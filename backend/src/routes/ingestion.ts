import express from 'express';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import db from '../config/database.js';
import scanner from '../services/scanner.js';
import { isModelFile, isArchiveFile, isDocumentFile } from '../utils/fileTypes.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';
import {
    extractRawTextFromPdf,
    extractLinksFromPdf,
    classifyLinks,
    detectPlatform,
    extractDesignerFromFilename
} from '../utils/pdfMetadata.js';

const router = express.Router();

const DEFAULT_INGESTION_DIR = '/Users/kyle/Downloads';

const DEFAULT_PROMPT = `You are categorizing 3D printing model files into an existing collection. The existing categories are:

{categories}

For each item below, suggest the best matching category from the list above. Use ALL available context (model filenames, PDF text, tags, designer info) to make your decision. If none of the existing categories fit well, use "Uncategorized". Rate your confidence: "high" if you're quite sure, "medium" if it's a reasonable guess, "low" if you're unsure.

Items to categorize:
{items}

Respond with ONLY a JSON array, one entry per item, in order:
[{"category": "...", "confidence": "high|medium|low"}, ...]

No explanation, just the JSON array.`;

// Common noise words to ignore in fuzzy matching
const NOISE_WORDS = new Set([
    'free', '3d', 'print', 'model', 'stl', 'file', 'files', 'download',
    'printable', 'printing', 'printer', 'printed', 'the', 'and', 'for',
    'with', 'from', 'this', 'that', 'new', 'set', 'version', 'design',
    'ready', 'high', 'quality', 'low', 'poly', 'obj', 'fbx', 'gcode'
]);

interface IngestionItem {
    filename: string;
    filepath: string;
    isFolder: boolean;
    fileCount: number;
    fileSize: number;
    suggestedCategory: string;
    confidence: 'high' | 'medium' | 'low';
}

interface ScannedItem {
    filename: string;
    filepath: string;
    isFolder: boolean;
    fileCount: number;
    fileSize: number;
    // Rich context for AI categorization
    modelFileNames: string[];
    pdfFilename: string | null;
    pdfText: string | null;
    pdfTags: string[];
    designer: string | null;
    readmeText: string | null;
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

// --- Fuzzy matching fallback ---

function tokenize(name: string): string[] {
    return name
        .replace(/[_\-./\\()[\]{}]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && !NOISE_WORDS.has(w));
}

function suggestCategoryFuzzy(itemName: string, categories: string[]): { category: string; confidence: 'high' | 'medium' | 'low' } {
    const itemTokens = tokenize(itemName);
    if (itemTokens.length === 0) {
        return { category: 'Uncategorized', confidence: 'low' };
    }

    let bestCategory = 'Uncategorized';
    let bestScore = 0;
    let exactMatch = false;

    for (const category of categories) {
        if (itemName.toLowerCase().includes(category.toLowerCase())) {
            if (category.length > bestCategory.length || bestCategory === 'Uncategorized') {
                bestCategory = category;
                bestScore = 100;
                exactMatch = true;
            }
            continue;
        }

        const catTokens = tokenize(category);
        let matchCount = 0;
        for (const catToken of catTokens) {
            if (itemTokens.some(t => t.includes(catToken) || catToken.includes(t))) {
                matchCount++;
            }
        }

        if (matchCount > 0 && catTokens.length > 0) {
            const score = matchCount / catTokens.length;
            if (score > bestScore || (score === bestScore && category.length > bestCategory.length)) {
                bestScore = score;
                bestCategory = category;
                exactMatch = false;
            }
        }
    }

    let confidence: 'high' | 'medium' | 'low';
    if (exactMatch || bestScore >= 0.8) {
        confidence = 'high';
    } else if (bestScore > 0) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    return { category: bestCategory, confidence };
}

// --- Claude-powered categorization ---

async function suggestCategoriesWithClaude(
    items: ScannedItem[],
    categories: string[]
): Promise<Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }>> {
    const apiKey = getConfig('anthropic_api_key');
    if (!apiKey) {
        throw new Error('no_api_key');
    }

    const client = new Anthropic({ apiKey });

    const itemList = items.map((item, i) => {
        const lines = [`${i + 1}. "${item.filename}"`];
        lines.push(`   Type: ${item.isFolder ? 'folder' : 'file'}, ${item.fileCount} model file${item.fileCount > 1 ? 's' : ''}`);
        if (item.modelFileNames.length > 0 && item.isFolder) {
            lines.push(`   Model files: ${item.modelFileNames.join(', ')}`);
        }
        if (item.pdfFilename) {
            lines.push(`   PDF filename: "${item.pdfFilename}"`);
        }
        if (item.pdfText) {
            lines.push(`   PDF text: "${item.pdfText}"`);
        }
        if (item.pdfTags.length > 0) {
            lines.push(`   Tags from PDF: ${item.pdfTags.join(', ')}`);
        }
        if (item.designer) {
            lines.push(`   Designer: ${item.designer}`);
        }
        if (item.readmeText) {
            lines.push(`   Readme: "${item.readmeText}"`);
        }
        return lines.join('\n');
    }).join('\n\n');

    const categoryList = categories.join(', ');

    // Use custom prompt or default
    const promptTemplate = getConfig('ingestion_prompt') || DEFAULT_PROMPT;
    const prompt = promptTemplate
        .replace('{categories}', categoryList)
        .replace('{items}', itemList);

    const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [{
            role: 'user',
            content: prompt
        }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const results = new Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }>();

    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in response');

        const parsed = JSON.parse(jsonMatch[0]) as Array<{ category: string; confidence: string }>;
        for (let i = 0; i < items.length && i < parsed.length; i++) {
            const suggestion = parsed[i];
            const confidence = ['high', 'medium', 'low'].includes(suggestion.confidence)
                ? suggestion.confidence as 'high' | 'medium' | 'low'
                : 'low';
            results.set(items[i].filepath, {
                category: suggestion.category || 'Uncategorized',
                confidence
            });
        }
    } catch (parseError) {
        console.error('Failed to parse Claude response:', parseError, text);
        // Fall through — caller will use fuzzy fallback for missing items
    }

    return results;
}

