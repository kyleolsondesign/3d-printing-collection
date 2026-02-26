import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// List all tags with usage counts
router.get('/', (req, res) => {
    try {
        const tags = db.prepare(`
            SELECT t.id, t.name, t.created_at, COUNT(mt.model_id) as model_count
            FROM tags t
            LEFT JOIN model_tags mt ON mt.tag_id = t.id
            GROUP BY t.id
            ORDER BY t.name ASC
        `).all();
        res.json(tags);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Create a new tag (or return existing one)
router.post('/', (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tag name required' });
        }
        const trimmed = name.trim().toLowerCase();

        const existing = db.prepare('SELECT * FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number; name: string } | undefined;
        if (existing) {
            return res.json(existing);
        }

        const result = db.prepare('INSERT INTO tags (name) VALUES (?)').run(trimmed);
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(tag);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Delete a tag (cascades via model_tags FK)
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM tags WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Add a tag to a model (creates tag if needed)
router.post('/model/:modelId', (req, res) => {
    try {
        const { modelId } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tag name required' });
        }
        const trimmed = name.trim().toLowerCase();

        // Upsert tag
        let tag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number; name: string } | undefined;
        if (!tag) {
            const result = db.prepare('INSERT INTO tags (name) VALUES (?)').run(trimmed);
            tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as { id: number; name: string };
        }

        // Link tag to model (ignore if already linked)
        db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tag.id);

        res.json({ tag });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Remove a tag from a model
router.delete('/model/:modelId/:tagId', (req, res) => {
    try {
        const { modelId, tagId } = req.params;
        db.prepare('DELETE FROM model_tags WHERE model_id = ? AND tag_id = ?').run(modelId, tagId);
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Bulk add a tag to multiple models
router.post('/bulk', (req, res) => {
    try {
        const { modelIds, tagName } = req.body;
        if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
            return res.status(400).json({ error: 'modelIds array required' });
        }
        if (!tagName || !tagName.trim()) {
            return res.status(400).json({ error: 'tagName required' });
        }
        const trimmed = tagName.trim().toLowerCase();

        // Upsert tag
        let tag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number } | undefined;
        if (!tag) {
            const result = db.prepare('INSERT INTO tags (name) VALUES (?)').run(trimmed);
            tag = { id: Number(result.lastInsertRowid) };
        }

        const insert = db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)');
        const insertMany = db.transaction((ids: number[]) => {
            for (const id of ids) {
                insert.run(id, tag!.id);
            }
        });
        insertMany(modelIds);

        res.json({ success: true, tagId: tag.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
