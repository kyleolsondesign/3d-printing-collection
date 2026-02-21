import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { execFile } from 'child_process';
import yauzl from 'yauzl';
import db from '../config/database.js';
import { isModelFile, isImageFile, isDocumentFile, isArchiveFile } from '../utils/fileTypes.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';
import { getFinderTags, parseModelStateFromTags } from '../utils/finderTags.js';
import { extractMetadataFromPdf } from '../utils/pdfMetadata.js';

export type ScanMode = 'full' | 'full_sync' | 'add_only';

// Helper to yield control back to the event loop periodically
// This prevents the scanner from blocking API requests
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

type ScanStep = 'idle' | 'discovering' | 'indexing' | 'extracting' | 'metadata' | 'deduplicating' | 'tagging' | 'cleanup' | 'complete';

interface ScanProgress {
    totalFiles: number;
    processedFiles: number;
    modelsFound: number;
    modelsUpdated: number;
    modelsRemoved: number;
    modelFilesFound: number;
    assetsFound: number;
    looseFilesFound: number;
    currentStep: ScanStep;
    stepDescription: string;
    totalFolders: number;
    indexedFolders: number;
    modelsToExtract: number;
    modelsExtracted: number;
    overallProgress: number;
    scanStartedAt: string | null;
    scanCompletedAt: string | null;
    scanMode: ScanMode | null;
}

interface FolderData {
    files: string[];
    earliestAdded: Date | null;
    earliestCreated: Date | null;
}

class Scanner {
    private scanning: boolean = false;
    private scanMode: ScanMode = 'full';
    private progress: ScanProgress = {
        totalFiles: 0,
        processedFiles: 0,
        modelsFound: 0,
        modelsUpdated: 0,
        modelsRemoved: 0,
        modelFilesFound: 0,
        assetsFound: 0,
        looseFilesFound: 0,
        currentStep: 'idle',
        stepDescription: '',
        totalFolders: 0,
        indexedFolders: 0,
        modelsToExtract: 0,
        modelsExtracted: 0,
        overallProgress: 0,
        scanStartedAt: null,
        scanCompletedAt: null,
        scanMode: null
    };
    private foldersWithModels: Map<string, FolderData> = new Map();

