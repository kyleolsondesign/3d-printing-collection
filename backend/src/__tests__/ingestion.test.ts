import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import path from 'path';

const { testDb } = vi.hoisted(() => {
    const Database = require('better-sqlite3');
    return { testDb: new Database(':memory:') };
});

vi.mock('../config/database.js', () => ({ default: testDb }));

// Mock fs with helpers for controlling behavior per-test
const mockReaddirSync = vi.fn();
const mockExistsSync = vi.fn().mockReturnValue(true);
const mockStatSync = vi.fn().mockReturnValue({ size: 1000 });
const mockMkdirSync = vi.fn();
const mockRenameSync = vi.fn();

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        ...actual as any,
        default: {
            ...(actual as any),
            readdirSync: (...args: any[]) => mockReaddirSync(...args),
            existsSync: (...args: any[]) => mockExistsSync(...args),
            statSync: (...args: any[]) => mockStatSync(...args),
            mkdirSync: (...args: any[]) => mockMkdirSync(...args),
            renameSync: (...args: any[]) => mockRenameSync(...args),
            readFileSync: (actual as any).readFileSync,
        },
        readdirSync: (...args: any[]) => mockReaddirSync(...args),
        existsSync: (...args: any[]) => mockExistsSync(...args),
        statSync: (...args: any[]) => mockStatSync(...args),
        mkdirSync: (...args: any[]) => mockMkdirSync(...args),
        renameSync: (...args: any[]) => mockRenameSync(...args),
    };
});

// Mock scanner
vi.mock('../services/scanner.js', () => ({
    default: { scanSingleFolder: vi.fn().mockResolvedValue({ modelId: 1, filename: 'test' }) }
}));

// Mock pdfMetadata utils
vi.mock('../utils/pdfMetadata.js', () => ({
    extractRawTextFromPdf: vi.fn().mockResolvedValue(null),
    extractLinksFromPdf: vi.fn().mockResolvedValue([]),
    classifyLinks: vi.fn().mockReturnValue({ tags: [], designer: null }),
    detectPlatform: vi.fn().mockReturnValue(null),
    extractDesignerFromFilename: vi.fn().mockReturnValue(null)
}));

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn()
}));

// Mock nameCleanup
vi.mock('../utils/nameCleanup.js', () => ({
    cleanupFolderName: (name: string) => name
}));

import ingestionRouter from '../routes/ingestion.js';
import { initSchema, seedTestData } from './setup.js';

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/ingestion', ingestionRouter);
    return app;
}

