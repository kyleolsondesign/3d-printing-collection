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

**Important**: There is no root-level `build` command. Both backend and frontend use hot-reload in development (`npm run dev`). Build commands only exist within the `backend/` and `frontend/` subdirectories.

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

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
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
      ingestion.ts        # Model ingestion from external folders
    services/
      scanner.ts          # Directory scanning and indexing
    utils/
      fileTypes.ts        # File type detection
      finderTags.ts       # macOS Finder tag read/write utilities
      nameCleanup.ts      # Folder name cleanup utilities
    server.ts             # Express server entry point
  data/
    collection.db         # SQLite database

frontend/
  src/
    components/           # Reusable Vue components
    views/
      BrowseView.vue      # Main model browsing interface with "Show in Finder" buttons
      FavoritesView.vue   # Favorites list
      PrintedView.vue     # Print history
      QueueView.vue       # Print queue
      LooseFilesView.vue  # Review and organize loose files
      IngestionView.vue   # Import models from external folder
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
  - `deleted_at`: Soft delete timestamp (NULL = active, set = deleted)
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

**No Verbose Logging**: Scanner only logs summary stats at completion. Model paths in logs use relative paths from the model root directory.

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
- `/api/ingestion` - Model ingestion from external folders (scan, config, import)

File serving uses secure path validation to prevent directory traversal attacks (backend/src/routes/models.ts).

### Frontend State Management
Pinia store (frontend/src/store/index.ts) manages:
- Models list with pagination
- Categories for filtering
- Search state
- Loading states
- Toggle actions for favorites/queue

### Testing
**Important: Always update or add tests when making changes.** When adding new features, fixing bugs, or modifying existing behavior, corresponding tests must be written or updated. Run `npm run test` in both `frontend/` and `backend/` to verify before committing.

**Frontend Tests:**
- Framework: Vitest with Vue Test Utils + happy-dom
- Tests located in `frontend/src/__tests__/`
- `store.test.ts`: Pinia store initialization and computed properties
- `api.test.ts`: API client method calls and URL construction
- `ModelDetailsModal.test.ts`: Component rendering, user interactions, API integration

**Backend Tests:**
- Framework: Vitest with supertest for HTTP endpoint testing
- Tests located in `backend/src/__tests__/`
- `setup.ts`: Shared test helpers (`initSchema`, `seedTestData`) for in-memory SQLite
- `models.test.ts`: Browse filters, inline name editing, asset hide/unhide, primaryImage filtering
- `printed.test.ts`: Print toggle, queue removal, rating updates, make image CRUD

**Test Patterns:**
- Backend tests use `vi.hoisted` + `vi.mock` to inject an in-memory SQLite database
- Backend tests mock `finderTags.js` (macOS-specific functionality)
- Frontend tests mock the API module with `vi.mock('../services/api')`
- Each `beforeEach` reinitializes schema + seeds fresh test data for isolation

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
- **Folders = Models**: Each folder containing model files is treated as one model, unless it's a "container" folder
- **Container folders** (never treated as models, model files in them are loose):
  - Depth 1 folders (direct children of root) are category folders (e.g., `Toys/`, `Tools/`)
  - Folders starting with `~` are organizational containers at any depth
  - Folders starting with `!` are completely ignored (skipped during scan)
  - Direct children of `Paid/` are designer folders, regardless of where `Paid` appears in the hierarchy (e.g., `Paid/DesignerName/` or `Shared 3D Models/Paid/DesignerName/`)
- **Multiple files per model**: All files in a folder are indexed as alternate versions/formats
  - Example: A folder with 3 STL files → 1 model with 3 file versions
  - No "duplicates" - all files are considered part of the same model
- **Loose files management**: Files in root OR directly in category folders are tracked separately
  - Example: `Toys/model.stl` is loose (needs a folder), `Toys/MyModel/model.stl` is indexed
- **Loose files review page**: Dedicated page to review and organize unorganized files
  - Click anywhere on a file card to toggle selection (buttons use `@click.stop`)
  - Search filtering: Global search bar filters loose files by filename, file type, and category
  - Organize summary: After organizing files, a detailed per-file results panel shows each file's outcome (success with new folder name, or failure with error message)
- **Show in Finder**: Button on each model card to quickly open the containing folder
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

