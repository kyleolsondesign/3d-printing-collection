import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- All vi.hoisted() calls must come before vi.mock() calls ---

// Hoist fs mock helpers so they are available inside vi.mock() factories
const { mockFsWatch, mockReaddirSync, mockFsWatchInstance, mockFsWatcherOn, mockFsWatcherClose } = vi.hoisted(() => {
    const mockFsWatcherOn = vi.fn().mockReturnThis();
    const mockFsWatcherClose = vi.fn();
    const mockFsWatchInstance = { on: mockFsWatcherOn, close: mockFsWatcherClose };
    const mockFsWatch = vi.fn().mockReturnValue(mockFsWatchInstance);
    const mockReaddirSync = vi.fn().mockReturnValue([]);
    return { mockFsWatch, mockReaddirSync, mockFsWatchInstance, mockFsWatcherOn, mockFsWatcherClose };
});

// Hoist scanner mock helpers
const { mockScanDirectory, mockGetProgress } = vi.hoisted(() => ({
    mockScanDirectory: vi.fn().mockResolvedValue({}),
    mockGetProgress: vi.fn().mockReturnValue({ scanning: false }),
}));

// Hoist DB
const { testDb } = vi.hoisted(() => {
    const Database = require('better-sqlite3');
    return { testDb: new Database(':memory:') };
});

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        ...actual as object,
        default: {
            ...(actual as object),
            watch: (...args: unknown[]) => mockFsWatch(...args),
            readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
        },
        watch: (...args: unknown[]) => mockFsWatch(...args),
        readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
    };
});

vi.mock('../config/database.js', () => ({ default: testDb }));

vi.mock('../services/scanner.js', () => ({
    default: { scanDirectory: mockScanDirectory, getProgress: mockGetProgress }
}));

// --- Imports after mocks ---
import { initSchema } from './setup.js';
import watcherService from '../services/watcher.js';

// Cast to any to access private methods in tests
const watcher = watcherService as any;

