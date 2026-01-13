# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

3D Printing Collection Manager is a local web application for browsing and managing 3D printing model collections. It allows users to:
- Browse models organized by category (toys, tools, Paid, Original Creations, etc.)
- Search models by keywords using full-text search
- Manage favorites, print queue, and printed models history
- Track print quality ratings (good/bad)
- Automatically discover images and PDFs associated with models

**Model Directory**: `/Users/kyle/Library/Mobile Documents/com~apple~CloudDocs/Documents/3D Printing`

## Architecture

**Type**: Monorepo with separate backend and frontend
- **Backend**: TypeScript + Node.js + Express + SQLite
- **Frontend**: TypeScript + Vue 3 + Vite + Pinia

## Commands

### Development
```bash
# Install all dependencies
npm run install:all

# Run both backend and frontend in development mode
npm run dev

# Run backend only
npm run dev:backend

# Run frontend only
npm run dev:frontend
```

### Backend Commands
```bash
cd backend

# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

### Frontend Commands
```bash
cd frontend

# Development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
backend/
  src/
    config/
      database.ts         # SQLite setup, schema, FTS5 triggers
    routes/
      models.ts           # Browse, search, file serving
      favorites.ts        # Favorites management
      printed.ts          # Print history tracking
      queue.ts            # Print queue management
      system.ts           # Config, scanning, stats
    services/
      scanner.ts          # Directory scanning and indexing
    utils/
      fileTypes.ts        # File type detection
    server.ts             # Express server entry point
  data/
    collection.db         # SQLite database

frontend/
  src/
    components/           # Reusable Vue components
    views/
      BrowseView.vue      # Main model browsing interface with "Open in Finder" buttons
      FavoritesView.vue   # Favorites list
      PrintedView.vue     # Print history
      QueueView.vue       # Print queue
      LooseFilesView.vue  # Review and organize loose files
      SettingsView.vue    # Configuration and scanning
    router/
      index.ts            # Vue Router setup
    services/
      api.ts              # API client with typed endpoints
    store/
      index.ts            # Pinia store for global state
    __tests__/            # Vitest tests
    main.ts               # Vue app entry point
    App.vue               # Root component
