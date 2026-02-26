import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import db from '../config/database.js';
import scanner, { ScanMode } from '../services/scanner.js';
import watcher from '../services/watcher.js';
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
// Accepts optional 'mode' parameter:
//   - 'full': Destructive scan - clears all data and rescans (default, legacy behavior)
//   - 'full_sync': Non-destructive sync - updates existing, adds new, removes deleted
//                  Preserves favorites, print history, and queue
//   - 'add_only': Only adds new models, never modifies or deletes existing
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

        // Get scan mode (default to 'full' for backward compatibility)
        const mode: ScanMode = req.body.mode || 'full';
        if (!['full', 'full_sync', 'add_only'].includes(mode)) {
            return res.status(400).json({ error: 'Invalid scan mode. Must be: full, full_sync, or add_only' });
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
        scanner.scanDirectory(modelDirectory, mode).catch(error => {
            console.error('Scan error:', error);
        });

        // Restart watcher if directory changed
        if (req.body.modelDirectory) {
            watcher.restart(modelDirectory).catch((err: Error) => {
                console.error('Failed to restart watcher after directory change:', err.message);
            });
        }

        res.json({ success: true, message: `Scan started (mode: ${mode})` });
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

// Get file watcher status
router.get('/watcher/status', (req, res) => {
    try {
        res.json(watcher.getStatus());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Enable or disable file watcher
router.post('/watcher/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled (boolean) is required' });
        }
        await watcher.setEnabled(enabled);
        res.json({ success: true, status: watcher.getStatus() });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Deduplicate images across all models (manual trigger)
router.post('/deduplicate-images', async (req, res) => {
    try {
        const result = await scanner.deduplicateAllImages();
        res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get all categories (excludes soft-deleted models)
router.get('/categories', (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT DISTINCT category, COUNT(*) as count
            FROM models
            WHERE deleted_at IS NULL
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
        const totalModels = (db.prepare('SELECT COUNT(*) as count FROM models WHERE deleted_at IS NULL').get() as { count: number }).count;
        const deletedModels = (db.prepare('SELECT COUNT(*) as count FROM models WHERE deleted_at IS NOT NULL').get() as { count: number }).count;
        const totalFavorites = (db.prepare('SELECT COUNT(*) as count FROM favorites').get() as { count: number }).count;
        const totalPrinted = (db.prepare('SELECT COUNT(*) as count FROM printed_models').get() as { count: number }).count;
        const totalQueued = (db.prepare('SELECT COUNT(*) as count FROM print_queue').get() as { count: number }).count;
        const totalLooseFiles = (db.prepare('SELECT COUNT(*) as count FROM loose_files').get() as { count: number }).count;

        res.json({
            totalModels,
            deletedModels,
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

// Get detailed statistics for the dashboard
router.get('/stats/detail', (req, res) => {
    try {
        // Models per category (top 20)
        const modelsByCategory = db.prepare(`
            SELECT category, COUNT(*) as count
            FROM models
            WHERE deleted_at IS NULL AND category IS NOT NULL
            GROUP BY category
            ORDER BY count DESC
            LIMIT 20
        `).all() as Array<{ category: string; count: number }>;

        // Prints per month (last 18 months)
        const printsByMonth = db.prepare(`
            SELECT
                strftime('%Y-%m', printed_at) as month,
                COUNT(*) as total,
                SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END) as bad_count
            FROM printed_models
            WHERE printed_at >= date('now', '-18 months')
            GROUP BY month
            ORDER BY month ASC
        `).all() as Array<{ month: string; total: number; good_count: number; bad_count: number }>;

        // Good vs bad print ratio
        const printRatings = db.prepare(`
            SELECT
                SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good,
                SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END) as bad,
                SUM(CASE WHEN rating IS NULL THEN 1 ELSE 0 END) as unrated
            FROM printed_models
        `).get() as { good: number; bad: number; unrated: number };

        // Most printed categories
        const topPrintedCategories = db.prepare(`
            SELECT m.category, COUNT(pm.id) as print_count
            FROM printed_models pm
            JOIN models m ON m.id = pm.model_id
            WHERE m.category IS NOT NULL
            GROUP BY m.category
            ORDER BY print_count DESC
            LIMIT 10
        `).all() as Array<{ category: string; print_count: number }>;

        // Average files per model
        const avgFilesRow = db.prepare(`
            SELECT AVG(file_count) as avg FROM models WHERE deleted_at IS NULL AND file_count > 0
        `).get() as { avg: number | null };

        // Total file size (from model_files)
        const fileSizeRow = db.prepare(`
            SELECT SUM(mf.file_size) as total
            FROM model_files mf
            JOIN models m ON m.id = mf.model_id
            WHERE m.deleted_at IS NULL
        `).get() as { total: number | null };

        // Print time and filament totals
        const printTotals = db.prepare(`
            SELECT
                SUM(print_time_hours) as total_hours,
                SUM(filament_used_grams) as total_grams
            FROM printed_models
            WHERE print_time_hours IS NOT NULL OR filament_used_grams IS NOT NULL
        `).get() as { total_hours: number | null; total_grams: number | null };

        // Models added per month (last 18 months)
        const modelsAddedByMonth = db.prepare(`
            SELECT
                strftime('%Y-%m', date_added) as month,
                COUNT(*) as count
            FROM models
            WHERE deleted_at IS NULL AND date_added >= date('now', '-18 months')
            GROUP BY month
            ORDER BY month ASC
        `).all() as Array<{ month: string; count: number }>;

        // Tag usage stats (top 15)
        const tagStats = db.prepare(`
            SELECT t.name, COUNT(mt.model_id) as model_count
            FROM tags t
            JOIN model_tags mt ON mt.tag_id = t.id
            GROUP BY t.id
            ORDER BY model_count DESC
            LIMIT 15
        `).all() as Array<{ name: string; model_count: number }>;

        // File type breakdown
        const fileTypes = db.prepare(`
            SELECT file_type, COUNT(*) as count
            FROM model_files mf
            JOIN models m ON m.id = mf.model_id
            WHERE m.deleted_at IS NULL AND file_type IS NOT NULL
            GROUP BY file_type
            ORDER BY count DESC
            LIMIT 10
        `).all() as Array<{ file_type: string; count: number }>;

        res.json({
            modelsByCategory,
            printsByMonth,
            printRatings,
            topPrintedCategories,
            avgFilesPerModel: avgFilesRow.avg ? Math.round(avgFilesRow.avg * 10) / 10 : 0,
            totalFileSize: fileSizeRow.total || 0,
            totalPrintTimeHours: printTotals?.total_hours || 0,
            totalFilamentGrams: printTotals?.total_grams || 0,
            modelsAddedByMonth,
            tagStats,
            fileTypes
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get loose files
router.get('/loose-files', (req, res) => {
    try {
        const looseFiles = db.prepare('SELECT * FROM loose_files ORDER BY filepath ASC').all();
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

// Show file or folder in Finder (macOS only)
router.post('/open-folder', (req, res) => {
    try {
        const { folderPath } = req.body;

        if (!folderPath) {
            return res.status(400).json({ error: 'folderPath is required' });
        }

        // Use 'open -R' to reveal the item in Finder (selects it in the parent folder)
        // This works for both files and folders
        exec(`open -R "${folderPath}"`, (error) => {
            if (error) {
                console.error('Failed to show in Finder:', error);
                return res.status(500).json({ error: 'Failed to show in Finder' });
            }
            res.json({ success: true });
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Move a loose file to macOS Trash
router.post('/trash-loose-file', async (req, res) => {
    try {
        const { looseFileId } = req.body;

        if (!looseFileId) {
            return res.status(400).json({ error: 'looseFileId is required' });
        }

        const looseFile = db.prepare('SELECT * FROM loose_files WHERE id = ?').get(looseFileId) as any;
        if (!looseFile) {
            return res.status(404).json({ error: 'Loose file not found' });
        }

        // Check file exists
        if (!fs.existsSync(looseFile.filepath)) {
            // File already gone, just remove from DB
            db.prepare('DELETE FROM loose_files WHERE id = ?').run(looseFileId);
            return res.json({ success: true, message: 'File not found on disk, removed from database' });
        }

        // Move to macOS Trash using osascript
        await new Promise<void>((resolve, reject) => {
            const escapedPath = looseFile.filepath.replace(/"/g, '\\"');
            exec(
                `osascript -e 'tell application "Finder" to delete POSIX file "${escapedPath}"'`,
                (error) => {
                    if (error) reject(error);
                    else resolve();
                }
            );
        });

        // Remove from database
        db.prepare('DELETE FROM loose_files WHERE id = ?').run(looseFileId);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
