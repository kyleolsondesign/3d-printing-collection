import express from 'express';
import db from '../config/database.js';
import { setFinderTags, TAG_COLORS } from '../utils/finderTags.js';

const router = express.Router();

// Helper to update Finder tags for a model based on its current state
async function updateModelFinderTags(modelId: number): Promise<void> {
    try {
        // Get model filepath
        const model = db.prepare('SELECT filepath FROM models WHERE id = ?').get(modelId) as { filepath: string } | undefined;
        if (!model) return;

        // Check printed status
        const printed = db.prepare('SELECT rating FROM printed_models WHERE model_id = ? ORDER BY printed_at DESC LIMIT 1').get(modelId) as { rating: 'good' | 'bad' | null } | undefined;

        // Check queue status
        const queued = db.prepare('SELECT id FROM print_queue WHERE model_id = ?').get(modelId) as { id: number } | undefined;

        // Build tags array
        const tags: string[] = [];

        if (printed) {
            tags.push(printed.rating === 'good' ? TAG_COLORS.PRINTED_GOOD : TAG_COLORS.PRINTED_BAD);
        }

        if (queued) {
            tags.push(TAG_COLORS.QUEUED);
        }

        await setFinderTags(model.filepath, tags);
    } catch (error) {
        console.error('Failed to update Finder tags:', error);
    }
}

// Get print queue
router.get('/', (req, res) => {
    try {
        const queue = db.prepare(`
            SELECT print_queue.*, models.*
            FROM print_queue
            JOIN models ON print_queue.model_id = models.id
            ORDER BY print_queue.priority DESC, print_queue.added_at ASC
        `).all();

        res.json({ queue });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Add to print queue
router.post('/', async (req, res) => {
    try {
        const { model_id, priority, notes, estimated_time_hours } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        const insert = db.prepare(`
            INSERT INTO print_queue (model_id, priority, notes, estimated_time_hours)
            VALUES (?, ?, ?, ?)
        `);

        const result = insert.run(
            model_id,
            priority || 0,
            notes || null,
            estimated_time_hours || null
        );

        // Update Finder tags
        await updateModelFinderTags(model_id);

        res.json({
            id: result.lastInsertRowid,
            model_id,
            priority,
            notes,
            estimated_time_hours
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Update queue item
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { priority, notes, estimated_time_hours } = req.body;

        db.prepare(`
            UPDATE print_queue
            SET priority = ?, notes = ?, estimated_time_hours = ?
            WHERE id = ?
        `).run(priority, notes, estimated_time_hours, id);

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Remove from queue
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get model_id before delete
        const existing = db.prepare('SELECT model_id FROM print_queue WHERE id = ?').get(id) as { model_id: number } | undefined;

        db.prepare('DELETE FROM print_queue WHERE id = ?').run(id);

        // Update Finder tags
        if (existing) {
            await updateModelFinderTags(existing.model_id);
        }

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Reorder queue
router.post('/reorder', (req, res) => {
    try {
        const { items } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'items must be an array' });
        }

        const update = db.prepare('UPDATE print_queue SET priority = ? WHERE id = ?');

        for (const item of items) {
            update.run(item.priority, item.id);
        }

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Toggle queue by model_id
router.post('/toggle', async (req, res) => {
    try {
        const { model_id } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        const existing = db.prepare('SELECT * FROM print_queue WHERE model_id = ?').get(model_id);

        if (existing) {
            db.prepare('DELETE FROM print_queue WHERE model_id = ?').run(model_id);
            await updateModelFinderTags(model_id);
            res.json({ queued: false });
        } else {
            const insert = db.prepare('INSERT INTO print_queue (model_id) VALUES (?)');
            insert.run(model_id);
            await updateModelFinderTags(model_id);
            res.json({ queued: true });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
