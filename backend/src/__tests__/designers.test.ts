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
    TAG_COLORS: { PRINTED_GOOD: 'Green', PRINTED_BAD: 'Red', QUEUED: 'Blue', CURRENTLY_PRINTING: 'Orange' }
}));

import designersRouter from '../routes/designers.js';
import { initSchema, seedTestData } from './setup.js';

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/designers', designersRouter);
    return app;
}

describe('Designers Routes', () => {
    let app: express.Express;

    beforeEach(() => {
        initSchema(testDb);
        seedTestData(testDb);
        app = createApp();
    });

    describe('GET /api/designers', () => {
        it('returns empty list when no designers', async () => {
            const res = await request(app).get('/api/designers');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('includes is_favorite flag', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'FavDesigner');
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(2, 'OtherDesigner');
            testDb.prepare('INSERT INTO designer_favorites (designer_id) VALUES (?)').run(1);

            const res = await request(app).get('/api/designers');
            expect(res.status).toBe(200);
            const fav = res.body.find((d: any) => d.id === 1);
            const other = res.body.find((d: any) => d.id === 2);
            expect(fav.is_favorite).toBe(1);
            expect(other.is_favorite).toBe(0);
        });

        it('filters by favoritesOnly=true', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'FavDesigner');
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(2, 'OtherDesigner');
            testDb.prepare('INSERT INTO designer_favorites (designer_id) VALUES (?)').run(1);

            const res = await request(app).get('/api/designers?favoritesOnly=true');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('FavDesigner');
        });

        it('returns designers with model counts', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');
            testDb.prepare('UPDATE models SET designer_id = 1 WHERE id = 1').run();
            testDb.prepare('UPDATE models SET designer_id = 1 WHERE id = 2').run();

            const res = await request(app).get('/api/designers');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('TestDesigner');
            expect(res.body[0].model_count).toBe(2);
        });

        it('returns paid_model_count', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'PaidDesigner');
            testDb.prepare('UPDATE models SET designer_id = 1, is_paid = 1 WHERE id = 1').run();
            testDb.prepare('UPDATE models SET designer_id = 1, is_paid = 0 WHERE id = 2').run();

            const res = await request(app).get('/api/designers');
            expect(res.body[0].paid_model_count).toBe(1);
        });

        it('filters by paid', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'PaidDesigner');
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(2, 'FreeDesigner');
            testDb.prepare('UPDATE models SET designer_id = 1, is_paid = 1 WHERE id = 1').run();
            testDb.prepare('UPDATE models SET designer_id = 2, is_paid = 0 WHERE id = 2').run();

            const res = await request(app).get('/api/designers?filter=paid');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('PaidDesigner');
        });

        it('filters by free', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'PaidDesigner');
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(2, 'FreeDesigner');
            testDb.prepare('UPDATE models SET designer_id = 1, is_paid = 1 WHERE id = 1').run();
            testDb.prepare('UPDATE models SET designer_id = 2, is_paid = 0 WHERE id = 2').run();

            const res = await request(app).get('/api/designers?filter=free');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('FreeDesigner');
        });
    });

    describe('POST /api/designers', () => {
        it('creates a new designer', async () => {
            const res = await request(app).post('/api/designers').send({ name: 'NewDesigner' });
            expect(res.status).toBe(201);
            expect(res.body.name).toBe('NewDesigner');
        });

        it('returns existing designer if name matches (case insensitive)', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');
            const res = await request(app).post('/api/designers').send({ name: 'testdesigner' });
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(1);
        });

        it('rejects empty name', async () => {
            const res = await request(app).post('/api/designers').send({ name: '' });
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/designers/sync', () => {
        it('requires model directory config', async () => {
            // Remove the model_directory that seedTestData inserts
            testDb.prepare("DELETE FROM config WHERE key = 'model_directory'").run();
            const res = await request(app).post('/api/designers/sync');
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Model directory not configured');
        });

        it('starts sync and returns immediately', async () => {
            testDb.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('model_directory', '/test/root')").run();

            const res = await request(app).post('/api/designers/sync');
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Sync started');
        });

        it('creates designers from paid model paths', async () => {
            testDb.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('model_directory', '/test/root')").run();
            // Add a paid model with a designer in path
            testDb.prepare(`INSERT INTO models (id, filename, filepath, category, is_paid, file_count) VALUES (?, ?, ?, ?, ?, ?)`).run(
                10, 'Cool Model', '/test/root/Paid/DesignerX/Cool Model', 'Paid', 1, 1
            );

            await request(app).post('/api/designers/sync');
            // Wait for async sync to complete
            await new Promise(r => setTimeout(r, 100));

            const designers = testDb.prepare('SELECT * FROM designers').all() as any[];
            expect(designers).toHaveLength(1);
            expect(designers[0].name).toBe('DesignerX');

            const model = testDb.prepare('SELECT designer_id FROM models WHERE id = 10').get() as any;
            expect(model.designer_id).toBe(designers[0].id);
        });

        it('links models from model_metadata', async () => {
            testDb.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('model_directory', '/test/root')").run();
            // Add metadata with designer for a non-paid model
            testDb.prepare(`INSERT INTO model_metadata (model_id, designer, designer_url) VALUES (?, ?, ?)`).run(
                1, 'MetaDesigner', 'https://example.com/profile'
            );

            await request(app).post('/api/designers/sync');
            await new Promise(r => setTimeout(r, 100));

            const designers = testDb.prepare('SELECT * FROM designers').all() as any[];
            expect(designers.some((d: any) => d.name === 'MetaDesigner')).toBe(true);

            const model = testDb.prepare('SELECT designer_id FROM models WHERE id = 1').get() as any;
            expect(model.designer_id).toBeTruthy();
        });

        it('sync completes and allows subsequent sync', async () => {
            testDb.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('model_directory', '/test/root')").run();

            const first = await request(app).post('/api/designers/sync');
            expect(first.status).toBe(200);

            // Wait for async sync to complete
            await new Promise(r => setTimeout(r, 100));

            // Should be able to sync again after completion
            const second = await request(app).post('/api/designers/sync');
            expect(second.status).toBe(200);

            await new Promise(r => setTimeout(r, 100));
        });
    });

    describe('GET /api/designers/sync/status', () => {
        it('returns sync progress state', async () => {
            const res = await request(app).get('/api/designers/sync/status');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('active');
            expect(res.body).toHaveProperty('phase');
            expect(res.body).toHaveProperty('created');
            expect(res.body).toHaveProperty('linked');
        });
    });

    describe('GET /api/designers/:id', () => {
        it('returns designer with models', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');
            testDb.prepare('UPDATE models SET designer_id = 1 WHERE id = 1').run();

            const res = await request(app).get('/api/designers/1');
            expect(res.status).toBe(200);
            expect(res.body.name).toBe('TestDesigner');
            expect(res.body.models).toHaveLength(1);
            expect(res.body.total).toBe(1);
        });

        it('includes is_favorite=0 when not favorited', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');

            const res = await request(app).get('/api/designers/1');
            expect(res.status).toBe(200);
            expect(res.body.is_favorite).toBe(0);
        });

        it('includes is_favorite=1 when favorited', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');
            testDb.prepare('INSERT INTO designer_favorites (designer_id) VALUES (?)').run(1);

            const res = await request(app).get('/api/designers/1');
            expect(res.status).toBe(200);
            expect(res.body.is_favorite).toBe(1);
        });

        it('returns 404 for unknown designer', async () => {
            const res = await request(app).get('/api/designers/999');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/designers/:id/favorite', () => {
        it('adds a favorite', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');

            const res = await request(app).post('/api/designers/1/favorite');
            expect(res.status).toBe(200);
            expect(res.body.is_favorite).toBe(true);

            const row = testDb.prepare('SELECT * FROM designer_favorites WHERE designer_id = 1').get();
            expect(row).toBeTruthy();
        });

        it('removes a favorite on second toggle', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');
            testDb.prepare('INSERT INTO designer_favorites (designer_id) VALUES (?)').run(1);

            const res = await request(app).post('/api/designers/1/favorite');
            expect(res.status).toBe(200);
            expect(res.body.is_favorite).toBe(false);

            const row = testDb.prepare('SELECT * FROM designer_favorites WHERE designer_id = 1').get();
            expect(row).toBeFalsy();
        });

        it('returns 404 for unknown designer', async () => {
            const res = await request(app).post('/api/designers/999/favorite');
            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /api/designers/:id', () => {
        it('deletes designer and unlinks models', async () => {
            testDb.prepare('INSERT INTO designers (id, name) VALUES (?, ?)').run(1, 'TestDesigner');
            testDb.prepare('UPDATE models SET designer_id = 1 WHERE id = 1').run();

            const res = await request(app).delete('/api/designers/1');
            expect(res.status).toBe(200);

            const model = testDb.prepare('SELECT designer_id FROM models WHERE id = 1').get() as any;
            expect(model.designer_id).toBeNull();

            const designer = testDb.prepare('SELECT * FROM designers WHERE id = 1').get();
            expect(designer).toBeUndefined();
        });
    });
});
