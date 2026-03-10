import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Model, Category } from '../services/api';
import { modelsApi, favoritesApi, queueApi, printedApi, systemApi } from '../services/api';

interface ModelStateOverride {
    isFavorite?: boolean;
    isQueued?: boolean;
    isPrinted?: boolean;
    printRating?: string | null;
    isPrinting?: boolean;
}

export const useAppStore = defineStore('app', () => {
    // State
    const models = ref<Model[]>([]);
    const categories = ref<Category[]>([]);
    const selectedCategory = ref<string>('all');
    const searchQuery = ref<string>('');
    const globalSearchQuery = ref<string>(''); // Global search from navbar
    const loading = ref(false);
    const currentPage = ref(1);
    const totalPages = ref(1);
    const modelDirectory = ref<string>('');

    // Cross-view state override map: modelId → latest known state
    // Updated after every toggle action so all views reflect changes immediately
    const modelStateOverrides = ref<Map<number, ModelStateOverride>>(new Map());

    function setModelStateOverride(modelId: number, state: ModelStateOverride) {
        const updated = new Map(modelStateOverrides.value);
        updated.set(modelId, { ...(updated.get(modelId) || {}), ...state });
        modelStateOverrides.value = updated;
    }

    function resolveModelState<T extends { id: number }>(model: T): T {
        const override = modelStateOverrides.value.get(model.id);
        return override ? { ...model, ...override } : model;
    }

    // Computed
    const stats = computed(() => ({
        total: models.value.length,
        favorites: models.value.filter(m => m.isFavorite).length,
        queued: models.value.filter(m => m.isQueued).length
    }));

    // Actions
    async function loadModels(page = 1, category = selectedCategory.value, sort = 'date_added', order = 'desc') {
        loading.value = true;
        try {
            const response = await modelsApi.getAll({ page, category, limit: 50, sort, order });
            models.value = response.data.models;
            currentPage.value = response.data.pagination.page;
            totalPages.value = response.data.pagination.totalPages;
            selectedCategory.value = category;
        } catch (error) {
            console.error('Failed to load models:', error);
        } finally {
            loading.value = false;
        }
    }

    async function searchModels(query: string) {
        if (!query) {
            await loadModels();
            return;
        }
        loading.value = true;
        try {
            const response = await modelsApi.search(query);
            models.value = response.data.models;
            searchQuery.value = query;
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            loading.value = false;
        }
    }

    async function loadCategories() {
        try {
            const response = await systemApi.getCategories();
            categories.value = response.data.categories;
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    async function toggleFavorite(modelId: number) {
        try {
            await favoritesApi.toggle(modelId);
            const model = models.value.find(m => m.id === modelId);
            const newState = model ? !model.isFavorite : !(modelStateOverrides.value.get(modelId)?.isFavorite ?? false);
            if (model) model.isFavorite = newState;
            setModelStateOverride(modelId, { isFavorite: newState });
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
        }
    }

    async function toggleQueue(modelId: number) {
        try {
            await queueApi.toggle(modelId);
            const model = models.value.find(m => m.id === modelId);
            const newState = model ? !model.isQueued : !(modelStateOverrides.value.get(modelId)?.isQueued ?? false);
            if (model) model.isQueued = newState;
            setModelStateOverride(modelId, { isQueued: newState });
        } catch (error) {
            console.error('Failed to toggle queue:', error);
        }
    }

    async function togglePrinted(modelId: number, rating: 'good' | 'bad' = 'good') {
        try {
            const response = await printedApi.toggle(modelId, rating);
            const model = models.value.find(m => m.id === modelId);
            const stateUpdate: ModelStateOverride = {
                isPrinted: response.data.printed,
                printRating: response.data.printed ? response.data.rating : null,
            };
            if (response.data.printed && response.data.removedFromQueue) {
                stateUpdate.isQueued = false;
            }
            if (response.data.printed) {
                stateUpdate.isPrinting = false;
            }
            if (model) {
                model.isPrinted = stateUpdate.isPrinted!;
                model.printRating = stateUpdate.printRating ?? null;
                if (stateUpdate.isQueued !== undefined) model.isQueued = stateUpdate.isQueued;
                if (stateUpdate.isPrinting !== undefined) model.isPrinting = stateUpdate.isPrinting;
            }
            setModelStateOverride(modelId, stateUpdate);
        } catch (error) {
            console.error('Failed to toggle printed:', error);
        }
    }

    async function cyclePrinted(modelId: number) {
        try {
            const response = await printedApi.cycle(modelId);
            const model = models.value.find(m => m.id === modelId);
            const stateUpdate: ModelStateOverride = {
                isPrinted: response.data.printed,
                printRating: response.data.rating || null,
                isPrinting: !!response.data.printing,
            };
            if (response.data.removedFromQueue) {
                stateUpdate.isQueued = false;
            }
            if (model) {
                model.isPrinted = stateUpdate.isPrinted!;
                model.printRating = stateUpdate.printRating ?? null;
                model.isPrinting = stateUpdate.isPrinting!;
                if (stateUpdate.isQueued !== undefined) model.isQueued = stateUpdate.isQueued;
            }
            setModelStateOverride(modelId, stateUpdate);
        } catch (error) {
            console.error('Failed to cycle printed:', error);
        }
    }

    async function togglePrinting(modelId: number) {
        try {
            const response = await queueApi.togglePrinting(modelId);
            const model = models.value.find(m => m.id === modelId);
            if (model) model.isPrinting = response.data.printing;
            setModelStateOverride(modelId, { isPrinting: response.data.printing });
        } catch (error) {
            console.error('Failed to toggle printing:', error);
        }
    }

    async function loadConfig() {
        try {
            const response = await systemApi.getConfig();
            modelDirectory.value = response.data.model_directory || '';
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    async function startScan(directory?: string) {
        try {
            await systemApi.scan(directory);
            if (directory) {
                modelDirectory.value = directory;
            }
        } catch (error) {
            console.error('Failed to start scan:', error);
            throw error;
        }
    }

    function setGlobalSearch(query: string) {
        globalSearchQuery.value = query;
    }

    function clearGlobalSearch() {
        globalSearchQuery.value = '';
    }

    return {
        // State
        models,
        categories,
        selectedCategory,
        searchQuery,
        globalSearchQuery,
        loading,
        currentPage,
        totalPages,
        modelDirectory,
        modelStateOverrides,
        // Computed
        stats,
        // Actions
        setModelStateOverride,
        resolveModelState,
        loadModels,
        searchModels,
        loadCategories,
        toggleFavorite,
        toggleQueue,
        togglePrinted,
        cyclePrinted,
        togglePrinting,
        loadConfig,
        startScan,
        setGlobalSearch,
        clearGlobalSearch
    };
});
