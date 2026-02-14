import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

import printedRouter from '../routes/printed.js';
import { initSchema, seedTestData } from './setup.js';

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/printed', printedRouter);
    return app;
}

describe('Printed Routes', () => {
    let app: express.Express;

    beforeEach(() => {
        initSchema(testDb);
        seedTestData(testDb);
        app = createApp();
    });

    describe('GET /api/printed', () => {
        it('returns all printed models with primaryImage', async () => {
            const res = await request(app).get('/api/printed');
            expect(res.status).toBe(200);
            expect(res.body.printed).toHaveLength(1);
            expect(res.body.printed[0].model_id).toBe(1);
            expect(res.body.printed[0].primaryImage).toBe('/test/models/a/image1.jpg');
        });

        it('excludes hidden assets from primaryImage', async () => {
            testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE id = 1').run();
            const res = await request(app).get('/api/printed');
            expect(res.body.printed[0].primaryImage).toBe('/test/models/a/image2.jpg');
        });
    });

    describe('POST /api/printed/toggle', () => {
        it('marks an unprinted model as printed', async () => {
            const res = await request(app)
                .post('/api/printed/toggle')
                .send({ model_id: 2, rating: 'good' });
            expect(res.status).toBe(200);
            expect(res.body.printed).toBe(true);
            expect(res.body.rating).toBe('good');
        });

        it('removes from queue when marking as printed', async () => {
            const res = await request(app)
                .post('/api/printed/toggle')
                .send({ model_id: 2, rating: 'good' });
            expect(res.status).toBe(200);
            expect(res.body.removedFromQueue).toBe(true);

            const queueItem = testDb.prepare('SELECT id FROM print_queue WHERE model_id = 2').get();
            expect(queueItem).toBeUndefined();
        });

        it('unmarks a printed model', async () => {
            const res = await request(app)
                .post('/api/printed/toggle')
                .send({ model_id: 1 });
            expect(res.status).toBe(200);
            expect(res.body.printed).toBe(false);
        });

        it('requires model_id', async () => {
            const res = await request(app)
                .post('/api/printed/toggle')
                .send({});
            expect(res.status).toBe(400);
        });

        it('validates rating values', async () => {
            const res = await request(app)
                .post('/api/printed/toggle')
                .send({ model_id: 2, rating: 'excellent' });
            expect(res.status).toBe(400);
        });
    });

    describe('PUT /api/printed/:id', () => {
        it('updates rating on a printed record', async () => {
            const res = await request(app)
                .put('/api/printed/1')
                .send({ rating: 'bad', notes: 'warped' });
            expect(res.status).toBe(200);

            const record = testDb.prepare('SELECT rating, notes FROM printed_models WHERE id = 1').get() as any;
            expect(record.rating).toBe('bad');
            expect(record.notes).toBe('warped');
        });
    });

    describe('DELETE /api/printed/:id', () => {
        it('deletes a printed record', async () => {
            const res = await request(app).delete('/api/printed/1');
            expect(res.status).toBe(200);

            const record = testDb.prepare('SELECT id FROM printed_models WHERE id = 1').get();
            expect(record).toBeUndefined();
        });
    });

    describe('Make Images', () => {
        it('GET /:id/images returns empty array initially', async () => {
            const res = await request(app).get('/api/printed/1/images');
            expect(res.status).toBe(200);
            expect(res.body.images).toEqual([]);
        });

        it('POST /:id/images uploads an image', async () => {
            const testImagePath = path.join(os.tmpdir(), 'test-make.jpg');
            fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

            const res = await request(app)
                .post('/api/printed/1/images')
                .attach('image', testImagePath);

            expect(res.status).toBe(200);
            expect(res.body.printed_model_id).toBe(1);
            expect(res.body.filename).toBe('test-make.jpg');
            expect(res.body.id).toBeDefined();

            const images = testDb.prepare('SELECT * FROM make_images WHERE printed_model_id = 1').all();
            expect(images).toHaveLength(1);

            // Clean up
            if (fs.existsSync(res.body.filepath)) fs.unlinkSync(res.body.filepath);
            if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
        });

        it('POST /:id/images returns 404 for non-existent printed record', async () => {
            const testImagePath = path.join(os.tmpdir(), 'test-make2.jpg');
            fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

            const res = await request(app)
                .post('/api/printed/999/images')
                .attach('image', testImagePath);

            expect(res.status).toBe(404);
            fs.unlinkSync(testImagePath);
        });

        it('DELETE /:printedId/images/:imageId deletes a make image', async () => {
            const filepath = path.join(os.tmpdir(), 'make-to-delete.jpg');
            fs.writeFileSync(filepath, Buffer.from('fake-data'));
            testDb.prepare('INSERT INTO make_images (id, printed_model_id, filename, filepath) VALUES (?, ?, ?, ?)').run(1, 1, 'test.jpg', filepath);

            const res = await request(app).delete('/api/printed/1/images/1');
            expect(res.status).toBe(200);

            const record = testDb.prepare('SELECT id FROM make_images WHERE id = 1').get();
            expect(record).toBeUndefined();
            expect(fs.existsSync(filepath)).toBe(false);
        });

        it('GET /:id/images returns uploaded images', async () => {
            testDb.prepare('INSERT INTO make_images (id, printed_model_id, filename, filepath) VALUES (?, ?, ?, ?)').run(1, 1, 'photo1.jpg', '/tmp/photo1.jpg');
            testDb.prepare('INSERT INTO make_images (id, printed_model_id, filename, filepath) VALUES (?, ?, ?, ?)').run(2, 1, 'photo2.jpg', '/tmp/photo2.jpg');

            const res = await request(app).get('/api/printed/1/images');
            expect(res.status).toBe(200);
            expect(res.body.images).toHaveLength(2);
        });
    });
});
