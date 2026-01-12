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
    category: string;
    is_paid: number;
    is_original: number;
    created_at: string;
    primaryImage?: string | null;
    isFavorite?: boolean;
    isQueued?: boolean;
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
    getAll: (params?: { page?: number; limit?: number; category?: string }) =>
        api.get('/models', { params }),

    getById: (id: number) =>
        api.get(`/models/${id}`),

    search: (query: string) =>
        api.get('/models/search/query', { params: { q: query } }),

    getFileUrl: (filepath: string) =>
        `/api/models/file/serve?path=${encodeURIComponent(filepath)}`
};

// Favorites API
export const favoritesApi = {
    getAll: () => api.get('/favorites'),
    toggle: (modelId: number) => api.post('/favorites/toggle', { model_id: modelId }),
    update: (id: number, notes: string) => api.put(`/favorites/${id}`, { notes }),
    delete: (id: number) => api.delete(`/favorites/${id}`)
};

// Printed Models API
export const printedApi = {
    getAll: () => api.get('/printed'),
    add: (data: { model_id: number; rating?: 'good' | 'bad'; notes?: string; print_time_hours?: number; filament_used_grams?: number }) =>
        api.post('/printed', data),
    update: (id: number, data: { rating?: 'good' | 'bad'; notes?: string; print_time_hours?: number; filament_used_grams?: number }) =>
        api.put(`/printed/${id}`, data),
    delete: (id: number) => api.delete(`/printed/${id}`)
};

// Queue API
export const queueApi = {
    getAll: () => api.get('/queue'),
    toggle: (modelId: number) => api.post('/queue/toggle', { model_id: modelId }),
    add: (data: { model_id: number; priority?: number; notes?: string; estimated_time_hours?: number }) =>
        api.post('/queue', data),
    update: (id: number, data: { priority?: number; notes?: string; estimated_time_hours?: number }) =>
        api.put(`/queue/${id}`, data),
    delete: (id: number) => api.delete(`/queue/${id}`),
    reorder: (items: { id: number; priority: number }[]) =>
        api.post('/queue/reorder', { items })
};

// System API
export const systemApi = {
    getConfig: () => api.get('/system/config'),
    setConfig: (key: string, value: string) => api.post('/system/config', { key, value }),
    scan: (modelDirectory?: string) => api.post('/system/scan', { modelDirectory }),
    getScanStatus: () => api.get('/system/scan/status'),
    getCategories: () => api.get('/system/categories'),
    getStats: () => api.get('/system/stats')
};

export default api;
