import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/database.js';
import {
    ScoreDebugEntry,
    tokenize,
    suggestCategoryFuzzy,
    suggestCategoriesWithClaude,
} from '../services/categorization.js';
import scanner from '../services/scanner.js';
import { isModelFile, isArchiveFile, isDocumentFile, isImageFile } from '../utils/fileTypes.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';
import {
    extractRawTextFromPdf,
    extractLinksFromPdf,
    classifyLinks,
    detectPlatform,
    extractDesignerFromFilename
} from '../utils/pdfMetadata.js';
import { extractMetadataFromDataJson } from '../utils/dataJsonMetadata.js';

const router = express.Router();

function filterBlocklistedTags(tags: string[]): string[] {
    return tags.filter(t => {
        const trimmed = t.trim().toLowerCase();
        return trimmed && !db.prepare('SELECT 1 FROM tag_blocklist WHERE name = ?').get(trimmed);
    });
}

const DEFAULT_INGESTION_DIR = '/Users/kyle/Downloads';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATEGORIES_FILE = path.join(__dirname, '../../data/categories.md');

const DEFAULT_PROMPT = `You are categorizing 3D printing model files into an existing collection. The existing categories are:

{categories}

{category_definitions}

For each item below, suggest the best matching category from the list above. Use ALL available context (model filenames, PDF text, tags, designer info) to make your decision. If none of the existing categories fit well, use "Uncategorized". Rate your confidence: "high" if you're quite sure, "medium" if it's a reasonable guess, "low" if you're unsure.

Items to categorize:
{items}

Respond with ONLY a JSON array, one entry per item, in order:
[{"category": "...", "confidence": "high|medium|low"}, ...]

No explanation, just the JSON array.`;

function loadCategoryDefinitions(): string {
    try {
        if (fs.existsSync(CATEGORIES_FILE)) {
            return fs.readFileSync(CATEGORIES_FILE, 'utf-8').trim();
        }
    } catch { /* ignore */ }
    return '';
}


interface IngestionItem {
    filename: string;
    filepath: string;
    isFolder: boolean;
    fileCount: number;
    fileSize: number;
    suggestedCategory: string;
    confidence: 'high' | 'medium' | 'low';
    imageFile: string | null;
    debugScores: ScoreDebugEntry[];
    designer: string | null;
    suggestedTags: string[];
}

interface ScannedItem {
    filename: string;
    filepath: string;
    isFolder: boolean;
    fileCount: number;
    fileSize: number;
    imageFile: string | null;
    // Rich context for AI categorization
    modelFileNames: string[];
    pdfFilename: string | null;
    pdfText: string | null;
    pdfTags: string[];
    designer: string | null;
    readmeText: string | null;
    // From data.json (preferred source when available)
    sourceTitle: string | null;
    sourceDescription: string | null;
    sourceTags: string[];
}

function getConfig(key: string): string | null {
    const config = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return config?.value || null;
}

