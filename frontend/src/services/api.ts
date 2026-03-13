import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    timeout: 30000
});

export interface Model {
    id: number;
    filename: string;
    filepath: string;
    file_size: number;
    file_type: string;
    file_count: number;
    category: string;
    is_paid: number;
    is_original: number;
    date_added: string | null;
    date_created: string | null;
    created_at: string;
    primaryImage?: string | null;
    isFavorite?: boolean;
    isQueued?: boolean;
    isPrinted?: boolean;
    printRating?: 'good' | 'bad' | null;
    isPrinting?: boolean;
    designer_id?: number | null;
    designer_name?: string | null;
    designer?: string | null;
    source_platform?: string | null;
    source_url?: string | null;
    purge_marked_at?: string | null;
    deleted_at?: string | null;
}

export interface ModelMetadata {
    model_id: number;
    source_platform: string | null;
    source_url: string | null;
    designer: string | null;
    designer_url: string | null;
    description: string | null;
    license: string | null;
    license_url: string | null;
    extracted_at: string | null;
}

export interface ModelAsset {
    id: number;
    model_id: number;
    filepath: string;
    asset_type: 'image' | 'pdf';
    is_primary: number;
}

export interface PrintedModel {
    id: number;
    model_id: number;
    printed_at: string;
    rating: 'good' | 'bad' | null;
    notes: string;
    print_time_hours: number;
    filament_used_grams: number;
}

export interface QueueItem {
    id: number;
    model_id: number;
    added_at: string;
    priority: number;
    notes: string;
    estimated_time_hours: number;
    is_printing?: number;
    printing_started_at?: string | null;
}

export interface Category {
    category: string;
    count: number;
}

export interface ScoreDebugEntry {
    category: string;
    score: number;
    source: 'exact' | 'name' | 'files' | 'tags' | 'text' | 'hint';
}

export interface CategorySuggestion {
    model_id: number;
    model_name: string;
    current_category: string;
    suggested_category: string;
    confidence: 'high' | 'medium' | 'low';
    debug_scores: ScoreDebugEntry[];
}

// Models API
export const modelsApi = {
    getAll: (params?: { page?: number; limit?: number; category?: string; sort?: string; order?: string; hidePrinted?: boolean; hideQueued?: boolean; filterPrinted?: string; filterQueued?: string; filterFavorites?: string; noImage?: boolean; hasPreviewFiles?: boolean; tag?: string; tags?: string; tagMode?: 'and' | 'or' }) =>
        api.get('/models', { params }),

    getById: (id: number) =>
        api.get(`/models/${id}`),

    search: (query: string, sort?: string, order?: string) =>
        api.get('/models/search/query', { params: { q: query, sort, order } }),

    getFileUrl: (filepath: string) =>
        `/api/models/file/serve?path=${encodeURIComponent(filepath)}`,

    rescan: (id: number) =>
        api.post(`/models/${id}/rescan`),

    bulkRescan: (ids: number[]) =>
        api.post('/models/bulk-rescan', { ids }),

    getFiles: (id: number) =>
        api.get(`/models/${id}/files`),

    bulkDelete: (modelIds: number[]) =>
        api.post('/models/bulk-delete', { model_ids: modelIds }),

    bulkReassignCategory: (modelIds: number[], newCategory: string) =>
        api.post('/models/bulk-reassign-category', { model_ids: modelIds, new_category: newCategory }),

    setPrimaryImage: (modelId: number, assetId: number) =>
        api.put(`/models/${modelId}/primary-image`, { assetId }),

    extractZip: (modelId: number, zipPath: string) =>
        api.post(`/models/${modelId}/extract-zip`, { zipPath }, { timeout: 120000 }),

    updateMetadata: (modelId: number, filename: string) =>
        api.patch(`/models/${modelId}`, { filename }),

    updateNotes: (modelId: number, notes: string) =>
        api.patch(`/models/${modelId}`, { notes }),

    hideAsset: (modelId: number, assetId: number, isHidden: boolean) =>
        api.put(`/models/${modelId}/assets/${assetId}/hide`, { isHidden }),

    getRecent: (limit?: number) =>
        api.get('/models/recent', { params: { limit } }),

    recordView: (modelId: number) =>
        api.post(`/models/${modelId}/view`),

    togglePurgeMark: (modelId: number) =>
        api.post(`/models/${modelId}/toggle-purge-mark`),

    suggestCategories: (modelIds: number[], useAi?: boolean) =>
        api.post('/models/suggest-categories', { model_ids: modelIds, use_ai: useAi ?? false }, { timeout: 60000 }),

    savePreviewImage: (modelId: number, imageData: string) =>
        api.post(`/models/${modelId}/save-preview-image`, { imageData }, { timeout: 30000 }),

    extractTempModel: (modelId: number) =>
        api.post(`/models/${modelId}/extract-temp-model`, {}, { timeout: 30000 }),

    cleanupTempModel: (tempPath: string) =>
        api.post('/models/cleanup-temp-model', { tempPath })
};

