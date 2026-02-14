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

        it('rejects missing filename', async () => {
            const res = await request(app)
                .patch('/api/models/1')
                .send({});
            expect(res.status).toBe(400);
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
});
