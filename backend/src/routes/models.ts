import express from 'express';
import db from '../config/database.js';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

const router = express.Router();

// Get all models with pagination and filtering
router.get('/', (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const category = req.query.category as string;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM models';
        const params: any[] = [];

        if (category && category !== 'all') {
            query += ' WHERE category = ?';
            params.push(category);
        }

        query += ' ORDER BY filename ASC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const models = db.prepare(query).all(...params) as any[];

        // Get primary image for each model
        const modelsWithImages = models.map(model => {
            const primaryImage = db.prepare(`
                SELECT filepath FROM model_assets
                WHERE model_id = ? AND asset_type = 'image'
                ORDER BY is_primary DESC, id ASC
                LIMIT 1
            `).get(model.id) as { filepath: string } | undefined;

            return {
                ...model,
                primaryImage: primaryImage?.filepath || null
            };
        });

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM models';
        const countParams: any[] = [];
        if (category && category !== 'all') {
            countQuery += ' WHERE category = ?';
            countParams.push(category);
        }

        const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

        res.json({
            models: modelsWithImages,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get model by ID with assets
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;

        const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id);

        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // Get associated assets
        const assets = db.prepare('SELECT * FROM model_assets WHERE model_id = ? ORDER BY is_primary DESC').all(id);

        // Check if in favorites
        const favorite = db.prepare('SELECT * FROM favorites WHERE model_id = ?').get(id);

        // Check if in print queue
        const queued = db.prepare('SELECT * FROM print_queue WHERE model_id = ?').get(id);

        // Get print history
        const printed = db.prepare('SELECT * FROM printed_models WHERE model_id = ? ORDER BY printed_at DESC').all(id);

        res.json({
            ...model,
            assets,
            isFavorite: !!favorite,
            isQueued: !!queued,
            printHistory: printed
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Search models
router.get('/search/query', (req, res) => {
    try {
        const query = req.query.q as string;

        if (!query) {
            return res.status(400).json({ error: 'Search query required' });
        }

        // Use FTS5 for full-text search
        const models = db.prepare(`
            SELECT models.* FROM models
            JOIN models_fts ON models.id = models_fts.rowid
            WHERE models_fts MATCH ?
            ORDER BY rank
            LIMIT 100
        `).all(query);

        res.json({ models, count: models.length });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Serve file (model, image, PDF)
router.get('/file/serve', (req, res) => {
    try {
        const filepath = req.query.path as string;

        if (!filepath) {
            return res.status(400).json({ error: 'File path required' });
        }

        // Get configured model directory
        const configResult = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory');

        if (!configResult) {
            return res.status(500).json({ error: 'Model directory not configured' });
        }

        const modelRoot = (configResult as { value: string }).value;

        // Security: Ensure requested path is within model directory
        const resolvedPath = path.resolve(filepath);
        const resolvedRoot = path.resolve(modelRoot);

        if (!resolvedPath.startsWith(resolvedRoot)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Set appropriate content type
        const mimeType = mime.lookup(resolvedPath);
        if (mimeType) {
            res.setHeader('Content-Type', mimeType);
        }

        res.sendFile(resolvedPath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
