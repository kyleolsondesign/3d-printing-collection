import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import db from '../config/database.js';
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

const router = express.Router();

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

// Categories that require the full phrase to appear in the item name.
// Individual tokens from these categories (e.g. "mini", "one", "brick") are
// too generic and cause false matches, so token-based scoring is skipped for them.
const PHRASE_ONLY_CATEGORIES = new Set([
    'A1 Mini',
    'Core One',
    'CyberBrick',
]);

// Common noise words to ignore in fuzzy matching
const NOISE_WORDS = new Set([
    'free', '3d', 'print', 'model', 'stl', 'file', 'files', 'download',
    'printable', 'printing', 'printer', 'printed', 'the', 'and', 'for',
    'with', 'from', 'this', 'that', 'new', 'set', 'version', 'design',
    'ready', 'high', 'quality', 'low', 'poly', 'obj', 'fbx', 'gcode'
]);

// Semantic synonym groups for 3D printing categories.
// When an item's tokens include any word in a group, all other words in that group
// are added to the token set, enabling semantic cross-matching against category names.
const SYNONYM_GROUPS: string[][] = [
    // Toys, figures, games
    ['toy', 'toys', 'figure', 'figures', 'figurine', 'miniature', 'bust', 'statue', 'character', 'diorama', 'game', 'games', 'puzzle'],
    // Tools, hardware, functional parts
    ['tool', 'tools', 'wrench', 'bracket', 'mount', 'holder', 'clip', 'organizer', 'jig', 'fixture', 'hardware', 'hanger', 'hook'],
    // Plants, nature, garden
    ['plant', 'plants', 'pot', 'vase', 'planter', 'succulent', 'flower', 'garden'],
    // Vehicles, transportation
    ['vehicle', 'vehicles', 'car', 'truck', 'boat', 'airplane', 'aircraft', 'ship', 'tank'],
    // Animals, creatures
    ['animal', 'animals', 'dog', 'cat', 'bird', 'dragon', 'fish', 'creature', 'beast', 'dinosaur'],
    // Jewelry, accessories
    ['jewelry', 'keychain', 'pendant', 'ring', 'earring', 'necklace', 'charm', 'accessory'],
    // Electronics, tech
    ['electronic', 'electronics', 'phone', 'cable', 'charger', 'raspberry', 'arduino', 'circuit'],
    // Household, kitchen, storage
    ['household', 'kitchen', 'bathroom', 'shelf', 'storage', 'container', 'box', 'drawer'],
    // Stands, supports, bases
    ['stand', 'stands', 'base', 'support', 'platform', 'riser', 'dock'],
];

// Build reverse lookup: word → synonym group
const SYNONYM_MAP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
        SYNONYM_MAP.set(word, group);
    }
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

// Expand a token set with synonyms from SYNONYM_GROUPS
function expandWithSynonyms(tokens: string[]): string[] {
    const expanded = new Set(tokens);
    for (const token of tokens) {
        const group = SYNONYM_MAP.get(token);
        if (group) {
            for (const synonym of group) {
                expanded.add(synonym);
            }
        }
    }
    return Array.from(expanded);
}

// Pure token overlap score: what fraction of catTokens are covered by itemTokens
function scoreTokensVsCategory(itemTokens: string[], catTokens: string[]): number {
    if (itemTokens.length === 0 || catTokens.length === 0) return 0;
    let matchCount = 0;
    for (const catToken of catTokens) {
        if (itemTokens.some(t => t.includes(catToken) || catToken.includes(t))) {
            matchCount++;
        }
    }
    return matchCount / catTokens.length;
}

// Score a named source (with pre-expanded tokens) against a single category.
// Handles phrase-only enforcement, substring check, and token overlap.
function scoreNameVsCategory(
    name: string,
    expandedTokens: string[],
    category: string,
    catTokens: string[],
    normalizedCat: string,
    isPhraseOnly: boolean
): { score: number; isExact: boolean } {
    const normalizedName = name.toLowerCase().replace(/[\s_-]+/g, '');

    if (isPhraseOnly) {
        const match = name.toLowerCase().includes(category.toLowerCase())
            || normalizedName.includes(normalizedCat);
        return { score: match ? 100 : 0, isExact: match };
    }

    if (name.toLowerCase().includes(category.toLowerCase())) {
        return { score: 100, isExact: true };
    }

    return { score: scoreTokensVsCategory(expandedTokens, catTokens), isExact: false };
}

// Learned-hint fallback: query categorization_hints for token→category associations.
// Returns a low-confidence suggestion if any learned associations match, or null.
function tryHintFallback(
    tokens: string[],
    categories: string[]
): { category: string; confidence: 'high' | 'medium' | 'low' } | null {
    if (tokens.length === 0) return null;
    try {
        const placeholders = tokens.map(() => '?').join(',');
        const rows = db.prepare(`
            SELECT category, SUM(count) as total
            FROM categorization_hints
            WHERE token IN (${placeholders})
            GROUP BY category
            ORDER BY total DESC
            LIMIT 1
        `).all(...tokens) as Array<{ category: string; total: number }>;

        if (rows.length === 0) return null;
        const best = rows[0];
        if (!categories.includes(best.category)) return null;
        return { category: best.category, confidence: 'low' };
    } catch {
        return null;
    }
}

interface FuzzyMatchContext {
    name: string;
    modelFileNames?: string[];
    pdfTags?: string[];
    readmeText?: string | null;
    pdfText?: string | null;
}

