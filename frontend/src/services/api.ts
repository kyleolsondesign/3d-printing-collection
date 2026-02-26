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
    designer?: string | null;
    source_platform?: string | null;
    source_url?: string | null;
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
}

export interface Category {
    category: string;
    count: number;
}

// Models API
export const modelsApi = {
    getAll: (params?: { page?: number; limit?: number; category?: string; sort?: string; order?: string; hidePrinted?: boolean; hideQueued?: boolean }) =>
        api.get('/models', { params }),

    getById: (id: number) =>
        api.get(`/models/${id}`),

    search: (query: string) =>
        api.get('/models/search/query', { params: { q: query } }),

    getFileUrl: (filepath: string) =>
        `/api/models/file/serve?path=${encodeURIComponent(filepath)}`,

    rescan: (id: number) =>
        api.post(`/models/${id}/rescan`),

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
        api.post(`/models/${modelId}/view`)
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
    getAll: () => api.get('/printed'),
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
        api.post('/queue/reorder', { items })
};

// Scan modes for the scanner
export type ScanMode = 'full' | 'full_sync' | 'add_only';

// System API
export const systemApi = {
    getConfig: () => api.get('/system/config'),
    setConfig: (key: string, value: string) => api.post('/system/config', { key, value }),
    scan: (modelDirectory?: string, mode: ScanMode = 'full') => api.post('/system/scan', { modelDirectory, mode }),
    getScanStatus: () => api.get('/system/scan/status'),
    getCategories: () => api.get('/system/categories'),
    getStats: () => api.get('/system/stats'),
    getDetailedStats: () => api.get('/system/stats/detail'),
    getLooseFiles: () => api.get('/system/loose-files'),
    openFolder: (folderPath: string) => api.post('/system/open-folder', { folderPath }),
    organizeLooseFile: (looseFileId: number) => api.post('/system/organize-loose-file', { looseFileId }),
    organizeLooseFiles: (looseFileIds: number[]) => api.post('/system/organize-loose-files', { looseFileIds }),
    deduplicateImages: () => api.post('/system/deduplicate-images'),
    trashLooseFile: (looseFileId: number) => api.post('/system/trash-loose-file', { looseFileId })
};

// Ingestion API
export const ingestionApi = {
    getConfig: () => api.get('/ingestion/config'),
    setConfig: (data: { directory?: string; apiKey?: string; prompt?: string }) => api.post('/ingestion/config', data),
    scan: () => api.get('/ingestion/scan'),
    categorize: () => api.post('/ingestion/categorize'),
    categorizeStatus: () => api.get('/ingestion/categorize/status'),
    importItems: (items: Array<{ filepath: string; category: string; isFolder: boolean }>) =>
        api.post('/ingestion/import', { items }),
    getPreviewImageUrl: (filePath: string) =>
        `/api/ingestion/preview-image?path=${encodeURIComponent(filePath)}`
};

// Designers API
export interface Designer {
    id: number;
    name: string;
    profile_url: string | null;
    notes: string | null;
    model_count?: number;
    latest_model_date?: string | null;
    created_at?: string;
    updated_at?: string;
}

export const designersApi = {
    getAll: () => api.get('/designers'),
    getById: (id: number, page?: number) => api.get(`/designers/${id}`, { params: { page } }),
    create: (data: { name: string; profile_url?: string; notes?: string }) => api.post('/designers', data),
    update: (id: number, data: { name?: string; profile_url?: string; notes?: string }) => api.patch(`/designers/${id}`, data),
    delete: (id: number) => api.delete(`/designers/${id}`),
    sync: () => api.post('/designers/sync')
};

// Tags API
export interface Tag {
    id: number;
    name: string;
    model_count?: number;
    created_at?: string;
}

export const tagsApi = {
    getAll: () => api.get('/tags'),
    create: (name: string) => api.post('/tags', { name }),
    delete: (id: number) => api.delete(`/tags/${id}`),
    addToModel: (modelId: number, name: string) => api.post(`/tags/model/${modelId}`, { name }),
    removeFromModel: (modelId: number, tagId: number) => api.delete(`/tags/model/${modelId}/${tagId}`),
    bulkAddToModels: (modelIds: number[], tagName: string) => api.post('/tags/bulk', { modelIds, tagName })
};

export default api;
