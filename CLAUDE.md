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
      BrowseView.vue      # Main model browsing interface
      FavoritesView.vue   # Favorites list
      PrintedView.vue     # Print history
      QueueView.vue       # Print queue
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
- **models**: All discovered model files with metadata (category, file type, paid/original flags)
- **model_assets**: Associated images and PDFs for each model
- **favorites**: User's favorited models with optional notes
- **printed_models**: Print history with ratings (good/bad) and notes
- **print_queue**: Queue of models to print with priority ordering
- **config**: Application configuration (model directory path)

### Full-Text Search
- Uses SQLite FTS5 virtual table (`models_fts`) for fast keyword search
- Automatically synced with models table via triggers

## Key Implementation Details

### File Scanning
The scanner service (backend/src/services/scanner.ts) recursively scans the model directory:
1. Discovers all model files (STL, 3MF, gcode, OBJ, PLY, AMF) and archives (zip, rar, 7z)
2. Extracts category from folder structure
3. Detects special folders: "Paid" and "Original Creations"
4. Finds associated images (.jpg, .png, .gif, .webp) and PDFs in the same directory
5. Indexes everything into SQLite database

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
- `/api/models` - Browse and search models
- `/api/favorites` - Manage favorites
- `/api/printed` - Track print history
- `/api/queue` - Manage print queue
- `/api/system` - Config, scanning, statistics

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

## Future Enhancements
- Zip file extraction and viewing
- 3D model preview (STL viewer)
- Thumbnail generation for models
- File system watcher for auto-refresh
- Drag-and-drop reordering for print queue
- Export/import favorites and queue
- Print statistics and analytics
