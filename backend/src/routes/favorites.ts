import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Get all favorites
router.get('/', (req, res) => {
    try {
        const favorites = db.prepare(`
            SELECT favorites.*, models.*
            FROM favorites
            JOIN models ON favorites.model_id = models.id
            ORDER BY favorites.added_at DESC
        `).all();

        res.json({ favorites });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Add to favorites
router.post('/', (req, res) => {
    try {
        const { model_id, notes } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        const insert = db.prepare(`
            INSERT INTO favorites (model_id, notes)
            VALUES (?, ?)
        `);

        const result = insert.run(model_id, notes || null);

        res.json({ id: result.lastInsertRowid, model_id, notes });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Update favorite notes
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        db.prepare('UPDATE favorites SET notes = ? WHERE id = ?').run(notes, id);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Remove from favorites
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;

        db.prepare('DELETE FROM favorites WHERE id = ?').run(id);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Toggle favorite by model_id
router.post('/toggle', (req, res) => {
    try {
        const { model_id } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        const existing = db.prepare('SELECT * FROM favorites WHERE model_id = ?').get(model_id);

        if (existing) {
            db.prepare('DELETE FROM favorites WHERE model_id = ?').run(model_id);
            res.json({ favorited: false });
        } else {
            const insert = db.prepare('INSERT INTO favorites (model_id) VALUES (?)');
            insert.run(model_id);
            res.json({ favorited: true });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
