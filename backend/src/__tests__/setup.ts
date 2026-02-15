import Database from 'better-sqlite3';

/**
 * Initialize the full schema on an existing database instance.
 * Drops all tables first to ensure clean state for tests.
 */
export function initSchema(db: InstanceType<typeof Database>): void {
    db.pragma('foreign_keys = OFF');

    // Drop triggers and FTS table first
    db.exec(`DROP TRIGGER IF EXISTS models_fts_insert`);
    db.exec(`DROP TRIGGER IF EXISTS models_fts_delete`);
    db.exec(`DROP TRIGGER IF EXISTS models_fts_update`);
    db.exec(`DROP TABLE IF EXISTS models_fts`);

    // Drop tables in dependency order
    const tables = ['make_images', 'model_metadata', 'model_tags', 'model_files', 'model_assets', 'favorites', 'printed_models', 'print_queue', 'tags', 'config', 'models'];
    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }

    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE models (
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
            last_scanned TEXT DEFAULT CURRENT_TIMESTAMP,
            deleted_at TEXT
        )
    `);

    db.exec(`
        CREATE TABLE model_files (
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

    db.exec(`
        CREATE TABLE model_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER,
            filepath TEXT NOT NULL,
            asset_type TEXT,
            is_primary INTEGER DEFAULT 0,
            is_hidden INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            UNIQUE(model_id)
        )
    `);

    db.exec(`
        CREATE TABLE printed_models (
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

    db.exec(`
        CREATE TABLE make_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            printed_model_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (printed_model_id) REFERENCES printed_models(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE print_queue (
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

    db.exec(`
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE model_metadata (
            model_id INTEGER PRIMARY KEY,
            source_platform TEXT,
            source_url TEXT,
            designer TEXT,
            designer_url TEXT,
            description TEXT,
            license TEXT,
            license_url TEXT,
            extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE model_tags (
            model_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (model_id, tag_id),
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE INDEX idx_models_category ON models(category);
        CREATE INDEX idx_models_filename ON models(filename);
        CREATE INDEX idx_models_filepath ON models(filepath);
        CREATE INDEX idx_models_deleted_at ON models(deleted_at);
        CREATE INDEX idx_favorites_model ON favorites(model_id);
        CREATE INDEX idx_printed_model ON printed_models(model_id);
        CREATE INDEX idx_queue_priority ON print_queue(priority DESC, added_at);
    `);

    // Full-text search table and triggers
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
            filename, filepath, category,
            content=models, content_rowid=id
        )
    `);
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
}

/**
 * Seeds test data: 3 models with assets, 1 printed, 1 queued, 1 favorited.
 */
export function seedTestData(db: InstanceType<typeof Database>): void {
    db.prepare(`INSERT INTO models (id, filename, filepath, category, file_count) VALUES (?, ?, ?, ?, ?)`).run(1, 'Test Model A', '/test/models/a', 'Toys', 3);
    db.prepare(`INSERT INTO models (id, filename, filepath, category, file_count) VALUES (?, ?, ?, ?, ?)`).run(2, 'Test Model B', '/test/models/b', 'Tools', 1);
    db.prepare(`INSERT INTO models (id, filename, filepath, category, file_count) VALUES (?, ?, ?, ?, ?)`).run(3, 'Test Model C', '/test/models/c', 'Toys', 2);

    db.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary) VALUES (?, ?, ?, ?, ?)`).run(1, 1, '/test/models/a/image1.jpg', 'image', 1);
    db.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary) VALUES (?, ?, ?, ?, ?)`).run(2, 1, '/test/models/a/image2.jpg', 'image', 0);
    db.prepare(`INSERT INTO model_assets (id, model_id, filepath, asset_type, is_primary) VALUES (?, ?, ?, ?, ?)`).run(3, 2, '/test/models/b/preview.png', 'image', 1);

    db.prepare(`INSERT INTO model_files (model_id, filename, filepath, file_size, file_type) VALUES (?, ?, ?, ?, ?)`).run(1, 'model.stl', '/test/models/a/model.stl', 50000, 'stl');
    db.prepare(`INSERT INTO model_files (model_id, filename, filepath, file_size, file_type) VALUES (?, ?, ?, ?, ?)`).run(1, 'model.3mf', '/test/models/a/model.3mf', 30000, '3mf');

    db.prepare(`INSERT INTO printed_models (id, model_id, rating) VALUES (?, ?, ?)`).run(1, 1, 'good');
    db.prepare(`INSERT INTO print_queue (id, model_id, priority) VALUES (?, ?, ?)`).run(1, 2, 5);
    db.prepare(`INSERT INTO favorites (id, model_id) VALUES (?, ?)`).run(1, 3);
}