### Scan Modes
Three scan modes available in Settings:
- **Sync (Recommended)**: Non-destructive sync that updates existing records, adds new models, and soft-deletes models whose folders no longer exist. Preserves favorites, print history, and queue.
- **Add Only**: Only adds new models that don't exist in the database. Never modifies or deletes existing records.
- **Full Rebuild**: Clears all model data and rescans from scratch. Favorites, history, and queue are saved before clearing and restored by matching filepaths after rebuild.

### Soft Deletes
- Models use soft deletion (deleted_at timestamp) instead of hard deletion
- Deleted models are filtered out of queries by default
- If a deleted model's folder reappears, it's automatically restored during sync
- Stats page shows count of deleted models

### macOS Finder Tag Integration
The app integrates with macOS Finder tags to sync print status:

**Tag Color Meanings:**
- **Green tag**: Model has been printed with "good" rating
- **Red tag**: Model has been printed with "bad" rating
- **Blue tag**: Model is in the print queue

**Reading Tags (during scan):**
- Scanner reads Finder tags from model folders
- Automatically creates printed_models/print_queue records based on tags
- Existing records are preserved (tags only create new records)

**Writing Tags (on UI changes):**
- Adding/updating printed status updates folder's Green/Red tag
- Adding/removing from queue updates folder's Blue tag
- Tags are synced immediately when changes are made in the UI

**Implementation:**
- Uses `mdls` command to read tags
- Uses `xattr` with binary plist to write tags
- Tag utility: `backend/src/utils/finderTags.ts`

### Nested Folder Handling
- Model folders can contain nested subfolders (variants, parts, etc.)
- Parent folder at depth 3 (root/category/model-folder) is the model
- All files in nested subfolders are attributed to the parent model
- Assets (images, PDFs) are also searched recursively in subfolders
- **Paid folder**: `Paid/{designer}/{model}/` — depth-3 folders under Paid are always treated as models, even if model files only exist in nested subfolders

### Performance with Large Collections
- Successfully tested with 38k+ models and 33k+ assets
- Pagination handles large result sets efficiently
- Database queries optimized with proper indexing
- Image loading with error handling for missing/broken files
- Deduplication reduces indexed models for folders with multiple versions

### Global Navigation & Search
- **Global search bar**: Search input moved to navbar, accessible from any view
- **Context-aware search**: Search results show in the current view's format with thumbnails and status
- **Settings search redirect**: Searching from the settings tab redirects to browse and applies the search there
- **Search clears on tab change**: Navigating between tabs clears the search field and results
- **Dynamic placeholder**: Search placeholder reflects the current view (e.g., "Search favorites...")
- **URL query params**: State is synced to URL for deep-linking
  - Supported params: `category`, `q` (search), `sort`, `order`, `view`, `model`
  - Example: `/?category=Toys&sort=name&order=asc&view=table`
  - Deep link to model: `/?model=123` opens model details modal

### Bulk Operations
- **Selection mode**: Toggle to enable multi-select on browse, queue, and favorites pages
- **Bulk actions on browse**: Add to favorites, add to queue, remove from queue, mark as printed, soft delete
- **Bulk remove**: Queue and favorites pages support bulk removal
- **Visual feedback**: Selected items highlighted, action buttons disabled when none selected

### Queue Management
- **Drag-and-drop reorder**: Reorder queue items by dragging
- **Priority persistence**: Order is saved to database via reorder API

### ZIP Extraction
- **Extract archives**: Extract ZIP/RAR/7z files from model details modal
- **Auto-cleanup**: Original archive moved to macOS Trash after extraction
- **Auto-rescan**: Model folder rescanned after extraction to update assets

### Thumbnail Selection
- **Choose primary image**: When multiple images exist, select which one appears on model cards
- **Set as Primary button**: Hover over thumbnail in details modal to set it

### Enhanced Scan Progress
- **Step tracking**: Shows current scan phase (discovering, indexing, extracting, tagging)
- **Step descriptions**: Human-readable status messages during scan
- **Scan prevention**: UI prevents starting new scans while one is in progress
- **Elapsed timer**: Shows running elapsed time during scan
- **Completion summary**: Shows scan type (Sync/Full rebuild/Add-only) and total duration on completion
- **Polling interval**: Frontend polls scan status every 10 seconds during active scans

