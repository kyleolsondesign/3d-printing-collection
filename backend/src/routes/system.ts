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

        // Get scan scope (default to 'all')
        const scope: 'all' | 'paid' = req.body.scope || 'all';
        if (!['all', 'paid'].includes(scope)) {
            return res.status(400).json({ error: 'Invalid scope. Must be: all or paid' });
        }
        if (scope === 'paid' && mode === 'full') {
            return res.status(400).json({ error: 'Full rebuild is not supported with paid-only scope' });
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
        scanner.scanDirectory(modelDirectory, mode, scope).catch(error => {
            console.error('Scan error:', error);
        });

        // Restart watcher if directory changed
        if (req.body.modelDirectory) {
            watcher.restart(modelDirectory).catch((err: Error) => {
                console.error('Failed to restart watcher after directory change:', err.message);
            });
        }

        res.json({ success: true, message: `Scan started (mode: ${mode}, scope: ${scope})` });
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

// Audit: find models whose filepath is nested inside another model's filepath
router.get('/audit/nested-models', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT
                child.id AS child_id,
                child.filename AS child_filename,
                child.filepath AS child_filepath,
                child.category AS child_category,
                parent.id AS parent_id,
                parent.filename AS parent_filename,
                parent.filepath AS parent_filepath,
                parent.category AS parent_category
            FROM models child
            JOIN models parent ON child.filepath LIKE parent.filepath || '/%'
            WHERE child.deleted_at IS NULL AND parent.deleted_at IS NULL
            ORDER BY parent.filepath, child.filepath
        `).all() as Array<{
            child_id: number; child_filename: string; child_filepath: string; child_category: string;
            parent_id: number; parent_filename: string; parent_filepath: string; parent_category: string;
        }>;

        res.json({ count: rows.length, items: rows });
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

        // Prints per month (from 2026-03 onward, excluding Feb bulk-import)
        const printsByMonth = db.prepare(`
            SELECT
                strftime('%Y-%m', printed_at) as month,
                COUNT(*) as total,
                SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END) as bad_count
            FROM printed_models
            WHERE strftime('%Y-%m', printed_at) >= '2026-03'
            GROUP BY month
            ORDER BY month ASC
        `).all() as Array<{ month: string; total: number; good_count: number; bad_count: number }>;

        // Prints per day (from 2026-03 onward, for granular 30-day view)
        const printsByDay = db.prepare(`
            SELECT
                date(printed_at) as day,
                COUNT(*) as total,
                SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END) as bad_count
            FROM printed_models
            WHERE date(printed_at) >= '2026-03-01'
            GROUP BY day
            ORDER BY day ASC
        `).all() as Array<{ day: string; total: number; good_count: number; bad_count: number }>;

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
            SELECT m.category, COUNT(DISTINCT pm.model_id) as print_count
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
            printsByDay,
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

// Get designer statistics for the dashboard
router.get('/stats/designers', (req, res) => {
    try {
        const totalDesigners = (db.prepare('SELECT COUNT(*) as count FROM designers').get() as { count: number }).count;
        const modelsWithDesigner = (db.prepare('SELECT COUNT(*) as count FROM models WHERE designer_id IS NOT NULL AND deleted_at IS NULL').get() as { count: number }).count;
        const favoritedDesigners = (db.prepare('SELECT COUNT(*) as count FROM designer_favorites').get() as { count: number }).count;

        // Top designers by model count (top 15)
        const topByModelCount = db.prepare(`
            SELECT d.id, d.name, COUNT(m.id) as model_count
            FROM designers d
            LEFT JOIN models m ON m.designer_id = d.id AND m.deleted_at IS NULL
            GROUP BY d.id
            ORDER BY model_count DESC
            LIMIT 15
        `).all() as Array<{ id: number; name: string; model_count: number }>;

        // Top designers by how many of their models have been printed (top 10)
        // Use DISTINCT model_id to count each model once, even if printed multiple times
        const topByPrintCount = db.prepare(`
            SELECT d.id, d.name, COUNT(DISTINCT pm.model_id) as print_count
            FROM designers d
            JOIN models m ON m.designer_id = d.id AND m.deleted_at IS NULL
            JOIN printed_models pm ON pm.model_id = m.id
            GROUP BY d.id
            ORDER BY print_count DESC
            LIMIT 10
        `).all() as Array<{ id: number; name: string; print_count: number }>;

        // Print quality by designer (designers with at least 1 print, top 10 by total)
        // Use latest print record per model (most recent printed_at) to determine rating
        const printQuality = db.prepare(`
            SELECT d.id, d.name,
                SUM(CASE WHEN latest_pm.rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN latest_pm.rating = 'bad' THEN 1 ELSE 0 END) as bad_count,
                COUNT(latest_pm.model_id) as total_prints
            FROM designers d
            JOIN models m ON m.designer_id = d.id AND m.deleted_at IS NULL
            JOIN (
                SELECT model_id, rating
                FROM printed_models
                WHERE (model_id, printed_at) IN (
                    SELECT model_id, MAX(printed_at) FROM printed_models GROUP BY model_id
                )
            ) latest_pm ON latest_pm.model_id = m.id
            GROUP BY d.id
            HAVING total_prints >= 1
            ORDER BY total_prints DESC
            LIMIT 10
        `).all() as Array<{ id: number; name: string; good_count: number; bad_count: number; total_prints: number }>;

        res.json({
            totalDesigners,
            favoritedDesigners,
            modelsWithDesigner,
            topByModelCount,
            topByPrintCount,
            printQuality,
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

// Get purge candidates
router.get('/purge/candidates', (req, res) => {
    try {
        // Models with at least one purge signal
        const candidates = db.prepare(`
            SELECT DISTINCT
                m.id, m.filename, m.filepath, m.category, m.is_paid,
                m.purge_marked_at, m.deleted_at,
                CASE WHEN
                    EXISTS(SELECT 1 FROM printed_models WHERE model_id = m.id AND rating = 'bad')
                    AND NOT EXISTS(SELECT 1 FROM printed_models WHERE model_id = m.id AND rating = 'good')
                THEN 1 ELSE 0 END AS has_bad_print
            FROM models m
            WHERE
                m.is_paid = 0
                AND m.category != 'Paid'
                AND m.category != 'Original Creations'
                AND (
                    m.purge_marked_at IS NOT NULL
                    OR m.deleted_at IS NOT NULL
                    OR (
                        EXISTS(SELECT 1 FROM printed_models WHERE model_id = m.id AND rating = 'bad')
                        AND NOT EXISTS(SELECT 1 FROM printed_models WHERE model_id = m.id AND rating = 'good')
                    )
                )
            ORDER BY
                (CASE WHEN m.purge_marked_at IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN m.deleted_at IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN EXISTS(SELECT 1 FROM printed_models WHERE model_id = m.id AND rating = 'bad')
                       AND NOT EXISTS(SELECT 1 FROM printed_models WHERE model_id = m.id AND rating = 'good')
                 THEN 1 ELSE 0 END) DESC,
                COALESCE(m.purge_marked_at, m.deleted_at) DESC
        `).all() as Array<{
            id: number;
            filename: string;
            filepath: string;
            category: string;
            is_paid: number;
            purge_marked_at: string | null;
            deleted_at: string | null;
            has_bad_print: number;
        }>;

        const getPrimaryImage = db.prepare(`
            SELECT filepath FROM model_assets
            WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
            ORDER BY is_primary DESC, id ASC
            LIMIT 1
        `);

        const result = candidates.map(c => {
            const reasons: string[] = [];
            if (c.purge_marked_at) reasons.push('marked');
            if (c.deleted_at) {
                // Only flag "deleted" signal if folder is gone from disk
                if (!fs.existsSync(c.filepath)) reasons.push('deleted');
            }
            if (c.has_bad_print) reasons.push('bad_print');
            // Skip models that have no actual reasons (e.g. soft-deleted but folder still exists with no other signals)
            if (reasons.length === 0) return null;
            const imageRow = getPrimaryImage.get(c.id) as { filepath: string } | undefined;
            const primaryImage = imageRow?.filepath || null;
            return { id: c.id, filename: c.filename, filepath: c.filepath, category: c.category, is_paid: c.is_paid, purge_marked_at: c.purge_marked_at, deleted_at: c.deleted_at, reasons, primaryImage };
        }).filter(Boolean);

        res.json({ candidates: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Execute purge - move model folders to Trash and hard-delete records
router.post('/purge/execute', async (req, res) => {
    try {
        const { model_ids } = req.body as { model_ids: number[] };

        if (!Array.isArray(model_ids) || model_ids.length === 0) {
            return res.status(400).json({ error: 'model_ids must be a non-empty array' });
        }

        const models = model_ids.map(id =>
            db.prepare('SELECT id, filename, filepath, category, is_paid FROM models WHERE id = ?').get(id) as {
                id: number; filename: string; filepath: string; category: string; is_paid: number;
            } | undefined
        ).filter(Boolean) as Array<{ id: number; filename: string; filepath: string; category: string; is_paid: number }>;

        // Refuse to purge Paid or Original Creations models
        const protected_ = models.filter(m => m.is_paid || m.category === 'Paid' || m.category === 'Original Creations');
        if (protected_.length > 0) {
            return res.status(400).json({ error: `Cannot purge protected models: ${protected_.map(m => m.filename).join(', ')}` });
        }

        const results: Array<{ id: number; success: boolean; error?: string }> = [];

        for (const model of models) {
            try {
                // Get reasons before deletion for event log
                const hasBadPrint = db.prepare(`SELECT id FROM printed_models WHERE model_id = ? AND rating = 'bad'`).get(model.id);
                const modelRow = db.prepare('SELECT purge_marked_at, deleted_at FROM models WHERE id = ?').get(model.id) as { purge_marked_at: string | null; deleted_at: string | null };
                const reasons: string[] = [];
                if (modelRow?.purge_marked_at) reasons.push('marked');
                if (modelRow?.deleted_at && !fs.existsSync(model.filepath)) reasons.push('deleted');
                if (hasBadPrint) reasons.push('bad_print');

                // Move to Trash if folder exists
                if (fs.existsSync(model.filepath)) {
                    await new Promise<void>((resolve, reject) => {
                        const escapedPath = model.filepath.replace(/"/g, '\\"');
                        exec(
                            `osascript -e 'tell application "Finder" to delete POSIX file "${escapedPath}"'`,
                            (error) => {
                                if (error) reject(error);
                                else resolve();
                            }
                        );
                    });
                }

                // Record purge event before hard-deleting
                db.prepare(`
                    INSERT INTO purge_events (model_name, category, is_paid, reasons)
                    VALUES (?, ?, ?, ?)
                `).run(model.filename, model.category, model.is_paid, JSON.stringify(reasons));

                // Hard-delete all related records (cascades handle most, but be explicit)
                db.prepare('DELETE FROM models WHERE id = ?').run(model.id);

                results.push({ id: model.id, success: true });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                results.push({ id: model.id, success: false, error: msg });
            }
        }

        const purged = results.filter(r => r.success).length;
        const errors = results.filter(r => !r.success).map(r => `${r.id}: ${r.error}`);
        res.json({ success: true, purged, errors, results });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Purge stats
router.get('/stats/purge', (req, res) => {
    try {
        const totalPurged = (db.prepare('SELECT COUNT(*) as count FROM purge_events').get() as { count: number }).count;

        const byMonth = db.prepare(`
            SELECT strftime('%Y-%m', purged_at) as month, COUNT(*) as count
            FROM purge_events
            WHERE purged_at >= date('now', '-12 months')
            GROUP BY month
            ORDER BY month ASC
        `).all() as Array<{ month: string; count: number }>;

        const allReasons = db.prepare('SELECT reasons FROM purge_events WHERE reasons IS NOT NULL').all() as Array<{ reasons: string }>;
        const byReason: Record<string, number> = { marked: 0, deleted: 0, bad_print: 0 };
        for (const row of allReasons) {
            try {
                const reasons = JSON.parse(row.reasons) as string[];
                for (const r of reasons) {
                    if (r in byReason) byReason[r]++;
                }
            } catch {}
        }

        const byCategory = db.prepare(`
            SELECT category, COUNT(*) as count
            FROM purge_events
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY count DESC
            LIMIT 10
        `).all() as Array<{ category: string; count: number }>;

        res.json({ totalPurged, byMonth, byReason, byCategory });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
