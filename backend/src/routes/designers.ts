import express from 'express';
import db from '../config/database.js';
import path from 'path';

const router = express.Router();

// Sync progress state
interface SyncProgress {
    active: boolean;
    phase: 'idle' | 'paid_models' | 'metadata_models' | 'complete';
    phaseDescription: string;
    totalItems: number;
    processedItems: number;
    created: number;
    linked: number;
}

let syncProgress: SyncProgress = {
    active: false,
    phase: 'idle',
    phaseDescription: '',
    totalItems: 0,
    processedItems: 0,
    created: 0,
    linked: 0
};

// Get sync status
router.get('/sync/status', (_req, res) => {
    res.json(syncProgress);
});

// List all designers with model counts
router.get('/', (req, res) => {
    try {
        const filter = req.query.filter as string | undefined;
        const favoritesOnly = req.query.favoritesOnly === 'true';

        const conditions: string[] = [];
        if (favoritesOnly) {
            conditions.push('EXISTS (SELECT 1 FROM designer_favorites df WHERE df.designer_id = d.id)');
        }

        let havingClause = '';
        if (filter === 'paid') {
            havingClause = 'HAVING SUM(CASE WHEN m.is_paid = 1 THEN 1 ELSE 0 END) > 0';
        } else if (filter === 'free') {
            havingClause = 'HAVING SUM(CASE WHEN m.is_paid = 1 THEN 1 ELSE 0 END) = 0';
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const rows = db.prepare(`
            SELECT
                d.id, d.name, d.profile_url, d.notes, d.created_at, d.updated_at,
                COUNT(m.id) as model_count,
                MAX(m.date_added) as latest_model_date,
                SUM(CASE WHEN m.is_paid = 1 THEN 1 ELSE 0 END) as paid_model_count,
                CASE WHEN df.designer_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                (
                    SELECT GROUP_CONCAT(sub.filepath, '|||')
                    FROM (
                        SELECT ma.filepath
                        FROM model_assets ma
                        INNER JOIN models inner_m ON inner_m.id = ma.model_id
                        LEFT JOIN favorites fav ON fav.model_id = inner_m.id
                        WHERE inner_m.designer_id = d.id
                          AND inner_m.deleted_at IS NULL
                          AND ma.asset_type = 'image'
                          AND (ma.is_hidden = 0 OR ma.is_hidden IS NULL)
                          AND ma.is_primary = 1
                        ORDER BY (CASE WHEN fav.model_id IS NOT NULL THEN 0 ELSE 1 END) ASC,
                                 inner_m.date_added DESC NULLS LAST
                        LIMIT 4
                    ) sub
                ) as preview_images_raw
            FROM designers d
            LEFT JOIN models m ON m.designer_id = d.id AND m.deleted_at IS NULL
            LEFT JOIN designer_favorites df ON df.designer_id = d.id
            ${whereClause}
            GROUP BY d.id
            ${havingClause}
            ORDER BY d.name ASC
        `).all() as any[];
        const designers = rows.map((d: any) => ({
            ...d,
            preview_images: d.preview_images_raw ? d.preview_images_raw.split('|||') : [],
            preview_images_raw: undefined
        }));
        res.json(designers);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Toggle designer favorite
router.post('/:id/favorite', (req, res) => {
    try {
        const { id } = req.params;
        const designer = db.prepare('SELECT id FROM designers WHERE id = ?').get(id);
        if (!designer) {
            return res.status(404).json({ error: 'Designer not found' });
        }
        const existing = db.prepare('SELECT 1 FROM designer_favorites WHERE designer_id = ?').get(id);
        if (existing) {
            db.prepare('DELETE FROM designer_favorites WHERE designer_id = ?').run(id);
            res.json({ is_favorite: false });
        } else {
            db.prepare('INSERT INTO designer_favorites (designer_id) VALUES (?)').run(id);
            res.json({ is_favorite: true });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get a single designer with their models
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;
        const sort = req.query.sort as string || 'date_added';
        const order = req.query.order as string || 'desc';
        const q = (req.query.q as string || '').trim();

        // Status filters: 'hide' or 'only'
        const filterPrinted = req.query.filterPrinted as string | undefined;
        const filterQueued = req.query.filterQueued as string | undefined;
        const filterFavorites = req.query.filterFavorites as string | undefined;

        const designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(id) as any;
        if (!designer) {
            return res.status(404).json({ error: 'Designer not found' });
        }

        // Validate sort field
        const sortColumns: Record<string, string> = {
            'date_added': 'm.date_added',
            'date_created': 'm.date_created',
            'name': 'm.filename',
            'category': 'm.category'
        };
        const sortCol = sortColumns[sort] || 'm.date_added';
        const sortDir = order === 'asc' ? 'ASC' : 'DESC';
        const nullsClause = sort === 'name' || sort === 'category' ? '' : ' NULLS LAST';

        // Build extra WHERE conditions
        const extraClauses: string[] = [];
        if (q) extraClauses.push('AND m.filename LIKE ?');
        if (filterPrinted === 'hide') extraClauses.push('AND NOT EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = m.id)');
        if (filterPrinted === 'only') extraClauses.push('AND EXISTS (SELECT 1 FROM printed_models WHERE printed_models.model_id = m.id)');
        if (filterQueued === 'hide') extraClauses.push('AND NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = m.id)');
        if (filterQueued === 'only') extraClauses.push('AND EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = m.id)');
        if (filterFavorites === 'hide') extraClauses.push('AND NOT EXISTS (SELECT 1 FROM favorites WHERE favorites.model_id = m.id)');
        if (filterFavorites === 'only') extraClauses.push('AND EXISTS (SELECT 1 FROM favorites WHERE favorites.model_id = m.id)');

        const extraWhere = extraClauses.join(' ');
        const baseParams: any[] = [id];
        if (q) baseParams.push(`%${q}%`);

        const totalRow = db.prepare(`SELECT COUNT(*) as total FROM models m WHERE m.designer_id = ? AND m.deleted_at IS NULL ${extraWhere}`).get(...baseParams) as { total: number };
        const models = db.prepare(`
            SELECT m.*,
                (SELECT filepath FROM model_assets WHERE model_id = m.id AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL) ORDER BY is_primary DESC, id ASC LIMIT 1) as primaryImage,
                (SELECT 1 FROM favorites WHERE model_id = m.id) as isFavorite,
                (SELECT 1 FROM print_queue WHERE model_id = m.id) as isQueued,
                (SELECT rating FROM printed_models WHERE model_id = m.id ORDER BY printed_at DESC LIMIT 1) as printRating
            FROM models m
            WHERE m.designer_id = ? AND m.deleted_at IS NULL ${extraWhere}
            ORDER BY ${sortCol} ${sortDir}${nullsClause}, m.filename ASC
            LIMIT ? OFFSET ?
        `).all(...baseParams, limit, offset) as any[];

        res.json({
            ...designer,
            models,
            total: totalRow.total,
            page,
            totalPages: Math.ceil(totalRow.total / limit)
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Create a designer
router.post('/', (req, res) => {
    try {
        const { name, profile_url, notes } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }

        const existing = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(name.trim()) as any;
        if (existing) {
            return res.json(existing);
        }

        const result = db.prepare('INSERT INTO designers (name, profile_url, notes) VALUES (?, ?, ?)').run(name.trim(), profile_url || null, notes || null);
        const designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(designer);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Update a designer
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, profile_url, notes } = req.body;

        const designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(id) as any;
        if (!designer) {
            return res.status(404).json({ error: 'Designer not found' });
        }

        if (name !== undefined) {
            db.prepare('UPDATE designers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name.trim(), id);
        }
        if (profile_url !== undefined) {
            db.prepare('UPDATE designers SET profile_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(profile_url || null, id);
        }
        if (notes !== undefined) {
            db.prepare('UPDATE designers SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(notes || null, id);
        }

        const updated = db.prepare('SELECT * FROM designers WHERE id = ?').get(id);
        res.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Delete a designer (unlinks models but doesn't delete them)
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('UPDATE models SET designer_id = NULL WHERE designer_id = ?').run(id);
        db.prepare('DELETE FROM designers WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Helper: upsert designer by name, returns designer record
function upsertDesigner(designerName: string, profileUrl?: string | null): any {
    let designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(designerName) as any;
    if (!designer) {
        const result = db.prepare('INSERT OR IGNORE INTO designers (name, profile_url) VALUES (?, ?)').run(designerName, profileUrl || null);
        designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(result.lastInsertRowid) as any;
        if (!designer) {
            designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(designerName) as any;
        }
        return { designer, isNew: true };
    }
    // Update profile URL if missing
    if (profileUrl && !designer.profile_url) {
        db.prepare('UPDATE designers SET profile_url = ? WHERE id = ?').run(profileUrl, designer.id);
    }
    return { designer, isNew: false };
}

/**
 * Core designer sync logic — used by both the scanner (automatic) and the standalone API endpoint.
 * Returns { created, linked } counts.
 */
export function syncDesignersCore(
    modelRoot: string,
    onProgress?: (phase: string, description: string, processed: number, total: number, created: number, linked: number) => void
): { created: number; linked: number } {
    let created = 0;
    let linked = 0;

    // Phase 1: Paid model folder structure
    const paidModels = db.prepare(`
        SELECT id, filepath, category FROM models WHERE is_paid = 1 AND deleted_at IS NULL
    `).all() as Array<{ id: number; filepath: string; category: string }>;

    onProgress?.('paid_models', 'Scanning paid model folders...', 0, paidModels.length, 0, 0);

    for (let i = 0; i < paidModels.length; i++) {
        const model = paidModels[i];

        const relative = model.filepath.startsWith(modelRoot)
            ? model.filepath.slice(modelRoot.length + 1)
            : model.filepath;

        const parts = relative.split(path.sep).filter(Boolean);
        const paidIdx = parts.findIndex(p => p.toLowerCase() === 'paid');
        if (paidIdx < 0 || paidIdx + 1 >= parts.length) continue;

        const designerName = parts[paidIdx + 1];
        if (!designerName) continue;

        const { designer, isNew } = upsertDesigner(designerName);
        if (isNew) created++;

        // Check model_metadata for designer URL
        const metadata = db.prepare('SELECT designer_url FROM model_metadata WHERE model_id = ?').get(model.id) as { designer_url: string | null } | undefined;
        if (metadata?.designer_url && designer && !designer.profile_url) {
            db.prepare('UPDATE designers SET profile_url = ? WHERE id = ?').run(metadata.designer_url, designer.id);
        }

        if (designer) {
            db.prepare('UPDATE models SET designer_id = ? WHERE id = ?').run(designer.id, model.id);
            linked++;
        }

        onProgress?.('paid_models', 'Scanning paid model folders...', i + 1, paidModels.length, created, linked);
    }

    // Phase 2: All models with metadata designer (not just paid)
    const metadataModels = db.prepare(`
        SELECT m.id, mm.designer, mm.designer_url
        FROM model_metadata mm
        JOIN models m ON m.id = mm.model_id
        WHERE mm.designer IS NOT NULL AND mm.designer != '' AND m.deleted_at IS NULL AND m.designer_id IS NULL
    `).all() as Array<{ id: number; designer: string; designer_url: string | null }>;

    onProgress?.('metadata_models', 'Checking PDF metadata...', 0, metadataModels.length, created, linked);

    for (let i = 0; i < metadataModels.length; i++) {
        const row = metadataModels[i];

        const { designer, isNew } = upsertDesigner(row.designer, row.designer_url);
        if (isNew) created++;

        if (designer) {
            db.prepare('UPDATE models SET designer_id = ? WHERE id = ?').run(designer.id, row.id);
            linked++;
        }

        onProgress?.('metadata_models', 'Checking PDF metadata...', i + 1, metadataModels.length, created, linked);
    }

    return { created, linked };
}

// Sync designers from folder structure and PDF metadata
router.post('/sync', (req, res) => {
    if (syncProgress.active) {
        return res.status(409).json({ error: 'Sync already in progress' });
    }

    const config = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory') as { value: string } | undefined;
    if (!config) {
        return res.status(400).json({ error: 'Model directory not configured' });
    }

    // Reset and start
    syncProgress = {
        active: true,
        phase: 'paid_models',
        phaseDescription: 'Scanning paid model folders...',
        totalItems: 0,
        processedItems: 0,
        created: 0,
        linked: 0
    };

    res.json({ success: true, message: 'Sync started' });

    // Run sync asynchronously
    setImmediate(() => {
        try {
            const result = syncDesignersCore(config.value, (phase, description, processed, total, created, linked) => {
                syncProgress.phase = phase as SyncProgress['phase'];
                syncProgress.phaseDescription = description;
                syncProgress.processedItems = processed;
                syncProgress.totalItems = total;
                syncProgress.created = created;
                syncProgress.linked = linked;
            });

            syncProgress.phase = 'complete';
            syncProgress.phaseDescription = 'Sync complete';
            syncProgress.created = result.created;
            syncProgress.linked = result.linked;
            syncProgress.active = false;
        } catch (error) {
            console.error('Designer sync error:', error);
            syncProgress.phase = 'complete';
            syncProgress.phaseDescription = `Error: ${error instanceof Error ? error.message : String(error)}`;
            syncProgress.active = false;
        }
    });
});

export default router;
