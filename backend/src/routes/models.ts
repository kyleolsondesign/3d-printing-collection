import express from 'express';
import db from '../config/database.js';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import scanner from '../services/scanner.js';
import extractZip from 'extract-zip';
import { exec } from 'child_process';
import {
    suggestCategoryFuzzy,
    suggestCategoriesWithClaude,
    CategorizationItem,
} from '../services/categorization.js';

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
        const filterPrinted = req.query.filterPrinted as string || '';
        const filterQueued = req.query.filterQueued as string || '';
        const filterFavorites = req.query.filterFavorites as string || '';
        const noImage = req.query.noImage === 'true';
        // Legacy support
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

        // 3-state filters (new)
        if (filterPrinted === 'hide') {
            conditions.push('NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        } else if (filterPrinted === 'only') {
            conditions.push('EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        } else if (hidePrinted) {
            // Legacy boolean fallback
            conditions.push('NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        }

        if (filterQueued === 'hide') {
            conditions.push('NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        } else if (filterQueued === 'only') {
            conditions.push('EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        } else if (hideQueued) {
            conditions.push('NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        }

        if (filterFavorites === 'hide') {
            conditions.push('NOT EXISTS (SELECT 1 FROM favorites WHERE favorites.model_id = models.id)');
        } else if (filterFavorites === 'only') {
            conditions.push('EXISTS (SELECT 1 FROM favorites WHERE favorites.model_id = models.id)');
        }

        if (noImage) {
            conditions.push('NOT EXISTS (SELECT 1 FROM model_assets WHERE model_assets.model_id = models.id AND model_assets.asset_type = \'image\' AND (model_assets.is_hidden = 0 OR model_assets.is_hidden IS NULL))');
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
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        if (sort === 'random') {
            query += ` ORDER BY RANDOM() LIMIT ? OFFSET ?`;
        } else {
            const sortColumn = sortColumns[sort] || 'date_added';
            query += ` ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, filename ASC LIMIT ? OFFSET ?`;
        }
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
            const printing = db.prepare('SELECT id FROM currently_printing WHERE model_id = ?').get(model.id);

            return {
                ...model,
                primaryImage: primaryImage?.filepath || null,
                isFavorite: !!favorite,
                isQueued: !!queued,
                isPrinted: !!printed,
                printRating: printed?.rating || null,
                isPrinting: !!printing
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
        if (filterPrinted === 'hide') {
            countConditions.push('NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        } else if (filterPrinted === 'only') {
            countConditions.push('EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        } else if (hidePrinted) {
            countConditions.push('NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = models.id)');
        }
        if (filterQueued === 'hide') {
            countConditions.push('NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        } else if (filterQueued === 'only') {
            countConditions.push('EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        } else if (hideQueued) {
            countConditions.push('NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = models.id)');
        }
        if (filterFavorites === 'hide') {
            countConditions.push('NOT EXISTS (SELECT 1 FROM favorites WHERE favorites.model_id = models.id)');
        } else if (filterFavorites === 'only') {
            countConditions.push('EXISTS (SELECT 1 FROM favorites WHERE favorites.model_id = models.id)');
        }
        if (noImage) {
            countConditions.push('NOT EXISTS (SELECT 1 FROM model_assets WHERE model_assets.model_id = models.id AND model_assets.asset_type = \'image\' AND (model_assets.is_hidden = 0 OR model_assets.is_hidden IS NULL))');
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

// Get recently viewed models
router.get('/recent', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const recentModels = db.prepare(`
            SELECT rv.viewed_at, models.*, mm.designer, mm.source_platform, mm.source_url
            FROM recently_viewed rv
            JOIN models ON rv.model_id = models.id
            LEFT JOIN model_metadata mm ON mm.model_id = models.id
            WHERE models.deleted_at IS NULL
            ORDER BY rv.viewed_at DESC
            LIMIT ?
        `).all(limit) as any[];

        const modelsWithDetails = recentModels.map(model => {
            const primaryImage = db.prepare(`
                SELECT filepath FROM model_assets
                WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
                ORDER BY is_primary DESC, id ASC
                LIMIT 1
            `).get(model.id) as { filepath: string } | undefined;

            const favorite = db.prepare('SELECT id FROM favorites WHERE model_id = ?').get(model.id);
            const queued = db.prepare('SELECT id FROM print_queue WHERE model_id = ?').get(model.id);
            const printed = db.prepare('SELECT rating FROM printed_models WHERE model_id = ? ORDER BY printed_at DESC LIMIT 1').get(model.id) as { rating: 'good' | 'bad' | null } | undefined;
            const printing = db.prepare('SELECT id FROM currently_printing WHERE model_id = ?').get(model.id);

            return {
                ...model,
                primaryImage: primaryImage?.filepath || null,
                isFavorite: !!favorite,
                isQueued: !!queued,
                isPrinted: !!printed,
                printRating: printed?.rating || null,
                isPrinting: !!printing
            };
        });

        res.json({ models: modelsWithDetails });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Record a model view
router.post('/:id/view', (req, res) => {
    try {
        const { id } = req.params;
        const modelId = parseInt(id);

        if (isNaN(modelId)) {
            return res.status(400).json({ error: 'Invalid model ID' });
        }

        // Verify model exists
        const model = db.prepare('SELECT id FROM models WHERE id = ?').get(modelId);
        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // Upsert: insert or update viewed_at
        db.prepare(`
            INSERT INTO recently_viewed (model_id, viewed_at)
            VALUES (?, CURRENT_TIMESTAMP)
            ON CONFLICT(model_id) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP
        `).run(modelId);

        res.json({ success: true });
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

        // Check if currently printing
        const printing = db.prepare('SELECT id FROM currently_printing WHERE model_id = ?').get(id);

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
            SELECT t.id, t.name FROM tags t
            JOIN model_tags mt ON mt.tag_id = t.id
            WHERE mt.model_id = ?
            ORDER BY t.name
        `).all(id) as Array<{ id: number; name: string }>;

        res.json({
            ...model,
            assets,
            zipFiles,
            isFavorite: !!favorite,
            isQueued: !!queued,
            isPrinting: !!printing,
            printHistory: printed,
            metadata,
            tags
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
        const sort = req.query.sort as string || 'date_added';
        const order = req.query.order as string || 'desc';

        if (!query) {
            return res.status(400).json({ error: 'Search query required' });
        }

        // Build prefix search query for FTS5: append * to each term for prefix matching
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        const ftsQuery = terms.map(t => {
            // Escape FTS5 special characters and add prefix wildcard
            const escaped = t.replace(/['"*()]/g, '');
            return `"${escaped}"*`;
        }).join(' ');

        // Use FTS5 for prefix-aware search, then fall back to LIKE for substring matches
        let models: any[];
        try {
            models = db.prepare(`
                SELECT models.*, mm.designer, mm.source_platform, mm.source_url FROM models
                LEFT JOIN model_metadata mm ON mm.model_id = models.id
                JOIN models_fts ON models.id = models_fts.rowid
                WHERE models_fts MATCH ? AND models.deleted_at IS NULL
                ORDER BY rank
                LIMIT 100
            `).all(ftsQuery);
        } catch {
            // If FTS query fails (bad syntax), fall back to empty results for FTS
            models = [];
        }

        // Also find substring matches not caught by FTS prefix search
        const likePattern = `%${query}%`;
        const likeModels = db.prepare(`
            SELECT models.*, mm.designer, mm.source_platform, mm.source_url FROM models
            LEFT JOIN model_metadata mm ON mm.model_id = models.id
            WHERE models.deleted_at IS NULL
              AND (models.filename LIKE ? OR models.filepath LIKE ? OR models.category LIKE ?)
            LIMIT 100
        `).all(likePattern, likePattern, likePattern) as any[];

        // Merge results, FTS first (ranked), then LIKE matches not already included
        const seenIds = new Set(models.map((m: any) => m.id));
        for (const m of likeModels) {
            if (!seenIds.has(m.id)) {
                models.push(m);
                seenIds.add(m.id);
            }
        }

        // Apply sort/order to merged results
        if (sort === 'random') {
            for (let i = models.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [models[i], models[j]] = [models[j], models[i]];
            }
        } else {
            const sortColumns: Record<string, string> = {
                'date_added': 'date_added',
                'date_created': 'date_created',
                'name': 'filename',
                'category': 'category'
            };
            const sortCol = sortColumns[sort] || 'date_added';
            const sortDir = order.toLowerCase() === 'asc' ? 1 : -1;
            models.sort((a: any, b: any) => {
                const av = a[sortCol] ?? '';
                const bv = b[sortCol] ?? '';
                if (av < bv) return -1 * sortDir;
                if (av > bv) return 1 * sortDir;
                return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0;
            });
        }

        // Get primary image and status for each search result
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
            const printing = db.prepare('SELECT id FROM currently_printing WHERE model_id = ?').get(model.id);

            return {
                ...model,
                primaryImage: primaryImage?.filepath || null,
                isFavorite: !!favorite,
                isQueued: !!queued,
                isPrinted: !!printed,
                printRating: printed?.rating || null,
                isPrinting: !!printing
            };
        });

        res.json({ models: modelsWithDetails, count: modelsWithDetails.length });
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

// Bulk rescan multiple model folders
router.post('/bulk-rescan', async (req, res) => {
    try {
        const { ids } = req.body as { ids: number[] };
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }
        let succeeded = 0;
        let failed = 0;
        for (const id of ids) {
            try {
                const result = await scanner.rescanModel(id);
                if (result) succeeded++; else failed++;
            } catch {
                failed++;
            }
        }
        res.json({ success: true, succeeded, failed });
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
        const modelId = parseInt(id);
        const result = await scanner.rescanModel(modelId);

        // Return the updated model data (ID is preserved by rescanModel)
        const updatedModel = db.prepare('SELECT * FROM models WHERE id = ?').get(modelId) as any;
        const assets = db.prepare('SELECT * FROM model_assets WHERE model_id = ? ORDER BY is_primary DESC').all(modelId);
        const files = db.prepare('SELECT * FROM model_files WHERE model_id = ?').all(modelId);

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

// Bulk reassign category - moves model folders to a new category directory
router.post('/bulk-reassign-category', async (req, res) => {
    try {
        const { model_ids, new_category } = req.body;

        if (!Array.isArray(model_ids) || model_ids.length === 0) {
            return res.status(400).json({ error: 'model_ids must be a non-empty array' });
        }
        if (!new_category || typeof new_category !== 'string' || !new_category.trim()) {
            return res.status(400).json({ error: 'new_category is required' });
        }

        const category = new_category.trim();
        const config = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory') as { value: string } | undefined;
        if (!config) {
            return res.status(400).json({ error: 'Model directory not configured' });
        }
        const modelRoot = config.value;

        const results: Array<{ id: number; success: boolean; error?: string; newFilepath?: string }> = [];

        for (const modelId of model_ids) {
            const model = db.prepare('SELECT * FROM models WHERE id = ? AND deleted_at IS NULL').get(modelId) as { id: number; filepath: string; category: string } | undefined;
            if (!model) {
                results.push({ id: modelId, success: false, error: 'Model not found' });
                continue;
            }

            if (model.category === category) {
                results.push({ id: modelId, success: true, newFilepath: model.filepath });
                continue;
            }

            const folderName = path.basename(model.filepath);
            const newCategoryDir = path.join(modelRoot, category);
            const newFilepath = path.join(newCategoryDir, folderName);

            try {
                // Create category directory if it doesn't exist
                if (!fs.existsSync(newCategoryDir)) {
                    fs.mkdirSync(newCategoryDir, { recursive: true });
                }

                // Check for collision
                if (fs.existsSync(newFilepath)) {
                    results.push({ id: modelId, success: false, error: `Destination already exists: ${newFilepath}` });
                    continue;
                }

                // Move the folder
                fs.renameSync(model.filepath, newFilepath);

                // Update DB: model filepath and category
                db.prepare('UPDATE models SET filepath = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(newFilepath, category, modelId);

                // Update model_files filepaths
                const modelFiles = db.prepare('SELECT id, filepath FROM model_files WHERE model_id = ?').all(modelId) as Array<{ id: number; filepath: string }>;
                for (const file of modelFiles) {
                    const updatedFilepath = file.filepath.replace(model.filepath, newFilepath);
                    db.prepare('UPDATE model_files SET filepath = ? WHERE id = ?').run(updatedFilepath, file.id);
                }

                // Update model_assets filepaths
                const assets = db.prepare('SELECT id, filepath FROM model_assets WHERE model_id = ?').all(modelId) as Array<{ id: number; filepath: string }>;
                for (const asset of assets) {
                    const updatedFilepath = asset.filepath.replace(model.filepath, newFilepath);
                    db.prepare('UPDATE model_assets SET filepath = ? WHERE id = ?').run(updatedFilepath, asset.id);
                }

                results.push({ id: modelId, success: true, newFilepath });
            } catch (moveError) {
                const errMsg = moveError instanceof Error ? moveError.message : String(moveError);
                results.push({ id: modelId, success: false, error: errMsg });
            }
        }

        const succeeded = results.filter(r => r.success).length;
        res.json({ success: true, results, succeeded, total: model_ids.length });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Suggest categories for a set of models using fuzzy or AI matching
router.post('/suggest-categories', async (req, res) => {
    try {
        const { model_ids, use_ai } = req.body;

        if (!Array.isArray(model_ids) || model_ids.length === 0) {
            return res.status(400).json({ error: 'model_ids must be a non-empty array' });
        }

        // Fetch models
        const placeholders = model_ids.map(() => '?').join(',');
        const models = db.prepare(
            `SELECT id, filename, filepath, category FROM models WHERE id IN (${placeholders}) AND deleted_at IS NULL`
        ).all(...model_ids) as Array<{ id: number; filename: string; filepath: string; category: string }>;

        if (models.length === 0) {
            return res.json({ suggestions: [], used_ai: false });
        }

        // Get model file names from model_files table (no disk reads needed)
        const modelFileNamesByModel = new Map<number, string[]>();
        for (const model of models) {
            const files = db.prepare('SELECT filename FROM model_files WHERE model_id = ?')
                .all(model.id) as Array<{ filename: string }>;
            modelFileNamesByModel.set(model.id, files.map(f => f.filename));
        }

        // Get all categories for scoring
        const categories = (db.prepare(
            'SELECT DISTINCT category FROM models WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category'
        ).all() as Array<{ category: string }>).map(r => r.category);

        // Determine whether to use AI
        const apiKey = use_ai
            ? (db.prepare('SELECT value FROM config WHERE key = ?').get('anthropic_api_key') as { value: string } | undefined)?.value || null
            : null;
        let usedAi = false;

        const suggestionMap = new Map<number, { category: string; confidence: 'high' | 'medium' | 'low' }>();

        if (apiKey) {
            try {
                const items: CategorizationItem[] = models.map(m => ({
                    identifier: m.id.toString(),
                    name: m.filename,
                    modelFileNames: modelFileNamesByModel.get(m.id) || [],
                }));
                const aiResults = await suggestCategoriesWithClaude(items, categories, apiKey);
                for (const [idStr, result] of aiResults) {
                    suggestionMap.set(parseInt(idStr), result);
                }
                usedAi = true;
            } catch (aiError) {
                console.error('[suggest-categories] AI failed, falling back to fuzzy:', aiError);
            }
        }

        // Build final suggestions: AI where available, fuzzy fallback otherwise
        const suggestions = models.map(model => {
            let suggested: { category: string; confidence: 'high' | 'medium' | 'low' };
            let debugScores: Array<{ category: string; score: number; source: string }> = [];

            if (suggestionMap.has(model.id)) {
                suggested = suggestionMap.get(model.id)!;
            } else {
                const fuzzy = suggestCategoryFuzzy({
                    name: model.filename,
                    modelFileNames: modelFileNamesByModel.get(model.id) || [],
                }, categories);
                suggested = { category: fuzzy.category, confidence: fuzzy.confidence };
                debugScores = fuzzy.debugScores;
            }

            return {
                model_id: model.id,
                model_name: model.filename,
                current_category: model.category,
                suggested_category: suggested.category,
                confidence: suggested.confidence,
                debug_scores: debugScores,
            };
        });

        res.json({ suggestions, used_ai: usedAi });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Update model metadata (name)
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { filename, notes } = req.body;

        const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id);
        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        if (filename !== undefined) {
            if (typeof filename !== 'string' || filename.trim() === '') {
                return res.status(400).json({ error: 'filename must be non-empty' });
            }
            db.prepare('UPDATE models SET filename = ? WHERE id = ?').run(filename.trim(), id);
        }

        if (notes !== undefined) {
            db.prepare('UPDATE models SET notes = ? WHERE id = ?').run(notes || null, id);
        }

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

// Toggle purge mark on a model
router.post('/:id/toggle-purge-mark', (req, res) => {
    try {
        const { id } = req.params;
        const model = db.prepare('SELECT id, purge_marked_at FROM models WHERE id = ?').get(id) as { id: number; purge_marked_at: string | null } | undefined;

        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        if (model.purge_marked_at) {
            db.prepare('UPDATE models SET purge_marked_at = NULL WHERE id = ?').run(id);
            res.json({ success: true, purge_marked_at: null });
        } else {
            db.prepare('UPDATE models SET purge_marked_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
            const updated = db.prepare('SELECT purge_marked_at FROM models WHERE id = ?').get(id) as { purge_marked_at: string };
            res.json({ success: true, purge_marked_at: updated.purge_marked_at });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