// Favorites API
export const favoritesApi = {
    getAll: () => api.get('/favorites'),
    toggle: (modelId: number) => api.post('/favorites/toggle', { model_id: modelId }),
    bulk: (modelIds: number[], action: 'add' | 'remove') => api.post('/favorites/bulk', { model_ids: modelIds, action }),
    update: (id: number, notes: string) => api.put(`/favorites/${id}`, { notes }),
    delete: (id: number) => api.delete(`/favorites/${id}`)
};

// Printed Models API
export interface MakeImage {
    id: number;
    printed_model_id: number;
    filename: string;
    filepath: string;
    created_at: string;
}

export const printedApi = {
    getAll: (params?: { page?: number; limit?: number; sort?: string; order?: string; filterFavorites?: string; filterQueued?: string }) =>
        api.get('/printed', { params }),
    toggle: (modelId: number, rating: 'good' | 'bad' = 'good') => api.post('/printed/toggle', { model_id: modelId, rating }),
    cycle: (modelId: number) => api.post('/printed/cycle', { model_id: modelId }),
    bulk: (modelIds: number[], action: 'add' | 'remove', rating: 'good' | 'bad' = 'good') =>
        api.post('/printed/bulk', { model_ids: modelIds, action, rating }),
    add: (data: { model_id: number; rating?: 'good' | 'bad'; notes?: string; print_time_hours?: number; filament_used_grams?: number }) =>
        api.post('/printed', data),
    update: (id: number, data: { rating?: 'good' | 'bad'; notes?: string; print_time_hours?: number; filament_used_grams?: number }) =>
        api.put(`/printed/${id}`, data),
    delete: (id: number) => api.delete(`/printed/${id}`),
    getImages: (printedId: number) => api.get(`/printed/${printedId}/images`),
    uploadImage: (printedId: number, file: File) => {
        const formData = new FormData();
        formData.append('image', file);
        return api.post(`/printed/${printedId}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    deleteImage: (printedId: number, imageId: number) =>
        api.delete(`/printed/${printedId}/images/${imageId}`),
    getMakeImageUrl: (filename: string) =>
        `/api/printed/make-image/${encodeURIComponent(filename)}`
};

// Queue API
export const queueApi = {
    getAll: () => api.get('/queue'),
    toggle: (modelId: number) => api.post('/queue/toggle', { model_id: modelId }),
    bulk: (modelIds: number[], action: 'add' | 'remove') => api.post('/queue/bulk', { model_ids: modelIds, action }),
    add: (data: { model_id: number; priority?: number; notes?: string; estimated_time_hours?: number }) =>
        api.post('/queue', data),
    update: (id: number, data: { priority?: number; notes?: string; estimated_time_hours?: number }) =>
        api.put(`/queue/${id}`, data),
    delete: (id: number) => api.delete(`/queue/${id}`),
    reorder: (items: { id: number; priority: number }[]) =>
        api.post('/queue/reorder', { items }),
    togglePrinting: (modelId: number) => api.post('/queue/printing/toggle', { model_id: modelId })
};

// Scan modes for the scanner
export type ScanMode = 'full' | 'full_sync' | 'add_only';

export interface WatcherStatus {
    enabled: boolean;
    active: boolean;
    lastTriggered: string | null;
    pendingChanges: number;
}

// System API
export const systemApi = {
    getConfig: () => api.get('/system/config'),
    setConfig: (key: string, value: string) => api.post('/system/config', { key, value }),
    scan: (modelDirectory?: string, mode: ScanMode = 'full', scope: 'all' | 'paid' = 'all') => api.post('/system/scan', { modelDirectory, mode, scope }),
    getScanStatus: () => api.get('/system/scan/status'),
    getCategories: () => api.get('/system/categories'),
    getStats: () => api.get('/system/stats'),
    getDetailedStats: () => api.get('/system/stats/detail'),
    getDesignerStats: () => api.get('/system/stats/designers'),
    getLooseFiles: () => api.get('/system/loose-files'),
    openFolder: (folderPath: string) => api.post('/system/open-folder', { folderPath }),
    organizeLooseFile: (looseFileId: number) => api.post('/system/organize-loose-file', { looseFileId }),
    organizeLooseFiles: (looseFileIds: number[]) => api.post('/system/organize-loose-files', { looseFileIds }),
    deduplicateImages: () => api.post('/system/deduplicate-images'),
    trashLooseFile: (looseFileId: number) => api.post('/system/trash-loose-file', { looseFileId }),
    getWatcherStatus: () => api.get<WatcherStatus>('/system/watcher/status'),
    toggleWatcher: (enabled: boolean) => api.post('/system/watcher/toggle', { enabled }),
    auditNestedModels: () => api.get<{ count: number; items: Array<{ child_id: number; child_filename: string; child_filepath: string; child_category: string; parent_id: number; parent_filename: string; parent_filepath: string; parent_category: string }> }>('/system/audit/nested-models'),
    getPurgeStats: () => api.get('/system/stats/purge')
};

export interface PurgeCandidate {
    id: number;
    filename: string;
    filepath: string;
    category: string;
    is_paid: number;
    purge_marked_at: string | null;
    deleted_at: string | null;
    reasons: Array<'marked' | 'deleted' | 'bad_print'>;
    primaryImage: string | null;
}

export const purgeApi = {
    getCandidates: () => api.get<{ candidates: PurgeCandidate[] }>('/system/purge/candidates'),
    execute: (modelIds: number[], confirmedPaid?: boolean) =>
        api.post('/system/purge/execute', { model_ids: modelIds, confirmedPaid })
};

// Ingestion API
export const ingestionApi = {
    getConfig: () => api.get('/ingestion/config'),
    setConfig: (data: { directory?: string; apiKey?: string; prompt?: string }) => api.post('/ingestion/config', data),
    scan: () => api.get('/ingestion/scan', { timeout: 300000 }),
    categorize: () => api.post('/ingestion/categorize'),
    categorizeStatus: () => api.get('/ingestion/categorize/status'),
    importItems: (items: Array<{ filepath: string; category: string; isFolder: boolean; suggestedCategory?: string; confidence?: string; designer?: string | null; tags?: string[] }>) =>
        api.post('/ingestion/import', { items }),
    getImportStatus: () => api.get('/ingestion/import/status'),
    getPreviewImageUrl: (filePath: string) =>
        `/api/ingestion/preview-image?path=${encodeURIComponent(filePath)}`,
    getImportStats: () => api.get('/ingestion/stats'),
    getPaidUncategorized: (page = 1, limit = 100, search = '') => api.get('/ingestion/paid-uncategorized', { params: { page, limit, search: search || undefined } }),
    categorizePaid: () => api.post('/ingestion/categorize-paid', {}, { timeout: 300000 }),
    getCategorizePaidStatus: () => api.get('/ingestion/categorize-paid/status'),
    applyPaidCategories: (assignments: Array<{ model_id: number; category: string }>) =>
        api.post('/ingestion/apply-paid-categories', { assignments })
};

// Designers API
export interface Designer {
    id: number;
    name: string;
    profile_url: string | null;
    notes: string | null;
    model_count?: number;
    paid_model_count?: number;
    printed_model_count?: number;
    latest_model_date?: string | null;
    is_favorite?: number;
    created_at?: string;
    updated_at?: string;
    preview_images?: string[];
}

export interface SyncProgress {
    active: boolean;
    phase: 'idle' | 'paid_models' | 'metadata_models' | 'complete';
    phaseDescription: string;
    totalItems: number;
    processedItems: number;
    created: number;
    linked: number;
}

export const designersApi = {
    getAll: (filter?: 'paid' | 'free', favoritesOnly?: boolean) => api.get('/designers', { params: { filter, favoritesOnly: favoritesOnly || undefined } }),
    getById: (id: number, opts?: { page?: number; sort?: string; order?: string; q?: string; filterPrinted?: string; filterQueued?: string; filterFavorites?: string }) => api.get(`/designers/${id}`, { params: opts }),
    create: (data: { name: string; profile_url?: string; notes?: string }) => api.post('/designers', data),
    update: (id: number, data: { name?: string; profile_url?: string; notes?: string }) => api.patch(`/designers/${id}`, data),
    delete: (id: number) => api.delete(`/designers/${id}`),
    toggleFavorite: (id: number) => api.post(`/designers/${id}/favorite`),
    sync: () => api.post('/designers/sync'),
    syncStatus: () => api.get('/designers/sync/status')
};

// Tags API
export interface Tag {
    id: number;
    name: string;
    source?: 'pdf' | 'user' | 'autotag';
    model_count?: number;
    created_at?: string;
}

export interface TagSimilarPair {
    tag1: Tag;
    tag2: Tag;
    similarity: number;
}

export type AutoConsolidateReason = 'leading-dash' | 'leading-apostrophe' | 'separator' | 'plural' | 'spelling' | 'year';

export interface AutoConsolidateLoser extends Tag {
    reasons: AutoConsolidateReason[];
}

export interface AutoConsolidateGroup {
    winner: Tag;
    losers: AutoConsolidateLoser[];
    reasons: AutoConsolidateReason[];
    totalModels: number;
}

export interface AutoRenameItem {
    id: number;
    from: string;
    to: string;
    model_count: number;
}

export const tagsApi = {
    getAll: () => api.get('/tags'),
    create: (name: string) => api.post('/tags', { name }),
    rename: (id: number, name: string) => api.patch(`/tags/${id}`, { name }),
    delete: (id: number) => api.delete(`/tags/${id}`),
    addToModel: (modelId: number, name: string) => api.post(`/tags/model/${modelId}`, { name }),
    removeFromModel: (modelId: number, tagId: number) => api.delete(`/tags/model/${modelId}/${tagId}`),
    bulkAddToModels: (modelIds: number[], tagName: string) => api.post('/tags/bulk', { modelIds, tagName }),
    getSimilar: (threshold?: number) => api.get('/tags/similar', { params: { threshold } }),
    merge: (sourceIds: number[], targetId: number) => api.post('/tags/merge', { sourceIds, targetId }),
    mergeBatch: (merges: Array<{ sourceId: number; targetId: number }>) =>
        api.post('/tags/merge-batch', { merges }),
    bulkRename: (renames: Array<{ id: number; name: string }>) =>
        api.post('/tags/bulk-rename', { renames }),
    cleanup: (opts: { maxCount?: number; source?: string[]; dryRun?: boolean }) => api.post('/tags/cleanup', opts),
    autotag: (opts: { modelIds?: number[]; minTagCount?: number; useAi?: boolean; dryRun?: boolean }) =>
        api.post('/tags/autotag', opts, { timeout: 120000 }),
    aiConsolidate: (pairs: TagSimilarPair[]) =>
        api.post('/tags/ai-consolidate', { pairs }, { timeout: 120000 }),
    getAutoConsolidateSuggestions: () =>
        api.get<{ groups: AutoConsolidateGroup[]; renames: AutoRenameItem[] }>('/tags/auto-consolidate-suggestions')
};

export default api;