// --- File scanning ---

const TEXT_EXTENSIONS = ['.txt', '.md', '.readme'];

interface FolderScanResult {
    count: number;
    totalSize: number;
    modelFileNames: string[];
    pdfPaths: string[];
    textFilePaths: string[];
}

function scanFolderContents(dirPath: string): FolderScanResult {
    const result: FolderScanResult = {
        count: 0,
        totalSize: 0,
        modelFileNames: [],
        pdfPaths: [],
        textFilePaths: []
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

async function extractFolderContext(scanResult: FolderScanResult): Promise<{
    pdfFilename: string | null;
    pdfText: string | null;
    pdfTags: string[];
    designer: string | null;
    readmeText: string | null;
}> {
    let pdfFilename: string | null = null;
    let pdfText: string | null = null;
    let pdfTags: string[] = [];
    let designer: string | null = null;
    let readmeText: string | null = null;

    // Extract from first PDF
    if (scanResult.pdfPaths.length > 0) {
        const pdfPath = scanResult.pdfPaths[0];
        pdfFilename = path.basename(pdfPath);

        // Get raw first-page text (capped at 1000 chars)
        const rawText = await extractRawTextFromPdf(pdfPath);
        if (rawText) {
            pdfText = rawText.substring(0, 1000);
        }

        // Get links, tags, designer from PDF
        try {
            const links = await extractLinksFromPdf(pdfPath);
            const platform = detectPlatform(pdfFilename);
            const classified = classifyLinks(links, platform);
            pdfTags = classified.tags || [];
            designer = classified.designer || extractDesignerFromFilename(pdfFilename, platform);
        } catch { /* ignore link extraction failures */ }
    }

    // Read first text file
    if (scanResult.textFilePaths.length > 0) {
        try {
            const content = fs.readFileSync(scanResult.textFilePaths[0], 'utf-8');
            readmeText = content.substring(0, 500).trim() || null;
        } catch { /* ignore */ }
    }

    return { pdfFilename, pdfText, pdfTags, designer, readmeText };
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
                const context = await extractFolderContext(scanResult);
                items.push({
                    filename: entry.name,
                    filepath: fullPath,
                    isFolder: true,
                    fileCount: scanResult.count,
                    fileSize: scanResult.totalSize,
                    modelFileNames: scanResult.modelFileNames,
                    ...context
                });
            }
        } else if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
            let fileSize = 0;
            try { fileSize = fs.statSync(fullPath).size; } catch { /* ignore */ }

            items.push({
                filename: entry.name,
                filepath: fullPath,
                isFolder: false,
                fileCount: 1,
                fileSize,
                modelFileNames: [entry.name],
                pdfFilename: null,
                pdfText: null,
                pdfTags: [],
                designer: null,
                readmeText: null
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

// GET /api/ingestion/scan
router.get('/scan', async (req, res) => {
    try {
        const ingestionDir = getConfig('ingestion_directory') || DEFAULT_INGESTION_DIR;
        if (!fs.existsSync(ingestionDir)) {
            return res.status(400).json({ error: `Ingestion directory does not exist: ${ingestionDir}` });
        }

        const categories = getExistingCategories();
        const scannedItems = await scanIngestionDir(ingestionDir);

        if (scannedItems.length === 0) {
            return res.json({ items: [], usedClaude: false });
        }

        // Try Claude first, fall back to fuzzy matching
        let claudeSuggestions: Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }> | null = null;
        let usedClaude = false;

        try {
            claudeSuggestions = await suggestCategoriesWithClaude(scannedItems, categories);
            usedClaude = true;
        } catch (error: any) {
            if (error.message !== 'no_api_key') {
                console.error('Claude categorization failed, falling back to fuzzy matching:', error.message);
            }
        }

        const items: IngestionItem[] = scannedItems.map(item => {
            const claudeSuggestion = claudeSuggestions?.get(item.filepath);
            let suggestedCategory: string;
            let confidence: 'high' | 'medium' | 'low';

            if (claudeSuggestion) {
                suggestedCategory = claudeSuggestion.category;
                confidence = claudeSuggestion.confidence;
            } else {
                // Fuzzy fallback
                const nameForMatch = item.isFolder
                    ? item.filename
                    : path.basename(item.filename, path.extname(item.filename));
                const fuzzy = suggestCategoryFuzzy(nameForMatch, categories);
                suggestedCategory = fuzzy.category;
                confidence = fuzzy.confidence;
            }

            return {
                filename: item.filename,
                filepath: item.filepath,
                isFolder: item.isFolder,
                fileCount: item.fileCount,
                fileSize: item.fileSize,
                suggestedCategory,
                confidence
            };
        });

        res.json({ items, usedClaude });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// POST /api/ingestion/import
router.post('/import', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required' });
        }

        const modelDir = getConfig('model_directory');
        if (!modelDir) {
            return res.status(500).json({ error: 'Model directory not configured' });
        }

        const results: Array<{
            filepath: string;
            success: boolean;
            error?: string;
            model?: { modelId: number; filename: string } | null;
        }> = [];

        for (const item of items) {
            const { filepath, category, isFolder } = item;
            if (!filepath || !category) {
                results.push({ filepath: filepath || 'unknown', success: false, error: 'Missing filepath or category' });
                continue;
            }

            try {
                if (!fs.existsSync(filepath)) {
                    results.push({ filepath, success: false, error: 'Source file not found' });
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
                        results.push({ filepath, success: false, error: `Target folder already exists: ${category}/${folderName}` });
                        continue;
                    }

                    fs.renameSync(filepath, targetFolderPath);
                } else {
                    const baseName = path.basename(filepath, path.extname(filepath));
                    const cleanedName = cleanupFolderName(baseName);
                    targetFolderPath = path.join(categoryDir, cleanedName);

                    if (fs.existsSync(targetFolderPath)) {
                        results.push({ filepath, success: false, error: `Target folder already exists: ${category}/${cleanedName}` });
                        continue;
                    }

                    fs.mkdirSync(targetFolderPath, { recursive: true });
                    const targetFilePath = path.join(targetFolderPath, path.basename(filepath));
                    fs.renameSync(filepath, targetFilePath);
                }

                const model = await scanner.scanSingleFolder(targetFolderPath, modelDir);
                results.push({ filepath, success: true, model });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                results.push({ filepath, success: false, error: message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            summary: {
                total: items.length,
                succeeded: successCount,
                failed: failCount
            },
            results
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