```

## Database Schema

### Core Tables
- **models**: Folders containing 3D models (one entry per folder)
  - `filename`: Folder name
  - `filepath`: Path to the folder
  - `category`: Primary category extracted from folder structure
  - `file_count`: Number of model files in the folder
  - Excludes loose files (files in root directory)
- **model_files**: All actual model files within each folder
  - Multiple files per model (alternate versions, different formats)
  - Links to parent model via `model_id`
- **model_assets**: Associated images and PDFs for each model
- **tags**: Tag names for categorizing models
- **model_tags**: Many-to-many relationship for models with multiple tags/categories
- **favorites**: User's favorited models with optional notes
- **printed_models**: Print history with ratings (good/bad) and notes
- **print_queue**: Queue of models to print with priority ordering
- **config**: Application configuration (model directory path)
- **loose_files**: Files in root directory that need organizing (not indexed as models)

### Full-Text Search
- Uses SQLite FTS5 virtual table (`models_fts`) for fast keyword search
- Automatically synced with models table via triggers

## Key Implementation Details

### File Scanning
The scanner service (backend/src/services/scanner.ts) recursively scans the model directory:

**Phase 1: File Discovery**
1. Recursively scan all directories
2. Discover all model files (STL, 3MF, gcode, OBJ, PLY, AMF) and archives (zip, rar, 7z)
3. Group model files by their containing folder
4. **Loose files**: Files in root directory are tracked separately in `loose_files` table
   - Not indexed as models until organized into folders
   - Can be reviewed on dedicated "Loose Files" page

**Phase 2: Folder Indexing**
1. **Treat each folder as one model**
   - Create one `models` entry per folder containing model files
   - Store folder name and path
   - All files in the folder are variations/formats of the same model
2. **Index all model files** in each folder to `model_files` table
   - Multiple STL/3MF/etc files → alternate versions or parts
   - Track file count for each model
3. Extracts primary category from folder structure
4. Detects special folders: "Paid" and "Original Creations"
5. Finds associated images (.jpg, .png, .gif, .webp) and PDFs in the folder
6. First image found becomes the primary image

**No Verbose Logging**: Scanner only logs summary stats at completion

**Category Logic**:
- If path contains "Paid" → category = "Paid"
- If path contains "Original Creations" → category = "Original Creations"
- Otherwise, first directory level becomes category
- Models in root directory → "Uncategorized"

### Asset Association
For each model file, the scanner looks for:
- **Images**: Prefers images with matching basename (e.g., `model.stl` → `model.jpg`)
- **PDFs**: All PDFs in the same directory

### API Architecture
All API endpoints are in `/api/*`:
- `/api/models` - Browse and search models (includes primary image for each model)
- `/api/favorites` - Manage favorites
- `/api/printed` - Track print history
- `/api/queue` - Manage print queue
- `/api/system` - Config, scanning, statistics, loose files
- `/api/system/loose-files` - Get all loose files that need organizing
- `/api/system/open-folder` - Open a folder in macOS Finder

File serving uses secure path validation to prevent directory traversal attacks (backend/src/routes/models.ts).

### Frontend State Management
Pinia store (frontend/src/store/index.ts) manages:
- Models list with pagination
- Categories for filtering
- Search state
- Loading states
- Toggle actions for favorites/queue

### Testing
- Framework: Vitest with Vue Test Utils
- Tests located in `frontend/src/__tests__/`
- Example: Store tests with mocked API calls

## TypeScript Configuration

Both backend and frontend use strict TypeScript:
- ES2022 target for backend, ES2020 for frontend
- ES modules throughout
- Source maps enabled for debugging

## Development Workflow

1. **First Time Setup**:
   ```bash
   npm run install:all
   ```

2. **Start Development**:
   ```bash
   npm run dev
   ```
   - Backend: http://localhost:3000
   - Frontend: http://localhost:5173

3. **Configure Model Directory**:
   - Open frontend in browser
   - Go to Settings
   - Set model directory path
   - Click "Save & Scan"

4. **Making Changes**:
   - Backend changes: Auto-reload via tsx watch
   - Frontend changes: Hot module replacement via Vite
   - Both have TypeScript type checking

## API Proxy Configuration

Frontend Vite config (frontend/vite.config.ts) proxies `/api` requests to backend:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true
  }
}
```

## Recent Improvements

### Scan Progress & Performance
- **Progress bar**: Real-time visual progress during directory scanning
- **Live updates**: Frontend polls scan status every 500ms during active scans
- **Smart logging**: Backend logs progress every 1000 files instead of per-file (reduces noise for large collections)
- **Auto-reload stats**: Statistics automatically refresh when scan completes

### Image Display
- **Primary images**: Model cards now display associated images from the model directory
- **Automatic selection**: Prioritizes images with matching filename, falls back to any image in folder
- **Graceful fallback**: Shows package emoji (📦) for models without images
- **Image optimization**: Hover effects and smooth transitions on model cards

### Image Extraction from Archives
For models without standalone images, the scanner automatically extracts images from:
- **.3mf files**: These are ZIP archives that often contain plate preview images
  - Prioritizes `plate_1.png` and similar plate images
  - Falls back to thumbnail/preview images in Metadata folder
  - Uses earliest-dated .3mf file when multiple exist
- **Photo ZIP files**: Archives named with photo keywords (Photos.zip, images.zip, etc.)
  - Extracts the best available image (prefers main/cover images)
- Extracted images are saved to the model folder with `_extracted_` prefix
- Only extracts when no other images exist for the model

### Folder-Based Model Organization
- **Folders = Models**: Each folder containing model files is treated as one model
- **Multiple files per model**: All files in a folder are indexed as alternate versions/formats
  - Example: A folder with 3 STL files → 1 model with 3 file versions
  - No "duplicates" - all files are considered part of the same model
- **Loose files management**: Files in root OR directly in category folders are tracked separately
  - Example: `Toys/model.stl` is loose (needs a folder), `Toys/MyModel/model.stl` is indexed
- **Loose files review page**: Dedicated page to review and organize unorganized files
- **Open in Finder**: Button on each model card to quickly open the containing folder
- **Multi-tag support**: Models can have multiple tags/categories (database schema ready, UI pending)

### Date Tracking & Sorting
- **Date tracking**: Models track earliest file dates from all files in folder
  - `date_added`: Earliest modification time (mtime) of files in model folder
  - `date_created`: Earliest creation time (birthtime) of files in model folder
- **Sorting options**: Sort by Date Added (default), Date Created, Name, or Category
- **Sort order toggle**: Ascending or descending sort order

### Browse View Options
- **Grid view**: Card-based layout with images (default)
- **Table view**: Compact list with columns for name, category, file count, date, actions
- **View toggle**: Switch between grid and table views

### Performance with Large Collections
- Successfully tested with 38k+ models and 33k+ assets
- Pagination handles large result sets efficiently
- Database queries optimized with proper indexing
- Image loading with error handling for missing/broken files
- Deduplication reduces indexed models for folders with multiple versions

## Future Enhancements
- 3D model preview (STL viewer)
- Thumbnail generation for models (resize large images)
- File system watcher for auto-refresh
- Drag-and-drop reordering for print queue
- Export/import favorites and queue
- Print statistics and analytics
- Lazy loading for images (only load visible thumbnails)
