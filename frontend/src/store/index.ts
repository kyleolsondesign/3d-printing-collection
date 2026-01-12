import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Model, Category } from '../services/api';
import { modelsApi, favoritesApi, queueApi, systemApi } from '../services/api';

export const useAppStore = defineStore('app', () => {
    // State
    const models = ref<Model[]>([]);
    const categories = ref<Category[]>([]);
    const selectedCategory = ref<string>('all');
    const searchQuery = ref<string>('');
    const loading = ref(false);
    const currentPage = ref(1);
    const totalPages = ref(1);
    const modelDirectory = ref<string>('');

    // Computed
    const stats = computed(() => ({
        total: models.value.length,
        favorites: models.value.filter(m => m.isFavorite).length,
        queued: models.value.filter(m => m.isQueued).length
    }));

    // Actions
    async function loadModels(page = 1, category = selectedCategory.value) {
        loading.value = true;
        try {
            const response = await modelsApi.getAll({ page, category, limit: 50 });
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
            if (model) {
                model.isFavorite = !model.isFavorite;
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
        }
    }

    async function toggleQueue(modelId: number) {
        try {
            await queueApi.toggle(modelId);
            const model = models.value.find(m => m.id === modelId);
            if (model) {
                model.isQueued = !model.isQueued;
            }
        } catch (error) {
            console.error('Failed to toggle queue:', error);
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

    return {
        // State
        models,
        categories,
        selectedCategory,
        searchQuery,
        loading,
        currentPage,
        totalPages,
        modelDirectory,
        // Computed
        stats,
        // Actions
        loadModels,
        searchModels,
        loadCategories,
        toggleFavorite,
        toggleQueue,
        loadConfig,
        startScan
    };
});
