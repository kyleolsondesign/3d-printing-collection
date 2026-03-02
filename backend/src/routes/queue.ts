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

        // Check printing status
        const printing = db.prepare('SELECT id FROM currently_printing WHERE model_id = ?').get(modelId) as { id: number } | undefined;

        // Build tags array
        const tags: string[] = [];

        if (printed) {
            tags.push(printed.rating === 'good' ? TAG_COLORS.PRINTED_GOOD : TAG_COLORS.PRINTED_BAD);
        }

        if (queued) {
            tags.push(TAG_COLORS.QUEUED);
        }

        if (printing) {
            tags.push(TAG_COLORS.PRINTING);
        }

        await setFinderTags(model.filepath, tags);
    } catch (error) {
        console.error('Failed to update Finder tags:', error);
    }
}

// Get print queue (includes currently printing models at the top)
router.get('/', (req, res) => {
    try {
        // Queue items with is_printing flag
        const queueItems = db.prepare(`
            SELECT print_queue.id, print_queue.model_id, print_queue.added_at,
                   print_queue.priority, print_queue.notes, print_queue.estimated_time_hours,
                   models.filename, models.filepath, models.category, models.file_count,
                   CASE WHEN cp.model_id IS NOT NULL THEN 1 ELSE 0 END as is_printing,
                   cp.started_at as printing_started_at
            FROM print_queue
            JOIN models ON print_queue.model_id = models.id AND models.deleted_at IS NULL
            LEFT JOIN currently_printing cp ON cp.model_id = print_queue.model_id
        `).all() as any[];

        // Printing-only items not in the queue
        const printingOnlyItems = db.prepare(`
            SELECT NULL as id, cp.model_id, cp.started_at as added_at,
                   999999 as priority, NULL as notes, NULL as estimated_time_hours,
                   models.filename, models.filepath, models.category, models.file_count,
                   1 as is_printing, cp.started_at as printing_started_at
            FROM currently_printing cp
            JOIN models ON cp.model_id = models.id AND models.deleted_at IS NULL
            WHERE NOT EXISTS (SELECT 1 FROM print_queue WHERE print_queue.model_id = cp.model_id)
        `).all() as any[];

        const allItems = [...queueItems, ...printingOnlyItems];

        // Sort: printing items first, then by priority DESC, added_at ASC
        allItems.sort((a, b) => {
            if (a.is_printing !== b.is_printing) return b.is_printing - a.is_printing;
            if (a.priority !== b.priority) return b.priority - a.priority;
            return a.added_at < b.added_at ? -1 : 1;
        });

        const queueWithImages = allItems.map(item => {
            const primaryImage = db.prepare(`
                SELECT filepath FROM model_assets
                WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
                ORDER BY is_primary DESC, id ASC
                LIMIT 1
            `).get(item.model_id) as { filepath: string } | undefined;
            return { ...item, primaryImage: primaryImage?.filepath || null };
        });

        res.json({ queue: queueWithImages });
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

// Bulk add/remove from queue
router.post('/bulk', async (req, res) => {
    try {
        const { model_ids, action } = req.body;

        if (!Array.isArray(model_ids) || model_ids.length === 0) {
            return res.status(400).json({ error: 'model_ids must be a non-empty array' });
        }

        if (action !== 'add' && action !== 'remove') {
            return res.status(400).json({ error: 'action must be "add" or "remove"' });
        }

        let affected = 0;

        if (action === 'add') {
            const insert = db.prepare('INSERT OR IGNORE INTO print_queue (model_id) VALUES (?)');
            for (const modelId of model_ids) {
                const result = insert.run(modelId);
                if (result.changes > 0) {
                    affected++;
                    await updateModelFinderTags(modelId);
                }
            }
        } else {
            const remove = db.prepare('DELETE FROM print_queue WHERE model_id = ?');
            for (const modelId of model_ids) {
                const result = remove.run(modelId);
                if (result.changes > 0) {
                    affected++;
                    await updateModelFinderTags(modelId);
                }
            }
        }

        res.json({ success: true, affected });
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

// Toggle currently-printing state by model_id
router.post('/printing/toggle', async (req, res) => {
    try {
        const { model_id } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        const existing = db.prepare('SELECT id FROM currently_printing WHERE model_id = ?').get(model_id);

        if (existing) {
            db.prepare('DELETE FROM currently_printing WHERE model_id = ?').run(model_id);
            await updateModelFinderTags(model_id);
            res.json({ printing: false });
        } else {
            db.prepare('INSERT INTO currently_printing (model_id) VALUES (?)').run(model_id);
            await updateModelFinderTags(model_id);
            res.json({ printing: true });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
