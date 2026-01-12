import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '../store';
import * as api from '../services/api';

vi.mock('../services/api');

describe('App Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with empty state', () => {
    const store = useAppStore();
    expect(store.models).toEqual([]);
    expect(store.categories).toEqual([]);
    expect(store.selectedCategory).toBe('all');
    expect(store.loading).toBe(false);
  });

  it('loads models successfully', async () => {
    const mockModels = [
      { id: 1, filename: 'test.stl', category: 'toys', file_type: 'stl' }
    ];

    vi.mocked(api.modelsApi.getAll).mockResolvedValue({
      data: {
        models: mockModels,
        pagination: { page: 1, totalPages: 1, limit: 50, total: 1 }
      }
    } as any);

    const store = useAppStore();
    await store.loadModels();

    expect(store.models).toEqual(mockModels);
    expect(store.loading).toBe(false);
  });

  it('calculates stats correctly', () => {
    const store = useAppStore();
    store.models = [
      { id: 1, filename: 'test1.stl', isFavorite: true, isQueued: false } as any,
      { id: 2, filename: 'test2.stl', isFavorite: true, isQueued: true } as any,
      { id: 3, filename: 'test3.stl', isFavorite: false, isQueued: false } as any,
    ];

    expect(store.stats.total).toBe(3);
    expect(store.stats.favorites).toBe(2);
    expect(store.stats.queued).toBe(1);
  });
});