function setConfig(key: string, value: string): void {
    db.prepare(`
        INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
}

function getExistingCategories(): string[] {
    const rows = db.prepare(`
        SELECT DISTINCT category FROM models
        WHERE deleted_at IS NULL AND category IS NOT NULL
        ORDER BY category
    `).all() as Array<{ category: string }>;
    return rows.map(r => r.category);
}


// --- File scanning ---

const TEXT_EXTENSIONS = ['.txt', '.md', '.readme'];

interface FolderScanResult {
    count: number;
    totalSize: number;
    modelFileNames: string[];
    pdfPaths: string[];
    textFilePaths: string[];
    imagePaths: string[];
}

function scanFolderContents(dirPath: string): FolderScanResult {
    const result: FolderScanResult = {
        count: 0,
        totalSize: 0,
        modelFileNames: [],
        pdfPaths: [],
        textFilePaths: [],
        imagePaths: []
    };

    function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                result.count++;
                if (result.modelFileNames.length < 10) {
                    result.modelFileNames.push(entry.name);
                }
                try {
                    result.totalSize += fs.statSync(fullPath).size;
                } catch { /* ignore */ }
            } else if (isDocumentFile(fullPath)) {
                if (result.pdfPaths.length < 3) {
                    result.pdfPaths.push(fullPath);
                }
            } else if (isImageFile(fullPath)) {
                if (result.imagePaths.length < 5) {
                    result.imagePaths.push(fullPath);
                }
            } else if (TEXT_EXTENSIONS.includes(path.extname(fullPath).toLowerCase())) {
                if (result.textFilePaths.length < 1) {
                    result.textFilePaths.push(fullPath);
                }
            }
        }
    }

    walk(dirPath);
    return result;
}

async function extractFolderContext(scanResult: FolderScanResult, folderPath?: string): Promise<{
    pdfFilename: string | null;
    pdfText: string | null;
    pdfTags: string[];
    designer: string | null;
    readmeText: string | null;
    sourceTitle: string | null;
    sourceDescription: string | null;
    sourceTags: string[];
}> {
    let pdfFilename: string | null = null;
    let pdfText: string | null = null;
    let pdfTags: string[] = [];
    let designer: string | null = null;
    let readmeText: string | null = null;
    let sourceTitle: string | null = null;
    let sourceDescription: string | null = null;
    let sourceTags: string[] = [];

    // Try data.json first (richer, more reliable than PDF)
    if (folderPath) {
        try {
            const jsonMeta = await extractMetadataFromDataJson(folderPath);
            if (jsonMeta) {
                sourceTitle = jsonMeta.title;
                sourceDescription = jsonMeta.description;
                sourceTags = jsonMeta.tags;
                designer = jsonMeta.designer;
            }
        } catch { /* ignore */ }
    }

    // Extract from first PDF (always collect for supplementary context / license)
    if (scanResult.pdfPaths.length > 0) {
        const pdfPath = scanResult.pdfPaths[0];
        pdfFilename = path.basename(pdfPath);

        // Get raw first-page text (capped at 1000 chars)
        const rawText = await extractRawTextFromPdf(pdfPath);
        if (rawText) {
            pdfText = rawText.substring(0, 1000);
        }

        // Get links, tags, designer from PDF (only use designer if JSON didn't provide one)
        try {
            const links = await extractLinksFromPdf(pdfPath);
            const platform = detectPlatform(pdfFilename);
            const classified = classifyLinks(links, platform);
            pdfTags = classified.tags || [];
            if (!designer) {
                designer = classified.designer || extractDesignerFromFilename(pdfFilename, platform);
            }
        } catch { /* ignore link extraction failures */ }
    }

    // Read first text file
    if (scanResult.textFilePaths.length > 0) {
        try {
            const content = fs.readFileSync(scanResult.textFilePaths[0], 'utf-8');
            readmeText = content.substring(0, 500).trim() || null;
        } catch { /* ignore */ }
    }

    return { pdfFilename, pdfText, pdfTags, designer, readmeText, sourceTitle, sourceDescription, sourceTags };
}

async function scanIngestionDir(ingestionDir: string): Promise<ScannedItem[]> {
    const items: ScannedItem[] = [];
    const entries = fs.readdirSync(ingestionDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('!')) continue;

        const fullPath = path.join(ingestionDir, entry.name);

        if (entry.isDirectory()) {
            const scanResult = scanFolderContents(fullPath);
            if (scanResult.count > 0) {
                const context = await extractFolderContext(scanResult, fullPath);
                items.push({
                    filename: entry.name,
                    filepath: fullPath,
                    isFolder: true,
                    fileCount: scanResult.count,
                    fileSize: scanResult.totalSize,
                    modelFileNames: scanResult.modelFileNames,
                    imageFile: scanResult.imagePaths.length > 0 ? scanResult.imagePaths[0] : null,
                    ...context
                });
            }
        } else if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
            let fileSize = 0;
            try { fileSize = fs.statSync(fullPath).size; } catch { /* ignore */ }

            // Check for sibling image with matching basename
            const baseName = path.basename(entry.name, path.extname(entry.name));
            let siblingImage: string | null = null;
            for (const sibling of entries) {
                if (sibling.name === entry.name || sibling.isDirectory()) continue;
                const siblingPath = path.join(ingestionDir, sibling.name);
                if (isImageFile(siblingPath)) {
                    const siblingBase = path.basename(sibling.name, path.extname(sibling.name));
                    if (siblingBase === baseName) {
                        siblingImage = siblingPath;
                        break;
                    }
                    if (!siblingImage) {
                        siblingImage = siblingPath;
                    }
                }
            }

            items.push({
                filename: entry.name,
                filepath: fullPath,
                isFolder: false,
                fileCount: 1,
                fileSize,
                imageFile: siblingImage,
                modelFileNames: [entry.name],
                pdfFilename: null,
                pdfText: null,
                pdfTags: [],
                designer: null,
                readmeText: null,
                sourceTitle: null,
                sourceDescription: null,
                sourceTags: []
            });
        }
    }

    // Sort: folders first, then by filename
    items.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.filename.localeCompare(b.filename);
    });

    return items;
}

// --- Routes ---

// GET /api/ingestion/config
router.get('/config', (req, res) => {
    const directory = getConfig('ingestion_directory') || DEFAULT_INGESTION_DIR;
    const hasApiKey = !!getConfig('anthropic_api_key');
    const prompt = getConfig('ingestion_prompt') || DEFAULT_PROMPT;
    res.json({ directory, hasApiKey, prompt });
});

// POST /api/ingestion/config
router.post('/config', (req, res) => {
    const { directory, apiKey, prompt } = req.body;

    if (directory !== undefined) {
        if (!directory || typeof directory !== 'string') {
            return res.status(400).json({ error: 'directory must be a non-empty string' });
        }
        if (!fs.existsSync(directory)) {
            return res.status(400).json({ error: 'Directory does not exist' });
        }
        setConfig('ingestion_directory', directory);
    }

    if (apiKey !== undefined) {
        if (apiKey === '') {
            db.prepare('DELETE FROM config WHERE key = ?').run('anthropic_api_key');
        } else {
            setConfig('anthropic_api_key', apiKey);
        }
    }

    if (prompt !== undefined) {
        if (prompt === '') {
            // Reset to default
            db.prepare('DELETE FROM config WHERE key = ?').run('ingestion_prompt');
        } else {
            setConfig('ingestion_prompt', prompt);
        }
    }

    const currentDir = getConfig('ingestion_directory') || DEFAULT_INGESTION_DIR;
    const hasApiKey = !!getConfig('anthropic_api_key');
    const currentPrompt = getConfig('ingestion_prompt') || DEFAULT_PROMPT;
    res.json({ success: true, directory: currentDir, hasApiKey, prompt: currentPrompt });
});

// GET /api/ingestion/scan — file discovery + fuzzy categorization only (no API cost)
router.get('/scan', async (req, res) => {
    try {
        const ingestionDir = getConfig('ingestion_directory') || DEFAULT_INGESTION_DIR;
        if (!fs.existsSync(ingestionDir)) {
            return res.status(400).json({ error: `Ingestion directory does not exist: ${ingestionDir}` });
        }

        const categories = getExistingCategories();
        const scannedItems = await scanIngestionDir(ingestionDir);

        if (scannedItems.length === 0) {
            return res.json({ items: [] });
        }

        const items: IngestionItem[] = scannedItems.map(item => {
            const fuzzy = suggestCategoryFuzzy({
                name: item.isFolder
                    ? item.filename
                    : path.basename(item.filename, path.extname(item.filename)),
                modelFileNames: item.modelFileNames,
                pdfTags: item.pdfTags,
                readmeText: item.readmeText,
                pdfText: item.pdfText,
                sourceTitle: item.sourceTitle,
                sourceDescription: item.sourceDescription,
                sourceTags: item.sourceTags,
            }, categories);

            return {
                filename: item.filename,
                filepath: item.filepath,
                isFolder: item.isFolder,
                fileCount: item.fileCount,
                fileSize: item.fileSize,
                imageFile: item.imageFile,
                suggestedCategory: fuzzy.category,
                confidence: fuzzy.confidence,
                debugScores: fuzzy.debugScores,
                designer: item.designer,
                suggestedTags: filterBlocklistedTags(item.sourceTags?.length ? item.sourceTags : (item.pdfTags || []))
            };
        });

        res.json({ items });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// State for import job progress (polled by frontend)
let importJobProgress: {
    active: boolean;
    totalItems: number;
    processedItems: number;
    currentItem: string;
    status: string;
    results: Array<{ filepath: string; success: boolean; error?: string; model?: { modelId: number; filename: string } | null }>;
    summary: { total: number; succeeded: number; failed: number };
} = {
    active: false,
    totalItems: 0,
    processedItems: 0,
    currentItem: '',
    status: '',
    results: [],
    summary: { total: 0, succeeded: 0, failed: 0 }
};

// GET /api/ingestion/import/status — poll import job progress
router.get('/import/status', (_req, res) => {
    res.json(importJobProgress);
});

// State for AI categorization progress (polled by frontend)
let aiCategorizationProgress = {
    active: false,
    totalItems: 0,
    processedItems: 0,
    currentBatch: 0,
    totalBatches: 0,
    status: '' as string
};

// GET /api/ingestion/categorize/status — poll AI categorization progress
router.get('/categorize/status', (_req, res) => {
    res.json(aiCategorizationProgress);
});

// POST /api/ingestion/categorize — AI-powered categorization (manual trigger, batched)
router.post('/categorize', async (req, res) => {
    if (aiCategorizationProgress.active) {
        return res.status(409).json({ error: 'AI categorization already in progress' });
    }

    try {
        const ingestionDir = getConfig('ingestion_directory') || DEFAULT_INGESTION_DIR;
        if (!fs.existsSync(ingestionDir)) {
            return res.status(400).json({ error: `Ingestion directory does not exist: ${ingestionDir}` });
        }

        const apiKey = getConfig('anthropic_api_key');
        if (!apiKey) {
            return res.status(400).json({ error: 'Anthropic API key not configured' });
        }

        const categories = getExistingCategories();
        const scannedItems = await scanIngestionDir(ingestionDir);

        if (scannedItems.length === 0) {
            return res.json({ items: [], batches: 0 });
        }

        const BATCH_SIZE = 15;
        const batches: ScannedItem[][] = [];
        for (let i = 0; i < scannedItems.length; i += BATCH_SIZE) {
            batches.push(scannedItems.slice(i, i + BATCH_SIZE));
        }

        aiCategorizationProgress = {
            active: true,
            totalItems: scannedItems.length,
            processedItems: 0,
            currentBatch: 0,
            totalBatches: batches.length,
            status: `Starting AI categorization (${scannedItems.length} items in ${batches.length} batch${batches.length > 1 ? 'es' : ''})...`
        };

        console.log(`[AI Categorize] Starting: ${scannedItems.length} items in ${batches.length} batches of up to ${BATCH_SIZE}`);
        const startTime = Date.now();

        const allResults = new Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }>();

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            const batch = batches[batchIdx];
            aiCategorizationProgress.currentBatch = batchIdx + 1;
            aiCategorizationProgress.status = `Processing batch ${batchIdx + 1} of ${batches.length} (${batch.length} items)...`;
            console.log(`[AI Categorize] Batch ${batchIdx + 1}/${batches.length}: ${batch.length} items (${batch.map(i => i.filename).join(', ')})`);

            const batchStart = Date.now();
            try {
                        const promptTemplate = getConfig('ingestion_prompt') || DEFAULT_PROMPT;
                const categoryDefs = loadCategoryDefinitions();
                const batchResults = await suggestCategoriesWithClaude(
                    batch.map(item => ({
                        identifier: item.filepath,
                        name: item.filename,
                        isFolder: item.isFolder,
                        fileCount: item.fileCount,
                        modelFileNames: item.modelFileNames,
                        pdfFilename: item.pdfFilename,
                        pdfText: item.pdfText,
                        pdfTags: item.pdfTags,
                        readmeText: item.readmeText,
                        designer: item.designer,
                        sourceTitle: item.sourceTitle,
                        sourceDescription: item.sourceDescription,
                        sourceTags: item.sourceTags,
                    })),
                    categories,
                    apiKey,
                    promptTemplate,
                    categoryDefs
                );
                const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);

                let matched = 0;
                for (const [filepath, suggestion] of batchResults) {
                    allResults.set(filepath, suggestion);
                    matched++;
                }
                console.log(`[AI Categorize] Batch ${batchIdx + 1} complete: ${matched}/${batch.length} categorized (${batchTime}s)`);

                // Log individual results for this batch
                for (const item of batch) {
                    const result = batchResults.get(item.filepath);
                    if (result) {
                        console.log(`[AI Categorize]   "${item.filename}" -> "${result.category}" (${result.confidence})`);
                    } else {
                        console.log(`[AI Categorize]   "${item.filename}" -> NO RESULT (will use fuzzy fallback)`);
                    }
                }
            } catch (error) {
                const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[AI Categorize] Batch ${batchIdx + 1} FAILED (${batchTime}s): ${message}`);
                // Continue with remaining batches
            }

            aiCategorizationProgress.processedItems += batch.length;
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[AI Categorize] Complete: ${allResults.size}/${scannedItems.length} categorized by AI (${totalTime}s total)`);

        // Build final results: AI suggestions where available, fuzzy fallback otherwise
        const items: IngestionItem[] = scannedItems.map(item => {
            const aiSuggestion = allResults.get(item.filepath);
            if (aiSuggestion) {
                return {
                    filename: item.filename,
                    filepath: item.filepath,
                    isFolder: item.isFolder,
                    fileCount: item.fileCount,
                    fileSize: item.fileSize,
                    imageFile: item.imageFile,
                    suggestedCategory: aiSuggestion.category,
                    confidence: aiSuggestion.confidence,
                    debugScores: [],
                    designer: item.designer,
                    suggestedTags: filterBlocklistedTags(item.sourceTags?.length ? item.sourceTags : (item.pdfTags || []))
                };
            } else {
                const fuzzy = suggestCategoryFuzzy({
                    name: item.isFolder
                        ? item.filename
                        : path.basename(item.filename, path.extname(item.filename)),
                    modelFileNames: item.modelFileNames,
                    pdfTags: item.pdfTags,
                    readmeText: item.readmeText,
                    pdfText: item.pdfText,
                    sourceTitle: item.sourceTitle,
                    sourceDescription: item.sourceDescription,
                    sourceTags: item.sourceTags,
                }, categories);
                return {
                    filename: item.filename,
                    filepath: item.filepath,
                    isFolder: item.isFolder,
                    fileCount: item.fileCount,
                    fileSize: item.fileSize,
                    imageFile: item.imageFile,
                    suggestedCategory: fuzzy.category,
                    confidence: fuzzy.confidence,
                    debugScores: fuzzy.debugScores,
                    designer: item.designer,
                    suggestedTags: filterBlocklistedTags(item.sourceTags?.length ? item.sourceTags : (item.pdfTags || []))
                };
            }
        });

        aiCategorizationProgress = {
            active: false,
            totalItems: scannedItems.length,
            processedItems: scannedItems.length,
            currentBatch: batches.length,
            totalBatches: batches.length,
            status: `Complete: ${allResults.size} of ${scannedItems.length} categorized by AI`
        };

        res.json({ items, batches: batches.length, aiCategorized: allResults.size });
    } catch (error) {
        aiCategorizationProgress.active = false;
        aiCategorizationProgress.status = 'Failed';
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[AI Categorize] Error: ${message}`);
        res.status(500).json({ error: message });
    }
});

