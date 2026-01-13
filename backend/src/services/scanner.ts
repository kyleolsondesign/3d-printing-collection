import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import db from '../config/database.js';
import { isModelFile, isImageFile, isDocumentFile, isArchiveFile } from '../utils/fileTypes.js';
import { cleanupFolderName } from '../utils/nameCleanup.js';

interface ScanProgress {
    totalFiles: number;
    processedFiles: number;
    modelsFound: number;
    modelFilesFound: number;
    assetsFound: number;
    looseFilesFound: number;
}

interface FolderData {
    files: string[];
    earliestAdded: Date | null;
    earliestCreated: Date | null;
}

class Scanner {
    private scanning: boolean = false;
    private progress: ScanProgress = {
        totalFiles: 0,
        processedFiles: 0,
        modelsFound: 0,
        modelFilesFound: 0,
        assetsFound: 0,
        looseFilesFound: 0
    };
    private foldersWithModels: Map<string, FolderData> = new Map();

    async scanDirectory(modelDirectory: string): Promise<ScanProgress> {
        if (this.scanning) {
            throw new Error('Scan already in progress');
        }

        this.scanning = true;
        this.progress = {
            totalFiles: 0,
            processedFiles: 0,
            modelsFound: 0,
            modelFilesFound: 0,
            assetsFound: 0,
            looseFilesFound: 0
        };
        this.foldersWithModels = new Map();

        try {
            console.log(`Starting scan of directory: ${modelDirectory}`);

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

            // Clear existing models before rescanning
            this.clearExistingModels();

            // Phase 1: Recursively scan and collect model files by folder
            await this.scanDirectoryRecursive(modelDirectory, modelDirectory);

            // Phase 2: Index folders as models (includes image extraction from archives)
            await this.indexFoldersAsModels(modelDirectory);

            console.log(`Scan complete!`);
            console.log(`- Models (folders): ${this.progress.modelsFound}`);
            console.log(`- Model files: ${this.progress.modelFilesFound}`);
            console.log(`- Assets (images/PDFs): ${this.progress.assetsFound}`);
            console.log(`- Loose files: ${this.progress.looseFilesFound}`);

            return this.progress;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Scan failed:`, message);
            throw error;
        } finally {
            this.scanning = false;
        }
    }

    private clearExistingModels(): void {
        db.prepare('DELETE FROM models').run();
        db.prepare('DELETE FROM model_files').run();
        db.prepare('DELETE FROM model_assets').run();
        db.prepare('DELETE FROM loose_files').run();
        console.log('Cleared existing data from database');
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
                        const folderPath = path.dirname(fullPath);
                        const relativePath = path.relative(rootPath, fullPath);
                        const pathDepth = relativePath.split(path.sep).length;

                        // Check if file is loose (in root or directly in a category folder)
                        // pathDepth 1 = root directory (e.g., "model.stl")
                        // pathDepth 2 = one level deep (e.g., "Toys/model.stl")
                        if (pathDepth <= 2) {
                            this.trackLooseFile(fullPath);
                            this.progress.looseFilesFound++;
                        } else {
                            // Get file dates
                            const stats = fs.statSync(fullPath);
                            const fileAdded = stats.mtime;
                            const fileCreated = stats.birthtime;

                            // Add to folder's model files collection
                            if (!this.foldersWithModels.has(folderPath)) {
                                this.foldersWithModels.set(folderPath, {
                                    files: [],
                                    earliestAdded: null,
                                    earliestCreated: null
                                });
                            }
                            const folderData = this.foldersWithModels.get(folderPath)!;
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
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error scanning directory ${currentPath}:`, message);
        }
    }

    private async indexFoldersAsModels(rootPath: string): Promise<void> {
        const modelsNeedingImages: Array<{ modelId: number; folderPath: string }> = [];

        for (const [folderPath, folderData] of this.foldersWithModels.entries()) {
            try {
                const folderName = path.basename(folderPath);
                const cleanedName = cleanupFolderName(folderName);
                const category = this.extractCategory(folderPath, rootPath);
                const isPaid = this.isInFolder(folderPath, rootPath, 'Paid');
                const isOriginal = this.isInFolder(folderPath, rootPath, 'Original Creations');

                // Format dates as ISO strings
                const dateAdded = folderData.earliestAdded?.toISOString() || null;
                const dateCreated = folderData.earliestCreated?.toISOString() || null;

                // Insert model (folder) into database
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

                const modelId = Number(result.lastInsertRowid);

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

                this.progress.modelsFound++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`Error indexing folder ${folderPath}:`, message);
            }
        }

        // Extract images from archives for models without images
        if (modelsNeedingImages.length > 0) {
            console.log(`Extracting images from archives for ${modelsNeedingImages.length} models...`);
            for (const { modelId, folderPath } of modelsNeedingImages) {
                await this.extractImageFromArchives(modelId, folderPath);
            }
        }
    }

    private trackLooseFile(filepath: string): void {
        try {
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
            const files = fs.readdirSync(folderPath);

            for (const file of files) {
                const assetPath = path.join(folderPath, file);

                // Skip directories
                try {
                    const stat = fs.statSync(assetPath);
                    if (stat.isDirectory()) continue;
                } catch (e) {
                    continue;
                }

                let assetType: string | null = null;
                let isPrimary = false;

                if (isImageFile(assetPath)) {
                    assetType = 'image';
                    // First image becomes primary
                    const existingImages = db.prepare('SELECT COUNT(*) as count FROM model_assets WHERE model_id = ? AND asset_type = ?').get(modelId, 'image') as { count: number };
                    isPrimary = existingImages.count === 0;
                } else if (isDocumentFile(assetPath)) {
                    assetType = 'pdf';
                }

                if (assetType) {
                    const insert = db.prepare(`
                        INSERT INTO model_assets (model_id, filepath, asset_type, is_primary)
                        VALUES (?, ?, ?, ?)
                    `);

                    insert.run(modelId, assetPath, assetType, isPrimary ? 1 : 0);
                    this.progress.assetsFound++;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error indexing assets for ${folderPath}:`, message);
        }
    }

    private hasPrimaryImage(modelId: number): boolean {
        const result = db.prepare('SELECT COUNT(*) as count FROM model_assets WHERE model_id = ? AND asset_type = ?').get(modelId, 'image') as { count: number };
        return result.count > 0;
    }

    private async extractImageFromArchives(modelId: number, folderPath: string): Promise<void> {
        try {
            const files = fs.readdirSync(folderPath);

            // Collect .3mf files and photo zips with their dates
            const archives: Array<{ path: string; type: '3mf' | 'photozip'; date: Date }> = [];

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                const ext = path.extname(file).toLowerCase();
                const baseName = path.basename(file, ext).toLowerCase();

                try {
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) continue;

                    if (ext === '.3mf') {
                        archives.push({ path: filePath, type: '3mf', date: stat.mtime });
                    } else if (ext === '.zip') {
                        // Check if it's a photo zip (Photos.zip, images.zip, pictures.zip, etc.)
                        const photoKeywords = ['photo', 'image', 'picture', 'pic', 'img', 'thumbnail', 'preview'];
                        if (photoKeywords.some(kw => baseName.includes(kw))) {
                            archives.push({ path: filePath, type: 'photozip', date: stat.mtime });
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

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
