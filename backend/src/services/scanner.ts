import fs from 'fs';
import path from 'path';
import db from '../config/database.js';
import { isModelFile, isImageFile, isDocumentFile, isArchiveFile } from '../utils/fileTypes.js';

interface ScanProgress {
    totalFiles: number;
    processedFiles: number;
    modelsFound: number;
    assetsFound: number;
}

class Scanner {
    private scanning: boolean = false;
    private progress: ScanProgress = {
        totalFiles: 0,
        processedFiles: 0,
        modelsFound: 0,
        assetsFound: 0
    };

    async scanDirectory(modelDirectory: string): Promise<ScanProgress> {
        if (this.scanning) {
            throw new Error('Scan already in progress');
        }

        this.scanning = true;
        this.progress = {
            totalFiles: 0,
            processedFiles: 0,
            modelsFound: 0,
            assetsFound: 0
        };

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

            // Recursively scan directory
            await this.scanDirectoryRecursive(modelDirectory, modelDirectory);

            console.log(`Scan complete. Found ${this.progress.modelsFound} models and ${this.progress.assetsFound} assets`);
            console.log(`Total files examined: ${this.progress.totalFiles}`);

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
        db.prepare('DELETE FROM model_assets').run();
        console.log('Cleared existing models from database');
    }

    private async scanDirectoryRecursive(currentPath: string, rootPath: string): Promise<void> {
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            console.log(`Scanning ${currentPath}: found ${entries.length} entries`);

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // Skip hidden files and node_modules
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    console.log(`  Skipping hidden/node_modules: ${entry.name}`);
                    continue;
                }

                if (entry.isDirectory()) {
                    console.log(`  Entering directory: ${entry.name}`);
                    // Recursively scan subdirectory
                    await this.scanDirectoryRecursive(fullPath, rootPath);
                } else if (entry.isFile()) {
                    this.progress.totalFiles++;
                    const ext = path.extname(fullPath).toLowerCase();

                    console.log(`  File: ${entry.name} (ext: ${ext})`);

                    // Check if it's a model file
                    if (isModelFile(fullPath)) {
                        console.log(`    -> Indexing as model`);
                        this.indexModel(fullPath, rootPath);
                    } else if (isArchiveFile(fullPath)) {
                        console.log(`    -> Indexing as archive`);
                        // Index zip files as models
                        this.indexModel(fullPath, rootPath);
                    } else {
                        console.log(`    -> Skipping (not a model file)`);
                    }

                    this.progress.processedFiles++;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error scanning directory ${currentPath}:`, message);
        }
    }

    private indexModel(filepath: string, rootPath: string): void {
        try {
            const stats = fs.statSync(filepath);
            const filename = path.basename(filepath);
            const ext = path.extname(filepath).toLowerCase();

            // Extract category from folder structure
            const category = this.extractCategory(filepath, rootPath);

            // Check if in special folders
            const isPaid = this.isInFolder(filepath, rootPath, 'Paid');
            const isOriginal = this.isInFolder(filepath, rootPath, 'Original Creations');

            // Determine file type
            const fileType = ext.replace('.', '');

            // Insert model into database
            const insert = db.prepare(`
                INSERT INTO models (filename, filepath, file_size, file_type, category, is_paid, is_original)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const result = insert.run(
                filename,
                filepath,
                stats.size,
                fileType,
                category,
                isPaid ? 1 : 0,
                isOriginal ? 1 : 0
            );

            const modelId = Number(result.lastInsertRowid);

            // Find and index associated assets (images, PDFs)
            this.indexAssets(modelId, filepath);

            this.progress.modelsFound++;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error indexing model ${filepath}:`, message);
        }
    }

    private indexAssets(modelId: number, modelFilepath: string): void {
        const modelDir = path.dirname(modelFilepath);
        const modelBasename = path.basename(modelFilepath, path.extname(modelFilepath));

        try {
            const files = fs.readdirSync(modelDir);

            for (const file of files) {
                const assetPath = path.join(modelDir, file);

                // Skip the model file itself
                if (assetPath === modelFilepath) {
                    continue;
                }

                let assetType: string | null = null;
                let isPrimary = false;

                if (isImageFile(assetPath)) {
                    assetType = 'image';
                    // Prefer images with same basename as model
                    isPrimary = file.startsWith(modelBasename);
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
            console.error(`Error indexing assets for ${modelFilepath}:`, message);
        }
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