    /**
     * Scan the model directory with the specified mode:
     * - 'full': Destructive scan - clears all model data and rescans (legacy behavior)
     * - 'full_sync': Non-destructive sync - updates existing, adds new, removes deleted folders
     *                Preserves favorites, print history, and queue (orphans them if model deleted)
     * - 'add_only': Only adds new models that don't exist, never modifies or deletes
     */
    async scanDirectory(modelDirectory: string, mode: ScanMode = 'full'): Promise<ScanProgress> {
        if (this.scanning) {
            throw new Error('Scan already in progress');
        }

        this.scanning = true;
        this.scanMode = mode;
        this.progress = {
            totalFiles: 0,
            processedFiles: 0,
            modelsFound: 0,
            modelsUpdated: 0,
            modelsRemoved: 0,
            modelFilesFound: 0,
            assetsFound: 0,
            looseFilesFound: 0,
            currentStep: 'discovering',
            stepDescription: 'Scanning directories...',
            totalFolders: 0,
            indexedFolders: 0,
            modelsToExtract: 0,
            modelsExtracted: 0,
            overallProgress: 0,
            scanStartedAt: new Date().toISOString(),
            scanCompletedAt: null,
            scanMode: mode
        };
        this.foldersWithModels = new Map();

        try {
            console.log(`Starting ${mode} scan of directory: ${modelDirectory}`);

            // Check if directory exists
            if (!fs.existsSync(modelDirectory)) {
                throw new Error(`Directory does not exist: ${modelDirectory}`);
            }

            // Check if it's actually a directory
            const stats = fs.statSync(modelDirectory);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${modelDirectory}`);
            }

            console.log(`Directory verified. Starting recursive scan...`);

            const scanStartTime = Date.now();

            // Only clear data in 'full' mode (destructive)
            if (mode === 'full') {
                this.clearExistingModels();
            } else if (mode === 'full_sync') {
                // Clear loose_files table - we'll rebuild it
                db.prepare('DELETE FROM loose_files').run();
            }

            // Phase 1: Recursively scan and collect model files by folder
            // Discovery is very fast (~1% of total time)
            const discoveryStart = Date.now();
            await this.scanDirectoryRecursive(modelDirectory, modelDirectory);

            // Set totalFolders for progress tracking
            this.progress.totalFolders = this.foldersWithModels.size;
            this.progress.overallProgress = 1; // Discovery complete (1%)
            console.log(`Discovery complete: ${this.foldersWithModels.size} model folders, ${this.progress.totalFiles} files (${((Date.now() - discoveryStart) / 1000).toFixed(1)}s)`);

            // Phase 2: Index folders as models
            // Indexing is ~29% of total (1-30%)
            const indexStart = Date.now();
            this.progress.currentStep = 'indexing';
            this.progress.stepDescription = 'Indexing model folders...';
            await this.indexFoldersAsModels(modelDirectory);
            console.log(`Indexing complete (${((Date.now() - indexStart) / 1000).toFixed(1)}s)`);

            // Phase 3: In full mode, restore saved user data (favorites, queue, printed)
            if (mode === 'full') {
                this.restoreUserData();
            }

            // Phase 4: In full_sync mode, remove models whose folders no longer exist
            // Cleanup is ~5% of total (95-100%)
            if (mode === 'full_sync') {
                this.progress.currentStep = 'cleanup';
                this.progress.stepDescription = 'Cleaning up orphaned models...';
                this.progress.overallProgress = 95;
                this.removeOrphanedModels();
            }

            this.progress.currentStep = 'complete';
            this.progress.stepDescription = 'Scan complete';
            this.progress.overallProgress = 100;
            this.progress.scanCompletedAt = new Date().toISOString();
            const totalScanTime = ((Date.now() - scanStartTime) / 1000).toFixed(1);
            console.log(`Scan complete! (${totalScanTime}s total)`);
            console.log(`- Mode: ${mode}`);
            console.log(`- Models added: ${this.progress.modelsFound}`);
            if (mode === 'full_sync') {
                console.log(`- Models updated: ${this.progress.modelsUpdated}`);
                console.log(`- Models removed: ${this.progress.modelsRemoved}`);
            }
            console.log(`- Model files: ${this.progress.modelFilesFound}`);
            console.log(`- Assets (images/PDFs): ${this.progress.assetsFound}`);
            console.log(`- Loose files: ${this.progress.looseFilesFound}`);

            return this.progress;
        } catch (error) {
            this.progress.currentStep = 'idle';
            this.progress.stepDescription = 'Scan failed';
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Scan failed:`, message);
            throw error;
        } finally {
            this.scanning = false;
        }
    }

    /**
     * Scan and index a single model folder.
     * Used for rescanning individual models or newly organized loose files.
     * Recursively scans subfolders for model files and assets.
     */
    async scanSingleFolder(folderPath: string, rootPath: string): Promise<{ modelId: number; filename: string } | null> {
        try {
            if (!fs.existsSync(folderPath)) {
                throw new Error(`Folder does not exist: ${folderPath}`);
            }

            const stats = fs.statSync(folderPath);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${folderPath}`);
            }

            // Collect model files recursively from this folder and all subfolders
            const modelFiles: string[] = [];
            const dateTracker = { earliestAdded: null as Date | null, earliestCreated: null as Date | null };

            this.collectModelFilesRecursive(folderPath, modelFiles, dateTracker);

            if (modelFiles.length === 0) {
                return null; // No model files found
            }

            const folderName = path.basename(folderPath);
            const cleanedName = cleanupFolderName(folderName);
            const category = this.extractCategory(folderPath, rootPath);
            const isPaid = this.isInFolder(folderPath, rootPath, 'Paid');
            const isOriginal = this.isInFolder(folderPath, rootPath, 'Original Creations');

            // Get folder's own dates first, fall back to earliest file dates
            let dateAdded: string | null = null;
            let dateCreated: string | null = null;

            try {
                const folderStat = fs.statSync(folderPath);
                const folderMtime = folderStat.mtime;
                const folderBirthtime = folderStat.birthtime;

                // Use the earlier of folder date or file date
                if (dateTracker.earliestAdded && dateTracker.earliestAdded < folderMtime) {
                    dateAdded = dateTracker.earliestAdded.toISOString();
                } else {
                    dateAdded = folderMtime.toISOString();
                }

                if (dateTracker.earliestCreated && dateTracker.earliestCreated < folderBirthtime) {
                    dateCreated = dateTracker.earliestCreated.toISOString();
                } else {
                    dateCreated = folderBirthtime.toISOString();
                }
            } catch (e) {
                dateAdded = dateTracker.earliestAdded?.toISOString() || null;
                dateCreated = dateTracker.earliestCreated?.toISOString() || null;
            }

            // Insert model into database
            const insertModel = db.prepare(`
                INSERT INTO models (filename, filepath, category, is_paid, is_original, file_count, date_added, date_created)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = insertModel.run(
                cleanedName,
                folderPath,
                category,
                isPaid ? 1 : 0,
                isOriginal ? 1 : 0,
                modelFiles.length,
                dateAdded,
                dateCreated
            );

            const modelId = Number(result.lastInsertRowid);

            // Insert model files
            const insertFile = db.prepare(`
                INSERT INTO model_files (model_id, filename, filepath, file_size, file_type)
                VALUES (?, ?, ?, ?, ?)
            `);

            for (const filePath of modelFiles) {
                const fileStats = fs.statSync(filePath);
                const filename = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase().replace('.', '');
                insertFile.run(modelId, filename, filePath, fileStats.size, ext);
            }

            // Index assets (recursively searches subfolders)
            this.indexAssets(modelId, folderPath);
            this.selectPrimaryImage(modelId);

            // Extract images from archives if no primary image
            if (!this.hasPrimaryImage(modelId)) {
                await this.extractImageFromArchives(modelId, folderPath);
            }

            console.log(`Indexed single folder: ${path.relative(rootPath, folderPath)}`);
            return { modelId, filename: cleanedName };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error scanning single folder ${folderPath}:`, message);
            throw error;
        }
    }

    /**
     * Recursively collect model files from a folder and all subfolders
     */
    private collectModelFilesRecursive(
        currentPath: string,
        modelFiles: string[],
        dateTracker: { earliestAdded: Date | null; earliestCreated: Date | null }
    ): void {
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // Skip hidden files
                if (entry.name.startsWith('.')) continue;

                if (entry.isDirectory()) {
                    this.collectModelFilesRecursive(fullPath, modelFiles, dateTracker);
                } else if (entry.isFile()) {
                    if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                        modelFiles.push(fullPath);

                        try {
                            const fileStat = fs.statSync(fullPath);
                            if (!dateTracker.earliestAdded || fileStat.mtime < dateTracker.earliestAdded) {
                                dateTracker.earliestAdded = fileStat.mtime;
                            }
                            if (!dateTracker.earliestCreated || fileStat.birthtime < dateTracker.earliestCreated) {
                                dateTracker.earliestCreated = fileStat.birthtime;
                            }
                        } catch (e) {
                            // Continue without date tracking on error
                        }
                    }
                }
            }
        } catch (e) {
            // Continue on errors
        }
    }

    /**
     * Rescan an existing model folder (update in place, preserving model ID)
     */
    async rescanModel(modelId: number): Promise<{ modelId: number; filename: string } | null> {
        try {
            // Get the model's folder path
            const model = db.prepare('SELECT filepath FROM models WHERE id = ?').get(modelId) as { filepath: string } | undefined;
            if (!model) {
                throw new Error(`Model not found: ${modelId}`);
            }

            // Get root path from config
            const configResult = db.prepare('SELECT value FROM config WHERE key = ?').get('model_directory') as { value: string } | undefined;
            if (!configResult) {
                throw new Error('Model directory not configured');
            }

            const folderPath = model.filepath;
            if (!fs.existsSync(folderPath)) {
                throw new Error(`Folder does not exist: ${folderPath}`);
            }

            // Collect model files recursively
            const modelFiles: string[] = [];
            const dateTracker = { earliestAdded: null as Date | null, earliestCreated: null as Date | null };
            this.collectModelFilesRecursive(folderPath, modelFiles, dateTracker);

            if (modelFiles.length === 0) {
                return null;
            }

            const folderName = path.basename(folderPath);
            const cleanedName = cleanupFolderName(folderName);
            const rootPath = configResult.value;
            const category = this.extractCategory(folderPath, rootPath);
            const isPaid = this.isInFolder(folderPath, rootPath, 'Paid');
            const isOriginal = this.isInFolder(folderPath, rootPath, 'Original Creations');

            let dateAdded: string | null = null;
            let dateCreated: string | null = null;
            try {
                const folderStat = fs.statSync(folderPath);
                const folderMtime = folderStat.mtime;
                const folderBirthtime = folderStat.birthtime;
                if (dateTracker.earliestAdded && dateTracker.earliestAdded < folderMtime) {
                    dateAdded = dateTracker.earliestAdded.toISOString();
                } else {
                    dateAdded = folderMtime.toISOString();
                }
                if (dateTracker.earliestCreated && dateTracker.earliestCreated < folderBirthtime) {
                    dateCreated = dateTracker.earliestCreated.toISOString();
                } else {
                    dateCreated = folderBirthtime.toISOString();
                }
            } catch (e) {
                dateAdded = dateTracker.earliestAdded?.toISOString() || null;
                dateCreated = dateTracker.earliestCreated?.toISOString() || null;
            }

            // Update existing model record (preserves ID, favorites, queue, printed history)
            db.prepare(`
                UPDATE models SET filename = ?, category = ?, is_paid = ?, is_original = ?,
                file_count = ?, date_added = ?, date_created = ?, last_scanned = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(cleanedName, category, isPaid ? 1 : 0, isOriginal ? 1 : 0,
                modelFiles.length, dateAdded, dateCreated, modelId);

            // Clear and re-insert child records
            db.prepare('DELETE FROM model_files WHERE model_id = ?').run(modelId);
            db.prepare('DELETE FROM model_assets WHERE model_id = ?').run(modelId);

            // Insert model files
            const insertFile = db.prepare(`
                INSERT INTO model_files (model_id, filename, filepath, file_size, file_type)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (const filePath of modelFiles) {
                const fileStats = fs.statSync(filePath);
                const filename = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase().replace('.', '');
                insertFile.run(modelId, filename, filePath, fileStats.size, ext);
            }

            // Index assets
            this.indexAssets(modelId, folderPath);
            this.selectPrimaryImage(modelId);

            // Extract images from archives if no primary image
            if (!this.hasPrimaryImage(modelId)) {
                await this.extractImageFromArchives(modelId, folderPath);
            }

            console.log(`Rescanned model: ${path.relative(rootPath, folderPath)}`);
            return { modelId, filename: cleanedName };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error rescanning model ${modelId}:`, message);
            throw error;
        }
    }

    /**
     * Clear model data for full rebuild while preserving favorites, queue, and printed records.
     * Saves filepath-based mappings, clears models (which cascades related tables),
     * then the mappings are restored after rebuild via restoreUserData().
     */
    private savedUserData: {
        favorites: Array<{ filepath: string; added_at: string; notes: string | null }>;
        queue: Array<{ filepath: string; added_at: string; priority: number; notes: string | null; estimated_time_hours: number | null }>;
        printed: Array<{ filepath: string; printed_at: string; rating: string | null; notes: string | null; print_time_hours: number | null; filament_used_grams: number | null }>;
        modelNotes: Array<{ filepath: string; notes: string }>;
        modelTags: Array<{ filepath: string; tag_name: string }>;
    } | null = null;

    private clearExistingModels(): void {
        // Save user data (favorites, queue, printed) keyed by filepath before clearing
        this.savedUserData = {
            favorites: db.prepare(`
                SELECT m.filepath, f.added_at, f.notes
                FROM favorites f JOIN models m ON f.model_id = m.id
            `).all() as any[],
            queue: db.prepare(`
                SELECT m.filepath, q.added_at, q.priority, q.notes, q.estimated_time_hours
                FROM print_queue q JOIN models m ON q.model_id = m.id
            `).all() as any[],
            printed: db.prepare(`
                SELECT m.filepath, p.printed_at, p.rating, p.notes, p.print_time_hours, p.filament_used_grams
                FROM printed_models p JOIN models m ON p.model_id = m.id
            `).all() as any[],
            modelNotes: db.prepare(`
                SELECT filepath, notes FROM models WHERE notes IS NOT NULL AND notes != ''
            `).all() as any[],
            modelTags: db.prepare(`
                SELECT m.filepath, t.name as tag_name
                FROM model_tags mt JOIN models m ON mt.model_id = m.id JOIN tags t ON mt.tag_id = t.id
            `).all() as any[]
        };

        console.log(`Saved user data: ${this.savedUserData.favorites.length} favorites, ${this.savedUserData.queue.length} queue items, ${this.savedUserData.printed.length} printed records, ${this.savedUserData.modelNotes.length} notes, ${this.savedUserData.modelTags.length} tags`);

        db.prepare('DELETE FROM models').run();
        db.prepare('DELETE FROM model_files').run();
        db.prepare('DELETE FROM model_assets').run();
        db.prepare('DELETE FROM loose_files').run();
        console.log('Cleared existing data from database');
    }

    /**
     * Restore favorites, queue, and printed records after a full rebuild
     * by matching saved filepaths to newly created model IDs.
     */
    private restoreUserData(): void {
        if (!this.savedUserData) return;

        let restored = { favorites: 0, queue: 0, printed: 0 };

        // Restore favorites
        const insertFav = db.prepare('INSERT OR IGNORE INTO favorites (model_id, added_at, notes) VALUES (?, ?, ?)');
        for (const fav of this.savedUserData.favorites) {
            const model = db.prepare('SELECT id FROM models WHERE filepath = ?').get(fav.filepath) as { id: number } | undefined;
            if (model) {
                insertFav.run(model.id, fav.added_at, fav.notes);
                restored.favorites++;
            }
        }

        // Restore queue
        const insertQueue = db.prepare('INSERT OR IGNORE INTO print_queue (model_id, added_at, priority, notes, estimated_time_hours) VALUES (?, ?, ?, ?, ?)');
        for (const q of this.savedUserData.queue) {
            const model = db.prepare('SELECT id FROM models WHERE filepath = ?').get(q.filepath) as { id: number } | undefined;
            if (model) {
                insertQueue.run(model.id, q.added_at, q.priority, q.notes, q.estimated_time_hours);
                restored.queue++;
            }
        }

        // Restore printed
        const insertPrinted = db.prepare('INSERT OR IGNORE INTO printed_models (model_id, printed_at, rating, notes, print_time_hours, filament_used_grams) VALUES (?, ?, ?, ?, ?, ?)');
        for (const p of this.savedUserData.printed) {
            const model = db.prepare('SELECT id FROM models WHERE filepath = ?').get(p.filepath) as { id: number } | undefined;
            if (model) {
                insertPrinted.run(model.id, p.printed_at, p.rating, p.notes, p.print_time_hours, p.filament_used_grams);
                restored.printed++;
            }
        }

        // Restore model notes
        let restoredNotes = 0;
        for (const n of this.savedUserData.modelNotes) {
            const model = db.prepare('SELECT id FROM models WHERE filepath = ?').get(n.filepath) as { id: number } | undefined;
            if (model) {
                db.prepare('UPDATE models SET notes = ? WHERE id = ?').run(n.notes, model.id);
                restoredNotes++;
            }
        }

        // Restore model tags
        let restoredTags = 0;
        const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
        const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
        const insertModelTag = db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)');
        for (const mt of this.savedUserData.modelTags) {
            const model = db.prepare('SELECT id FROM models WHERE filepath = ?').get(mt.filepath) as { id: number } | undefined;
            if (model) {
                insertTag.run(mt.tag_name);
                const tag = getTagId.get(mt.tag_name) as { id: number };
                insertModelTag.run(model.id, tag.id);
                restoredTags++;
            }
        }

        console.log(`Restored user data: ${restored.favorites} favorites, ${restored.queue} queue items, ${restored.printed} printed records, ${restoredNotes} notes, ${restoredTags} tags`);
        this.savedUserData = null;
    }

    /**
     * Soft delete models whose folders no longer exist on the filesystem.
     * Sets deleted_at timestamp instead of removing records.
     * Preserves all data including favorites, print history, and queue.
     */
    private removeOrphanedModels(): void {
        // Only check non-deleted models
        const models = db.prepare('SELECT id, filepath FROM models WHERE deleted_at IS NULL').all() as Array<{ id: number; filepath: string }>;

        for (const model of models) {
            // Check if the folder still exists
            if (!fs.existsSync(model.filepath) || !fs.statSync(model.filepath).isDirectory()) {
                // Soft delete: set deleted_at timestamp
                db.prepare('UPDATE models SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(model.id);
                this.progress.modelsRemoved++;
                console.log(`Soft deleted orphaned model: ${model.filepath}`);
            }
        }

        // Also restore any previously deleted models whose folders now exist again
        const deletedModels = db.prepare('SELECT id, filepath FROM models WHERE deleted_at IS NOT NULL').all() as Array<{ id: number; filepath: string }>;

        for (const model of deletedModels) {
            if (fs.existsSync(model.filepath) && fs.statSync(model.filepath).isDirectory()) {
                // Restore the model
                db.prepare('UPDATE models SET deleted_at = NULL WHERE id = ?').run(model.id);
                console.log(`Restored model: ${model.filepath}`);
            }
        }
    }

    private async scanDirectoryRecursive(currentPath: string, rootPath: string): Promise<void> {
        try {
            const dirName = path.basename(currentPath);

            // Skip hidden folders, node_modules, and folders starting with "!" (ignored)
            if (dirName.startsWith('.') || dirName.startsWith('!') || dirName === 'node_modules') {
                return;
            }

            // Determine if this folder can be a model folder.
            // Some folders are "container" folders that organize models but are not models themselves:
            // - Root path: never a model
            // - Depth 1 (category folders like "Toys", "Tools"): never a model
            // - Folders starting with "~": organizational containers, never models
            // - Direct children of "Paid" folder: designer/creator folders, never models
            if (currentPath !== rootPath && !this.isContainerFolder(currentPath, rootPath) &&
                (this.isModelFolder(currentPath) || this.isPaidModelFolder(currentPath, rootPath))) {
                // Register this folder as a model and collect all files from it + subfolders
                this.registerModelFolder(currentPath);
                return; // Don't recurse further - subfolders belong to this model
            }

            // Not a model folder - scan for loose files and recurse into subdirectories
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // Skip hidden files
                if (entry.name.startsWith('.')) {
                    continue;
                }

                if (entry.isDirectory()) {
                    // Recursively scan subdirectory
                    await this.scanDirectoryRecursive(fullPath, rootPath);
                } else if (entry.isFile()) {
                    this.progress.totalFiles++;

                    // Model files in non-model folders are loose files
                    if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                        this.trackLooseFile(fullPath);
                        this.progress.looseFilesFound++;
                    }

                    this.progress.processedFiles++;
                    // Discovery phase = 0-1% of overall progress (it's very fast)
                    if (this.progress.totalFiles > 0) {
                        this.progress.overallProgress = Math.min(1, Math.round((this.progress.processedFiles / this.progress.totalFiles) * 1));
                    }

                    // Yield control every 100 files to keep API responsive
                    if (this.progress.processedFiles % 100 === 0) {
                        await yieldToEventLoop();
                    }
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error scanning directory ${currentPath}:`, message);
        }
    }

    /**
     * Check if a folder is a "container" folder that organizes models but is not a model itself.
     * Container folders are recursed into, and any model files directly in them are treated as loose.
     *
     * Rules:
     * - Depth 1 folders (direct children of root) are category folders (e.g., "Toys", "Tools")
     * - Folders whose name starts with "~" are organizational containers
     * - Direct children of a "Paid" folder are designer/creator folders
     */
    private isContainerFolder(folderPath: string, rootPath: string): boolean {
        const relativePath = path.relative(rootPath, folderPath);
        const parts = relativePath.split(path.sep);
        const folderName = path.basename(folderPath);

        // Depth 1: top-level category folders (e.g., root/Toys)
        if (parts.length === 1) {
            return true;
        }

        // Folders starting with "~" are organizational containers at any depth
        if (folderName.startsWith('~')) {
            return true;
        }

        // Direct children of "Paid" are designer folders at any depth
        // e.g., root/Paid/DesignerName OR root/Shared 3D Models/Paid/DesignerName
        const paidIndex = parts.indexOf('Paid');
        if (paidIndex >= 0) {
            const depthAfterPaid = parts.length - paidIndex;
            // "Paid" itself (depthAfterPaid=1) is handled as a category container by depth-1 check
            // or will be recursed into. Designer folders are direct children of Paid (depthAfterPaid=2).
            if (depthAfterPaid === 2) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a folder is a model folder under .../Paid/{designer}/.
     * Folders that are 2 levels below a "Paid" directory are always treated as models,
     * even if they don't directly contain model files (files may be in nested subfolders).
     * Works regardless of where "Paid" appears in the path hierarchy.
     * e.g., root/Paid/Designer/Model or root/Shared 3D Models/Paid/Designer/Model
     */
    private isPaidModelFolder(folderPath: string, rootPath: string): boolean {
        const relativePath = path.relative(rootPath, folderPath);
        const parts = relativePath.split(path.sep);
        const paidIndex = parts.indexOf('Paid');
        if (paidIndex < 0) return false;
        const depthAfterPaid = parts.length - paidIndex;
        return depthAfterPaid === 3;
    }

    /**
     * Check if a folder directly contains model files (not just in subfolders).
     * This is the key detection method for identifying model folders.
     */
    private isModelFolder(folderPath: string): boolean {
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && !entry.name.startsWith('.')) {
                    const fullPath = path.join(folderPath, entry.name);
                    if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                        return true;
                    }
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Register a model folder and collect all files from it and subfolders
     */
    private registerModelFolder(folderPath: string): void {
        const dateTracker = { earliestAdded: null as Date | null, earliestCreated: null as Date | null };
        const modelFiles: string[] = [];

        // Use existing collectModelFilesRecursive to gather all files
        this.collectModelFilesRecursive(folderPath, modelFiles, dateTracker);

        // Count files for progress tracking
        this.countFilesInFolder(folderPath);

        if (modelFiles.length > 0) {
            this.foldersWithModels.set(folderPath, {
                files: modelFiles,
                earliestAdded: dateTracker.earliestAdded,
                earliestCreated: dateTracker.earliestCreated
            });
        }
    }

    /**
     * Count all files in a folder recursively (for progress tracking)
     */
    private countFilesInFolder(folderPath: string): void {
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;
                const fullPath = path.join(folderPath, entry.name);
                if (entry.isDirectory()) {
                    this.countFilesInFolder(fullPath);
                } else if (entry.isFile()) {
                    this.progress.totalFiles++;
                    this.progress.processedFiles++;
                }
            }
        } catch {
            // Continue on errors
        }
    }

    private async indexFoldersAsModels(rootPath: string): Promise<void> {
        const modelsNeedingImages: Array<{ modelId: number; folderPath: string }> = [];
        let indexedCount = 0;
        const totalFolders = this.foldersWithModels.size;

        for (const [folderPath, folderData] of this.foldersWithModels.entries()) {
            try {
                const folderName = path.basename(folderPath);
                const cleanedName = cleanupFolderName(folderName);
                const category = this.extractCategory(folderPath, rootPath);
                const isPaid = this.isInFolder(folderPath, rootPath, 'Paid');
                const isOriginal = this.isInFolder(folderPath, rootPath, 'Original Creations');

                // Get folder's own dates first, fall back to earliest file dates
                let dateAdded: string | null = null;
                let dateCreated: string | null = null;

                try {
                    const folderStat = fs.statSync(folderPath);
                    // Use folder dates as primary, but fall back to file dates if folder dates are newer
                    // (sometimes folder dates get updated when copying/moving)
                    const folderMtime = folderStat.mtime;
                    const folderBirthtime = folderStat.birthtime;

                    // Use the earlier of folder date or file date
                    if (folderData.earliestAdded && folderData.earliestAdded < folderMtime) {
                        dateAdded = folderData.earliestAdded.toISOString();
                    } else {
                        dateAdded = folderMtime.toISOString();
                    }

                    if (folderData.earliestCreated && folderData.earliestCreated < folderBirthtime) {
                        dateCreated = folderData.earliestCreated.toISOString();
                    } else {
                        dateCreated = folderBirthtime.toISOString();
                    }
                } catch (e) {
                    // Fall back to file dates if folder stat fails
                    dateAdded = folderData.earliestAdded?.toISOString() || null;
                    dateCreated = folderData.earliestCreated?.toISOString() || null;
                }

                let modelId: number;

                // Check if model already exists (for non-full modes)
                const existingModel = db.prepare('SELECT id FROM models WHERE filepath = ?').get(folderPath) as { id: number } | undefined;

                if (existingModel) {
                    // Model exists
                    if (this.scanMode === 'add_only') {
                        // Skip existing models in add_only mode
                        continue;
                    }

                    // full_sync mode: Update existing model
                    modelId = existingModel.id;

                    // Update model record
                    db.prepare(`
                        UPDATE models SET
                            filename = ?, category = ?, is_paid = ?, is_original = ?,
                            file_count = ?, date_added = ?, date_created = ?
                        WHERE id = ?
                    `).run(
                        cleanedName,
                        category,
                        isPaid ? 1 : 0,
                        isOriginal ? 1 : 0,
                        folderData.files.length,
                        dateAdded,
                        dateCreated,
                        modelId
                    );

                    // Clear and rebuild model_files and model_assets
                    db.prepare('DELETE FROM model_files WHERE model_id = ?').run(modelId);
                    db.prepare('DELETE FROM model_assets WHERE model_id = ?').run(modelId);

                    this.progress.modelsUpdated++;
                } else {
                    // Insert new model (folder) into database
                    const insertModel = db.prepare(`
                        INSERT INTO models (filename, filepath, category, is_paid, is_original, file_count, date_added, date_created)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    const result = insertModel.run(
                        cleanedName,
                        folderPath,
                        category,
                        isPaid ? 1 : 0,
                        isOriginal ? 1 : 0,
                        folderData.files.length,
                        dateAdded,
                        dateCreated
                    );

                    modelId = Number(result.lastInsertRowid);
                    this.progress.modelsFound++;
                }

                // Insert all model files for this model
                const insertFile = db.prepare(`
                    INSERT INTO model_files (model_id, filename, filepath, file_size, file_type)
                    VALUES (?, ?, ?, ?, ?)
                `);

                for (const filePath of folderData.files) {
                    const stats = fs.statSync(filePath);
                    const filename = path.basename(filePath);
                    const ext = path.extname(filePath).toLowerCase().replace('.', '');

                    insertFile.run(modelId, filename, filePath, stats.size, ext);
                    this.progress.modelFilesFound++;
                }

                // Find and index associated assets (images, PDFs)
                this.indexAssets(modelId, folderPath);
                this.selectPrimaryImage(modelId);

                // Check if model needs image extraction from archives
                if (!this.hasPrimaryImage(modelId)) {
                    modelsNeedingImages.push({ modelId, folderPath });
                }

                // Process Finder tags for printed/queue status
                await this.processFinderTags(modelId, folderPath);

                // Update indexing progress: 1-30% of overall progress
                indexedCount++;
                this.progress.indexedFolders = indexedCount;
                this.progress.overallProgress = 1 + Math.round((indexedCount / totalFolders) * 24);

                // Log progress every 500 models
                if (indexedCount % 500 === 0) {
                    console.log(`  Indexed ${indexedCount}/${totalFolders} model folders...`);
                }

                // Yield control every 50 models to keep API responsive
                if (indexedCount % 50 === 0) {
                    await yieldToEventLoop();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`Error indexing folder ${path.relative(rootPath, folderPath)}:`, message);
                indexedCount++;
            }
        }

        // Extract images from archives for models without images
        // Extraction is the longest phase: 30-95% of overall progress
        if (modelsNeedingImages.length > 0) {
            this.progress.currentStep = 'extracting';
            this.progress.modelsToExtract = modelsNeedingImages.length;
            this.progress.modelsExtracted = 0;
            this.progress.stepDescription = `Extracting images (0 of ${modelsNeedingImages.length})...`;
            this.progress.overallProgress = 25;
            console.log(`Extracting images from archives for ${modelsNeedingImages.length} models...`);

            const extractionStart = Date.now();
            let successCount = 0;
            let failCount = 0;
            let slowCount = 0;

            for (const { modelId, folderPath } of modelsNeedingImages) {
                const modelStart = Date.now();
                const folderName = path.basename(folderPath);

                await this.extractImageFromArchives(modelId, folderPath);

                const elapsed = Date.now() - modelStart;
                this.progress.modelsExtracted++;

                // Check if extraction found an image
                if (this.hasPrimaryImage(modelId)) {
                    successCount++;
                }

                // Log slow extractions (>5s) and periodic progress
                if (elapsed > 5000) {
                    slowCount++;
                    console.warn(`  Slow extraction (${(elapsed / 1000).toFixed(1)}s): ${folderName}`);
                }

                // Log progress every 100 models
                if (this.progress.modelsExtracted % 100 === 0) {
                    const totalElapsed = ((Date.now() - extractionStart) / 1000).toFixed(0);
                    const rate = (this.progress.modelsExtracted / ((Date.now() - extractionStart) / 1000)).toFixed(1);
                    const remaining = modelsNeedingImages.length - this.progress.modelsExtracted;
                    const eta = remaining / parseFloat(rate);
                    console.log(`  Extraction progress: ${this.progress.modelsExtracted}/${modelsNeedingImages.length} (${totalElapsed}s elapsed, ${rate}/s, ~${Math.ceil(eta)}s remaining, ${successCount} images found)`);
                }

                // Update progress: 30-95% based on extraction progress
                this.progress.overallProgress = 25 + Math.round((this.progress.modelsExtracted / this.progress.modelsToExtract) * 40);
                this.progress.stepDescription = `Extracting images (${this.progress.modelsExtracted} of ${this.progress.modelsToExtract})...`;

                // Yield control every 10 extractions to keep API responsive
                if (this.progress.modelsExtracted % 10 === 0) {
                    await yieldToEventLoop();
                }
            }

            const totalTime = ((Date.now() - extractionStart) / 1000).toFixed(1);
            console.log(`Extraction complete: ${successCount} images extracted, ${modelsNeedingImages.length - successCount} models without images (${totalTime}s total, ${slowCount} slow operations)`);
        } else {
            // No extraction needed, jump to 65%
            this.progress.overallProgress = 65;
        }

        // Phase: Extract metadata from PDFs
        await this.extractMetadataFromPdfs();

        // Phase: Deduplicate images
        await this.deduplicateAllImages();
    }

    /**
     * Extract metadata from PDF assets for models that don't already have metadata.
     * Uses pdftohtml to extract links (source URLs, designer profiles, tags, licenses)
     * and pdftotext for description text.
     */
    private async extractMetadataFromPdfs(): Promise<void> {
        // Find models with PDF assets but no metadata record
        const modelsWithPdfs = db.prepare(`
            SELECT DISTINCT m.id as model_id, ma.filepath as pdf_path
            FROM models m
            JOIN model_assets ma ON ma.model_id = m.id AND ma.asset_type = 'pdf'
            LEFT JOIN model_metadata mm ON mm.model_id = m.id
            WHERE mm.model_id IS NULL AND m.deleted_at IS NULL
            GROUP BY m.id
        `).all() as Array<{ model_id: number; pdf_path: string }>;

        if (modelsWithPdfs.length === 0) {
            this.progress.overallProgress = 95;
            return;
        }

        this.progress.currentStep = 'metadata';
        this.progress.modelsToExtract = modelsWithPdfs.length;
        this.progress.modelsExtracted = 0;
        this.progress.stepDescription = `Extracting metadata (0 of ${modelsWithPdfs.length})...`;
        this.progress.overallProgress = 65;
        console.log(`Extracting metadata from PDFs for ${modelsWithPdfs.length} models...`);

        const metadataStart = Date.now();
        let successCount = 0;
        let tagCount = 0;

        const insertMetadata = db.prepare(`
            INSERT OR REPLACE INTO model_metadata (model_id, source_platform, source_url, designer, designer_url, description, license, license_url, extracted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
        const getTagId = db.prepare(`SELECT id FROM tags WHERE name = ?`);
        const insertModelTag = db.prepare(`INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)`);

        for (const { model_id, pdf_path } of modelsWithPdfs) {
            try {
                const metadata = await extractMetadataFromPdf(pdf_path);

                insertMetadata.run(
                    model_id,
                    metadata.source_platform,
                    metadata.source_url,
                    metadata.designer,
                    metadata.designer_url,
                    metadata.description,
                    metadata.license,
                    metadata.license_url,
                    new Date().toISOString()
                );

                // Insert tags
                for (const tag of metadata.tags) {
                    insertTag.run(tag);
                    const tagRow = getTagId.get(tag) as { id: number } | undefined;
                    if (tagRow) {
                        insertModelTag.run(model_id, tagRow.id);
                        tagCount++;
                    }
                }

                if (metadata.source_platform || metadata.designer || metadata.tags.length > 0) {
                    successCount++;
                }
            } catch (error) {
                // Insert empty metadata record to avoid re-processing on next scan
                insertMetadata.run(model_id, null, null, null, null, null, null, null, new Date().toISOString());
            }

            this.progress.modelsExtracted++;
            this.progress.overallProgress = 65 + Math.round((this.progress.modelsExtracted / this.progress.modelsToExtract) * 30);
            this.progress.stepDescription = `Extracting metadata (${this.progress.modelsExtracted} of ${this.progress.modelsToExtract})...`;

            // Log progress every 100 models
            if (this.progress.modelsExtracted % 100 === 0) {
                const elapsed = ((Date.now() - metadataStart) / 1000).toFixed(0);
                const rate = (this.progress.modelsExtracted / ((Date.now() - metadataStart) / 1000)).toFixed(1);
                const remaining = modelsWithPdfs.length - this.progress.modelsExtracted;
                const eta = remaining / parseFloat(rate);
                console.log(`  Metadata progress: ${this.progress.modelsExtracted}/${modelsWithPdfs.length} (${elapsed}s elapsed, ${rate}/s, ~${Math.ceil(eta)}s remaining, ${successCount} enriched, ${tagCount} tags)`);
            }

            // Yield every 10 to keep API responsive
            if (this.progress.modelsExtracted % 10 === 0) {
                await yieldToEventLoop();
            }
        }

        const totalTime = ((Date.now() - metadataStart) / 1000).toFixed(1);
        console.log(`Metadata extraction complete: ${successCount} models enriched, ${tagCount} tags added (${totalTime}s total)`);
        this.progress.overallProgress = 90;
    }

    /**
     * Deduplicate images across all models that have multiple visible images.
     * Uses perceptual hashing (resize to 8x8 via sips, then hash the result)
     * to detect visually identical images regardless of format, size, or compression.
     * Keeps the highest quality image (largest file size) and hides duplicates.
     */
    async deduplicateAllImages(): Promise<{ modelsProcessed: number; duplicatesHidden: number }> {
        // Find all models with multiple non-hidden images
        const modelsWithMultipleImages = db.prepare(`
            SELECT model_id, COUNT(*) as image_count
            FROM model_assets
            WHERE asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
            GROUP BY model_id
            HAVING COUNT(*) > 1
        `).all() as Array<{ model_id: number; image_count: number }>;

        if (modelsWithMultipleImages.length === 0) {
            this.progress.overallProgress = 95;
            return { modelsProcessed: 0, duplicatesHidden: 0 };
        }

        this.progress.currentStep = 'deduplicating';
        this.progress.modelsToExtract = modelsWithMultipleImages.length;
        this.progress.modelsExtracted = 0;
        this.progress.stepDescription = `Deduplicating images (0 of ${modelsWithMultipleImages.length})...`;
        this.progress.overallProgress = 90;
        console.log(`Deduplicating images for ${modelsWithMultipleImages.length} models...`);

        const dedupStart = Date.now();
        let totalDuplicatesHidden = 0;

        for (const { model_id } of modelsWithMultipleImages) {
            try {
                const hidden = await this.deduplicateModelImages(model_id);
                totalDuplicatesHidden += hidden;
            } catch (error) {
                // Continue on individual model errors
            }

            this.progress.modelsExtracted++;
            this.progress.overallProgress = 90 + Math.round((this.progress.modelsExtracted / this.progress.modelsToExtract) * 5);
            this.progress.stepDescription = `Deduplicating images (${this.progress.modelsExtracted} of ${this.progress.modelsToExtract})...`;

            // Yield control every 20 models
            if (this.progress.modelsExtracted % 20 === 0) {
                await yieldToEventLoop();
            }
        }

        const dedupTime = ((Date.now() - dedupStart) / 1000).toFixed(1);
        console.log(`Deduplication complete: ${totalDuplicatesHidden} duplicate images hidden across ${modelsWithMultipleImages.length} models (${dedupTime}s)`);
        this.progress.overallProgress = 95;

        return { modelsProcessed: modelsWithMultipleImages.length, duplicatesHidden: totalDuplicatesHidden };
    }

    /**
     * Deduplicate images for a single model.
     * Returns the number of duplicates that were hidden.
     */
    async deduplicateModelImages(modelId: number): Promise<number> {
        const images = db.prepare(`
            SELECT id, filepath, is_primary
            FROM model_assets
            WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
        `).all(modelId) as Array<{ id: number; filepath: string; is_primary: number }>;

        if (images.length < 2) return 0;

        // Step 1: Compute perceptual hash for each image
        const imageHashes: Array<{ id: number; filepath: string; is_primary: number; hash: string; fileSize: number }> = [];
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedup-'));

        try {
            for (const image of images) {
                if (!fs.existsSync(image.filepath)) continue;

                try {
                    const stats = fs.statSync(image.filepath);
                    const hash = await this.computePerceptualHash(image.filepath, tempDir);
                    if (hash) {
                        imageHashes.push({
                            id: image.id,
                            filepath: image.filepath,
                            is_primary: image.is_primary,
                            hash,
                            fileSize: stats.size
                        });
                    }
                } catch {
                    // Skip images that can't be hashed
                }
            }

            if (imageHashes.length < 2) return 0;

            // Step 2: Group by perceptual hash
            const hashGroups = new Map<string, typeof imageHashes>();
            for (const img of imageHashes) {
                const group = hashGroups.get(img.hash) || [];
                group.push(img);
                hashGroups.set(img.hash, group);
            }

            // Step 3: For each group with duplicates, keep the best and hide the rest
            let duplicatesHidden = 0;
            const hideStmt = db.prepare('UPDATE model_assets SET is_hidden = 1 WHERE id = ?');

            for (const [, group] of hashGroups) {
                if (group.length < 2) continue;

                // Sort: primary images first, then by file size descending (keep largest)
                group.sort((a, b) => {
                    if (a.is_primary !== b.is_primary) return b.is_primary - a.is_primary;
                    return b.fileSize - a.fileSize;
                });

                // Hide all except the first (best) one
                for (let i = 1; i < group.length; i++) {
                    hideStmt.run(group[i].id);
                    duplicatesHidden++;
                }
            }

            return duplicatesHidden;
        } finally {
            // Clean up temp directory
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Compute a perceptual hash of an image by resizing it to 8x8 grayscale
     * using macOS sips, then hashing the resulting pixel data.
     */
    private async computePerceptualHash(imagePath: string, tempDir: string): Promise<string | null> {
        const ext = path.extname(imagePath).toLowerCase();
        // Skip non-standard image formats that sips might not handle
        if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp'].includes(ext)) {
            return null;
        }

        const baseName = crypto.randomBytes(8).toString('hex');
        const resizedPath = path.join(tempDir, `${baseName}.png`);

        try {
            // Use sips to resize to 8x8 and convert to PNG (deterministic output)
            await new Promise<void>((resolve, reject) => {
                execFile('sips', [
                    '-z', '8', '8',          // Resize to 8x8
                    '-s', 'format', 'png',   // Output as PNG
                    imagePath,
                    '--out', resizedPath
                ], { timeout: 5000 }, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            if (!fs.existsSync(resizedPath)) return null;

            // Hash the resized image bytes
            const data = fs.readFileSync(resizedPath);
            const hash = crypto.createHash('md5').update(data).digest('hex');

            // Clean up the temp file immediately
            try { fs.unlinkSync(resizedPath); } catch { /* ignore */ }

            return hash;
        } catch {
            // Clean up on error
            try { if (fs.existsSync(resizedPath)) fs.unlinkSync(resizedPath); } catch { /* ignore */ }
            return null;
        }
    }

    private trackLooseFile(filepath: string): void {
        try {
            // In add_only mode, check if loose file already exists
            if (this.scanMode === 'add_only') {
                const existing = db.prepare('SELECT id FROM loose_files WHERE filepath = ?').get(filepath);
                if (existing) {
                    return; // Skip existing loose files
                }
            }

            const stats = fs.statSync(filepath);
            const filename = path.basename(filepath);
            const ext = path.extname(filepath).toLowerCase();
            const fileType = ext.replace('.', '');

            const insert = db.prepare(`
                INSERT INTO loose_files (filename, filepath, file_size, file_type, category)
                VALUES (?, ?, ?, ?, 'Uncategorized')
            `);

            insert.run(filename, filepath, stats.size, fileType);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error tracking loose file ${filepath}:`, message);
        }
    }

    private indexAssets(modelId: number, folderPath: string): void {
        try {
            // Recursively scan folder and all subfolders for assets
            this.indexAssetsRecursive(modelId, folderPath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error indexing assets for ${folderPath}:`, message);
        }
    }

    private indexAssetsRecursive(modelId: number, currentPath: string): void {
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // Skip hidden files
                if (entry.name.startsWith('.')) continue;

                if (entry.isDirectory()) {
                    // Recursively scan subdirectories for assets
                    this.indexAssetsRecursive(modelId, fullPath);
                } else if (entry.isFile()) {
                    let assetType: string | null = null;

                    if (isImageFile(fullPath)) {
                        assetType = 'image';
                    } else if (isDocumentFile(fullPath)) {
                        assetType = 'pdf';
                    }

                    if (assetType) {
                        const insert = db.prepare(`
                            INSERT INTO model_assets (model_id, filepath, asset_type, is_primary)
                            VALUES (?, ?, ?, 0)
                        `);

                        insert.run(modelId, fullPath, assetType);
                        this.progress.assetsFound++;
                    }
                }
            }
        } catch (error) {
            // Silently continue on individual file/folder errors
        }
    }

    /**
     * Select the best primary image for a model from its indexed assets.
     * Prefers .gif images, then falls back to the first image found.
     */
    private selectPrimaryImage(modelId: number): void {
        const images = db.prepare(`
            SELECT id, filepath FROM model_assets
            WHERE model_id = ? AND asset_type = 'image' AND (is_hidden = 0 OR is_hidden IS NULL)
            ORDER BY id
        `).all(modelId) as Array<{ id: number; filepath: string }>;

        if (images.length === 0) return;

        // Prefer .gif images as primary
        const gifImage = images.find(img => path.extname(img.filepath).toLowerCase() === '.gif');
        const primaryId = gifImage ? gifImage.id : images[0].id;

        db.prepare('UPDATE model_assets SET is_primary = 1 WHERE id = ?').run(primaryId);
    }

    private hasPrimaryImage(modelId: number): boolean {
        const result = db.prepare('SELECT COUNT(*) as count FROM model_assets WHERE model_id = ? AND asset_type = ?').get(modelId, 'image') as { count: number };
        return result.count > 0;
    }

    /**
     * Process Finder tags on a model folder and create printed_models/print_queue records.
     * - Green tag = printed with 'good' rating
     * - Red tag = printed with 'bad' rating
     * - Blue tag = in print queue
     */
    private async processFinderTags(modelId: number, folderPath: string): Promise<void> {
        try {
            const tags = await getFinderTags(folderPath);
            if (tags.length === 0) return;

            const state = parseModelStateFromTags(tags);

            // Handle printed status
            if (state.isPrinted) {
                // Check if already in printed_models
                const existing = db.prepare('SELECT id FROM printed_models WHERE model_id = ?').get(modelId) as { id: number } | undefined;

                if (!existing) {
                    // Insert new printed record (discovered from Finder tag)
                    db.prepare(`
                        INSERT INTO printed_models (model_id, rating, notes)
                        VALUES (?, ?, 'Imported from Finder tag')
                    `).run(modelId, state.printRating);
                }
            }

            // Handle queue status
            if (state.isQueued) {
                // Check if already in print_queue
                const existing = db.prepare('SELECT id FROM print_queue WHERE model_id = ?').get(modelId) as { id: number } | undefined;

                if (!existing) {
                    // Insert new queue record (discovered from Finder tag)
                    db.prepare(`
                        INSERT INTO print_queue (model_id, notes)
                        VALUES (?, 'Imported from Finder tag')
                    `).run(modelId);
                }
            }
        } catch (error) {
            // Silently continue if tag reading fails
        }
    }

    private async extractImageFromArchives(modelId: number, folderPath: string): Promise<void> {
        const PER_MODEL_TIMEOUT = 30000; // 30 second max per model

        try {
            // Wrap entire extraction in a timeout to prevent any single model from blocking
            await Promise.race([
                this.extractImageFromArchivesInner(modelId, folderPath),
                new Promise<void>((_, reject) =>
                    setTimeout(() => reject(new Error('Per-model extraction timeout')), PER_MODEL_TIMEOUT)
                )
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('timeout')) {
                console.warn(`  Extraction timed out (${PER_MODEL_TIMEOUT / 1000}s): ${path.basename(folderPath)}`);
            } else {
                console.error(`  Error extracting images: ${path.basename(folderPath)}: ${message}`);
            }
        }
    }

    private async extractImageFromArchivesInner(modelId: number, folderPath: string): Promise<void> {
        // Collect .3mf files and photo zips with their dates (recursively)
        const archives: Array<{ path: string; type: '3mf' | 'photozip'; date: Date }> = [];
        this.collectArchivesRecursive(folderPath, archives);

        // Sort by date (earliest first) - 3mf files prioritized
        archives.sort((a, b) => {
            // Prioritize 3mf files over photo zips
            if (a.type === '3mf' && b.type !== '3mf') return -1;
            if (a.type !== '3mf' && b.type === '3mf') return 1;
            return a.date.getTime() - b.date.getTime();
        });

        const insert = db.prepare(`
            INSERT INTO model_assets (model_id, filepath, asset_type, is_primary)
            VALUES (?, ?, 'image', 0)
        `);

        // Try to extract images from each archive
        let extractedAny = false;
        for (const archive of archives) {
            const extracted = await this.extractImagesFromZip(archive.path, folderPath, archive.type);
            if (extracted.length > 0) {
                for (const imagePath of extracted) {
                    insert.run(modelId, imagePath);
                    this.progress.assetsFound++;
                }
                extractedAny = true;
                break; // Stop after first archive with images
            }
        }

        if (extractedAny) {
            this.selectPrimaryImage(modelId);
            return;
        }

        // Fallback: try to extract first page from PDFs as thumbnail
        const extracted = await this.extractImageFromPdf(folderPath);
        if (extracted) {
            insert.run(modelId, extracted);
            this.progress.assetsFound++;
            db.prepare('UPDATE model_assets SET is_primary = 1 WHERE model_id = ? AND filepath = ?').run(modelId, extracted);
        }
    }

    private async extractImageFromPdf(folderPath: string): Promise<string | null> {
        try {
            // Find PDFs in the folder (recursively)
            const pdfs = this.collectPdfsRecursive(folderPath);
            if (pdfs.length === 0) return null;

            // Sort by date (earliest first)
            pdfs.sort((a, b) => a.date.getTime() - b.date.getTime());

            // Use pdfimages (from poppler) to extract embedded images from PDFs
            for (const pdf of pdfs) {
                const pdfBaseName = path.basename(pdf.path, path.extname(pdf.path));
                const tempPrefix = path.join(folderPath, `_pdfextract_${pdfBaseName}`);

                try {
                    // Extract images from first page only, using native formats
                    // -f 1 -l 1: first page only
                    // -j: write JPEG images as JPEG files (keep native format)
                    // -png: write non-JPEG images as PNG
                    await new Promise<void>((resolve, reject) => {
                        execFile('pdfimages', ['-f', '1', '-l', '1', '-j', '-png', pdf.path, tempPrefix], { timeout: 15000 }, (error) => {
                            if (error) reject(error);
                            else resolve();
                        });
                    });

                    // Find extracted files (pdfimages creates files like prefix-000.jpg, prefix-001.png, etc.)
                    const extractedFiles: Array<{ path: string; size: number }> = [];
                    const entries = fs.readdirSync(folderPath);
                    const prefix = `_pdfextract_${pdfBaseName}`;
                    for (const entry of entries) {
                        if (entry.startsWith(prefix) && /\.(jpg|jpeg|png|ppm|tiff|tif)$/i.test(entry)) {
                            const fullPath = path.join(folderPath, entry);
                            const stat = fs.statSync(fullPath);
                            extractedFiles.push({ path: fullPath, size: stat.size });
                        }
                    }

                    if (extractedFiles.length === 0) continue;

                    // Pick the largest image (most likely the main content image)
                    extractedFiles.sort((a, b) => b.size - a.size);
                    const bestImage = extractedFiles[0];

                    // Convert to JPEG if needed (PPM/TIFF) using sips
                    let finalPath = bestImage.path;
                    const ext = path.extname(bestImage.path).toLowerCase();
                    if (ext === '.ppm' || ext === '.tiff' || ext === '.tif') {
                        const jpgPath = bestImage.path.replace(/\.[^.]+$/, '.jpg');
                        try {
                            await new Promise<void>((resolve, reject) => {
                                execFile('sips', ['-s', 'format', 'jpeg', bestImage.path, '--out', jpgPath], { timeout: 15000 }, (error) => {
                                    if (error) reject(error);
                                    else resolve();
                                });
                            });
                            fs.unlinkSync(bestImage.path);
                            finalPath = jpgPath;
                        } catch {
                            // Keep original format if conversion fails
                        }
                    }

                    // Rename to standard extracted name
                    const finalExt = path.extname(finalPath);
                    const outputName = `_extracted_${pdfBaseName}${finalExt}`;
                    const outputPath = path.join(folderPath, outputName);
                    if (finalPath !== outputPath) {
                        fs.renameSync(finalPath, outputPath);
                    }

                    // Clean up other extracted files
                    for (const file of extractedFiles) {
                        if (file.path !== bestImage.path && fs.existsSync(file.path)) {
                            try { fs.unlinkSync(file.path); } catch { /* ignore */ }
                        }
                    }

                    return outputPath;
                } catch {
                    // Clean up any temp files on failure
                    try {
                        const entries = fs.readdirSync(folderPath);
                        const prefix = `_pdfextract_${pdfBaseName}`;
                        for (const entry of entries) {
                            if (entry.startsWith(prefix)) {
                                fs.unlinkSync(path.join(folderPath, entry));
                            }
                        }
                    } catch { /* ignore */ }
                    continue;
                }
            }
        } catch {
            // Silently fail
        }
        return null;
    }

    private collectPdfsRecursive(currentPath: string): Array<{ path: string; date: Date }> {
        const pdfs: Array<{ path: string; date: Date }> = [];
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    pdfs.push(...this.collectPdfsRecursive(fullPath));
                } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') {
                    try {
                        const stat = fs.statSync(fullPath);
                        pdfs.push({ path: fullPath, date: stat.mtime });
                    } catch { continue; }
                }
            }
        } catch { /* ignore */ }
        return pdfs;
    }

    private collectArchivesRecursive(currentPath: string, archives: Array<{ path: string; type: '3mf' | 'photozip'; date: Date }>): void {
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // Skip hidden files
                if (entry.name.startsWith('.')) continue;

                if (entry.isDirectory()) {
                    this.collectArchivesRecursive(fullPath, archives);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const baseName = path.basename(entry.name, ext).toLowerCase();

                    try {
                        const stat = fs.statSync(fullPath);

                        if (ext === '.3mf') {
                            archives.push({ path: fullPath, type: '3mf', date: stat.mtime });
                        } else if (ext === '.zip') {
                            // Check if it's a photo zip (Photos.zip, images.zip, pictures.zip, etc.)
                            const photoKeywords = ['photo', 'image', 'picture', 'pic', 'img', 'thumbnail', 'preview'];
                            if (photoKeywords.some(kw => baseName.includes(kw))) {
                                archives.push({ path: fullPath, type: 'photozip', date: stat.mtime });
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
        } catch (e) {
            // Continue on errors
        }
    }

    /**
     * Extract images from a ZIP/3MF archive. Returns paths of all extracted high-scoring images.
     * For 3mf: extracts all images scoring >= 70 (Auxiliaries, plate, metadata, thumbnail).
     * For photo zips: extracts the single best image.
     */
    private extractImagesFromZip(zipPath: string, outputDir: string, type: '3mf' | 'photozip'): Promise<string[]> {
        const TIMEOUT_MS = 10000;
        const HIGH_SCORE_THRESHOLD = 70; // Extract all images at or above this score

        return new Promise((resolve) => {
            let resolved = false;
            const safeResolve = (value: string[]) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve(value);
                }
            };

            const timer = setTimeout(() => {
                console.warn(`  ZIP extraction timed out after ${TIMEOUT_MS / 1000}s: ${path.basename(zipPath)}`);
                safeResolve([]);
            }, TIMEOUT_MS);

            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err || !zipfile) {
                    safeResolve([]);
                    return;
                }

                const candidates: Array<{ name: string; score: number }> = [];

                zipfile.on('error', () => {
                    safeResolve([]);
                });

                zipfile.on('entry', (entry: yauzl.Entry) => {
                    if (resolved) return;
                    const entryName = entry.fileName;
                    const ext = path.extname(entryName).toLowerCase();

                    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
                        const baseName = path.basename(entryName).toLowerCase();
                        let score = 0;

                        if (type === '3mf') {
                            const entryLower = entryName.toLowerCase();
                            // Prefer Auxiliaries images (user-added reference images)
                            if (entryLower.includes('auxiliaries/') || entryLower.includes('auxiliaries\\')) score = 110;
                            else if (baseName.includes('plate_1')) score = 100;
                            else if (baseName.includes('plate')) score = 90;
                            else if (entryLower.includes('metadata')) score = 80;
                            else if (baseName.includes('thumbnail')) score = 70;
                            else if (baseName.includes('preview')) score = 60;
                            else score = 10;
                        } else {
                            if (baseName.includes('main') || baseName.includes('cover')) score = 100;
                            else if (baseName.includes('thumb') || baseName.includes('preview')) score = 90;
                            else score = 50;
                        }

                        candidates.push({ name: entryName, score });
                    }

                    zipfile.readEntry();
                });

                zipfile.on('end', () => {
                    if (resolved) return;
                    if (candidates.length === 0) {
                        zipfile.close();
                        safeResolve([]);
                        return;
                    }

                    // Sort by score descending
                    candidates.sort((a, b) => b.score - a.score);

                    // For 3mf: extract all high-scoring images; for photo zips: just the best
                    const toExtract = type === '3mf'
                        ? candidates.filter(c => c.score >= HIGH_SCORE_THRESHOLD)
                        : [candidates[0]];

                    // If no high-scoring candidates, fall back to the single best
                    if (toExtract.length === 0) {
                        toExtract.push(candidates[0]);
                    }

                    const targetNames = new Set(toExtract.map(c => c.name));

                    // Re-open to extract the selected files
                    yauzl.open(zipPath, { lazyEntries: true }, (err2, zipfile2) => {
                        if (err2 || !zipfile2) {
                            safeResolve([]);
                            return;
                        }

                        const extractedPaths: string[] = [];
                        let pending = 0;
                        let entriesDone = false;

                        const checkComplete = () => {
                            if (entriesDone && pending === 0) {
                                zipfile2.close();
                                safeResolve(extractedPaths);
                            }
                        };

                        zipfile2.on('error', () => {
                            safeResolve(extractedPaths);
                        });

                        zipfile2.on('entry', (entry: yauzl.Entry) => {
                            if (resolved) return;
                            if (targetNames.has(entry.fileName)) {
                                pending++;
                                zipfile2.openReadStream(entry, (streamErr, readStream) => {
                                    if (streamErr || !readStream) {
                                        pending--;
                                        checkComplete();
                                        zipfile2.readEntry();
                                        return;
                                    }

                                    const ext = path.extname(entry.fileName);
                                    const archiveName = path.basename(zipPath, path.extname(zipPath));
                                    const entryBaseName = path.basename(entry.fileName, ext);
                                    // Use unique name per entry to avoid collisions
                                    const suffix = extractedPaths.length > 0 ? `_${extractedPaths.length}` : '';
                                    const outputName = `_extracted_${archiveName}${suffix}${ext}`;
                                    const outputPath = path.join(outputDir, outputName);

                                    const writeStream = fs.createWriteStream(outputPath);
                                    readStream.pipe(writeStream);

                                    writeStream.on('finish', () => {
                                        extractedPaths.push(outputPath);
                                        pending--;
                                        checkComplete();
                                    });

                                    writeStream.on('error', () => {
                                        pending--;
                                        checkComplete();
                                    });
                                });
                            }
                            zipfile2.readEntry();
                        });

                        zipfile2.on('end', () => {
                            entriesDone = true;
                            checkComplete();
                        });

                        zipfile2.readEntry();
                    });
                });

                zipfile.readEntry();
            });
        });
    }

    private extractCategory(filepath: string, rootPath: string): string {
        const relativePath = path.relative(rootPath, filepath);
        const parts = relativePath.split(path.sep);

        // If file is directly in root
        if (parts.length === 1) {
            return 'Uncategorized';
        }

        // Check for special categories
        if (parts.includes('Paid')) {
            return 'Paid';
        }
        if (parts.includes('Original Creations')) {
            return 'Original Creations';
        }

        // Use first directory as category
        return parts[0];
    }

    private isInFolder(filepath: string, rootPath: string, folderName: string): boolean {
        const relativePath = path.relative(rootPath, filepath);
        const parts = relativePath.split(path.sep);
        return parts.includes(folderName);
    }

    getProgress(): ScanProgress & { scanning: boolean } {
        return {
            scanning: this.scanning,
            ...this.progress
        };
    }
}

export default new Scanner();
