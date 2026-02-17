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
vi.mock('../services/scanner.js', () => ({
    default: { scan: vi.fn(), deduplicateAllImages: vi.fn() },
    ScanMode: { SYNC: 'sync', ADD_ONLY: 'add_only', FULL_REBUILD: 'full_rebuild' }
}));

// Mock child_process exec for open-folder and trash
const mockExec = vi.fn();
vi.mock('child_process', () => ({
    exec: (...args: any[]) => mockExec(...args)
}));

// Mock fs for trash endpoint
const mockExistsSync = vi.fn().mockReturnValue(true);
vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        ...actual as any,
        default: {
            ...(actual as any),
            existsSync: (...args: any[]) => mockExistsSync(...args),
            mkdirSync: vi.fn(),
            readFileSync: (actual as any).readFileSync,
        },
        existsSync: (...args: any[]) => mockExistsSync(...args),
    };
});

import systemRouter from '../routes/system.js';
import { initSchema, seedTestData } from './setup.js';

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/system', systemRouter);
    return app;
}

describe('System Routes', () => {
    let app: express.Express;

    beforeEach(() => {
        initSchema(testDb);
        seedTestData(testDb);
        app = createApp();
        vi.clearAllMocks();
    });

    describe('GET /api/system/loose-files', () => {
        beforeEach(() => {
            // Seed loose files with different filepaths to test ordering
            testDb.prepare(`INSERT INTO loose_files (id, filename, filepath, file_size, file_type, category) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(1, 'model_z.stl', '/root/Toys/model_z.stl', 1000, 'stl', 'Toys');
            testDb.prepare(`INSERT INTO loose_files (id, filename, filepath, file_size, file_type, category) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(2, 'model_a.stl', '/root/Tools/model_a.stl', 2000, 'stl', 'Tools');
            testDb.prepare(`INSERT INTO loose_files (id, filename, filepath, file_size, file_type, category) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(3, 'model_m.3mf', '/root/Misc/model_m.3mf', 3000, '3mf', 'Misc');
        });

        it('returns loose files sorted by filepath', async () => {
            const res = await request(app).get('/api/system/loose-files');
            expect(res.status).toBe(200);
            expect(res.body.looseFiles).toHaveLength(3);
            // Should be sorted by filepath ASC
            expect(res.body.looseFiles[0].filepath).toBe('/root/Misc/model_m.3mf');
            expect(res.body.looseFiles[1].filepath).toBe('/root/Tools/model_a.stl');
            expect(res.body.looseFiles[2].filepath).toBe('/root/Toys/model_z.stl');
        });

        it('returns empty array when no loose files', async () => {
            testDb.prepare('DELETE FROM loose_files').run();
            const res = await request(app).get('/api/system/loose-files');
            expect(res.status).toBe(200);
            expect(res.body.looseFiles).toHaveLength(0);
        });
    });

    describe('POST /api/system/trash-loose-file', () => {
        beforeEach(() => {
            testDb.prepare(`INSERT INTO loose_files (id, filename, filepath, file_size, file_type, category) VALUES (?, ?, ?, ?, ?, ?)`)
                .run(10, 'delete_me.stl', '/root/Toys/delete_me.stl', 5000, 'stl', 'Toys');
        });

        it('returns 400 when looseFileId is missing', async () => {
            const res = await request(app).post('/api/system/trash-loose-file').send({});
            expect(res.status).toBe(400);
        });

        it('returns 404 when loose file does not exist', async () => {
            const res = await request(app).post('/api/system/trash-loose-file').send({ looseFileId: 999 });
            expect(res.status).toBe(404);
        });

        it('removes from DB when file does not exist on disk', async () => {
            mockExistsSync.mockReturnValueOnce(false);
            const res = await request(app).post('/api/system/trash-loose-file').send({ looseFileId: 10 });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify removed from database
            const row = testDb.prepare('SELECT * FROM loose_files WHERE id = 10').get();
            expect(row).toBeUndefined();
        });

        it('moves file to trash and removes from DB', async () => {
            mockExistsSync.mockReturnValue(true);
            // Mock exec to succeed
            mockExec.mockImplementation((_cmd: string, callback: Function) => {
                callback(null);
            });

            const res = await request(app).post('/api/system/trash-loose-file').send({ looseFileId: 10 });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify osascript was called
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('osascript'),
                expect.any(Function)
            );

            // Verify removed from database
            const row = testDb.prepare('SELECT * FROM loose_files WHERE id = 10').get();
            expect(row).toBeUndefined();
        });

        it('returns 500 when trash command fails', async () => {
            mockExistsSync.mockReturnValue(true);
            mockExec.mockImplementation((_cmd: string, callback: Function) => {
                callback(new Error('Finder failed'));
            });

            const res = await request(app).post('/api/system/trash-loose-file').send({ looseFileId: 10 });
            expect(res.status).toBe(500);

            // File should still be in database since trash failed
            const row = testDb.prepare('SELECT * FROM loose_files WHERE id = 10').get();
            expect(row).toBeDefined();
        });
    });

    describe('POST /api/system/open-folder', () => {
        it('returns 400 when folderPath is missing', async () => {
            const res = await request(app).post('/api/system/open-folder').send({});
            expect(res.status).toBe(400);
        });

        it('calls open -R with the provided path', async () => {
            mockExec.mockImplementation((_cmd: string, callback: Function) => {
                callback(null);
            });

            const res = await request(app).post('/api/system/open-folder').send({ folderPath: '/test/path/file.stl' });
            expect(res.status).toBe(200);
            expect(mockExec).toHaveBeenCalledWith(
                'open -R "/test/path/file.stl"',
                expect.any(Function)
            );
        });
    });
});
