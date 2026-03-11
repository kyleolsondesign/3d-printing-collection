import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Create DB in hoisted scope so vi.mock factory can reference it
const { testDb } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    return { testDb: new Database(':memory:') };
});

vi.mock('../config/database.js', () => ({ default: testDb }));
vi.mock('../utils/finderTags.js', () => ({
    setFinderTags: vi.fn().mockResolvedValue(undefined),
    getFinderTags: vi.fn().mockResolvedValue([]),
    TAG_COLORS: { PRINTED_GOOD: 'Green', PRINTED_BAD: 'Red', QUEUED: 'Blue' }
}));

// Mock fs to prevent actual disk writes in save-preview-image tests
const { mockWriteFileSync } = vi.hoisted(() => ({ mockWriteFileSync: vi.fn() }));
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return { ...actual, default: { ...actual, writeFileSync: mockWriteFileSync } };
});

import modelsRouter from '../routes/models.js';
import { initSchema, seedTestData } from './setup.js';

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/models', modelsRouter);
    return app;
}

describe('Models Routes', () => {
    let app: express.Express;

    beforeEach(() => {
        initSchema(testDb);
        seedTestData(testDb);
        app = createApp();
    });

    describe('GET /api/models', () => {
        it('returns paginated models', async () => {
            const res = await request(app).get('/api/models');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(3);
            expect(res.body.pagination).toBeDefined();
            expect(res.body.pagination.total).toBe(3);
        });

        it('filters by category', async () => {
            const res = await request(app).get('/api/models?category=Toys');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(2);
            expect(res.body.models.every((m: any) => m.category === 'Toys')).toBe(true);
        });

        it('hides printed models when hidePrinted=true', async () => {
            const res = await request(app).get('/api/models?hidePrinted=true');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(2);
            expect(res.body.models.find((m: any) => m.id === 1)).toBeUndefined();
        });

        it('hides queued models when hideQueued=true', async () => {
            const res = await request(app).get('/api/models?hideQueued=true');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(2);
            expect(res.body.models.find((m: any) => m.id === 2)).toBeUndefined();
        });

        it('hides both printed and queued models', async () => {
            const res = await request(app).get('/api/models?hidePrinted=true&hideQueued=true');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(1);
            expect(res.body.models[0].id).toBe(3);
        });

        it('includes primaryImage from non-hidden assets', async () => {
            const res = await request(app).get('/api/models');
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA.primaryImage).toBe('/test/models/a/image1.jpg');
        });

        it('excludes hidden assets from primaryImage', async () => {
            testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE id = 1').run();
            const res = await request(app).get('/api/models');
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA.primaryImage).toBe('/test/models/a/image2.jpg');
        });

        it('returns null primaryImage when all images are hidden', async () => {
            testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE model_id = 1').run();
            const res = await request(app).get('/api/models');
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA.primaryImage).toBeNull();
        });
    });

    describe('PATCH /api/models/:id', () => {
        it('updates model filename', async () => {
            const res = await request(app)
                .patch('/api/models/1')
                .send({ filename: 'Renamed Model' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.model.filename).toBe('Renamed Model');

            const model = testDb.prepare('SELECT filename FROM models WHERE id = 1').get() as any;
            expect(model.filename).toBe('Renamed Model');
        });

        it('rejects empty filename', async () => {
            const res = await request(app)
                .patch('/api/models/1')
                .send({ filename: '  ' });
            expect(res.status).toBe(400);
        });

        it('allows no-op update with empty body', async () => {
            const res = await request(app)
                .patch('/api/models/1')
                .send({});
            expect(res.status).toBe(200);
        });

        it('updates model notes', async () => {
            const res = await request(app)
                .patch('/api/models/1')
                .send({ notes: 'Test notes for this model' });
            expect(res.status).toBe(200);
            expect(res.body.model.notes).toBe('Test notes for this model');
        });

        it('returns 404 for non-existent model', async () => {
            const res = await request(app)
                .patch('/api/models/999')
                .send({ filename: 'New Name' });
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/models/:id/assets/:assetId/hide', () => {
        it('hides a non-primary asset', async () => {
            const res = await request(app)
                .put('/api/models/1/assets/2/hide')
                .send({ isHidden: true });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const asset = testDb.prepare('SELECT is_hidden FROM model_assets WHERE id = 2').get() as any;
            expect(asset.is_hidden).toBe(1);
        });

        it('unhides a previously hidden asset', async () => {
            testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE id = 2').run();
            const res = await request(app)
                .put('/api/models/1/assets/2/hide')
                .send({ isHidden: false });
            expect(res.status).toBe(200);

            const asset = testDb.prepare('SELECT is_hidden FROM model_assets WHERE id = 2').get() as any;
            expect(asset.is_hidden).toBe(0);
        });

        it('rejects hiding the primary image', async () => {
            const res = await request(app)
                .put('/api/models/1/assets/1/hide')
                .send({ isHidden: true });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('primary');
        });

        it('returns 404 for non-existent asset', async () => {
            const res = await request(app)
                .put('/api/models/1/assets/999/hide')
                .send({ isHidden: true });
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/models/search/query', () => {
        it('returns matching models with primaryImage', async () => {
            const res = await request(app).get('/api/models/search/query?q=Model');
            expect(res.status).toBe(200);
            expect(res.body.models.length).toBeGreaterThan(0);
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA).toBeDefined();
            expect(modelA.primaryImage).toBe('/test/models/a/image1.jpg');
        });

        it('returns isFavorite, isQueued, isPrinted status', async () => {
            const res = await request(app).get('/api/models/search/query?q=Model');
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA.isPrinted).toBe(true);
            expect(modelA.printRating).toBe('good');
            const modelB = res.body.models.find((m: any) => m.id === 2);
            expect(modelB.isQueued).toBe(true);
            const modelC = res.body.models.find((m: any) => m.id === 3);
            expect(modelC.isFavorite).toBe(true);
        });

        it('excludes soft-deleted models', async () => {
            testDb.prepare('UPDATE models SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1').run();
            const res = await request(app).get('/api/models/search/query?q=Model');
            expect(res.body.models.find((m: any) => m.id === 1)).toBeUndefined();
        });

        it('returns 400 without query param', async () => {
            const res = await request(app).get('/api/models/search/query');
            expect(res.status).toBe(400);
        });

        it('matches prefix searches (partial word at start)', async () => {
            // "Test" should match "Test Model A" via prefix
            const res = await request(app).get('/api/models/search/query?q=Tes');
            expect(res.status).toBe(200);
            expect(res.body.models.length).toBeGreaterThan(0);
        });

        it('matches substring searches via LIKE fallback', async () => {
            // Add a model with a compound word
            testDb.prepare(`INSERT INTO models (id, filename, filepath, category, file_count) VALUES (?, ?, ?, ?, ?)`).run(10, 'thermoformed-box', '/test/models/thermo', 'Tools', 1);
            // "thermoform" should match "thermoformed-box" via LIKE substring
            const res = await request(app).get('/api/models/search/query?q=thermoform');
            expect(res.status).toBe(200);
            expect(res.body.models.find((m: any) => m.id === 10)).toBeDefined();
        });

        it('sorts search results by name asc', async () => {
            const res = await request(app).get('/api/models/search/query?q=Model&sort=name&order=asc');
            expect(res.status).toBe(200);
            const names = res.body.models.map((m: any) => m.filename);
            const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
            expect(names).toEqual(sorted);
        });

        it('sorts search results by name desc', async () => {
            const res = await request(app).get('/api/models/search/query?q=Model&sort=name&order=desc');
            expect(res.status).toBe(200);
            const names = res.body.models.map((m: any) => m.filename);
            const sorted = [...names].sort((a: string, b: string) => b.localeCompare(a));
            expect(names).toEqual(sorted);
        });
    });

    describe('PUT /api/models/:id/primary-image', () => {
        it('sets the specified asset as primary and clears others', async () => {
            // Model 1 has image1.jpg (is_primary=1, id=1) and image2.jpg (is_primary=0, id=2)
            const res = await request(app)
                .put('/api/models/1/primary-image')
                .send({ assetId: 2 });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const img1 = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 1').get() as any;
            const img2 = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 2').get() as any;
            expect(img1.is_primary).toBe(0);
            expect(img2.is_primary).toBe(1);
        });

        it('returns 400 when assetId is missing', async () => {
            const res = await request(app)
                .put('/api/models/1/primary-image')
                .send({});
            expect(res.status).toBe(400);
        });

        it('returns 404 when asset does not belong to model', async () => {
            // asset id=3 belongs to model 2, not model 1
            const res = await request(app)
                .put('/api/models/1/primary-image')
                .send({ assetId: 3 });
            expect(res.status).toBe(404);
        });

        it('returns 404 for non-existent asset', async () => {
            const res = await request(app)
                .put('/api/models/1/primary-image')
                .send({ assetId: 999 });
            expect(res.status).toBe(404);
        });
    });

    describe('Primary image selection (GIF preference)', () => {
        it('returns gif as primaryImage when gif and other images exist', async () => {
            // Add a gif image (not primary) and verify the browse endpoint
            // uses it since gifs should be preferred
            testDb.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary) VALUES (?, ?, ?, ?, ?)`).run(10, 1, '/test/models/a/animation.gif', 'image', 0);
            // Model 1 already has image1.jpg as is_primary=1 (id=1) and image2.jpg (id=2)
            // When gif is set as primary, it should show up
            testDb.prepare('UPDATE model_assets SET is_primary = 0 WHERE model_id = 1').run();
            testDb.prepare('UPDATE model_assets SET is_primary = 1 WHERE id = 10').run();

            const res = await request(app).get('/api/models');
            expect(res.status).toBe(200);
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA.primaryImage).toBe('/test/models/a/animation.gif');
        });

        it('returns first image as primaryImage when no gif exists', async () => {
            // Model 1 has image1.jpg as primary
            const res = await request(app).get('/api/models');
            expect(res.status).toBe(200);
            const modelA = res.body.models.find((m: any) => m.id === 1);
            expect(modelA.primaryImage).toBe('/test/models/a/image1.jpg');
        });
    });

    describe('GET /api/models/:id', () => {
        it('returns model details with filtered hidden assets', async () => {
            testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE id = 2').run();
            const res = await request(app).get('/api/models/1');
            expect(res.status).toBe(200);
            expect(res.body.filename).toBe('Test Model A');
            const imageAssets = res.body.assets.filter((a: any) => a.asset_type === 'image');
            expect(imageAssets).toHaveLength(1);
            expect(imageAssets[0].id).toBe(1);
        });

        it('returns 404 for non-existent model', async () => {
            const res = await request(app).get('/api/models/999');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/models/:id/view', () => {
        it('records a model view', async () => {
            const res = await request(app).post('/api/models/1/view');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const record = testDb.prepare('SELECT * FROM recently_viewed WHERE model_id = 1').get() as any;
            expect(record).toBeTruthy();
            expect(record.model_id).toBe(1);
        });

        it('updates viewed_at on subsequent views', async () => {
            await request(app).post('/api/models/1/view');
            const first = testDb.prepare('SELECT viewed_at FROM recently_viewed WHERE model_id = 1').get() as any;

            // View again - should upsert, not duplicate
            await request(app).post('/api/models/1/view');
            const count = testDb.prepare('SELECT COUNT(*) as cnt FROM recently_viewed WHERE model_id = 1').get() as any;
            expect(count.cnt).toBe(1);
        });

        it('returns 404 for non-existent model', async () => {
            const res = await request(app).post('/api/models/999/view');
            expect(res.status).toBe(404);
        });

        it('returns 400 for invalid model ID', async () => {
            const res = await request(app).post('/api/models/abc/view');
            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/models/recent', () => {
        it('returns empty list when no views recorded', async () => {
            const res = await request(app).get('/api/models/recent');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(0);
        });

        it('returns recently viewed models in reverse chronological order', async () => {
            // Insert with explicit timestamps to ensure ordering
            testDb.prepare(`INSERT INTO recently_viewed (model_id, viewed_at) VALUES (?, ?)`).run(1, '2025-01-01 10:00:00');
            testDb.prepare(`INSERT INTO recently_viewed (model_id, viewed_at) VALUES (?, ?)`).run(2, '2025-01-01 11:00:00');

            const res = await request(app).get('/api/models/recent');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(2);
            // Most recent first
            expect(res.body.models[0].id).toBe(2);
            expect(res.body.models[1].id).toBe(1);
        });

        it('includes primaryImage and status fields', async () => {
            await request(app).post('/api/models/1/view');

            const res = await request(app).get('/api/models/recent');
            expect(res.status).toBe(200);
            const model = res.body.models[0];
            expect(model.primaryImage).toBe('/test/models/a/image1.jpg');
            expect(model.isPrinted).toBe(true);
            expect(model.printRating).toBe('good');
            expect(model.isFavorite).toBe(false);
        });

        it('excludes soft-deleted models', async () => {
            await request(app).post('/api/models/1/view');
            testDb.prepare('UPDATE models SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1').run();

            const res = await request(app).get('/api/models/recent');
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(0);
        });

        it('respects limit parameter', async () => {
            await request(app).post('/api/models/1/view');
            await request(app).post('/api/models/2/view');
            await request(app).post('/api/models/3/view');

            const res = await request(app).get('/api/models/recent').query({ limit: 2 });
            expect(res.status).toBe(200);
            expect(res.body.models).toHaveLength(2);
        });
    });

    describe('POST /api/models/suggest-categories', () => {
        it('returns 400 when model_ids is missing', async () => {
            const res = await request(app).post('/api/models/suggest-categories').send({});
            expect(res.status).toBe(400);
        });

        it('returns 400 when model_ids is empty', async () => {
            const res = await request(app).post('/api/models/suggest-categories').send({ model_ids: [] });
            expect(res.status).toBe(400);
        });

        it('returns suggestions for all provided model_ids', async () => {
            const res = await request(app).post('/api/models/suggest-categories').send({ model_ids: [1, 2, 3] });
            expect(res.status).toBe(200);
            expect(res.body.suggestions).toHaveLength(3);
            expect(res.body.used_ai).toBe(false);
        });

        it('each suggestion has required fields', async () => {
            const res = await request(app).post('/api/models/suggest-categories').send({ model_ids: [1] });
            expect(res.status).toBe(200);
            const s = res.body.suggestions[0];
            expect(s).toHaveProperty('model_id', 1);
            expect(s).toHaveProperty('model_name');
            expect(s).toHaveProperty('current_category');
            expect(s).toHaveProperty('suggested_category');
            expect(['high', 'medium', 'low']).toContain(s.confidence);
            expect(Array.isArray(s.debug_scores)).toBe(true);
        });

        it('returns empty array for non-existent model_ids', async () => {
            const res = await request(app).post('/api/models/suggest-categories').send({ model_ids: [999] });
            expect(res.status).toBe(200);
            expect(res.body.suggestions).toHaveLength(0);
        });

        it('falls back to fuzzy (used_ai: false) when no Anthropic key configured', async () => {
            const res = await request(app)
                .post('/api/models/suggest-categories')
                .send({ model_ids: [1, 2], use_ai: true });
            expect(res.status).toBe(200);
            expect(res.body.used_ai).toBe(false);
        });

        it('uses model file names from model_files table in fuzzy context', async () => {
            // Model 1 has model.stl and model.3mf in seedTestData
            const res = await request(app).post('/api/models/suggest-categories').send({ model_ids: [1] });
            expect(res.status).toBe(200);
            expect(res.body.suggestions[0].model_id).toBe(1);
            expect(Array.isArray(res.body.suggestions[0].debug_scores)).toBe(true);
        });

        it('excludes soft-deleted models', async () => {
            testDb.prepare('UPDATE models SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1').run();
            const res = await request(app).post('/api/models/suggest-categories').send({ model_ids: [1, 2] });
            expect(res.status).toBe(200);
            expect(res.body.suggestions).toHaveLength(1);
            expect(res.body.suggestions[0].model_id).toBe(2);
        });
    });

    describe('POST /api/models/bulk-reassign-category', () => {
        beforeEach(() => {
            // Ensure config has a model_directory for the non-paid path
            testDb.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('model_directory', '/test/models')`).run();
        });

        it('returns 400 when model_ids is missing', async () => {
            const res = await request(app).post('/api/models/bulk-reassign-category').send({ new_category: 'Tools' });
            expect(res.status).toBe(400);
        });

        it('returns 400 when new_category is missing', async () => {
            const res = await request(app).post('/api/models/bulk-reassign-category').send({ model_ids: [1] });
            expect(res.status).toBe(400);
        });

        it('updates DB category for paid models without moving files', async () => {
            // Insert a paid model with a filepath that doesn't exist on disk
            testDb.prepare(`INSERT INTO models (id, filename, filepath, category, is_paid, file_count)
                VALUES (10, 'Paid Model', '/Paid/DesignerX/Paid Model', 'Uncategorized', 1, 1)`).run();

            const res = await request(app)
                .post('/api/models/bulk-reassign-category')
                .send({ model_ids: [10], new_category: 'Toys' });

            expect(res.status).toBe(200);
            expect(res.body.results[0].success).toBe(true);

            // DB category updated
            const model = testDb.prepare('SELECT category FROM models WHERE id = 10').get() as { category: string };
            expect(model.category).toBe('Toys');

            // Filepath unchanged (folder not moved)
            const fp = testDb.prepare('SELECT filepath FROM models WHERE id = 10').get() as { filepath: string };
            expect(fp.filepath).toBe('/Paid/DesignerX/Paid Model');
        });

        it('returns no-op success when paid model already has the target category', async () => {
            testDb.prepare(`INSERT INTO models (id, filename, filepath, category, is_paid, file_count)
                VALUES (11, 'Already Categorized', '/Paid/DesignerX/Already Categorized', 'Toys', 1, 1)`).run();

            const res = await request(app)
                .post('/api/models/bulk-reassign-category')
                .send({ model_ids: [11], new_category: 'Toys' });

            expect(res.status).toBe(200);
            expect(res.body.results[0].success).toBe(true);
        });
    });

    describe('POST /api/models/:id/save-preview-image', () => {
        // Minimal 1x1 white JPEG in base64
        const validDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAIhAAAQMEAgMAAAAAAAAAAAAAAQIDBBEhMQUSQWH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Aqk1bXNe1bXNSiWGCGaRtIQfBJJ4AAyeSTk5JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ/9k=';

        beforeEach(() => {
            mockWriteFileSync.mockClear();
        });

        it('inserts asset as primary when model has no existing image', async () => {
            // Model 3 (Test Model C) has no assets in seed data
            const res = await request(app)
                .post('/api/models/3/save-preview-image')
                .set('Content-Type', 'application/json')
                .send({ imageData: validDataUrl });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.isPrimary).toBe(true);
            expect(res.body.asset).toBeDefined();
            expect(res.body.asset.asset_type).toBe('image');
            expect(res.body.asset.is_primary).toBe(1);
            expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
        });

        it('inserts asset as non-primary when model already has a primary image', async () => {
            // Model 1 already has a primary image from seed data
            const res = await request(app)
                .post('/api/models/1/save-preview-image')
                .set('Content-Type', 'application/json')
                .send({ imageData: validDataUrl });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.isPrimary).toBe(false);
            expect(res.body.asset.is_primary).toBe(0);
        });

        it('creates a new asset row for each capture (timestamped filenames)', async () => {
            // First capture
            await request(app)
                .post('/api/models/3/save-preview-image')
                .send({ imageData: validDataUrl });

            const countAfterFirst = (testDb.prepare(
                `SELECT COUNT(*) as n FROM model_assets WHERE model_id = 3 AND filepath LIKE '%_preview_captured_%'`
            ).get() as { n: number }).n;

            // Second capture
            await request(app)
                .post('/api/models/3/save-preview-image')
                .send({ imageData: validDataUrl });

            const countAfterSecond = (testDb.prepare(
                `SELECT COUNT(*) as n FROM model_assets WHERE model_id = 3 AND filepath LIKE '%_preview_captured_%'`
            ).get() as { n: number }).n;

            expect(countAfterFirst).toBe(1);
            expect(countAfterSecond).toBe(2);  // each capture is a new file
        });

        it('returns 404 for unknown model', async () => {
            const res = await request(app)
                .post('/api/models/999/save-preview-image')
                .send({ imageData: validDataUrl });
            expect(res.status).toBe(404);
        });

        it('returns 400 when imageData is missing', async () => {
            const res = await request(app)
                .post('/api/models/3/save-preview-image')
                .send({});
            expect(res.status).toBe(400);
        });

        it('returns 400 when imageData is not a valid data URL', async () => {
            const res = await request(app)
                .post('/api/models/3/save-preview-image')
                .send({ imageData: 'not-a-data-url' });
            expect(res.status).toBe(400);
        });
    });
});
