import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import db from '../config/database.js';
import scanner from '../services/scanner.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';

const router = express.Router();

// Get configuration
router.get('/config', (req, res) => {
    try {
        const configs = db.prepare('SELECT * FROM config').all() as { key: string; value: string }[];

        const configObject: Record<string, string> = {};
        for (const config of configs) {
            configObject[config.key] = config.value;
        }

        res.json(configObject);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Set configuration
router.post('/config', (req, res) => {
    try {
        const { key, value } = req.body;

        if (!key || !value) {
            return res.status(400).json({ error: 'key and value are required' });
        }

        db.prepare(`
            INSERT INTO config (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `).run(key, value, value);

        res.json({ success: true, key, value });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Trigger scan
router.post('/scan', async (req, res) => {
    try {
        // Get model directory from config or request
        let modelDirectory = req.body.modelDirectory;

        if (!modelDirectory) {
            const configResult = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory');
            if (configResult) {
                modelDirectory = (configResult as { value: string }).value;
            }
        }

        if (!modelDirectory) {
            return res.status(400).json({ error: 'Model directory not configured' });
        }

        // Save model directory to config if provided
        if (req.body.modelDirectory) {
            db.prepare(`
                INSERT INTO config (key, value)
                VALUES ('model_directory', ?)
                ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
            `).run(modelDirectory, modelDirectory);
        }

        // Start scan (async)
        scanner.scanDirectory(modelDirectory).catch(error => {
            console.error('Scan error:', error);
        });

        res.json({ success: true, message: 'Scan started' });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get scan status
router.get('/scan/status', (req, res) => {
    try {
        const progress = scanner.getProgress();
        res.json(progress);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get all categories
router.get('/categories', (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT DISTINCT category, COUNT(*) as count
            FROM models
            GROUP BY category
            ORDER BY category
        `).all();

        res.json({ categories });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get statistics
router.get('/stats', (req, res) => {
    try {
        const totalModels = (db.prepare('SELECT COUNT(*) as count FROM models').get() as { count: number }).count;
        const totalFavorites = (db.prepare('SELECT COUNT(*) as count FROM favorites').get() as { count: number }).count;
        const totalPrinted = (db.prepare('SELECT COUNT(*) as count FROM printed_models').get() as { count: number }).count;
        const totalQueued = (db.prepare('SELECT COUNT(*) as count FROM print_queue').get() as { count: number }).count;
        const totalLooseFiles = (db.prepare('SELECT COUNT(*) as count FROM loose_files').get() as { count: number }).count;

        res.json({
            totalModels,
            totalFavorites,
            totalPrinted,
            totalQueued,
            totalLooseFiles
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get loose files
router.get('/loose-files', (req, res) => {
    try {
        const looseFiles = db.prepare('SELECT * FROM loose_files ORDER BY filename ASC').all();
        res.json({ looseFiles });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Organize a single loose file into a folder
router.post('/organize-loose-file', async (req, res) => {
    try {
        const { looseFileId } = req.body;

        if (!looseFileId) {
            return res.status(400).json({ error: 'looseFileId is required' });
        }

        // Get the loose file
        const looseFile = db.prepare('SELECT * FROM loose_files WHERE id = ?').get(looseFileId) as {
            id: number;
            filename: string;
            filepath: string;
            file_type: string;
        } | undefined;

        if (!looseFile) {
            return res.status(404).json({ error: 'Loose file not found' });
        }

        // Get root path from config
        const configResult = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory') as { value: string } | undefined;
        if (!configResult) {
            return res.status(500).json({ error: 'Model directory not configured' });
        }

        // Create folder name from filename (cleaned up)
        const fileBaseName = path.basename(looseFile.filename, path.extname(looseFile.filename));
        const cleanedFolderName = cleanupFolderName(fileBaseName);
        const parentDir = path.dirname(looseFile.filepath);
        const newFolderPath = path.join(parentDir, cleanedFolderName);

        // Check if folder already exists
        if (fs.existsSync(newFolderPath)) {
            return res.status(400).json({ error: `Folder already exists: ${cleanedFolderName}` });
        }

        // Create the folder
        fs.mkdirSync(newFolderPath, { recursive: true });

        // Move the file into the folder
        const newFilePath = path.join(newFolderPath, looseFile.filename);
        fs.renameSync(looseFile.filepath, newFilePath);

        // Remove from loose_files table
        db.prepare('DELETE FROM loose_files WHERE id = ?').run(looseFileId);

        // Scan the new folder
        const result = await scanner.scanSingleFolder(newFolderPath, configResult.value);

        res.json({
            success: true,
            organized: {
                originalPath: looseFile.filepath,
                newFolderPath,
                newFilePath,
                model: result
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Organize multiple loose files into folders (bulk)
router.post('/organize-loose-files', async (req, res) => {
    try {
        const { looseFileIds } = req.body;

        if (!looseFileIds || !Array.isArray(looseFileIds) || looseFileIds.length === 0) {
            return res.status(400).json({ error: 'looseFileIds array is required' });
        }

        // Get root path from config
        const configResult = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory') as { value: string } | undefined;
        if (!configResult) {
            return res.status(500).json({ error: 'Model directory not configured' });
        }

        const results: Array<{
            looseFileId: number;
            success: boolean;
            error?: string;
            model?: { modelId: number; filename: string } | null;
        }> = [];

        for (const looseFileId of looseFileIds) {
            try {
                // Get the loose file
                const looseFile = db.prepare('SELECT * FROM loose_files WHERE id = ?').get(looseFileId) as {
                    id: number;
                    filename: string;
                    filepath: string;
                    file_type: string;
                } | undefined;

                if (!looseFile) {
                    results.push({ looseFileId, success: false, error: 'Not found' });
                    continue;
                }

                // Create folder name from filename (cleaned up)
                const fileBaseName = path.basename(looseFile.filename, path.extname(looseFile.filename));
                const cleanedFolderName = cleanupFolderName(fileBaseName);
                const parentDir = path.dirname(looseFile.filepath);
                const newFolderPath = path.join(parentDir, cleanedFolderName);

                // Check if folder already exists
                if (fs.existsSync(newFolderPath)) {
                    results.push({ looseFileId, success: false, error: `Folder already exists: ${cleanedFolderName}` });
                    continue;
                }

                // Create the folder
                fs.mkdirSync(newFolderPath, { recursive: true });

                // Move the file into the folder
                const newFilePath = path.join(newFolderPath, looseFile.filename);
                fs.renameSync(looseFile.filepath, newFilePath);

                // Remove from loose_files table
                db.prepare('DELETE FROM loose_files WHERE id = ?').run(looseFileId);

                // Scan the new folder
                const model = await scanner.scanSingleFolder(newFolderPath, configResult.value);

                results.push({ looseFileId, success: true, model });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                results.push({ looseFileId, success: false, error: message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            summary: {
                total: looseFileIds.length,
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

// Open folder in Finder (macOS only)
router.post('/open-folder', (req, res) => {
    try {
        const { folderPath } = req.body;

        if (!folderPath) {
            return res.status(400).json({ error: 'folderPath is required' });
        }

        // Use macOS 'open' command to reveal folder in Finder
        exec(`open "${folderPath}"`, (error) => {
            if (error) {
                console.error('Failed to open folder:', error);
                return res.status(500).json({ error: 'Failed to open folder' });
            }
            res.json({ success: true });
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