describe('Ingestion Routes', () => {
    let app: express.Express;

    beforeEach(() => {
        vi.clearAllMocks();
        initSchema(testDb);
        seedTestData(testDb);
        app = createApp();
    });

    describe('GET /api/ingestion/preview-image', () => {
        beforeEach(() => {
            // Set ingestion directory in config
            testDb.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`).run('ingestion_directory', '/test/ingestion');
        });

        it('returns 400 when path is missing', async () => {
            const res = await request(app).get('/api/ingestion/preview-image');
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('path');
        });

        it('returns 403 for path outside ingestion directory', async () => {
            const res = await request(app).get('/api/ingestion/preview-image')
                .query({ path: '/etc/passwd' });
            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Access denied');
        });

        it('returns 403 for path traversal attempt', async () => {
            const res = await request(app).get('/api/ingestion/preview-image')
                .query({ path: '/test/ingestion/../../etc/passwd' });
            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Access denied');
        });

        it('returns 404 when file does not exist', async () => {
            mockExistsSync.mockImplementation((p: string) => {
                // The file itself doesn't exist, but directory checks pass
                if (p === '/test/ingestion/subfolder/image.jpg') return false;
                return true;
            });
            const res = await request(app).get('/api/ingestion/preview-image')
                .query({ path: '/test/ingestion/subfolder/image.jpg' });
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/ingestion/scan - fuzzy category matching', () => {
        beforeEach(() => {
            testDb.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`).run('ingestion_directory', '/test/ingestion');
            mockExistsSync.mockReturnValue(true);
            mockStatSync.mockReturnValue({ size: 1000 });
        });

        // Helper: scan a single-file ingestion dir with the given filename
        async function scanFilename(filename: string) {
            mockReaddirSync.mockImplementation((dir: string) => {
                if (dir === '/test/ingestion') {
                    return [{ name: filename, isDirectory: () => false, isFile: () => true }];
                }
                return [];
            });
            const res = await request(app).get('/api/ingestion/scan');
            expect(res.status).toBe(200);
            return res.body.items[0] as { suggestedCategory: string; confidence: string };
        }

        // Helper: seed a category by inserting a model with that category
        function seedCategory(category: string) {
            testDb.prepare(`INSERT OR IGNORE INTO models (filename, filepath, category, file_count) VALUES (?, ?, ?, 1)`)
                .run(`${category} model`, `/test/cat/${category}`, category);
        }

        describe('phrase-only categories (A1 Mini, Core One, CyberBrick)', () => {
            beforeEach(() => {
                seedCategory('A1 Mini');
                seedCategory('Core One');
                seedCategory('CyberBrick');
            });

            // A1 Mini — false positives (should NOT match)
            it('does not match "A1 Mini" for a filename containing only "mini"', async () => {
                const item = await scanFilename('cool-mini-stand.stl');
                expect(item.suggestedCategory).not.toBe('A1 Mini');
            });

            it('does not match "A1 Mini" for a filename containing only "a1"', async () => {
                const item = await scanFilename('a1-bracket.stl');
                expect(item.suggestedCategory).not.toBe('A1 Mini');
            });

            // A1 Mini — true positives (should match)
            it('matches "A1 Mini" for filename with full phrase "A1 Mini"', async () => {
                const item = await scanFilename('A1 Mini Enclosure.stl');
                expect(item.suggestedCategory).toBe('A1 Mini');
            });

            it('matches "A1 Mini" for space-collapsed form "A1Mini"', async () => {
                const item = await scanFilename('A1Mini_Spool_Holder.stl');
                expect(item.suggestedCategory).toBe('A1 Mini');
            });

            // Core One — false positives
            it('does not match "Core One" for a filename containing only "one"', async () => {
                const item = await scanFilename('wall-one-holder.stl');
                expect(item.suggestedCategory).not.toBe('Core One');
            });

            it('does not match "Core One" for a filename containing only "core"', async () => {
                const item = await scanFilename('core-bracket.stl');
                expect(item.suggestedCategory).not.toBe('Core One');
            });

            // Core One — true positives
            it('matches "Core One" for filename with full phrase "Core One"', async () => {
                const item = await scanFilename('Core One Stand.stl');
                expect(item.suggestedCategory).toBe('Core One');
            });

            it('matches "Core One" for space-collapsed form "CoreOne"', async () => {
                const item = await scanFilename('CoreOne_bracket.stl');
                expect(item.suggestedCategory).toBe('Core One');
            });

            // CyberBrick — false positives
            it('does not match "CyberBrick" for a filename containing only "brick"', async () => {
                const item = await scanFilename('brick-shelf.stl');
                expect(item.suggestedCategory).not.toBe('CyberBrick');
            });

            it('does not match "CyberBrick" for a filename containing only "cyber"', async () => {
                const item = await scanFilename('cyber-mount.stl');
                expect(item.suggestedCategory).not.toBe('CyberBrick');
            });

            // CyberBrick — true positives
            it('matches "CyberBrick" for filename with full camelCase "CyberBrick"', async () => {
                const item = await scanFilename('CyberBrick Hub.stl');
                expect(item.suggestedCategory).toBe('CyberBrick');
            });

            it('matches "CyberBrick" for spaced form "Cyber Brick"', async () => {
                const item = await scanFilename('Cyber Brick Mount.stl');
                expect(item.suggestedCategory).toBe('CyberBrick');
            });
        });
    });

    describe('GET /api/ingestion/scan - imageFile field', () => {
        beforeEach(() => {
            testDb.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`).run('ingestion_directory', '/test/ingestion');
            mockExistsSync.mockReturnValue(true);
            mockStatSync.mockReturnValue({ size: 1000 });
        });

        it('includes imageFile for folder with images', async () => {
            // Root dir listing: one folder
            mockReaddirSync.mockImplementation((dir: string, opts?: any) => {
                if (dir === '/test/ingestion') {
                    return [{
                        name: 'MyModel',
                        isDirectory: () => true,
                        isFile: () => false
                    }];
                }
                // Inside MyModel folder (walk)
                if (dir === '/test/ingestion/MyModel') {
                    return [
                        { name: 'model.stl', isDirectory: () => false, isFile: () => true },
                        { name: 'preview.jpg', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });

            const res = await request(app).get('/api/ingestion/scan');
            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(1);
            expect(res.body.items[0].imageFile).toBe(
                path.join('/test/ingestion/MyModel', 'preview.jpg')
            );
        });

        it('returns null imageFile for folder without images', async () => {
            mockReaddirSync.mockImplementation((dir: string) => {
                if (dir === '/test/ingestion') {
                    return [{
                        name: 'NoImageModel',
                        isDirectory: () => true,
                        isFile: () => false
                    }];
                }
                if (dir === '/test/ingestion/NoImageModel') {
                    return [
                        { name: 'model.stl', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });

            const res = await request(app).get('/api/ingestion/scan');
            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(1);
            expect(res.body.items[0].imageFile).toBeNull();
        });

        it('includes imageFile for single file with sibling image', async () => {
            mockReaddirSync.mockImplementation((dir: string) => {
                if (dir === '/test/ingestion') {
                    return [
                        { name: 'widget.stl', isDirectory: () => false, isFile: () => true },
                        { name: 'widget.jpg', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });

            const res = await request(app).get('/api/ingestion/scan');
            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(1);
            // Should prefer matching basename
            expect(res.body.items[0].imageFile).toBe('/test/ingestion/widget.jpg');
        });

        it('uses fallback sibling image when basename does not match', async () => {
            mockReaddirSync.mockImplementation((dir: string) => {
                if (dir === '/test/ingestion') {
                    return [
                        { name: 'model.stl', isDirectory: () => false, isFile: () => true },
                        { name: 'random_photo.png', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });

            const res = await request(app).get('/api/ingestion/scan');
            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(1);
            expect(res.body.items[0].imageFile).toBe('/test/ingestion/random_photo.png');
        });

        it('returns null imageFile for single file with no sibling images', async () => {
            mockReaddirSync.mockImplementation((dir: string) => {
                if (dir === '/test/ingestion') {
                    return [
                        { name: 'model.stl', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });

            const res = await request(app).get('/api/ingestion/scan');
            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(1);
            expect(res.body.items[0].imageFile).toBeNull();
        });
    });
});
