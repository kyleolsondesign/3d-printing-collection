import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { modelsApi, printedApi, favoritesApi, queueApi } from '../services/api';

vi.mock('axios', () => {
    const mockAxios = {
        create: vi.fn(() => mockAxios),
        get: vi.fn().mockResolvedValue({ data: {} }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        put: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() }
        }
    };
    return { default: mockAxios };
});

describe('API Client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('modelsApi', () => {
        it('getFileUrl constructs correct URL', () => {
            const url = modelsApi.getFileUrl('/path/to/image.jpg');
            expect(url).toBe('/api/models/file/serve?path=%2Fpath%2Fto%2Fimage.jpg');
        });

        it('getFileUrl encodes special characters', () => {
            const url = modelsApi.getFileUrl('/path/with spaces/image (1).jpg');
            expect(url).toContain(encodeURIComponent('/path/with spaces/image (1).jpg'));
        });

        it('updateMetadata calls PATCH with filename', async () => {
            await modelsApi.updateMetadata(1, 'New Name');
            // The api instance from axios.create is the mock itself
            const mockApi = axios.create() as any;
            expect(mockApi.patch).toHaveBeenCalledWith('/models/1', { filename: 'New Name' });
        });

        it('hideAsset calls PUT with isHidden flag', async () => {
            await modelsApi.hideAsset(1, 2, true);
            const mockApi = axios.create() as any;
            expect(mockApi.put).toHaveBeenCalledWith('/models/1/assets/2/hide', { isHidden: true });
        });

        it('getAll passes filter params', async () => {
            await modelsApi.getAll({ hidePrinted: true, hideQueued: false, category: 'Toys' });
            const mockApi = axios.create() as any;
            expect(mockApi.get).toHaveBeenCalledWith('/models', {
                params: { hidePrinted: true, hideQueued: false, category: 'Toys' }
            });
        });
    });

    describe('printedApi', () => {
        it('toggle sends model_id and rating', async () => {
            await printedApi.toggle(1, 'good');
            const mockApi = axios.create() as any;
            expect(mockApi.post).toHaveBeenCalledWith('/printed/toggle', { model_id: 1, rating: 'good' });
        });

        it('getImages calls correct endpoint', async () => {
            await printedApi.getImages(5);
            const mockApi = axios.create() as any;
            expect(mockApi.get).toHaveBeenCalledWith('/printed/5/images');
        });

        it('uploadImage creates FormData with image', async () => {
            const file = new File(['fake'], 'test.jpg', { type: 'image/jpeg' });
            await printedApi.uploadImage(1, file);
            const mockApi = axios.create() as any;
            const [url, formData, config] = mockApi.post.mock.calls[0];
            expect(url).toBe('/printed/1/images');
            expect(formData).toBeInstanceOf(FormData);
            expect(config.headers['Content-Type']).toBe('multipart/form-data');
        });

        it('deleteImage calls correct endpoint', async () => {
            await printedApi.deleteImage(1, 5);
            const mockApi = axios.create() as any;
            expect(mockApi.delete).toHaveBeenCalledWith('/printed/1/images/5');
        });

        it('getMakeImageUrl constructs correct URL', () => {
            const url = printedApi.getMakeImageUrl('make-12345.jpg');
            expect(url).toBe('/api/printed/make-image/make-12345.jpg');
        });

        it('getMakeImageUrl encodes filename', () => {
            const url = printedApi.getMakeImageUrl('file with spaces.jpg');
            expect(url).toBe('/api/printed/make-image/file%20with%20spaces.jpg');
        });

        it('bulk sends model_ids, action, and rating', async () => {
            await printedApi.bulk([1, 2, 3], 'add', 'good');
            const mockApi = axios.create() as any;
            expect(mockApi.post).toHaveBeenCalledWith('/printed/bulk', {
                model_ids: [1, 2, 3], action: 'add', rating: 'good'
            });
        });
    });

    describe('favoritesApi', () => {
        it('toggle sends model_id', async () => {
            await favoritesApi.toggle(1);
            const mockApi = axios.create() as any;
            expect(mockApi.post).toHaveBeenCalledWith('/favorites/toggle', { model_id: 1 });
        });
    });

    describe('queueApi', () => {
        it('toggle sends model_id', async () => {
            await queueApi.toggle(1);
            const mockApi = axios.create() as any;
            expect(mockApi.post).toHaveBeenCalledWith('/queue/toggle', { model_id: 1 });
        });

        it('reorder sends items with priorities', async () => {
            const items = [{ id: 1, priority: 10 }, { id: 2, priority: 5 }];
            await queueApi.reorder(items);
            const mockApi = axios.create() as any;
            expect(mockApi.post).toHaveBeenCalledWith('/queue/reorder', { items });
        });
    });
});
