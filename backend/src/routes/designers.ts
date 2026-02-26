import express from 'express';
import db from '../config/database.js';
import path from 'path';

const router = express.Router();

// List all designers with model counts
router.get('/', (req, res) => {
    try {
        const designers = db.prepare(`
            SELECT
                d.id, d.name, d.profile_url, d.notes, d.created_at, d.updated_at,
                COUNT(m.id) as model_count,
                MAX(m.date_added) as latest_model_date
            FROM designers d
            LEFT JOIN models m ON m.designer_id = d.id AND m.deleted_at IS NULL
            GROUP BY d.id
            ORDER BY d.name ASC
        `).all();
        res.json(designers);
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

        const designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(id) as any;
        if (!designer) {
            return res.status(404).json({ error: 'Designer not found' });
        }

        const totalRow = db.prepare('SELECT COUNT(*) as total FROM models WHERE designer_id = ? AND deleted_at IS NULL').get(id) as { total: number };
        const models = db.prepare(`
            SELECT m.*,
                (SELECT filepath FROM model_assets WHERE model_id = m.id AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL) ORDER BY is_primary DESC, id ASC LIMIT 1) as primaryImage,
                (SELECT 1 FROM favorites WHERE model_id = m.id) as isFavorite,
                (SELECT 1 FROM print_queue WHERE model_id = m.id) as isQueued,
                (SELECT rating FROM printed_models WHERE model_id = m.id ORDER BY printed_at DESC LIMIT 1) as printRating
            FROM models m
            WHERE m.designer_id = ? AND m.deleted_at IS NULL
            ORDER BY m.date_added DESC NULLS LAST, m.filename ASC
            LIMIT ? OFFSET ?
        `).all(id, limit, offset) as any[];

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

// Sync designers from Paid folder structure - infers designer names from model paths
router.post('/sync', (req, res) => {
    try {
        const config = db.prepare('SELECT value FROM config WHERE key = ?').get('modelDirectory') as { value: string } | undefined;
        if (!config) {
            return res.status(400).json({ error: 'Model directory not configured' });
        }
        const modelRoot = config.value;

        // Find all paid models and extract designer folder names from their paths
        const paidModels = db.prepare(`
            SELECT id, filepath, category FROM models WHERE is_paid = 1 AND deleted_at IS NULL
        `).all() as Array<{ id: number; filepath: string; category: string }>;

        let linked = 0;
        let created = 0;

        for (const model of paidModels) {
            // Extract path relative to root
            const relative = model.filepath.startsWith(modelRoot)
                ? model.filepath.slice(modelRoot.length + 1)
                : model.filepath;

            const parts = relative.split(path.sep).filter(Boolean);

            // Find "Paid" segment in the path and get the segment after it as designer
            const paidIdx = parts.findIndex(p => p.toLowerCase() === 'paid');
            if (paidIdx < 0 || paidIdx + 1 >= parts.length) continue;

            const designerName = parts[paidIdx + 1];
            if (!designerName) continue;

            // Upsert designer
            let designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(designerName) as any;
            if (!designer) {
                const result = db.prepare('INSERT OR IGNORE INTO designers (name) VALUES (?)').run(designerName);
                designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(result.lastInsertRowid) as any;
                if (!designer) {
                    designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(designerName) as any;
                }
                if (designer) created++;
            }

            // Check if model_metadata has a designer URL
            const metadata = db.prepare('SELECT designer_url FROM model_metadata WHERE model_id = ?').get(model.id) as { designer_url: string | null } | undefined;
            if (metadata?.designer_url && designer && !designer.profile_url) {
                db.prepare('UPDATE designers SET profile_url = ? WHERE id = ?').run(metadata.designer_url, designer.id);
            }

            // Link model to designer
            if (designer) {
                db.prepare('UPDATE models SET designer_id = ? WHERE id = ?').run(designer.id, model.id);
                linked++;
            }
        }

        // Also link models from model_metadata that have a designer name
        const metadataModels = db.prepare(`
            SELECT m.id, mm.designer, mm.designer_url
            FROM model_metadata mm
            JOIN models m ON m.id = mm.model_id
            WHERE mm.designer IS NOT NULL AND mm.designer != '' AND m.deleted_at IS NULL AND m.designer_id IS NULL
        `).all() as Array<{ id: number; designer: string; designer_url: string | null }>;

        for (const row of metadataModels) {
            let designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(row.designer) as any;
            if (!designer) {
                const result = db.prepare('INSERT OR IGNORE INTO designers (name, profile_url) VALUES (?, ?)').run(row.designer, row.designer_url || null);
                designer = db.prepare('SELECT * FROM designers WHERE id = ?').get(result.lastInsertRowid) as any;
                if (!designer) {
                    designer = db.prepare('SELECT * FROM designers WHERE LOWER(name) = LOWER(?)').get(row.designer) as any;
                }
                if (designer) created++;
            }
            if (designer) {
                db.prepare('UPDATE models SET designer_id = ? WHERE id = ?').run(designer.id, row.id);
                linked++;
            }
        }

        res.json({ success: true, created, linked });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
