import express from 'express';
import fs from 'fs';
import path from 'path';
import db from '../config/database.js';
import scanner from '../services/scanner.js';
import { isModelFile, isArchiveFile, MODEL_EXTENSIONS, ARCHIVE_EXTENSIONS } from '../utils/fileTypes.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';

const router = express.Router();

const DEFAULT_INGESTION_DIR = '/Users/kyle/Downloads';

interface IngestionItem {
    filename: string;
    filepath: string;
    isFolder: boolean;
    fileCount: number;
    fileSize: number;
    suggestedCategory: string;
    confidence: 'high' | 'medium' | 'low';
}

function getIngestionDir(): string {
    const config = db.prepare('SELECT value FROM config WHERE key = ?').get('ingestion_directory') as { value: string } | undefined;
    return config?.value || DEFAULT_INGESTION_DIR;
}

function getModelDir(): string | null {
    const config = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory') as { value: string } | undefined;
    return config?.value || null;
}

function getExistingCategories(): string[] {
    const rows = db.prepare(`
        SELECT DISTINCT category FROM models
        WHERE deleted_at IS NULL AND category IS NOT NULL
        ORDER BY category
    `).all() as Array<{ category: string }>;
    return rows.map(r => r.category);
}

function tokenize(name: string): string[] {
    return name
        .replace(/[_\-./\\()[\]{}]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2); // skip very short words
}

function suggestCategory(itemName: string, categories: string[]): { category: string; confidence: 'high' | 'medium' | 'low' } {
    const itemTokens = tokenize(itemName);
    if (itemTokens.length === 0) {
        return { category: 'Uncategorized', confidence: 'low' };
    }

    let bestCategory = 'Uncategorized';
    let bestScore = 0;
    let exactMatch = false;

    for (const category of categories) {
        // Check exact match (case-insensitive)
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

        if (matchCount > 0) {
            // Score: ratio of matched category tokens (prefer categories where more tokens match)
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

function countModelFiles(dirPath: string): { count: number; totalSize: number } {
    let count = 0;
    let totalSize = 0;

    function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                count++;
                try {
                    totalSize += fs.statSync(fullPath).size;
                } catch { /* ignore */ }
            }
        }
    }

    walk(dirPath);
    return { count, totalSize };
}

// GET /api/ingestion/config
router.get('/config', (req, res) => {
    const directory = getIngestionDir();
    res.json({ directory });
});

// POST /api/ingestion/config
router.post('/config', (req, res) => {
    const { directory } = req.body;
    if (!directory || typeof directory !== 'string') {
        return res.status(400).json({ error: 'directory is required' });
    }

    if (!fs.existsSync(directory)) {
        return res.status(400).json({ error: 'Directory does not exist' });
    }

    db.prepare(`
        INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run('ingestion_directory', directory);

    res.json({ success: true, directory });
});

// GET /api/ingestion/scan
router.get('/scan', (req, res) => {
    try {
        const ingestionDir = getIngestionDir();
        if (!fs.existsSync(ingestionDir)) {
            return res.status(400).json({ error: `Ingestion directory does not exist: ${ingestionDir}` });
        }

        const categories = getExistingCategories();
        const items: IngestionItem[] = [];

        const entries = fs.readdirSync(ingestionDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name.startsWith('!')) continue;

            const fullPath = path.join(ingestionDir, entry.name);

            if (entry.isDirectory()) {
                // Check if folder contains any model files
                const { count, totalSize } = countModelFiles(fullPath);
                if (count > 0) {
                    const suggestion = suggestCategory(entry.name, categories);
                    items.push({
                        filename: entry.name,
                        filepath: fullPath,
                        isFolder: true,
                        fileCount: count,
                        fileSize: totalSize,
                        suggestedCategory: suggestion.category,
                        confidence: suggestion.confidence
                    });
                }
            } else if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                let fileSize = 0;
                try { fileSize = fs.statSync(fullPath).size; } catch { /* ignore */ }

                const baseName = path.basename(entry.name, path.extname(entry.name));
                const suggestion = suggestCategory(baseName, categories);
                items.push({
                    filename: entry.name,
                    filepath: fullPath,
                    isFolder: false,
                    fileCount: 1,
                    fileSize,
                    suggestedCategory: suggestion.category,
                    confidence: suggestion.confidence
                });
            }
        }

        // Sort: folders first, then by filename
        items.sort((a, b) => {
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
            return a.filename.localeCompare(b.filename);
        });

        res.json({ items });
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

        const modelDir = getModelDir();
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
                    // Move the whole folder into the category directory
                    const folderName = path.basename(filepath);
                    targetFolderPath = path.join(categoryDir, folderName);

                    if (fs.existsSync(targetFolderPath)) {
                        results.push({ filepath, success: false, error: `Target folder already exists: ${category}/${folderName}` });
                        continue;
                    }

                    fs.renameSync(filepath, targetFolderPath);
                } else {
                    // Single file: create a folder and move file into it
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

                // Index the new model
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
