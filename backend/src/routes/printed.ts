import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../config/database.js';
import { setFinderTags, getFinderTags, TAG_COLORS } from '../utils/finderTags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for make image uploads
const makesDir = path.join(__dirname, '../../data/makes');
if (!fs.existsSync(makesDir)) {
    fs.mkdirSync(makesDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, makesDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `make-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|heic)$/i;
        if (allowed.test(path.extname(file.originalname))) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

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

// Get all printed models
router.get('/', (req, res) => {
    try {
        const printed = db.prepare(`
            SELECT printed_models.*, models.*
            FROM printed_models
            JOIN models ON printed_models.model_id = models.id
            ORDER BY printed_models.printed_at DESC, models.date_added DESC
        `).all() as any[];

        const printedWithImages = printed.map(item => {
            const primaryImage = db.prepare(`
                SELECT filepath FROM model_assets
                WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
                ORDER BY is_primary DESC, id ASC
                LIMIT 1
            `).get(item.model_id) as { filepath: string } | undefined;
            return { ...item, primaryImage: primaryImage?.filepath || null };
        });

        res.json({ printed: printedWithImages });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Mark model as printed
router.post('/', async (req, res) => {
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

        // Remove from queue if present
        db.prepare('DELETE FROM print_queue WHERE model_id = ?').run(model_id);

        // Update Finder tags
        await updateModelFinderTags(model_id);

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
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, notes, print_time_hours, filament_used_grams } = req.body;

        if (rating && rating !== 'good' && rating !== 'bad') {
            return res.status(400).json({ error: 'rating must be "good" or "bad"' });
        }

        // Get model_id before update
        const existing = db.prepare('SELECT model_id FROM printed_models WHERE id = ?').get(id) as { model_id: number } | undefined;

        db.prepare(`
            UPDATE printed_models
            SET rating = ?, notes = ?, print_time_hours = ?, filament_used_grams = ?
            WHERE id = ?
        `).run(rating, notes, print_time_hours, filament_used_grams, id);

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

// Delete printed model record
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get model_id before delete
        const existing = db.prepare('SELECT model_id FROM printed_models WHERE id = ?').get(id) as { model_id: number } | undefined;

        db.prepare('DELETE FROM printed_models WHERE id = ?').run(id);

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

// Bulk add/remove printed
router.post('/bulk', async (req, res) => {
    try {
        const { model_ids, action, rating } = req.body;

        if (!Array.isArray(model_ids) || model_ids.length === 0) {
            return res.status(400).json({ error: 'model_ids must be a non-empty array' });
        }

        if (action !== 'add' && action !== 'remove') {
            return res.status(400).json({ error: 'action must be "add" or "remove"' });
        }

        if (action === 'add' && rating && rating !== 'good' && rating !== 'bad') {
            return res.status(400).json({ error: 'rating must be "good" or "bad"' });
        }

        let affected = 0;

        if (action === 'add') {
            const insert = db.prepare('INSERT OR IGNORE INTO printed_models (model_id, rating) VALUES (?, ?)');
            const removeFromQueue = db.prepare('DELETE FROM print_queue WHERE model_id = ?');
            for (const modelId of model_ids) {
                const result = insert.run(modelId, rating || 'good');
                if (result.changes > 0) {
                    affected++;
                    removeFromQueue.run(modelId);
                    await updateModelFinderTags(modelId);
                }
            }
        } else {
            const remove = db.prepare('DELETE FROM printed_models WHERE model_id = ?');
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

// Toggle printed status by model_id
router.post('/toggle', async (req, res) => {
    try {
        const { model_id, rating } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        if (rating && rating !== 'good' && rating !== 'bad') {
            return res.status(400).json({ error: 'rating must be "good" or "bad"' });
        }

        const existing = db.prepare('SELECT * FROM printed_models WHERE model_id = ?').get(model_id);

        if (existing) {
            // Remove from printed
            db.prepare('DELETE FROM printed_models WHERE model_id = ?').run(model_id);
            await updateModelFinderTags(model_id);
            res.json({ printed: false });
        } else {
            // Add to printed
            const insert = db.prepare('INSERT INTO printed_models (model_id, rating) VALUES (?, ?)');
            insert.run(model_id, rating || 'good');

            // Remove from queue if present
            const wasQueued = db.prepare('SELECT id FROM print_queue WHERE model_id = ?').get(model_id);
            if (wasQueued) {
                db.prepare('DELETE FROM print_queue WHERE model_id = ?').run(model_id);
            }

            await updateModelFinderTags(model_id);
            res.json({ printed: true, rating: rating || 'good', removedFromQueue: !!wasQueued });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Cycle printed status: not printed → good → bad → not printed
router.post('/cycle', async (req, res) => {
    try {
        const { model_id } = req.body;

        if (!model_id) {
            return res.status(400).json({ error: 'model_id is required' });
        }

        const existing = db.prepare('SELECT * FROM printed_models WHERE model_id = ?').get(model_id) as any;

        if (!existing) {
            // Not printed → good
            db.prepare('INSERT INTO printed_models (model_id, rating) VALUES (?, ?)').run(model_id, 'good');
            const wasQueued = db.prepare('SELECT id FROM print_queue WHERE model_id = ?').get(model_id);
            if (wasQueued) {
                db.prepare('DELETE FROM print_queue WHERE model_id = ?').run(model_id);
            }
            await updateModelFinderTags(model_id);
            res.json({ printed: true, rating: 'good', removedFromQueue: !!wasQueued });
        } else if (existing.rating === 'good') {
            // Good → bad
            db.prepare('UPDATE printed_models SET rating = ? WHERE model_id = ?').run('bad', model_id);
            await updateModelFinderTags(model_id);
            res.json({ printed: true, rating: 'bad' });
        } else {
            // Bad (or null) → not printed
            db.prepare('DELETE FROM printed_models WHERE model_id = ?').run(model_id);
            await updateModelFinderTags(model_id);
            res.json({ printed: false, rating: null });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Get make images for a printed record
router.get('/:id/images', (req, res) => {
    try {
        const { id } = req.params;
        const images = db.prepare('SELECT * FROM make_images WHERE printed_model_id = ? ORDER BY created_at DESC').all(id);
        res.json({ images });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Upload make image for a printed record
router.post('/:id/images', upload.single('image'), (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        // Verify printed record exists
        const printed = db.prepare('SELECT id FROM printed_models WHERE id = ?').get(id);
        if (!printed) {
            // Clean up uploaded file
            fs.unlinkSync(file.path);
            return res.status(404).json({ error: 'Printed record not found' });
        }

        const insert = db.prepare('INSERT INTO make_images (printed_model_id, filename, filepath) VALUES (?, ?, ?)');
        const result = insert.run(id, file.originalname, file.path);

        res.json({
            id: result.lastInsertRowid,
            printed_model_id: parseInt(id),
            filename: file.originalname,
            filepath: file.path
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Delete make image
router.delete('/:printedId/images/:imageId', (req, res) => {
    try {
        const { imageId } = req.params;

        // Get filepath before deleting
        const image = db.prepare('SELECT filepath FROM make_images WHERE id = ?').get(imageId) as { filepath: string } | undefined;

        if (image && fs.existsSync(image.filepath)) {
            fs.unlinkSync(image.filepath);
        }

        db.prepare('DELETE FROM make_images WHERE id = ?').run(imageId);
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Serve make image file
router.get('/make-image/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filepath = path.join(makesDir, filename);

        // Security: ensure we're serving from the makes directory
        const resolved = path.resolve(filepath);
        if (!resolved.startsWith(path.resolve(makesDir))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(resolved)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.sendFile(resolved);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