function suggestCategoryFuzzy(
    item: FuzzyMatchContext,
    categories: string[]
): { category: string; confidence: 'high' | 'medium' | 'low' } {
    // Pre-compute expanded tokens for each source
    const primaryTokens = expandWithSynonyms(tokenize(item.name));

    // Model file names: strip extension, tokenize + expand per file
    const modelFileContexts = (item.modelFileNames || []).map(fn => {
        const baseName = fn.replace(/\.(stl|3mf|obj|gcode|ply|amf|zip|rar|7z)$/i, '');
        return { name: baseName, tokens: expandWithSynonyms(tokenize(baseName)) };
    });

    // PDF tags: tokenize all tags combined
    const pdfTagTokens = expandWithSynonyms(
        (item.pdfTags || []).flatMap(tag => tokenize(tag))
    );

    // Readme / PDF text: limit length to avoid noise
    const textContent = [item.readmeText, item.pdfText]
        .filter(Boolean)
        .join(' ')
        .substring(0, 500);
    const textTokens = textContent ? expandWithSynonyms(tokenize(textContent)) : [];

    const hasAnyTokens = primaryTokens.length > 0
        || modelFileContexts.some(fc => fc.tokens.length > 0)
        || pdfTagTokens.length > 0
        || textTokens.length > 0;

    if (!hasAnyTokens) {
        return tryHintFallback([], categories) ?? { category: 'Uncategorized', confidence: 'low' };
    }

    let bestCategory = 'Uncategorized';
    let bestScore = 0;
    let bestIsExact = false;

    for (const category of categories) {
        const isPhraseOnly = PHRASE_ONLY_CATEGORIES.has(category);
        const normalizedCat = category.toLowerCase().replace(/[\s_-]+/g, '');
        const catTokens = tokenize(category);

        // Source 1: Primary name — unrestricted, can reach high confidence
        const nameResult = scoreNameVsCategory(
            item.name, primaryTokens, category, catTokens, normalizedCat, isPhraseOnly
        );

        // Sources 2–4: secondary — never override primary for high confidence
        let secondaryScore = 0;

        if (!isPhraseOnly) {
            // Source 2: Individual model file names
            for (const fc of modelFileContexts) {
                const r = scoreNameVsCategory(
                    fc.name, fc.tokens, category, catTokens, normalizedCat, false
                );
                if (r.score > secondaryScore) secondaryScore = r.score;
            }

            // Source 3: PDF tags (pure token overlap)
            if (pdfTagTokens.length > 0) {
                const s = scoreTokensVsCategory(pdfTagTokens, catTokens);
                if (s > secondaryScore) secondaryScore = s;
            }

            // Source 4: Text content (capped lower — noisy signal)
            if (textTokens.length > 0) {
                const s = Math.min(scoreTokensVsCategory(textTokens, catTokens), 0.5);
                if (s > secondaryScore) secondaryScore = s;
            }

            // Cap secondary sources below the high-confidence threshold
            secondaryScore = Math.min(secondaryScore, 0.79);
        }

        const catScore = nameResult.isExact ? 100 : Math.max(nameResult.score, secondaryScore);
        const catIsExact = nameResult.isExact;

        if (catScore > bestScore || (catScore === bestScore && category.length > bestCategory.length)) {
            bestScore = catScore;
            bestCategory = category;
            bestIsExact = catIsExact;
        }
    }

    // Hint fallback: if still no match, try learned associations
    if (bestScore === 0) {
        const allTokens = [
            ...primaryTokens,
            ...modelFileContexts.flatMap(fc => fc.tokens),
            ...pdfTagTokens,
            ...textTokens,
        ];
        const hintResult = tryHintFallback(allTokens, categories);
        if (hintResult) return hintResult;
    }

    let confidence: 'high' | 'medium' | 'low';
    if (bestIsExact || bestScore >= 0.8) {
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

    // Use custom prompt or default, with placeholder substitution
    const promptTemplate = getConfig('ingestion_prompt') || DEFAULT_PROMPT;
    const categoryDefs = loadCategoryDefinitions();
    const prompt = promptTemplate
        .replace('{categories}', categoryList)
        .replace('{category_definitions}', categoryDefs ? `Here are detailed descriptions of each category to help you decide:\n\n${categoryDefs}` : '')
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
            }, categories);

            return {
                filename: item.filename,
                filepath: item.filepath,
                isFolder: item.isFolder,
                fileCount: item.fileCount,
                fileSize: item.fileSize,
                imageFile: item.imageFile,
                suggestedCategory: fuzzy.category,
                confidence: fuzzy.confidence
            };
        });

        res.json({ items });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
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
                const batchResults = await suggestCategoriesWithClaude(batch, categories);
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
                    confidence: aiSuggestion.confidence
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
                }, categories);
                return {
                    filename: item.filename,
                    filepath: item.filepath,
                    isFolder: item.isFolder,
                    fileCount: item.fileCount,
                    fileSize: item.fileSize,
                    imageFile: item.imageFile,
                    suggestedCategory: fuzzy.category,
                    confidence: fuzzy.confidence
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

                // Record name tokens → category association for future hint lookups
                const importName = isFolder
                    ? path.basename(filepath)
                    : path.basename(filepath, path.extname(filepath));
                recordCategorizationHints(importName, category);
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
