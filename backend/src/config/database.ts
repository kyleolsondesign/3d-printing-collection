import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/collection.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase(): void {
    // Models table - stores folders containing 3D models (one entry per folder)
    db.exec(`
        CREATE TABLE IF NOT EXISTS models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL UNIQUE,
            category TEXT,
            is_paid INTEGER DEFAULT 0,
            is_original INTEGER DEFAULT 0,
            file_count INTEGER DEFAULT 0,
            date_added TEXT,
            date_created TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_scanned TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Add date columns if they don't exist (migration for existing databases)
    try {
        db.exec(`ALTER TABLE models ADD COLUMN date_added TEXT`);
    } catch (e) {
        // Column already exists, ignore
    }
    try {
        db.exec(`ALTER TABLE models ADD COLUMN date_created TEXT`);
    } catch (e) {
        // Column already exists, ignore
    }
    // Add deleted_at for soft deletes
    try {
        db.exec(`ALTER TABLE models ADD COLUMN deleted_at TEXT`);
    } catch (e) {
        // Column already exists, ignore
    }

    // Add is_hidden for hiding thumbnails without deleting files
    try {
        db.exec(`ALTER TABLE model_assets ADD COLUMN is_hidden INTEGER DEFAULT 0`);
    } catch (e) {
        // Column already exists, ignore
    }

    // Model files table - stores all actual model files in a folder
    db.exec(`
        CREATE TABLE IF NOT EXISTS model_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL UNIQUE,
            file_size INTEGER,
            file_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        )
    `);

    // Model assets - images, PDFs associated with models
    db.exec(`
        CREATE TABLE IF NOT EXISTS model_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER,
            filepath TEXT NOT NULL,
            asset_type TEXT,
            is_primary INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        )
    `);

    // Favorites
    db.exec(`
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            UNIQUE(model_id)
        )
    `);

    // Printed models tracking
    db.exec(`
        CREATE TABLE IF NOT EXISTS printed_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            printed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            rating TEXT CHECK(rating IN ('good', 'bad')),
            notes TEXT,
            print_time_hours REAL,
            filament_used_grams REAL,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        )
    `);

    // Print queue
    db.exec(`
        CREATE TABLE IF NOT EXISTS print_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            priority INTEGER DEFAULT 0,
            notes TEXT,
            estimated_time_hours REAL,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            UNIQUE(model_id)
        )
    `);

    // Configuration
    db.exec(`
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Loose files - files not in folders that need organizing
    db.exec(`
        CREATE TABLE IF NOT EXISTS loose_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL UNIQUE,
            file_size INTEGER,
            file_type TEXT,
            category TEXT,
            discovered_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tags table - for categorizing models with multiple tags
    db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Model tags - many-to-many relationship
    db.exec(`
        CREATE TABLE IF NOT EXISTS model_tags (
            model_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (model_id, tag_id),
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    `);

    // Create indexes
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_models_category ON models(category);
        CREATE INDEX IF NOT EXISTS idx_models_filename ON models(filename);
        CREATE INDEX IF NOT EXISTS idx_models_filepath ON models(filepath);
        CREATE INDEX IF NOT EXISTS idx_models_deleted_at ON models(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_favorites_model ON favorites(model_id);
        CREATE INDEX IF NOT EXISTS idx_printed_model ON printed_models(model_id);
        CREATE INDEX IF NOT EXISTS idx_queue_priority ON print_queue(priority DESC, added_at);
    `);

    // Create full-text search virtual table
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
            filename,
            filepath,
            category,
            content=models,
            content_rowid=id
        )
    `);

    // Triggers to keep FTS table in sync
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS models_fts_insert AFTER INSERT ON models BEGIN
            INSERT INTO models_fts(rowid, filename, filepath, category)
            VALUES (new.id, new.filename, new.filepath, new.category);
        END
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS models_fts_delete AFTER DELETE ON models BEGIN
            DELETE FROM models_fts WHERE rowid = old.id;
        END
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS models_fts_update AFTER UPDATE ON models BEGIN
            UPDATE models_fts
            SET filename = new.filename, filepath = new.filepath, category = new.category
            WHERE rowid = new.id;
        END
    `);

    console.log('Database initialized successfully');
}

// Initialize on first load
initializeDatabase();

export default db;
