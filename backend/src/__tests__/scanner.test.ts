import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    parseModelStateFromTags: vi.fn().mockReturnValue({ isPrinted: false, isQueued: false }),
    TAG_COLORS: { PRINTED_GOOD: 'Green', PRINTED_BAD: 'Red', QUEUED: 'Blue' }
}));
vi.mock('../utils/pdfMetadata.js', () => ({
    extractMetadataFromPdf: vi.fn().mockResolvedValue(null)
}));
vi.mock('../routes/designers.js', () => ({
    syncDesignersCore: vi.fn().mockResolvedValue(undefined)
}));

import scanner from '../services/scanner.js';
import { initSchema } from './setup.js';

// Access private method for unit testing
const callSelectPrimaryImage = (modelId: number, preferredFilepath?: string) =>
    (scanner as any).selectPrimaryImage(modelId, preferredFilepath);

describe('Scanner.selectPrimaryImage', () => {
    beforeEach(() => {
        initSchema(testDb);
        testDb.prepare(`INSERT INTO models (id, filename, filepath, category, file_count) VALUES (?, ?, ?, ?, ?)`).run(1, 'Test Model', '/test/models/a', 'Toys', 1);
        testDb.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary, is_hidden) VALUES (?, ?, ?, ?, ?, ?)`).run(1, 1, '/test/models/a/image1.jpg', 'image', 0, 0);
        testDb.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary, is_hidden) VALUES (?, ?, ?, ?, ?, ?)`).run(2, 1, '/test/models/a/image2.jpg', 'image', 0, 0);
        testDb.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary, is_hidden) VALUES (?, ?, ?, ?, ?, ?)`).run(3, 1, '/test/models/a/anim.gif', 'image', 0, 0);
    });

    it('honors preferredFilepath when it exists in indexed assets', () => {
        callSelectPrimaryImage(1, '/test/models/a/image2.jpg');

        const img1 = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 1').get() as any;
        const img2 = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 2').get() as any;
        expect(img1.is_primary).toBe(0);
        expect(img2.is_primary).toBe(1);
    });

    it('falls back to gif preference when preferredFilepath is not found', () => {
        // preferred path no longer exists after rescan (file was deleted)
        callSelectPrimaryImage(1, '/test/models/a/deleted.jpg');

        const gif = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 3').get() as any;
        expect(gif.is_primary).toBe(1);
    });

    it('selects gif when no preferredFilepath is given', () => {
        callSelectPrimaryImage(1);

        const gif = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 3').get() as any;
        expect(gif.is_primary).toBe(1);
    });

    it('selects first image when no gif and no preference', () => {
        testDb.prepare('DELETE FROM model_assets WHERE id = 3').run(); // remove gif
        callSelectPrimaryImage(1);

        const img1 = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 1').get() as any;
        expect(img1.is_primary).toBe(1);
    });

    it('does nothing when model has no images', () => {
        testDb.prepare('DELETE FROM model_assets WHERE model_id = 1').run();
        // Should not throw
        expect(() => callSelectPrimaryImage(1)).not.toThrow();
    });

    it('ignores hidden images when honoring preferredFilepath', () => {
        // image2.jpg is now hidden — preference cannot be honored
        testDb.prepare('UPDATE model_assets SET is_hidden = 1 WHERE id = 2').run();
        callSelectPrimaryImage(1, '/test/models/a/image2.jpg');

        const img2 = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 2').get() as any;
        expect(img2.is_primary).toBe(0);
        // Falls back to gif
        const gif = testDb.prepare('SELECT is_primary FROM model_assets WHERE id = 3').get() as any;
        expect(gif.is_primary).toBe(1);
    });
});
