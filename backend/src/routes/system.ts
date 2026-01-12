import express from 'express';
import { exec } from 'child_process';
import db from '../config/database.js';
import scanner from '../services/scanner.js';

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