describe('WatcherService', () => {
    beforeEach(async () => {
        initSchema(testDb);
        testDb.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('model_directory', '/test/models')`).run();
        testDb.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('file_watcher_enabled', 'false')`).run();

        vi.clearAllMocks();
        mockFsWatch.mockReturnValue(mockFsWatchInstance);
        mockFsWatcherOn.mockReturnThis();
        mockGetProgress.mockReturnValue({ scanning: false });
        mockReaddirSync.mockReturnValue([]);
        vi.useFakeTimers();

        // Reset singleton state
        await watcherService.stop();
        watcher.enabled = false;
        watcher.lastTriggered = null;
        watcher.pendingChangeCount = 0;
    });

    afterEach(async () => {
        await watcherService.stop();
        vi.useRealTimers();
    });

    describe('initialize()', () => {
        it('does not start watcher when file_watcher_enabled = false', async () => {
            await watcherService.initialize();
            expect(mockFsWatch).not.toHaveBeenCalled();
            expect(watcherService.getStatus().active).toBe(false);
        });

        it('starts watcher when file_watcher_enabled = true', async () => {
            testDb.prepare(`UPDATE config SET value = 'true' WHERE key = 'file_watcher_enabled'`).run();
            await watcherService.initialize();
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models', expect.any(Function));
            expect(watcherService.getStatus().active).toBe(true);
        });

        it('does not start when enabled but no model directory', async () => {
            testDb.prepare(`DELETE FROM config WHERE key = 'model_directory'`).run();
            testDb.prepare(`UPDATE config SET value = 'true' WHERE key = 'file_watcher_enabled'`).run();
            await watcherService.initialize();
            expect(mockFsWatch).not.toHaveBeenCalled();
        });
    });

    describe('start()', () => {
        it('watches root directory', async () => {
            await watcherService.start('/test/models');
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models', expect.any(Function));
        });

        it('watches each immediate subdirectory', async () => {
            mockReaddirSync.mockReturnValue([
                { name: 'Toys', isDirectory: () => true },
                { name: 'Tools', isDirectory: () => true },
                { name: '.hidden', isDirectory: () => true },   // should be ignored
                { name: 'model.stl', isDirectory: () => false }, // file, ignored
            ]);
            await watcherService.start('/test/models');
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Toys', expect.any(Function));
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Tools', expect.any(Function));
            // hidden dir should be skipped
            expect(mockFsWatch).not.toHaveBeenCalledWith('/test/models/.hidden', expect.any(Function));
        });

        it('watches designer subdirectories under Paid at root level', async () => {
            mockReaddirSync
                .mockReturnValueOnce([
                    { name: 'Paid', isDirectory: () => true },
                    { name: 'Toys', isDirectory: () => true },
                ])
                .mockReturnValueOnce([
                    // Paid entries (designer dirs)
                    { name: 'Designer1', isDirectory: () => true },
                    { name: 'Designer2', isDirectory: () => true },
                    { name: '.hidden', isDirectory: () => true }, // should be ignored
                ])
                .mockReturnValue([]); // Toys depth-2 check (no nested Paid)
            await watcherService.start('/test/models');
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Paid', expect.any(Function));
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Paid/Designer1', expect.any(Function));
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Paid/Designer2', expect.any(Function));
            expect(mockFsWatch).not.toHaveBeenCalledWith('/test/models/Paid/.hidden', expect.any(Function));
        });

        it('watches designer subdirectories under nested Paid (Category/Paid/Designer)', async () => {
            mockReaddirSync
                .mockReturnValueOnce([
                    // root entries
                    { name: 'Shared Models', isDirectory: () => true },
                ])
                .mockReturnValueOnce([
                    // Shared Models entries
                    { name: 'Paid', isDirectory: () => true },
                    { name: 'SomeModel', isDirectory: () => true },
                ])
                .mockReturnValueOnce([
                    // Paid entries (designers)
                    { name: 'Designer1', isDirectory: () => true },
                ]);
            await watcherService.start('/test/models');
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Shared Models', expect.any(Function));
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Shared Models/Paid', expect.any(Function));
            expect(mockFsWatch).toHaveBeenCalledWith('/test/models/Shared Models/Paid/Designer1', expect.any(Function));
        });

        it('reports active when watchers are running', async () => {
            await watcherService.start('/test/models');
            expect(watcherService.getStatus().active).toBe(true);
        });
    });

    describe('stop()', () => {
        it('closes all watchers and reports inactive', async () => {
            await watcherService.start('/test/models');
            await watcherService.stop();
            expect(mockFsWatcherClose).toHaveBeenCalled();
            expect(watcherService.getStatus().active).toBe(false);
        });

        it('cancels pending debounce timer', async () => {
            await watcherService.start('/test/models');
            watcher.onEvent();
            expect(watcherService.getStatus().pendingChanges).toBe(1);
            await watcherService.stop();
            expect(watcherService.getStatus().pendingChanges).toBe(0);
        });
    });

    describe('setEnabled()', () => {
        it('starts watcher and persists true to config', async () => {
            await watcherService.setEnabled(true);
            const row = testDb.prepare(`SELECT value FROM config WHERE key = 'file_watcher_enabled'`).get() as { value: string };
            expect(row.value).toBe('true');
            expect(mockFsWatch).toHaveBeenCalled();
            expect(watcherService.getStatus().enabled).toBe(true);
        });

        it('stops watcher and persists false to config', async () => {
            await watcherService.setEnabled(true);
            vi.clearAllMocks();
            await watcherService.setEnabled(false);
            const row = testDb.prepare(`SELECT value FROM config WHERE key = 'file_watcher_enabled'`).get() as { value: string };
            expect(row.value).toBe('false');
            expect(watcherService.getStatus().enabled).toBe(false);
            expect(watcherService.getStatus().active).toBe(false);
        });
    });

    describe('restart()', () => {
        it('starts watcher at new directory when enabled', async () => {
            await watcherService.setEnabled(true);
            vi.clearAllMocks();
            mockFsWatch.mockReturnValue(mockFsWatchInstance);
            await watcherService.restart('/new/directory');
            expect(mockFsWatch).toHaveBeenCalledWith('/new/directory', expect.any(Function));
        });

        it('does nothing when disabled', async () => {
            watcher.enabled = false;
            await watcherService.restart('/new/directory');
            expect(mockFsWatch).not.toHaveBeenCalled();
        });
    });

    describe('auto-scan flush logic', () => {
        it('triggers full_sync scan after debounce', async () => {
            await watcherService.start('/test/models');
            watcher.onEvent();
            await vi.runAllTimersAsync();
            expect(mockScanDirectory).toHaveBeenCalledWith('/test/models', 'full_sync');
        });

        it('skips scan if scanner is already running', async () => {
            mockGetProgress.mockReturnValue({ scanning: true });
            await watcherService.start('/test/models');
            watcher.onEvent();
            await vi.runAllTimersAsync();
            expect(mockScanDirectory).not.toHaveBeenCalled();
        });

        it('resets pendingChangeCount to 0 after flush', async () => {
            await watcherService.start('/test/models');
            watcher.onEvent();
            watcher.onEvent();
            expect(watcherService.getStatus().pendingChanges).toBe(2);
            await vi.runAllTimersAsync();
            expect(watcherService.getStatus().pendingChanges).toBe(0);
        });

        it('sets lastTriggered after scan', async () => {
            await watcherService.start('/test/models');
            watcher.onEvent();
            await vi.runAllTimersAsync();
            expect(watcherService.getStatus().lastTriggered).not.toBeNull();
        });

        it('does not scan when no changes are pending', async () => {
            await watcherService.start('/test/models');
            await watcher.flush();
            expect(mockScanDirectory).not.toHaveBeenCalled();
        });

        it('skips scan when no model directory is configured', async () => {
            testDb.prepare(`DELETE FROM config WHERE key = 'model_directory'`).run();
            await watcherService.start('/test/models');
            watcher.onEvent();
            await vi.runAllTimersAsync();
            expect(mockScanDirectory).not.toHaveBeenCalled();
        });
    });

    describe('getStatus()', () => {
        it('returns correct shape with expected types', () => {
            const status = watcherService.getStatus();
            expect(typeof status.enabled).toBe('boolean');
            expect(typeof status.active).toBe('boolean');
            expect(typeof status.pendingChanges).toBe('number');
            expect(status.lastTriggered === null || typeof status.lastTriggered === 'string').toBe(true);
        });
    });
});
