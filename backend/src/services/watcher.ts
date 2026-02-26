import fs from 'fs';
import path from 'path';
import db from '../config/database.js';
import scanner from './scanner.js';

// How long to wait after the last FS event before triggering a scan (ms)
const DEBOUNCE_MS = 20_000;

// Flush unconditionally after 5 minutes of continuous events (iCloud sync storm guard)
const MAX_WAIT_MS = 5 * 60_000;

// Names/patterns to ignore when watching
const IGNORE_RE = /^\.|\.icloud$|\.tmp$|\.DS_Store$/;

export interface WatcherStatus {
    enabled: boolean;
    active: boolean;
    lastTriggered: string | null;
    pendingChanges: number;
}

class WatcherService {
    // One fs.FSWatcher per watched directory (root + category-level dirs)
    private watchers: Map<string, fs.FSWatcher> = new Map();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private firstEventAt: number | null = null;
    private pendingChangeCount = 0;
    private lastTriggered: string | null = null;
    private enabled: boolean = false;

    /**
     * Called on server startup. Reads config and starts watcher if enabled.
     */
    async initialize(): Promise<void> {
        const enabledRow = db.prepare(`SELECT value FROM config WHERE key = 'file_watcher_enabled'`).get() as { value: string } | undefined;
        this.enabled = enabledRow?.value === 'true';

        if (this.enabled) {
            const dirRow = db.prepare(`SELECT value FROM config WHERE key = 'model_directory'`).get() as { value: string } | undefined;
            if (dirRow?.value) {
                await this.start(dirRow.value);
            } else {
                console.warn('[Watcher] Enabled but no model directory configured');
            }
        }
    }

    /**
     * Start watching a model directory at shallow depth.
     * Watches the root + each immediate subdirectory (category level).
     * This keeps the total watcher count to ~20 handles instead of 38k+.
     */
    async start(directory: string): Promise<void> {
        await this.stop();
        this.enabled = true;

        // Watch the root directory itself
        this.watchDir(directory);

        // Watch each immediate child directory (category folders)
        try {
            const entries = fs.readdirSync(directory, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !IGNORE_RE.test(entry.name)) {
                    this.watchDir(path.join(directory, entry.name));
                }
            }
        } catch (err) {
            console.error('[Watcher] Could not read root directory:', (err as Error).message);
        }

        console.log(`[Watcher] Started watching: ${directory} (${this.watchers.size} directories)`);
    }

    /**
     * Stop all watchers and cancel any pending debounce timer.
     */
    async stop(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.firstEventAt = null;
        this.pendingChangeCount = 0;

        const count = this.watchers.size;
        for (const w of this.watchers.values()) {
            w.close();
        }
        this.watchers.clear();

        if (count > 0) {
            console.log('[Watcher] Stopped');
        }
    }

    /**
     * Enable or disable the watcher. Persists state to config table.
     */
    async setEnabled(enabled: boolean): Promise<void> {
        this.enabled = enabled;

        db.prepare(`
            INSERT INTO config (key, value)
            VALUES ('file_watcher_enabled', ?)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `).run(String(enabled), String(enabled));

        if (enabled) {
            const dirRow = db.prepare(`SELECT value FROM config WHERE key = 'model_directory'`).get() as { value: string } | undefined;
            if (dirRow?.value) {
                await this.start(dirRow.value);
            } else {
                console.warn('[Watcher] No model directory configured, cannot start watcher');
            }
        } else {
            await this.stop();
        }
    }

    /**
     * Restart the watcher pointing at a new directory (called when model directory changes).
     */
    async restart(newDirectory: string): Promise<void> {
        if (this.enabled) await this.start(newDirectory);
    }

    getStatus(): WatcherStatus {
        return {
            enabled: this.enabled,
            active: this.watchers.size > 0,
            lastTriggered: this.lastTriggered,
            pendingChanges: this.pendingChangeCount,
        };
    }

    /**
     * Set up a non-recursive fs.watch on a single directory.
     * Only fires for direct children of that directory.
     */
    private watchDir(dirPath: string): void {
        if (this.watchers.has(dirPath)) return;

        try {
            const w = fs.watch(dirPath, (eventType, filename) => {
                // Only care about directory renames (create/delete/move)
                if (eventType !== 'rename') return;
                if (filename && IGNORE_RE.test(filename)) return;
                this.onEvent();
            });

            w.on('error', (err: Error) => {
                console.error(`[Watcher] Error on ${path.basename(dirPath)}:`, err.message);
                this.watchers.delete(dirPath);
            });

            this.watchers.set(dirPath, w);
        } catch {
            // Directory may not be accessible — skip silently
        }
    }

    private onEvent(): void {
        this.pendingChangeCount++;
        this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (!this.firstEventAt) this.firstEventAt = Date.now();
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        const elapsed = Date.now() - this.firstEventAt;
        const delay = elapsed >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS;
        this.debounceTimer = setTimeout(() => this.flush(), delay);
    }

    private async flush(): Promise<void> {
        this.debounceTimer = null;
        this.firstEventAt = null;
        const changeCount = this.pendingChangeCount;
        this.pendingChangeCount = 0;

        if (changeCount === 0) return;

        if (scanner.getProgress().scanning) {
            console.log(`[Watcher] Skipping auto-scan — scan already in progress (${changeCount} changes discarded)`);
            return;
        }

        const dirRow = db.prepare(`SELECT value FROM config WHERE key = 'model_directory'`).get() as { value: string } | undefined;
        if (!dirRow?.value) {
            console.warn('[Watcher] Cannot auto-scan — no model directory configured');
            return;
        }

        this.lastTriggered = new Date().toISOString();
        console.log(`[Watcher] Auto-scan triggered (full_sync, ${changeCount} changes)`);

        scanner.scanDirectory(dirRow.value, 'full_sync').catch((err: Error) => {
            console.error('[Watcher] Auto-scan failed:', err.message);
        });
    }
}

export default new WatcherService();