// GET /api/ingestion/preview-image — serve an image from the ingestion directory
router.get('/preview-image', (req, res) => {
    try {
        const filePath = req.query.path as string;
        if (!filePath) {
            return res.status(400).json({ error: 'path query parameter is required' });
        }

        // Security: only serve files under the configured ingestion directory
        const ingestionDir = getConfig('ingestion_directory') || DEFAULT_INGESTION_DIR;
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(ingestionDir))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(resolved)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.sendFile(resolved);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Record token→category associations from a successful import for future hint lookups
function recordCategorizationHints(name: string, category: string): void {
    if (!category || category === 'Uncategorized') return;
    const tokens = tokenize(name);
    if (tokens.length === 0) return;
    try {
        const stmt = db.prepare(`
            INSERT INTO categorization_hints (token, category, count)
            VALUES (?, ?, 1)
            ON CONFLICT(token, category) DO UPDATE SET count = count + 1
        `);
        for (const token of tokens) {
            stmt.run(token, category);
        }
    } catch { /* ignore */ }
}

// Decrement hint counts when a user corrects a wrong suggestion (floor at 0).
// Over time, consistently wrong suggestions lose their boost signal.
function recordCategorizationHintPenalty(name: string, wrongCategory: string): void {
    if (!wrongCategory || wrongCategory === 'Uncategorized') return;
    const tokens = tokenize(name);
    if (tokens.length === 0) return;
    try {
        const stmt = db.prepare(`
            UPDATE categorization_hints SET count = MAX(0, count - 1)
            WHERE token = ? AND category = ?
        `);
        for (const token of tokens) {
            stmt.run(token, wrongCategory);
        }
    } catch { /* ignore */ }
}

// Record a single import event to the ingestion_events log
function recordIngestionEvent(
    itemName: string,
    suggestedCategory: string | undefined,
    chosenCategory: string,
    confidence: string | undefined
): void {
    try {
        const accepted = (suggestedCategory && suggestedCategory !== 'Uncategorized' && suggestedCategory === chosenCategory) ? 1 : 0;
        const validConfidence = ['high', 'medium', 'low'].includes(confidence || '') ? confidence : null;
        db.prepare(`
            INSERT INTO ingestion_events (item_name, suggested_category, chosen_category, confidence, accepted)
            VALUES (?, ?, ?, ?, ?)
        `).run(itemName, suggestedCategory || null, chosenCategory, validConfidence, accepted);
    } catch { /* ignore */ }
}

// POST /api/ingestion/import
router.post('/import', async (req, res) => {
    if (importJobProgress.active) {
        return res.status(409).json({ error: 'Import already in progress' });
    }

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
    }

    const modelDir = getConfig('model_directory');
    if (!modelDir) {
        return res.status(500).json({ error: 'Model directory not configured' });
    }

    importJobProgress = {
        active: true,
        totalItems: items.length,
        processedItems: 0,
        currentItem: '',
        status: `Starting import of ${items.length} item${items.length !== 1 ? 's' : ''}...`,
        results: [],
        summary: { total: items.length, succeeded: 0, failed: 0 }
    };

    // Respond immediately so the client is never blocked
    res.status(202).json({ message: 'Import started' });

    // Process items in the background after response is sent
    setImmediate(async () => {
        try {
            for (const item of items) {
                const { filepath, category, isFolder, suggestedCategory, confidence, tags } = item;
                const displayName = path.basename(filepath || 'unknown');
                importJobProgress.currentItem = displayName;
                importJobProgress.status = `Importing ${displayName} (${importJobProgress.processedItems + 1}/${importJobProgress.totalItems})`;

                if (!filepath || !category) {
                    importJobProgress.results.push({ filepath: filepath || 'unknown', success: false, error: 'Missing filepath or category' });
                    importJobProgress.summary.failed++;
                    importJobProgress.processedItems++;
                    continue;
                }

                try {
                    if (!fs.existsSync(filepath)) {
                        importJobProgress.results.push({ filepath, success: false, error: 'Source file not found' });
                        importJobProgress.summary.failed++;
                        importJobProgress.processedItems++;
                        continue;
                    }

                    // Ensure category folder exists
                    const categoryDir = path.join(modelDir, category);
                    if (!fs.existsSync(categoryDir)) {
                        fs.mkdirSync(categoryDir, { recursive: true });
                    }

                    let targetFolderPath: string;

                    if (isFolder) {
                        const folderName = path.basename(filepath);
                        targetFolderPath = path.join(categoryDir, folderName);

                        if (fs.existsSync(targetFolderPath)) {
                            importJobProgress.results.push({ filepath, success: false, error: `Target folder already exists: ${category}/${folderName}` });
                            importJobProgress.summary.failed++;
                            importJobProgress.processedItems++;
                            continue;
                        }

                        fs.renameSync(filepath, targetFolderPath);
                    } else {
                        const baseName = path.basename(filepath, path.extname(filepath));
                        const cleanedName = cleanupFolderName(baseName);
                        targetFolderPath = path.join(categoryDir, cleanedName);

                        if (fs.existsSync(targetFolderPath)) {
                            importJobProgress.results.push({ filepath, success: false, error: `Target folder already exists: ${category}/${cleanedName}` });
                            importJobProgress.summary.failed++;
                            importJobProgress.processedItems++;
                            continue;
                        }

                        fs.mkdirSync(targetFolderPath, { recursive: true });
                        const targetFilePath = path.join(targetFolderPath, path.basename(filepath));
                        fs.renameSync(filepath, targetFilePath);
                    }

                    const model = await scanner.scanSingleFolder(targetFolderPath, modelDir);

                    // Apply tags if provided (skip blocklisted names)
                    if (model?.modelId && Array.isArray(tags) && tags.length > 0) {
                        for (const tagName of tags) {
                            const trimmed = String(tagName).trim().toLowerCase();
                            if (!trimmed) continue;
                            const blocked = db.prepare('SELECT 1 FROM tag_blocklist WHERE name = ?').get(trimmed);
                            if (blocked) continue;
                            let tag = db.prepare('SELECT id FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number } | undefined;
                            if (!tag) {
                                const result = db.prepare('INSERT INTO tags (name, source) VALUES (?, ?)').run(trimmed, 'pdf');
                                tag = { id: Number(result.lastInsertRowid) };
                            }
                            db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(model.modelId, tag.id);
                        }
                    }

                    // Assign designer if detected
                    if (model?.modelId) {
                        let designerName: string | null = item.designer || null;

                        // Fallback: check model_metadata (just extracted by scanSingleFolder)
                        if (!designerName) {
                            const mm = db.prepare('SELECT designer FROM model_metadata WHERE model_id = ?').get(model.modelId) as { designer: string | null } | undefined;
                            if (mm?.designer) designerName = mm.designer;
                        }

                        if (designerName) {
                            let designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(designerName) as any;
                            if (!designer) {
                                const result = db.prepare('INSERT OR IGNORE INTO designers (name) VALUES (?)').run(designerName);
                                designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(result.lastInsertRowid) as any;
                                if (!designer) {
                                    designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(designerName) as any;
                                }
                            }
                            if (designer) {
                                db.prepare('UPDATE models SET designer_id = ? WHERE id = ?').run(designer.id, model.modelId);
                                // Update profile URL from metadata if available
                                const mm = db.prepare('SELECT designer_url FROM model_metadata WHERE model_id = ?').get(model.modelId) as { designer_url: string | null } | undefined;
                                if (mm?.designer_url && !designer.profile_url) {
                                    db.prepare('UPDATE designers SET profile_url = ? WHERE id = ?').run(mm.designer_url, designer.id);
                                }
                            }
                        }
                    }

                    importJobProgress.results.push({ filepath, success: true, model });
                    importJobProgress.summary.succeeded++;

                    // Record name tokens → category association for future hint lookups
                    const importName = isFolder
                        ? path.basename(filepath)
                        : path.basename(filepath, path.extname(filepath));
                    recordCategorizationHints(importName, category);
                    // If the user changed the suggestion, penalize the wrong category
                    if (suggestedCategory && suggestedCategory !== category) {
                        recordCategorizationHintPenalty(importName, suggestedCategory);
                    }
                    // Log this import event for quality tracking over time
                    recordIngestionEvent(importName, suggestedCategory, category, confidence);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    importJobProgress.results.push({ filepath, success: false, error: message });
                    importJobProgress.summary.failed++;
                } finally {
                    importJobProgress.processedItems++;
                }
            }
        } finally {
            const { succeeded, failed } = importJobProgress.summary;
            importJobProgress.active = false;
            importJobProgress.status = `Import complete: ${succeeded} succeeded, ${failed} failed`;
        }
    });
});

// GET /api/ingestion/stats — acceptance rate and quality trends over time
router.get('/stats', (req, res) => {
    try {
        // Overall totals
        const totals = db.prepare(`
            SELECT COUNT(*) as total, SUM(accepted) as accepted_count
            FROM ingestion_events
        `).get() as { total: number; accepted_count: number | null };

        // Daily breakdown — all time
        const byDay = db.prepare(`
            SELECT
                date(imported_at) as day,
                COUNT(*) as total,
                SUM(accepted) as accepted
            FROM ingestion_events
            GROUP BY day
            ORDER BY day
        `).all() as Array<{ day: string; total: number; accepted: number }>;

        // Top corrected categories (suggested but user changed)
        const topCorrected = db.prepare(`
            SELECT suggested_category as category, COUNT(*) as count
            FROM ingestion_events
            WHERE accepted = 0 AND suggested_category IS NOT NULL
            GROUP BY suggested_category
            ORDER BY count DESC
            LIMIT 5
        `).all() as Array<{ category: string; count: number }>;

        // Top chosen categories
        const topChosen = db.prepare(`
            SELECT chosen_category as category, COUNT(*) as count
            FROM ingestion_events
            GROUP BY chosen_category
            ORDER BY count DESC
            LIMIT 5
        `).all() as Array<{ category: string; count: number }>;

        // Acceptance rate by confidence level
        const byConfidence = db.prepare(`
            SELECT
                confidence,
                COUNT(*) as total,
                SUM(accepted) as accepted
            FROM ingestion_events
            WHERE confidence IS NOT NULL
            GROUP BY confidence
        `).all() as Array<{ confidence: string; total: number; accepted: number }>;

        const total = totals.total || 0;
        const acceptedCount = totals.accepted_count || 0;

        res.json({
            totalImports: total,
            acceptanceRate: total > 0 ? Math.round((acceptedCount / total) * 100) : 0,
            byDay,
            topCorrected,
            topChosen,
            byConfidence
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// ─── Paid Models Categorization ───────────────────────────────────────────────

// GET /api/ingestion/paid-uncategorized — paginated paid models still needing a real category
router.get('/paid-uncategorized', (req, res) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
        const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10)));
        const search = String(req.query.search || '').toLowerCase().trim();
        const offset = (page - 1) * limit;

        const baseWhere = `
            WHERE m.is_paid = 1
              AND (m.category = 'Uncategorized' OR m.category = 'Paid')
              AND m.deleted_at IS NULL
        `;
        const searchClause = search ? `AND (LOWER(m.filename) LIKE ? OR LOWER(d.name) LIKE ?)` : '';
        const searchParams: string[] = search ? [`%${search}%`, `%${search}%`] : [];

        const { total } = db.prepare(`
            SELECT COUNT(*) as total
            FROM models m
            LEFT JOIN designers d ON m.designer_id = d.id
            ${baseWhere} ${searchClause}
        `).get(...searchParams) as { total: number };

        const designers = (db.prepare(`
            SELECT DISTINCT d.name
            FROM models m
            LEFT JOIN designers d ON m.designer_id = d.id
            ${baseWhere} ${searchClause}
            AND d.name IS NOT NULL
            ORDER BY d.name
        `).all(...searchParams) as Array<{ name: string }>).map(r => r.name);

        const rows = db.prepare(`
            SELECT m.id, m.filename, m.filepath, m.category,
                   d.name as designer_name,
                   ma.filepath as primary_image
            FROM models m
            LEFT JOIN designers d ON m.designer_id = d.id
            LEFT JOIN model_assets ma ON ma.model_id = m.id AND ma.is_primary = 1 AND (ma.is_hidden IS NULL OR ma.is_hidden = 0) AND ma.asset_type = 'image'
            ${baseWhere} ${searchClause}
            ORDER BY m.filename
            LIMIT ? OFFSET ?
        `).all(...searchParams, limit, offset) as Array<{ id: number; filename: string; filepath: string; category: string; designer_name: string | null; primary_image: string | null }>;

        const items = rows.map(item => {
            const fileNames = (db.prepare(
                'SELECT filename FROM model_files WHERE model_id = ? LIMIT 10'
            ).all(item.id) as Array<{ filename: string }>).map(r => r.filename);

            return {
                model_id: item.id,
                model_name: item.filename,
                model_filepath: item.filepath,
                current_category: item.category,
                designer: item.designer_name,
                primary_image: item.primary_image,
                model_file_names: fileNames,
            };
        });

        res.json({
            items,
            total,
            page,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            designers,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Progress state for paid categorization (separate from download import progress)
let paidCategorizationProgress = {
    active: false,
    totalItems: 0,
    processedItems: 0,
    currentBatch: 0,
    totalBatches: 0,
    status: '' as string
};

// GET /api/ingestion/categorize-paid/status — poll AI categorization progress
router.get('/categorize-paid/status', (_req, res) => {
    res.json(paidCategorizationProgress);
});

// POST /api/ingestion/categorize-paid — AI-only categorization for paid uncategorized models
router.post('/categorize-paid', async (req, res) => {
    if (paidCategorizationProgress.active) {
        return res.status(409).json({ error: 'AI categorization already in progress' });
    }

    const apiKey = getConfig('anthropic_api_key');
    if (!apiKey) {
        return res.status(400).json({ error: 'Anthropic API key not configured. AI categorization is required for paid models.' });
    }

    try {
        const paidItems = db.prepare(`
            SELECT m.id, m.filename
            FROM models m
            WHERE m.is_paid = 1
              AND (m.category = 'Uncategorized' OR m.category = 'Paid')
              AND m.deleted_at IS NULL
            ORDER BY m.filename
        `).all() as Array<{ id: number; filename: string }>;

        if (paidItems.length === 0) {
            return res.json({ items: [], batches: 0, aiCategorized: 0 });
        }

        const categories = getExistingCategories().filter(c => c !== 'Uncategorized' && c !== 'Paid');

        const BATCH_SIZE = 15;
        const batches: Array<typeof paidItems> = [];
        for (let i = 0; i < paidItems.length; i += BATCH_SIZE) {
            batches.push(paidItems.slice(i, i + BATCH_SIZE));
        }

        paidCategorizationProgress = {
            active: true,
            totalItems: paidItems.length,
            processedItems: 0,
            currentBatch: 0,
            totalBatches: batches.length,
            status: `Starting AI categorization (${paidItems.length} paid models in ${batches.length} batch${batches.length !== 1 ? 'es' : ''})...`
        };

        const allResults = new Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }>();

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            const batch = batches[batchIdx];
            paidCategorizationProgress.currentBatch = batchIdx + 1;
            paidCategorizationProgress.status = `Processing batch ${batchIdx + 1} of ${batches.length}...`;

            try {
                const fileNamesMap = new Map<number, string[]>();
                for (const item of batch) {
                    const fns = (db.prepare('SELECT filename FROM model_files WHERE model_id = ? LIMIT 10').all(item.id) as Array<{ filename: string }>).map(r => r.filename);
                    fileNamesMap.set(item.id, fns);
                }

                const batchResults = await suggestCategoriesWithClaude(
                    batch.map(item => ({
                        identifier: String(item.id),
                        name: item.filename,
                        modelFileNames: fileNamesMap.get(item.id) || [],
                    })),
                    categories,
                    apiKey
                );

                for (const [id, suggestion] of batchResults) {
                    allResults.set(id, suggestion);
                }
            } catch (err) {
                console.error(`[AI Categorize Paid] Batch ${batchIdx + 1} failed:`, err instanceof Error ? err.message : err);
            }

            paidCategorizationProgress.processedItems += batch.length;
        }

        const items = paidItems.map(item => {
            const result = allResults.get(String(item.id));
            return {
                model_id: item.id,
                model_name: item.filename,
                suggested_category: result?.category || null,
                confidence: result?.confidence || null,
            };
        });

        paidCategorizationProgress = {
            active: false,
            totalItems: paidItems.length,
            processedItems: paidItems.length,
            currentBatch: batches.length,
            totalBatches: batches.length,
            status: `Complete: ${allResults.size} of ${paidItems.length} categorized by AI`,
        };

        res.json({ items, batches: batches.length, aiCategorized: allResults.size });
    } catch (error) {
        paidCategorizationProgress.active = false;
        paidCategorizationProgress.status = 'Failed';
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// POST /api/ingestion/apply-paid-categories — DB-only category update, no stats recorded
router.post('/apply-paid-categories', (req, res) => {
    try {
        const { assignments } = req.body;
        if (!Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ error: 'assignments must be a non-empty array' });
        }

        const results: Array<{ model_id: number; success: boolean; error?: string }> = [];

        const stmt = db.prepare('UPDATE models SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_paid = 1');

        for (const { model_id, category } of assignments) {
            if (!model_id || !category) {
                results.push({ model_id, success: false, error: 'Missing model_id or category' });
                continue;
            }
            try {
                const info = stmt.run(category.trim(), model_id);
                if (info.changes === 0) {
                    results.push({ model_id, success: false, error: 'Model not found or not a paid model' });
                } else {
                    results.push({ model_id, success: true });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                results.push({ model_id, success: false, error: message });
            }
        }

        const succeeded = results.filter(r => r.success).length;
        res.json({ results, succeeded, total: assignments.length });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
