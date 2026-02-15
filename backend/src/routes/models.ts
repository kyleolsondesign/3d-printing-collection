import express from 'express';
import db from '../config/database.js';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import scanner from '../services/scanner.js';
import extractZip from 'extract-zip';
import { exec } from 'child_process';

const router = express.Router();

// Get all models with pagination, filtering, and sorting
router.get('/', (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const category = req.query.category as string;
        const sort = req.query.sort as string || 'date_added';
        const order = req.query.order as string || 'desc';
        const includeDeleted = req.query.includeDeleted === 'true';
        const hidePrinted = req.query.hidePrinted === 'true';
        const hideQueued = req.query.hideQueued === 'true';
        const offset = (page - 1) * limit;

        let query = 'SELECT models.*, mm.designer, mm.source_platform, mm.source_url FROM models LEFT JOIN model_metadata mm ON mm.model_id = models.id';
        const params: any[] = [];
        const conditions: string[] = [];

        // Filter out soft-deleted models by default
        if (!includeDeleted) {
            conditions.push('deleted_at IS NULL');
        }

        if (category && category !== 'all') {
            conditions.push('category = ?');
            params.push(category);
        }

        if (hidePrinted) {
            conditions.push('NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        }

        if (hideQueued) {
            conditions.push('NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Map sort parameter to column name
        const sortColumns: Record<string, string> = {
            'date_added': 'date_added',
            'date_created': 'date_created',
            'name': 'filename',
            'category': 'category'
        };
        const sortColumn = sortColumns[sort] || 'date_added';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        query += ` ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, filename ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const models = db.prepare(query).all(...params) as any[];

        // Get primary image, favorite/queue/printed status for each model
        const modelsWithDetails = models.map(model => {
            const primaryImage = db.prepare(`
                SELECT filepath FROM model_assets
                WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
                ORDER BY is_primary DESC, id ASC
                LIMIT 1
            `).get(model.id) as { filepath: string } | undefined;

            const favorite = db.prepare('SELECT id FROM favorites WHERE model_id = ?').get(model.id);
            const queued = db.prepare('SELECT id FROM print_queue WHERE model_id = ?').get(model.id);
            const printed = db.prepare('SELECT rating FROM printed_models WHERE model_id = ? ORDER BY printed_at DESC LIMIT 1').get(model.id) as { rating: 'good' | 'bad' | null } | undefined;

            return {
                ...model,
                primaryImage: primaryImage?.filepath || null,
                isFavorite: !!favorite,
                isQueued: !!queued,
                isPrinted: !!printed,
                printRating: printed?.rating || null
            };
        });

        // Get total count with same filters
        let countQuery = 'SELECT COUNT(*) as total FROM models';
        const countParams: any[] = [];
        const countConditions: string[] = [];

        if (!includeDeleted) {
            countConditions.push('deleted_at IS NULL');
        }
        if (category && category !== 'all') {
            countConditions.push('category = ?');
            countParams.push(category);
        }
        if (hidePrinted) {
            countConditions.push('NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        }
        if (hideQueued) {
            countConditions.push('NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        }
        if (countConditions.length > 0) {
            countQuery += ' WHERE ' + countConditions.join(' AND ');
        }

        const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

        res.json({
            models: modelsWithDetails,
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

        const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as { filepath: string } | undefined;

        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // Get associated assets (exclude hidden)
        const assets = db.prepare('SELECT * FROM model_assets WHERE model_id = ? AND (is_hidden = 0 OR is_hidden IS NULL) ORDER BY is_primary DESC').all(id);

        // Check if in favorites
        const favorite = db.prepare('SELECT * FROM favorites WHERE model_id = ?').get(id);

        // Check if in print queue
        const queued = db.prepare('SELECT * FROM print_queue WHERE model_id = ?').get(id);

        // Get print history
        const printed = db.prepare('SELECT * FROM printed_models WHERE model_id = ? ORDER BY printed_at DESC').all(id);

        // Find ZIP files in the model folder
        const zipFiles: { filename: string; filepath: string; size: number }[] = [];
        const archiveExtensions = ['.zip', '.rar', '.7z'];

        function findZipsRecursive(dir: string) {
            try {
                if (!fs.existsSync(dir)) return;
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        findZipsRecursive(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (archiveExtensions.includes(ext)) {
                            const stats = fs.statSync(fullPath);
                            zipFiles.push({
                                filename: entry.name,
                                filepath: fullPath,
                                size: stats.size
                            });
                        }
                    }
                }
            } catch (err) {
                // Skip directories we can't read
            }
        }

        findZipsRecursive(model.filepath);

        // Get metadata from PDF extraction
        const metadata = db.prepare('SELECT * FROM model_metadata WHERE model_id = ?').get(id) || null;

        // Get tags
        const tags = db.prepare(`
            SELECT t.name FROM tags t
            JOIN model_tags mt ON mt.tag_id = t.id
            WHERE mt.model_id = ?
            ORDER BY t.name
        `).all(id) as Array<{ name: string }>;

        res.json({
            ...model,
            assets,
            zipFiles,
            isFavorite: !!favorite,
            isQueued: !!queued,
            printHistory: printed,
            metadata,
            tags: tags.map(t => t.name)
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

        // Use FTS5 for full-text search, exclude soft-deleted models
        const models = db.prepare(`
            SELECT models.* FROM models
            JOIN models_fts ON models.id = models_fts.rowid
            WHERE models_fts MATCH ? AND models.deleted_at IS NULL
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

// Rescan a single model folder
router.post('/:id/rescan', async (req, res) => {
    try {
        const { id } = req.params;
        const modelId = parseInt(id);

        if (isNaN(modelId)) {
            return res.status(400).json({ error: 'Invalid model ID' });
        }

        const result = await scanner.rescanModel(modelId);

        if (!result) {
            return res.status(404).json({ error: 'Model folder not found or contains no model files' });
        }

        // Get the updated model with assets
        const model = db.prepare('SELECT * FROM models WHERE id = ?').get(result.modelId) as Record<string, unknown> | undefined;
        const assets = db.prepare('SELECT * FROM model_assets WHERE model_id = ? ORDER BY is_primary DESC').all(result.modelId);
        const files = db.prepare('SELECT * FROM model_files WHERE model_id = ?').all(result.modelId);

        res.json({
            success: true,
            model: {
                ...model,
                assets,
                files
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get all files for a model
router.get('/:id/files', (req, res) => {
    try {
        const { id } = req.params;
        const files = db.prepare('SELECT * FROM model_files WHERE model_id = ?').all(id);
        res.json({ files });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Set primary image for a model
router.put('/:id/primary-image', (req, res) => {
    try {
        const { id } = req.params;
        const { assetId } = req.body;

        if (!assetId) {
            return res.status(400).json({ error: 'assetId is required' });
        }

        // Verify the asset belongs to this model and is an image
        const asset = db.prepare(`
            SELECT * FROM model_assets
            WHERE id = ? AND model_id = ? AND asset_type = 'image'
        `).get(assetId, id);

        if (!asset) {
            return res.status(404).json({ error: 'Image asset not found for this model' });
        }

        // Clear all primary flags for this model's images
        db.prepare(`
            UPDATE model_assets
            SET is_primary = 0
            WHERE model_id = ? AND asset_type = 'image'
        `).run(id);

        // Set the new primary image
        db.prepare(`
            UPDATE model_assets
            SET is_primary = 1
            WHERE id = ?
        `).run(assetId);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Extract ZIP file in model folder
router.post('/:id/extract-zip', async (req, res) => {
    try {
        const { id } = req.params;
        const { zipPath } = req.body;

        if (!zipPath) {
            return res.status(400).json({ error: 'zipPath is required' });
        }

        // Get model to verify it exists and get the folder path
        const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as { filepath: string } | undefined;
        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // Security: Ensure the ZIP is within the model's folder
        const resolvedZipPath = path.resolve(zipPath);
        const resolvedModelPath = path.resolve(model.filepath);
        if (!resolvedZipPath.startsWith(resolvedModelPath)) {
            return res.status(403).json({ error: 'ZIP file must be within model folder' });
        }

        // Check ZIP exists
        if (!fs.existsSync(resolvedZipPath)) {
            return res.status(404).json({ error: 'ZIP file not found' });
        }

        // Create extraction directory (ZIP filename without extension)
        const zipBasename = path.basename(resolvedZipPath, path.extname(resolvedZipPath));
        const extractDir = path.join(path.dirname(resolvedZipPath), zipBasename);

        // Avoid overwriting existing directory
        if (fs.existsSync(extractDir)) {
            return res.status(409).json({ error: 'Extraction directory already exists' });
        }

        // Extract the ZIP
        await extractZip(resolvedZipPath, { dir: extractDir });

        // Move ZIP to macOS Trash using osascript
        await new Promise<void>((resolve, reject) => {
            const escapedPath = resolvedZipPath.replace(/"/g, '\\"');
            exec(`osascript -e 'tell application "Finder" to delete POSIX file "${escapedPath}"'`, (error) => {
                if (error) {
                    console.error('Failed to move ZIP to trash:', error);
                    // Don't fail the request, just log the error
                }
                resolve();
            });
        });

        // Rescan the model folder to update the database
        const result = await scanner.rescanModel(parseInt(id));

        // Return the updated model data
        const updatedModel = db.prepare('SELECT * FROM models WHERE id = ?').get(id);
        const assets = db.prepare('SELECT * FROM model_assets WHERE model_id = ? ORDER BY is_primary DESC').all(id);
        const files = db.prepare('SELECT * FROM model_files WHERE model_id = ?').all(id);

        res.json({
            success: true,
            extractedTo: extractDir,
            model: {
                ...updatedModel,
                assets,
                files
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Bulk soft delete models
router.post('/bulk-delete', (req, res) => {
    try {
        const { model_ids } = req.body;

        if (!Array.isArray(model_ids) || model_ids.length === 0) {
            return res.status(400).json({ error: 'model_ids must be a non-empty array' });
        }

        const softDelete = db.prepare('UPDATE models SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?');
        let affected = 0;

        for (const modelId of model_ids) {
            const result = softDelete.run(modelId);
            if (result.changes > 0) affected++;
        }

        res.json({ success: true, affected });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Update model metadata (name)
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { filename } = req.body;

        if (!filename || typeof filename !== 'string' || filename.trim() === '') {
            return res.status(400).json({ error: 'filename is required and must be non-empty' });
        }

        const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id);
        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        const cleanName = filename.trim();
        db.prepare('UPDATE models SET filename = ? WHERE id = ?').run(cleanName, id);

        const updated = db.prepare('SELECT * FROM models WHERE id = ?').get(id);
        res.json({ success: true, model: updated });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Hide or unhide an asset (thumbnail)
router.put('/:id/assets/:assetId/hide', (req, res) => {
    try {
        const { id, assetId } = req.params;
        const { isHidden } = req.body;

        if (typeof isHidden !== 'boolean') {
            return res.status(400).json({ error: 'isHidden must be a boolean' });
        }

        const asset = db.prepare('SELECT * FROM model_assets WHERE id = ? AND model_id = ?').get(assetId, id) as any;
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found for this model' });
        }

        if (isHidden && asset.is_primary === 1) {
            return res.status(400).json({ error: 'Cannot hide the primary image. Set another image as primary first.' });
        }

        db.prepare('UPDATE model_assets SET is_hidden = ? WHERE id = ?').run(isHidden ? 1 : 0, assetId);

        res.json({ success: true, assetId: Number(assetId), isHidden });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