### Print Workflow
- **Printed removes from queue**: Marking a model as printed automatically removes it from the print queue
- **Mark as printed from modal**: Model details modal has good/bad print rating buttons
- **Mark as printed from queue**: Queue items have a thumbs-up button to mark as printed (removes from queue)
- **Rating toggle on printed view**: Printed view shows clickable good/bad rating buttons to change rating
- **Printed view sorting**: Sorted by print date (descending), secondary sort by model date_added
- **3-state print cycle**: `POST /printed/cycle` endpoint cycles: not printed → good → bad → not printed
- **Cycle from browse**: Browse view uses `cyclePrinted()` store action for single-button print toggle
- **Escape key closes modal**: Press Escape to close the model details modal
- **Arrow key navigation**: Left/Right arrow keys navigate between models in the modal; hover arrows on screen edges
- **Clickable files in modal**: Click any model file in the details modal to reveal it in Finder
- **Show in Finder**: Uses `open -R` to reveal and select the item in Finder (works for both files and folders)

### View Consistency
- **Thumbnails everywhere**: Favorites, Queue, Printed views all show model thumbnail images (56x56px)
- **Clickable modal**: All secondary views (Favorites, Queue, Printed) open the model details modal when clicked
- **Data refresh**: Modal changes (favorites, queue, printed status) trigger a reload of the current view's data
- **Backend image support**: Favorites, Queue, and Printed API endpoints include `primaryImage` from model_assets

### Browse Filters
- **Hide Printed filter**: Toggle button to exclude printed models from browse results (default: on)
- **Hide Queued filter**: Toggle button to exclude queued models from browse results (default: off)
- **Server-side filtering**: Filters use `NOT EXISTS` subqueries for accurate pagination
- **URL persistence**: Filter state is synced to URL query params (`hidePrinted`, `hideQueued`)

### Thumbnail Management
- **Hide thumbnails**: Hide unwanted images from a model without deleting files (`is_hidden` flag on model_assets)
- **Hide button**: Hover over non-primary thumbnail in details modal to reveal hide button (eye-slash icon)
- **Filtered queries**: All primaryImage queries across all endpoints filter out hidden assets

### Inline Model Name Editing
- **Edit name in modal**: Click the pencil icon next to model name to edit inline
- **Keyboard support**: Enter to save, Escape to cancel
- **Backend endpoint**: `PATCH /api/models/:id` updates the model filename in the database

### PDF Image Extraction
- **Embedded image extraction**: Uses `pdfimages` (from poppler) to extract embedded images from PDFs
- **First page only**: Only extracts images from the first page of each PDF
- **Format handling**: Extracts JPEG natively, converts TIFF/PPM to JPEG via `sips`
- **Largest image wins**: When multiple images are extracted, picks the largest one
- **Fallback strategy**: PDF extraction runs after archive extraction fails for models without images
- **Requires**: `brew install poppler` for the `pdfimages` command

### Make Photos
- **Upload make photos**: Upload photos of printed models ("makes") via file upload in the model details modal
- **Makes section**: Visible when a model is marked as printed, shows gallery of uploaded photos
- **File storage**: Uploaded images stored in `backend/data/makes/` directory
- **Database**: `make_images` table links photos to `printed_models` records
- **Upload handling**: Uses multer middleware with 20MB limit, image-only file filter
- **Serving**: Make images served via `/api/printed/make-image/:filename`

### Model Ingestion
- **Ingestion view**: Dedicated "Import" tab for importing models from an external folder (e.g., Downloads)
- **Configurable directory**: Ingestion folder path stored in config table (default: `/Users/kyle/Downloads`)
- **Auto-scan**: Scans ingestion folder for model files and folders containing model files
- **Category suggestion**: Fuzzy-matches item names against existing categories with confidence indicators (high/medium/low)
- **Editable categories**: Users can accept, change, or type new category names before importing
- **Bulk import**: Select multiple items and import them all at once with per-item results
- **File organization**: Single files get wrapped in cleaned-up folders; existing folders are moved as-is into the category directory
- **Auto-indexing**: After moving files, calls `scanner.scanSingleFolder()` to index the new model
- **API endpoints**: `GET/POST /api/ingestion/config`, `GET /api/ingestion/scan`, `POST /api/ingestion/import`

## Future Enhancements
- 3D model preview (STL viewer)
- Thumbnail generation for models (resize large images)
- File system watcher for auto-refresh
- Export/import favorites and queue
- Print statistics and analytics
- Lazy loading for images (only load visible thumbnails)
