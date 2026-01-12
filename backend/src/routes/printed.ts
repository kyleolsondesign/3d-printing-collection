import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Get all printed models
router.get('/', (req, res) => {
    try {
        const printed = db.prepare(`
            SELECT printed_models.*, models.*
            FROM printed_models
            JOIN models ON printed_models.model_id = models.id
            ORDER BY printed_models.printed_at DESC
        `).all();

        res.json({ printed });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Mark model as printed
router.post('/', (req, res) => {
    try {
        const { model_id, rating, notes, print_time_hours, filament_used_grams } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        if (rating && rating !== 'good' && rating !== 'bad') {
            return res.status(400).json({ error: 'rating must be "good" or "bad"' });
        }

        const insert = db.prepare(`
            INSERT INTO printed_models (model_id, rating, notes, print_time_hours, filament_used_grams)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = insert.run(
            model_id,
            rating || null,
            notes || null,
            print_time_hours || null,
            filament_used_grams || null
        );

        res.json({
            id: result.lastInsertRowid,
            model_id,
            rating,
            notes,
            print_time_hours,
            filament_used_grams
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Update printed model record
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { rating, notes, print_time_hours, filament_used_grams } = req.body;

        if (rating && rating !== 'good' && rating !== 'bad') {
            return res.status(400).json({ error: 'rating must be "good" or "bad"' });
        }

        db.prepare(`
            UPDATE printed_models
            SET rating = ?, notes = ?, print_time_hours = ?, filament_used_grams = ?
            WHERE id = ?
        `).run(rating, notes, print_time_hours, filament_used_grams, id);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Delete printed model record
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;

        db.prepare('DELETE FROM printed_models WHERE id = ?').run(id);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
