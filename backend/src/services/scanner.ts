import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import db from '../config/database.js';
import { isModelFile, isImageFile, isDocumentFile, isArchiveFile } from '../utils/fileTypes.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';
import { getFinderTags, parseModelStateFromTags } from '../utils/finderTags.js';

export type ScanMode = 'full' | 'full_sync' | 'add_only';

// Helper to yield control back to the event loop periodically
// This prevents the scanner from blocking API requests
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

type ScanStep = 'idle' | 'discovering' | 'indexing' | 'extracting' | 'tagging' | 'cleanup' | 'complete';

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
    overallProgress: number;
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
        overallProgress: 0
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
            overallProgress: 0
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

            // Only clear data in 'full' mode (destructive)
            if (mode === 'full') {
                this.clearExistingModels();
            } else if (mode === 'full_sync') {
                // Clear loose_files table - we'll rebuild it
                db.prepare('DELETE FROM loose_files').run();
            }

            // Phase 1: Recursively scan and collect model files by folder
            await this.scanDirectoryRecursive(modelDirectory, modelDirectory);

            // Set totalFolders for progress tracking
            this.progress.totalFolders = this.foldersWithModels.size;
            this.progress.overallProgress = 30; // Discovery complete

            // Phase 2: Index folders as models (includes image extraction from archives)
            this.progress.currentStep = 'indexing';
            this.progress.stepDescription = 'Indexing model folders...';
            await this.indexFoldersAsModels(modelDirectory);

            // Phase 3: In full_sync mode, remove models whose folders no longer exist
            if (mode === 'full_sync') {
                this.progress.currentStep = 'cleanup';
                this.progress.stepDescription = 'Cleaning up orphaned models...';
                this.progress.overallProgress = 95;
                this.removeOrphanedModels();
            }

            this.progress.currentStep = 'complete';
            this.progress.stepDescription = 'Scan complete';
            this.progress.overallProgress = 100;
            console.log(`Scan complete!`);
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

            // Extract images from archives if no primary image
            if (!this.hasPrimaryImage(modelId)) {
                await this.extractImageFromArchives(modelId, folderPath);
            }

            console.log(`Indexed single folder: ${cleanedName}`);
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
     * Rescan an existing model folder (delete and re-index)
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

            // Delete existing model data
            db.prepare('DELETE FROM model_files WHERE model_id = ?').run(modelId);
            db.prepare('DELETE FROM model_assets WHERE model_id = ?').run(modelId);
            db.prepare('DELETE FROM models WHERE id = ?').run(modelId);

            // Re-scan the folder
            return await this.scanSingleFolder(model.filepath, configResult.value);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error rescanning model ${modelId}:`, message);
            throw error;
        }
    }

    private clearExistingModels(): void {
        db.prepare('DELETE FROM models').run();
        db.prepare('DELETE FROM model_files').run();
        db.prepare('DELETE FROM model_assets').run();
        db.prepare('DELETE FROM loose_files').run();
        console.log('Cleared existing data from database');
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
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // Skip hidden files and node_modules
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }

                if (entry.isDirectory()) {
                    // Recursively scan subdirectory
                    await this.scanDirectoryRecursive(fullPath, rootPath);
                } else if (entry.isFile()) {
                    this.progress.totalFiles++;

                    // Check if it's a model file
                    if (isModelFile(fullPath) || isArchiveFile(fullPath)) {
                        const relativePath = path.relative(rootPath, fullPath);
                        const pathDepth = relativePath.split(path.sep).length;

                        // Check if file is loose (in root or directly in a category folder)
                        // pathDepth 1 = root directory (e.g., "model.stl")
                        // pathDepth 2 = one level deep (e.g., "Toys/model.stl")
                        if (pathDepth <= 2) {
                            this.trackLooseFile(fullPath);
                            this.progress.looseFilesFound++;
                        } else {
                            // Determine the model root folder (depth 3 = root/category/model-folder)
                            // Files in nested subfolders should be attributed to the parent model folder
                            const modelFolderPath = this.getModelRootFolder(fullPath, rootPath);

                            // Get file dates
                            const stats = fs.statSync(fullPath);
                            const fileAdded = stats.mtime;
                            const fileCreated = stats.birthtime;

                            // Add to model folder's files collection
                            if (!this.foldersWithModels.has(modelFolderPath)) {
                                this.foldersWithModels.set(modelFolderPath, {
                                    files: [],
                                    earliestAdded: null,
                                    earliestCreated: null
                                });
                            }
                            const folderData = this.foldersWithModels.get(modelFolderPath)!;
                            folderData.files.push(fullPath);

                            // Track earliest dates
                            if (!folderData.earliestAdded || fileAdded < folderData.earliestAdded) {
                                folderData.earliestAdded = fileAdded;
                            }
                            if (!folderData.earliestCreated || fileCreated < folderData.earliestCreated) {
                                folderData.earliestCreated = fileCreated;
                            }
                        }
                    }

                    this.progress.processedFiles++;
                    // Discovery phase = 0-30% of overall progress
                    if (this.progress.totalFiles > 0) {
                        this.progress.overallProgress = Math.round((this.progress.processedFiles / this.progress.totalFiles) * 30);
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
     * Get the model root folder for a file path.
     * The model root folder is at depth 3 (root/category/model-folder).
     * Files in nested subfolders are attributed to this parent model folder.
     */
    private getModelRootFolder(filePath: string, rootPath: string): string {
        const relativePath = path.relative(rootPath, filePath);
        const parts = relativePath.split(path.sep);

        // parts[0] = category folder
        // parts[1] = model folder
        // parts[2+] = nested subfolders and file

        // Return the model folder path (first two directory levels under root)
        if (parts.length >= 3) {
            return path.join(rootPath, parts[0], parts[1]);
        }

        // Fallback to immediate parent (shouldn't happen given depth check)
        return path.dirname(filePath);
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

                // Check if model needs image extraction from archives
                if (!this.hasPrimaryImage(modelId)) {
                    modelsNeedingImages.push({ modelId, folderPath });
                }

                // Process Finder tags for printed/queue status
                await this.processFinderTags(modelId, folderPath);

                // Update indexing progress (30% + up to 60% = 90% total before extraction)
                indexedCount++;
                this.progress.indexedFolders = indexedCount;
                // Indexing phase = 30-90% of overall progress
                this.progress.overallProgress = 30 + Math.round((indexedCount / totalFolders) * 60);

                // Yield control every 50 models to keep API responsive
                if (indexedCount % 50 === 0) {
                    await yieldToEventLoop();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`Error indexing folder ${folderPath}:`, message);
                indexedCount++;
            }
        }

        // Extract images from archives for models without images
        if (modelsNeedingImages.length > 0) {
            this.progress.currentStep = 'extracting';
            this.progress.stepDescription = `Extracting images from archives (${modelsNeedingImages.length} models)...`;
            console.log(`Extracting images from archives for ${modelsNeedingImages.length} models...`);
            let extractCount = 0;
            for (const { modelId, folderPath } of modelsNeedingImages) {
                await this.extractImageFromArchives(modelId, folderPath);
                extractCount++;
                // Yield control every 20 extractions
                if (extractCount % 20 === 0) {
                    await yieldToEventLoop();
                }
            }
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
                    let isPrimary = false;

                    if (isImageFile(fullPath)) {
                        assetType = 'image';
                        // First image becomes primary
                        const existingImages = db.prepare('SELECT COUNT(*) as count FROM model_assets WHERE model_id = ? AND asset_type = ?').get(modelId, 'image') as { count: number };
                        isPrimary = existingImages.count === 0;
                    } else if (isDocumentFile(fullPath)) {
                        assetType = 'pdf';
                    }

                    if (assetType) {
                        const insert = db.prepare(`
                            INSERT INTO model_assets (model_id, filepath, asset_type, is_primary)
                            VALUES (?, ?, ?, ?)
                        `);

                        insert.run(modelId, fullPath, assetType, isPrimary ? 1 : 0);
                        this.progress.assetsFound++;
                    }
                }
            }
        } catch (error) {
            // Silently continue on individual file/folder errors
        }
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
        try {
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

            // Try to extract an image from each archive
            for (const archive of archives) {
                const extracted = await this.extractImageFromZip(archive.path, folderPath, archive.type);
                if (extracted) {
                    // Index the extracted image
                    const insert = db.prepare(`
                        INSERT INTO model_assets (model_id, filepath, asset_type, is_primary)
                        VALUES (?, ?, 'image', 1)
                    `);
                    insert.run(modelId, extracted);
                    this.progress.assetsFound++;
                    return; // Stop after first successful extraction
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error extracting images from archives in ${folderPath}:`, message);
        }
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

    private extractImageFromZip(zipPath: string, outputDir: string, type: '3mf' | 'photozip'): Promise<string | null> {
        return new Promise((resolve) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err || !zipfile) {
                    resolve(null);
                    return;
                }

                let foundImage: string | null = null;
                const candidates: Array<{ name: string; score: number }> = [];

                zipfile.on('error', () => {
                    resolve(null);
                });

                zipfile.on('entry', (entry: yauzl.Entry) => {
                    const entryName = entry.fileName;
                    const ext = path.extname(entryName).toLowerCase();

                    // Check if it's an image
                    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
                        const baseName = path.basename(entryName).toLowerCase();
                        let score = 0;

                        if (type === '3mf') {
                            // Prefer plate images in 3mf files
                            if (baseName.includes('plate_1')) score = 100;
                            else if (baseName.includes('plate')) score = 90;
                            else if (entryName.toLowerCase().includes('metadata')) score = 80;
                            else if (baseName.includes('thumbnail')) score = 70;
                            else if (baseName.includes('preview')) score = 60;
                            else score = 10;
                        } else {
                            // For photo zips, any image is good
                            if (baseName.includes('main') || baseName.includes('cover')) score = 100;
                            else if (baseName.includes('thumb') || baseName.includes('preview')) score = 90;
                            else score = 50;
                        }

                        candidates.push({ name: entryName, score });
                    }

                    zipfile.readEntry();
                });

                zipfile.on('end', () => {
                    if (candidates.length === 0) {
                        zipfile.close();
                        resolve(null);
                        return;
                    }

                    // Sort by score and pick the best
                    candidates.sort((a, b) => b.score - a.score);
                    const bestCandidate = candidates[0].name;

                    // Re-open to extract the specific file
                    yauzl.open(zipPath, { lazyEntries: true }, (err2, zipfile2) => {
                        if (err2 || !zipfile2) {
                            resolve(null);
                            return;
                        }

                        zipfile2.on('error', () => {
                            resolve(null);
                        });

                        zipfile2.on('entry', (entry: yauzl.Entry) => {
                            if (entry.fileName === bestCandidate) {
                                zipfile2.openReadStream(entry, (streamErr, readStream) => {
                                    if (streamErr || !readStream) {
                                        zipfile2.readEntry();
                                        return;
                                    }

                                    // Generate output filename
                                    const ext = path.extname(bestCandidate);
                                    const archiveName = path.basename(zipPath, path.extname(zipPath));
                                    const outputName = `_extracted_${archiveName}${ext}`;
                                    const outputPath = path.join(outputDir, outputName);

                                    const writeStream = fs.createWriteStream(outputPath);
                                    readStream.pipe(writeStream);

                                    writeStream.on('finish', () => {
                                        foundImage = outputPath;
                                        zipfile2.close();
                                    });

                                    writeStream.on('error', () => {
                                        zipfile2.readEntry();
                                    });
                                });
                            } else {
                                zipfile2.readEntry();
                            }
                        });

                        zipfile2.on('end', () => {
                            zipfile2.close();
                            resolve(foundImage);
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
