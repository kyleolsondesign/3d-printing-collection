import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import express from 'express';
import { initSchema, seedTestData } from './setup.js';

// ── Mock database and macOS-specific modules ──────────────────────────────────

const testDb = new Database(':memory:');

vi.mock('../config/database.js', () => ({ default: testDb }));
vi.mock('../utils/finderTags.js', () => ({
    readFinderTags: vi.fn().mockResolvedValue([]),
    writeFinderTags: vi.fn().mockResolvedValue(undefined),
}));

// Import routes after mocks are established
const { default: tagsRouter } = await import('../routes/tags.js');
const { default: modelsRouter } = await import('../routes/models.js');

const app = express();
app.use(express.json());
app.use('/api/tags', tagsRouter);
app.use('/api/models', modelsRouter);

// ── Test helpers ──────────────────────────────────────────────────────────────

function createTag(name: string, source = 'pdf'): number {
    const result = testDb.prepare('INSERT INTO tags (name, source) VALUES (?, ?)').run(name, source);
    return Number(result.lastInsertRowid);
}

function linkTag(modelId: number, tagId: number) {
    testDb.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tagId);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    initSchema(testDb);
    seedTestData(testDb);
    // seed tags and config
    testDb.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('model_directory', '/test/models')`).run();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/tags', () => {
    it('returns tags with source field', async () => {
        createTag('toy', 'pdf');
        createTag('manual', 'user');

        const res = await request(app).get('/api/tags');
        expect(res.status).toBe(200);
        const names = res.body.map((t: any) => t.name);
        expect(names).toContain('toy');
        expect(names).toContain('manual');
        const manual = res.body.find((t: any) => t.name === 'manual');
        expect(manual.source).toBe('user');
    });
});

describe('GET /api/tags/similar', () => {
    it('detects plural/singular pairs', async () => {
        createTag('toy');
        createTag('toys');
        // link both to model 1 so they have count >= 1
        const rows = testDb.prepare('SELECT id FROM tags WHERE name IN (?, ?)').all('toy', 'toys') as any[];
        for (const r of rows) linkTag(1, r.id);

        const res = await request(app).get('/api/tags/similar?threshold=80');
        expect(res.status).toBe(200);
        const pair = res.body.find((p: any) =>
            (p.tag1.name === 'toy' && p.tag2.name === 'toys') ||
            (p.tag1.name === 'toys' && p.tag2.name === 'toy')
        );
        expect(pair).toBeTruthy();
        expect(pair.similarity).toBeGreaterThanOrEqual(80);
    });

    it('detects separator-variant pairs at score 98', async () => {
        createTag('kitchen-tool');
        createTag('kitchen tool');
        const rows = testDb.prepare('SELECT id FROM tags WHERE name IN (?, ?)').all('kitchen-tool', 'kitchen tool') as any[];
        for (const r of rows) linkTag(1, r.id);

        const res = await request(app).get('/api/tags/similar?threshold=80');
        expect(res.status).toBe(200);
        const pair = res.body.find((p: any) =>
            (p.tag1.name === 'kitchen-tool' || p.tag2.name === 'kitchen-tool')
        );
        expect(pair).toBeTruthy();
        expect(pair.similarity).toBe(98);
    });
});

describe('POST /api/tags/merge', () => {
    it('moves model associations to target and deletes source tag', async () => {
        const srcId = createTag('toy');
        const tgtId = createTag('toys');
        linkTag(1, srcId);
        linkTag(2, srcId);
        linkTag(3, tgtId);

        const res = await request(app)
            .post('/api/tags/merge')
            .send({ sourceIds: [srcId], targetId: tgtId });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.mergedCount).toBe(1);

        // source tag deleted
        const srcTag = testDb.prepare('SELECT id FROM tags WHERE id = ?').get(srcId);
        expect(srcTag).toBeUndefined();

        // models 1 and 2 now have target tag
        const m1 = testDb.prepare('SELECT 1 FROM model_tags WHERE model_id = 1 AND tag_id = ?').get(tgtId);
        expect(m1).toBeTruthy();
        const m2 = testDb.prepare('SELECT 1 FROM model_tags WHERE model_id = 2 AND tag_id = ?').get(tgtId);
        expect(m2).toBeTruthy();
    });

    it('returns 400 without required fields', async () => {
        const res = await request(app).post('/api/tags/merge').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /api/tags/cleanup', () => {
    it('deletes unused tags (maxCount=0)', async () => {
        const usedId = createTag('used');
        const unusedId = createTag('unused');
        linkTag(1, usedId);
        // unusedId has no model_tags rows

        const res = await request(app)
            .post('/api/tags/cleanup')
            .send({ maxCount: 0 });

        expect(res.status).toBe(200);
        expect(res.body.deleted).toBeGreaterThanOrEqual(1);

        const unusedStill = testDb.prepare('SELECT id FROM tags WHERE id = ?').get(unusedId);
        expect(unusedStill).toBeUndefined();

        const usedStill = testDb.prepare('SELECT id FROM tags WHERE id = ?').get(usedId);
        expect(usedStill).toBeTruthy();
    });

    it('dryRun returns count without deleting', async () => {
        createTag('orphan');

        const res = await request(app)
            .post('/api/tags/cleanup')
            .send({ maxCount: 0, dryRun: true });

        expect(res.status).toBe(200);
        expect(res.body.dryRun).toBe(true);
        expect(res.body.wouldDelete).toBeGreaterThanOrEqual(1);

        // Nothing deleted
        const all = testDb.prepare('SELECT id FROM tags WHERE name = ?').all('orphan');
        expect(all.length).toBe(1);
    });

    it('returns 400 without filter criteria', async () => {
        const res = await request(app).post('/api/tags/cleanup').send({});
        expect(res.status).toBe(400);
    });
});

describe('GET /api/models with multi-tag filter', () => {
    it('AND mode returns only models with all specified tags', async () => {
        const toyId = createTag('toy');
        const animalId = createTag('animal');
        const toolId = createTag('tool');

        // Model 1: toy + animal
        linkTag(1, toyId);
        linkTag(1, animalId);
        // Model 2: toy only
        linkTag(2, toyId);
        // Model 3: animal + tool
        linkTag(3, animalId);
        linkTag(3, toolId);

        const res = await request(app).get('/api/models?tags=toy,animal&tagMode=and');
        expect(res.status).toBe(200);
        const ids = res.body.models.map((m: any) => m.id);
        expect(ids).toContain(1);   // has both
        expect(ids).not.toContain(2); // only toy
        expect(ids).not.toContain(3); // no toy
    });

    it('OR mode returns models with any of the specified tags', async () => {
        const toyId = createTag('toy2');
        const toolId = createTag('tool2');

        linkTag(1, toyId);
        linkTag(2, toolId);
        // Model 3 gets no tags

        const res = await request(app).get('/api/models?tags=toy2,tool2&tagMode=or');
        expect(res.status).toBe(200);
        const ids = res.body.models.map((m: any) => m.id);
        expect(ids).toContain(1);
        expect(ids).toContain(2);
        expect(ids).not.toContain(3);
    });

    it('legacy ?tag= param still works', async () => {
        const legacyId = createTag('legacy');
        linkTag(1, legacyId);

        const res = await request(app).get('/api/models?tag=legacy');
        expect(res.status).toBe(200);
        const ids = res.body.models.map((m: any) => m.id);
        expect(ids).toContain(1);
        expect(ids).not.toContain(2);
    });
});

describe('POST /api/tags (source = user)', () => {
    it('creates tags with source=user', async () => {
        const res = await request(app)
            .post('/api/tags')
            .send({ name: 'MyManualTag' });

        expect(res.status).toBe(201);
        expect(res.body.source).toBe('user');
        expect(res.body.name).toBe('mymanualtag');
    });
});

describe('GET /api/tags/auto-consolidate-suggestions', () => {
    it('groups plural/singular variants', async () => {
        const toyId = createTag('toy');
        const toysId = createTag('toys');
        linkTag(1, toyId);
        linkTag(2, toysId);

        const res = await request(app).get('/api/tags/auto-consolidate-suggestions');
        expect(res.status).toBe(200);
        const group = res.body.groups.find((g: any) =>
            g.winner.name === 'toy' || g.winner.name === 'toys'
        );
        expect(group).toBeTruthy();
        expect(group.winner.name).toBe('toy');
        expect(group.reasons).toContain('plural');
    });

    it('groups separator variants and picks space-version as winner', async () => {
        const dashId = createTag('kitchen-tool');
        const spaceId = createTag('kitchen tool');
        linkTag(1, dashId);
        linkTag(2, spaceId);

        const res = await request(app).get('/api/tags/auto-consolidate-suggestions');
        expect(res.status).toBe(200);
        const group = res.body.groups.find((g: any) =>
            [g.winner.name, ...g.losers.map((l: any) => l.name)].includes('kitchen-tool')
        );
        expect(group).toBeTruthy();
        expect(group.winner.name).toBe('kitchen tool');
        expect(group.reasons).toContain('separator');
    });

    it('groups leading-dash variants and picks no-dash version as winner', async () => {
        const dashId = createTag('-animals');
        const noDashId = createTag('animals');
        linkTag(1, dashId);
        linkTag(2, noDashId);

        const res = await request(app).get('/api/tags/auto-consolidate-suggestions');
        expect(res.status).toBe(200);
        const group = res.body.groups.find((g: any) =>
            [g.winner.name, ...g.losers.map((l: any) => l.name)].includes('-animals')
        );
        expect(group).toBeTruthy();
        expect(group.winner.name).toBe('animals');
        expect(group.reasons).toContain('leading-dash');
    });

    it('does not group unrelated singleton tags', async () => {
        createTag('widget');
        createTag('gadget');

        const res = await request(app).get('/api/tags/auto-consolidate-suggestions');
        expect(res.status).toBe(200);
        const hasWidget = res.body.groups.some((g: any) =>
            g.winner.name === 'widget' || g.losers.some((l: any) => l.name === 'widget')
        );
        expect(hasWidget).toBe(false);
    });

    it('groups three separator/plural variants together', async () => {
        // "kitchen-tool", "kitchen tool", "kitchen-tools" all normalize to "kitchen tool"
        const id1 = createTag('kitchen tool');
        const id2 = createTag('kitchen-tool');
        const id3 = createTag('kitchen-tools');
        linkTag(1, id1); linkTag(2, id2); linkTag(3, id3);

        const res = await request(app).get('/api/tags/auto-consolidate-suggestions');
        expect(res.status).toBe(200);
        const group = res.body.groups.find((g: any) =>
            [g.winner.name, ...g.losers.map((l: any) => l.name)].includes('kitchen tool')
        );
        expect(group).toBeTruthy();
        expect(group.winner.name).toBe('kitchen tool');
        expect(group.losers.length).toBe(2);
    });
});
