import { defineStore } from 'pinia';
import { ref } from 'vue';
import { designersApi, type Designer } from '../services/api';

export const useDesignersStore = defineStore('designers', () => {
    // Cached data
    const designers = ref<Designer[]>([]);
    const lastFetched = ref<number | null>(null);

    // Loading states: isLoading = first-time (blank screen spinner),
    // isFetching = background refresh (data already visible)
    const isLoading = ref(false);
    const isFetching = ref(false);

    // Filter/sort state — persisted across navigations
    const activeFilter = ref<'all' | 'paid' | 'free'>('all');
    const favoritesOnly = ref(false);
    const sortField = ref('model_count');
    const sortOrder = ref<'asc' | 'desc'>('desc');
    const hideSmall = ref(true);
    const displayLimit = ref(24);

    async function fetchDesigners(background = false) {
        if (background) {
            isFetching.value = true;
        } else {
            isLoading.value = true;
        }
        try {
            const res = await designersApi.getAll(
                activeFilter.value === 'all' ? undefined : activeFilter.value,
                favoritesOnly.value || undefined
            );
            designers.value = res.data;
            lastFetched.value = Date.now();
        } catch (error) {
            console.error('Failed to load designers:', error);
        } finally {
            isLoading.value = false;
            isFetching.value = false;
        }
    }

    // Call on mount: renders immediately from cache if available,
    // always does a background refresh to catch any changes.
    async function ensureLoaded() {
        if (designers.value.length > 0) {
            fetchDesigners(true);
        } else {
            await fetchDesigners(false);
        }
    }

    async function cyclePaidFilter() {
        if (activeFilter.value === 'all') activeFilter.value = 'paid';
        else if (activeFilter.value === 'paid') activeFilter.value = 'free';
        else activeFilter.value = 'all';
        displayLimit.value = 24;
        await fetchDesigners(false);
    }

    async function toggleFavoritesOnly() {
        favoritesOnly.value = !favoritesOnly.value;
        displayLimit.value = 24;
        await fetchDesigners(false);
    }

    async function toggleFavorite(designer: Designer) {
        // Optimistic update
        const prev = designer.is_favorite;
        designer.is_favorite = prev ? 0 : 1;
        try {
            const res = await designersApi.toggleFavorite(designer.id);
            designer.is_favorite = res.data.is_favorite ? 1 : 0;
        } catch (error) {
            designer.is_favorite = prev;
            console.error('Failed to toggle favorite:', error);
        }
    }

    function updateDesigner(id: number, data: Partial<Designer>) {
        const d = designers.value.find(d => d.id === id);
        if (d) Object.assign(d, data);
    }

    function removeDesigner(id: number) {
        designers.value = designers.value.filter(d => d.id !== id);
    }

    return {
        designers,
        lastFetched,
        isLoading,
        isFetching,
        activeFilter,
        favoritesOnly,
        sortField,
        sortOrder,
        hideSmall,
        displayLimit,
        ensureLoaded,
        fetchDesigners,
        cyclePaidFilter,
        toggleFavoritesOnly,
        toggleFavorite,
        updateDesigner,
        removeDesigner,
    };
});
