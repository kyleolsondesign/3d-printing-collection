import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { testDb } = vi.hoisted(() => {
    const Database = require('better-sqlite3');
    return { testDb: new Database(':memory:') };
});

vi.mock('../config/database.js', () => ({ default: testDb }));
vi.mock('../utils/finderTags.js', () => ({
    setFinderTags: vi.fn().mockResolvedValue(undefined),
    getFinderTags: vi.fn().mockResolvedValue([]),
    TAG_COLORS: { PRINTED_GOOD: 'Green', PRINTED_BAD: 'Red', QUEUED: 'Blue' }
}));

import queueRouter from '../routes/queue.js';
import { initSchema, seedTestData } from './setup.js';

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/queue', queueRouter);
    return app;
}

describe('Queue Routes', () => {
    let app: express.Express;

    beforeEach(() => {
        initSchema(testDb);
        seedTestData(testDb);
        app = createApp();
    });

    describe('GET /api/queue', () => {
        it('returns queued models with primaryImage', async () => {
            const res = await request(app).get('/api/queue');
            expect(res.status).toBe(200);
            expect(res.body.queue).toHaveLength(1);
            expect(res.body.queue[0].model_id).toBe(2);
            expect(res.body.queue[0].primaryImage).toBe('/test/models/b/preview.png');
        });

        it('returns queue item with the queue row id, not the model id', async () => {
            // Seed data: print_queue row id=1 for model_id=2
            // Without the column order fix (SELECT print_queue.*, models.*),
            // models.id would overwrite print_queue.id, returning id=2 instead of id=1.
            const res = await request(app).get('/api/queue');
            expect(res.status).toBe(200);
            const item = res.body.queue[0];
            expect(item.id).toBe(1);       // queue row id
            expect(item.model_id).toBe(2); // model id
        });

        it('returns null primaryImage when model has no assets', async () => {
            testDb.prepare('DELETE FROM model_assets WHERE model_id = 2').run();
            const res = await request(app).get('/api/queue');
            expect(res.body.queue[0].primaryImage).toBeNull();
        });

        it('excludes hidden assets from primaryImage', async () => {
            testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE model_id = 2').run();
            const res = await request(app).get('/api/queue');
            expect(res.body.queue[0].primaryImage).toBeNull();
        });
    });

    describe('POST /api/queue (add)', () => {
        it('adds a model to the queue', async () => {
            const res = await request(app)
                .post('/api/queue')
                .send({ model_id: 1 });
            expect(res.status).toBe(200);
            expect(res.body.model_id).toBe(1);

            const row = testDb.prepare('SELECT id FROM print_queue WHERE model_id = 1').get();
            expect(row).toBeDefined();
        });

        it('requires model_id', async () => {
            const res = await request(app).post('/api/queue').send({});
            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /api/queue/:id', () => {
        it('removes from queue using the queue row id', async () => {
            // GET first to confirm id=1 is the queue row id
            const getRes = await request(app).get('/api/queue');
            const queueId = getRes.body.queue[0].id;
            expect(queueId).toBe(1);

            const deleteRes = await request(app).delete(`/api/queue/${queueId}`);
            expect(deleteRes.status).toBe(200);
            expect(deleteRes.body.success).toBe(true);

            const row = testDb.prepare('SELECT id FROM print_queue WHERE id = 1').get();
            expect(row).toBeUndefined();
        });

        it('does not remove anything when given a non-existent id', async () => {
            await request(app).delete('/api/queue/999');
            const row = testDb.prepare('SELECT id FROM print_queue WHERE model_id = 2').get();
            expect(row).toBeDefined();
        });
    });

    describe('POST /api/queue/toggle', () => {
        it('removes from queue when already queued', async () => {
            const res = await request(app)
                .post('/api/queue/toggle')
                .send({ model_id: 2 });
            expect(res.status).toBe(200);
            expect(res.body.queued).toBe(false);

            const row = testDb.prepare('SELECT id FROM print_queue WHERE model_id = 2').get();
            expect(row).toBeUndefined();
        });

        it('adds to queue when not queued', async () => {
            const res = await request(app)
                .post('/api/queue/toggle')
                .send({ model_id: 1 });
            expect(res.status).toBe(200);
            expect(res.body.queued).toBe(true);
        });

        it('requires model_id', async () => {
            const res = await request(app).post('/api/queue/toggle').send({});
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/queue/bulk', () => {
        it('removes models from queue', async () => {
            const res = await request(app)
                .post('/api/queue/bulk')
                .send({ model_ids: [2], action: 'remove' });
            expect(res.status).toBe(200);
            expect(res.body.affected).toBe(1);

            const row = testDb.prepare('SELECT id FROM print_queue WHERE model_id = 2').get();
            expect(row).toBeUndefined();
        });

        it('adds models to queue', async () => {
            const res = await request(app)
                .post('/api/queue/bulk')
                .send({ model_ids: [1, 3], action: 'add' });
            expect(res.status).toBe(200);
            expect(res.body.affected).toBe(2);
        });

        it('requires non-empty model_ids array', async () => {
            const res = await request(app)
                .post('/api/queue/bulk')
                .send({ model_ids: [], action: 'remove' });
            expect(res.status).toBe(400);
        });

        it('requires valid action', async () => {
            const res = await request(app)
                .post('/api/queue/bulk')
                .send({ model_ids: [1], action: 'delete' });
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/queue/reorder', () => {
        it('updates priority for queue items', async () => {
            const res = await request(app)
                .post('/api/queue/reorder')
                .send({ items: [{ id: 1, priority: 99 }] });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const row = testDb.prepare('SELECT priority FROM print_queue WHERE id = 1').get() as any;
            expect(row.priority).toBe(99);
        });

        it('requires items array', async () => {
            const res = await request(app)
                .post('/api/queue/reorder')
                .send({ items: 'not-an-array' });
            expect(res.status).toBe(400);
        });
    });
});
