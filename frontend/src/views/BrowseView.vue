<template>
  <div class="browse-view">
    <div class="header">
      <div class="header-left">
        <h2>Browse Models</h2>
        <span class="model-count" v-if="totalModels > 0">
          {{ totalModels.toLocaleString() }} {{ totalModels === 1 ? 'model' : 'models' }}
        </span>
      </div>
    </div>

    <div class="filters">
      <div class="filter-row">
        <div class="category-filters">
          <button
            @click="filterByCategory('all')"
            :class="['category-btn', { active: store.selectedCategory === 'all' }]"
          >
            All
          </button>
          <button
            v-for="cat in store.categories"
            :key="cat.category"
            @click="filterByCategory(cat.category)"
            :class="['category-btn', { active: store.selectedCategory === cat.category }]"
          >
            {{ cat.category }}
            <span class="cat-count">{{ cat.count }}</span>
          </button>
        </div>
        <div class="view-controls">
          <div class="filter-toggles">
            <button
              @click="toggleHidePrinted"
              :class="['filter-toggle-btn', { active: hidePrinted }]"
              title="Hide printed models"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span>Hide Printed</span>
            </button>
            <button
              @click="toggleHideQueued"
              :class="['filter-toggle-btn', { active: hideQueued }]"
              title="Hide queued models"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
              <span>Hide Queued</span>
            </button>
          </div>
          <button
            @click="toggleSelectionMode"
            :class="['select-btn', { active: selectionMode }]"
            title="Toggle selection mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path v-if="selectionMode" d="M9 12l2 2 4-4"/>
            </svg>
            <span>{{ selectionMode ? 'Cancel' : 'Select' }}</span>
          </button>
          <div class="sort-controls">
            <select v-model="sortField" @change="handleSortChange" class="sort-select">
              <option value="date_added">Date Added</option>
              <option value="date_created">Date Created</option>
              <option value="name">Name</option>
              <option value="category">Category</option>
            </select>
            <button @click="toggleSortOrder" class="sort-order-btn" :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'">
              <svg v-if="sortOrder === 'desc'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
          <div class="view-toggle">
            <button
              @click="viewMode = 'grid'"
              :class="['view-btn', { active: viewMode === 'grid' }]"
              title="Grid view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button
              @click="viewMode = 'table'"
              :class="['view-btn', { active: viewMode === 'table' }]"
              title="Table view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Search active indicator -->
    <div v-if="isSearchActive" class="search-results-bar">
      <span>Search results for "{{ store.globalSearchQuery }}"</span>
      <button @click="clearSearch" class="clear-search-btn">Clear search</button>
    </div>

    <!-- Bulk actions bar -->
    <div v-if="selectionMode" class="bulk-actions-bar">
      <div class="bulk-left">
        <span class="selected-count">{{ selectedCount }} selected</span>
        <button @click="allSelected ? deselectAll() : selectAll()" class="select-all-btn">
          {{ allSelected ? 'Deselect All' : 'Select All' }}
        </button>
      </div>
      <div class="bulk-actions" :class="{ disabled: bulkLoading || selectedCount === 0 }">
        <button @click="bulkAddToFavorites" class="bulk-btn" title="Add to Favorites" :disabled="bulkLoading || selectedCount === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <span>Favorite</span>
        </button>
        <button @click="bulkAddToQueue" class="bulk-btn" title="Add to Queue" :disabled="bulkLoading || selectedCount === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span>Queue</span>
        </button>
        <button @click="bulkRemoveFromQueue" class="bulk-btn" title="Remove from Queue" :disabled="bulkLoading || selectedCount === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"/>
          </svg>
          <span>Unqueue</span>
        </button>
        <button @click="bulkMarkPrinted('good')" class="bulk-btn printed-good-btn" title="Mark as Printed (Good)" :disabled="bulkLoading || selectedCount === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <path d="M6 14h12v8H6z"/>
          </svg>
          <span>Printed</span>
        </button>
        <button @click="bulkDelete" class="bulk-btn delete-btn" title="Delete" :disabled="bulkLoading || selectedCount === 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
          <span>Delete</span>
        </button>
        <div v-if="bulkLoading" class="bulk-loading">
          <div class="loading-spinner small"></div>
        </div>
      </div>
    </div>

    <div v-if="store.loading && store.models.length === 0" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading models...</span>
    </div>

    <div v-else-if="store.models.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h3>No models found</h3>
      <p>Go to Settings to configure your model directory and run a scan.</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="models-grid">
      <div
        v-for="(model, index) in store.models"
        :key="model.id"
        :class="['model-card', { 'selected': selectedModels.has(model.id) }]"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
        @click="selectionMode ? toggleModelSelection(model.id) : null"
      >
        <!-- Selection checkbox -->
        <div v-if="selectionMode" class="selection-checkbox" @click.stop="toggleModelSelection(model.id)">
          <svg v-if="selectedModels.has(model.id)" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent-primary)"/>
            <path d="M9 12l2 2 4-4" stroke="var(--bg-deepest)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
          </svg>
        </div>
        <div class="model-image" @click.stop="selectionMode ? toggleModelSelection(model.id) : openModal(model)">
          <img
            v-if="model.primaryImage"
            :src="modelsApi.getFileUrl(model.primaryImage)"
            :alt="model.filename"
            @error="onImageError"
            loading="lazy"
          />
          <div v-else class="no-image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
            </svg>
          </div>
          <div class="image-overlay">
            <span class="open-hint">View details</span>
          </div>
        </div>
        <div class="model-info">
          <h3 :title="model.filename" @click="openModal(model)">{{ model.filename }}</h3>
          <div class="model-meta">
            <span class="category-tag">{{ model.category }}</span>
            <span v-if="model.file_count > 1" class="file-count">{{ model.file_count }} files</span>
            <span v-if="model.is_paid" class="badge-paid">Paid</span>
            <span v-if="model.is_original" class="badge-original">Original</span>
          </div>
          <div class="model-actions">
            <button
              @click="store.toggleFavorite(model.id)"
              :class="['action-btn', { active: model.isFavorite }]"
              :title="model.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
            >
              <svg viewBox="0 0 24 24" :fill="model.isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
            <button
              @click="store.toggleQueue(model.id)"
              :class="['action-btn', { active: model.isQueued }]"
              :title="model.isQueued ? 'Remove from queue' : 'Add to queue'"
            >
              <svg v-if="model.isQueued" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button
              @click="store.togglePrinted(model.id)"
              :class="['action-btn', { active: model.isPrinted, 'printed-good': model.printRating === 'good', 'printed-bad': model.printRating === 'bad' }]"
              :title="model.isPrinted ? 'Remove from printed' : 'Mark as printed'"
            >
              <svg viewBox="0 0 24 24" :fill="model.isPrinted ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <path d="M6 14h12v8H6z"/>
              </svg>
            </button>
            <button
              @click="openInFinder(model)"
              class="action-btn"
              title="Show in Finder"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table View -->
    <div v-else class="models-table-container">
      <table class="models-table">
        <thead>
          <tr>
            <th v-if="selectionMode" class="col-checkbox">
              <div class="table-checkbox" @click="allSelected ? deselectAll() : selectAll()">
                <svg v-if="allSelected" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent-primary)"/>
                  <path d="M9 12l2 2 4-4" stroke="var(--bg-deepest)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                </svg>
              </div>
            </th>
            <th class="col-image"></th>
            <th class="col-name">Name</th>
            <th class="col-category">Category</th>
            <th class="col-files">Files</th>
            <th class="col-date">Date Added</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(model, index) in store.models"
            :key="model.id"
            :class="{ 'selected': selectedModels.has(model.id) }"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="selectionMode ? toggleModelSelection(model.id) : openModal(model)"
          >
            <td v-if="selectionMode" class="col-checkbox" @click.stop="toggleModelSelection(model.id)">
              <div class="table-checkbox">
                <svg v-if="selectedModels.has(model.id)" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent-primary)"/>
                  <path d="M9 12l2 2 4-4" stroke="var(--bg-deepest)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                </svg>
              </div>
            </td>
            <td class="col-image">
              <div class="table-image">
                <img
                  v-if="model.primaryImage"
                  :src="modelsApi.getFileUrl(model.primaryImage)"
                  :alt="model.filename"
                  @error="onImageError"
                  loading="lazy"
                />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="no-image-icon">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
              </div>
            </td>
            <td class="col-name">
              <span class="model-name" :title="model.filename">{{ model.filename }}</span>
              <div class="name-badges">
                <span v-if="model.is_paid" class="badge-paid badge-small">Paid</span>
                <span v-if="model.is_original" class="badge-original badge-small">Original</span>
              </div>
            </td>
            <td class="col-category">
              <span class="category-pill">{{ model.category }}</span>
            </td>
            <td class="col-files">{{ model.file_count }}</td>
            <td class="col-date">{{ formatDate(model.date_added) }}</td>
            <td class="col-actions" @click.stop>
              <div class="table-actions">
                <button
                  @click="store.toggleFavorite(model.id)"
                  :class="['action-btn-small', { active: model.isFavorite }]"
                  title="Favorite"
                >
                  <svg viewBox="0 0 24 24" :fill="model.isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
                <button
                  @click="store.toggleQueue(model.id)"
                  :class="['action-btn-small', { active: model.isQueued }]"
                  title="Queue"
                >
                  <svg v-if="model.isQueued" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </button>
                <button
                  @click="store.togglePrinted(model.id)"
                  :class="['action-btn-small', { active: model.isPrinted, 'printed-good': model.printRating === 'good', 'printed-bad': model.printRating === 'bad' }]"
                  title="Printed"
                >
                  <svg viewBox="0 0 24 24" :fill="model.isPrinted ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                    <path d="M6 14h12v8H6z"/>
                  </svg>
                </button>
                <button
                  @click="openInFinder(model)"
                  class="action-btn-small"
                  title="Show in Finder"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Infinite scroll sentinel (disabled during search) -->
    <div v-if="!isSearchActive" ref="loadMoreSentinel" class="load-more-sentinel">
      <div v-if="store.loading && store.models.length > 0" class="loading-more">
        <div class="loading-spinner small"></div>
        <span>Loading more...</span>
      </div>
      <div v-else-if="!hasMoreModels && store.models.length > 0" class="end-of-list">
        <span>All {{ totalModels }} models loaded</span>
      </div>
    </div>

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../store';
import { modelsApi, systemApi, queueApi, printedApi, favoritesApi } from '../services/api';
import type { Model } from '../services/api';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('date_added');
const sortOrder = ref<'asc' | 'desc'>('desc');
const hidePrinted = ref(true);
const hideQueued = ref(false);
const loadMoreSentinel = ref<HTMLElement | null>(null);
const totalModels = ref(0);
const isSearchActive = ref(false);
const selectedModelId = ref<number | null>(null);
const isInitialized = ref(false);

// Selection mode state
const selectionMode = ref(false);
const selectedModels = ref<Set<number>>(new Set());
const bulkLoading = ref(false);

const hasMoreModels = computed(() => !isSearchActive.value && store.models.length < totalModels.value);
const selectedCount = computed(() => selectedModels.value.size);
const allSelected = computed(() => store.models.length > 0 && selectedModels.value.size === store.models.length);

let observer: IntersectionObserver | null = null;

// Read query params and initialize state
function initFromQueryParams() {
  const { category, q, sort, order, view, model } = route.query;

  if (category && typeof category === 'string') {
    store.selectedCategory = category;
  }
  if (q && typeof q === 'string') {
    store.setGlobalSearch(q);
  } else if (store.globalSearchQuery) {
    store.clearGlobalSearch();
  }
  if (sort && typeof sort === 'string' && ['date_added', 'date_created', 'name', 'category'].includes(sort)) {
    sortField.value = sort;
  }
  if (order && typeof order === 'string' && ['asc', 'desc'].includes(order)) {
    sortOrder.value = order as 'asc' | 'desc';
  }
  if (view && typeof view === 'string' && ['grid', 'table'].includes(view)) {
    viewMode.value = view as 'grid' | 'table';
  }
  if (model && typeof model === 'string') {
    const modelId = parseInt(model);
    if (!isNaN(modelId)) {
      selectedModelId.value = modelId;
    }
  }

  const { hidePrinted: hp, hideQueued: hq } = route.query;
  if (hp === 'false') hidePrinted.value = false;
  if (hp === 'true') hidePrinted.value = true;
  if (hq === 'true') hideQueued.value = true;
  if (hq === 'false') hideQueued.value = false;
}

// Update URL query params when state changes
function updateQueryParams() {
  if (!isInitialized.value) return;

  const query: Record<string, string> = {};

  if (store.selectedCategory !== 'all') {
    query.category = store.selectedCategory;
  }
  if (store.globalSearchQuery) {
    query.q = store.globalSearchQuery;
  }
  if (sortField.value !== 'date_added') {
    query.sort = sortField.value;
  }
  if (sortOrder.value !== 'desc') {
    query.order = sortOrder.value;
  }
  if (viewMode.value !== 'grid') {
    query.view = viewMode.value;
  }
  if (!hidePrinted.value) {
    query.hidePrinted = 'false';
  }
  if (hideQueued.value) {
    query.hideQueued = 'true';
  }
  if (selectedModelId.value) {
    query.model = String(selectedModelId.value);
  }

  // Update URL without navigation (replace to avoid history spam)
  router.replace({ query });
}

onMounted(async () => {
  initFromQueryParams();
  await loadInitialModels();
  setupIntersectionObserver();
  isInitialized.value = true;
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
});

// Watch for changes that require reloading
watch([sortField, sortOrder, hidePrinted, hideQueued], () => {
  if (!isSearchActive.value) {
    resetAndLoad();
  }
  updateQueryParams();
});

// Watch for global search query changes
watch(() => store.globalSearchQuery, (newQuery) => {
  if (newQuery) {
    handleSearch(newQuery);
  } else if (isSearchActive.value) {
    // Clear search when global query is cleared
    resetAndLoad();
  }
  updateQueryParams();
}, { immediate: true });

// Watch for view mode and selected model changes to update URL
watch([viewMode, selectedModelId], () => {
  updateQueryParams();
});

// Watch for category changes to update URL
watch(() => store.selectedCategory, () => {
  updateQueryParams();
});

async function loadInitialModels() {
  // If there's a search query from URL, don't load models (the search watcher will handle it)
  if (store.globalSearchQuery) {
    return;
  }

  const category = store.selectedCategory || 'all';
  const response = await modelsApi.getAll({
    page: 1,
    category,
    limit: 50,
    sort: sortField.value,
    order: sortOrder.value,
    hidePrinted: hidePrinted.value,
    hideQueued: hideQueued.value
  });
  store.models = response.data.models;
  store.currentPage = 1;
  store.totalPages = response.data.pagination.totalPages;
  totalModels.value = response.data.pagination.total;
  if (!store.selectedCategory) {
    store.selectedCategory = 'all';
  }
  isSearchActive.value = false;
}

async function resetAndLoad() {
  store.models = [];
  store.currentPage = 1;
  isSearchActive.value = false;
  await loadInitialModels();
}

function setupIntersectionObserver() {
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && hasMoreModels.value && !store.loading && !isSearchActive.value) {
        loadMoreModels();
      }
    },
    { rootMargin: '200px' }
  );

  if (loadMoreSentinel.value) {
    observer.observe(loadMoreSentinel.value);
  }
}

async function loadMoreModels() {
  if (store.loading || !hasMoreModels.value || isSearchActive.value) return;

  store.loading = true;
  try {
    const nextPage = store.currentPage + 1;
    const response = await modelsApi.getAll({
      page: nextPage,
      category: store.selectedCategory,
      limit: 50,
      sort: sortField.value,
      order: sortOrder.value,
      hidePrinted: hidePrinted.value,
      hideQueued: hideQueued.value
    });

    store.models = [...store.models, ...response.data.models];
    store.currentPage = nextPage;
    store.totalPages = response.data.pagination.totalPages;
    totalModels.value = response.data.pagination.total;
  } catch (error) {
    console.error('Failed to load more models:', error);
  } finally {
    store.loading = false;
  }
}

async function filterByCategory(category: string) {
  if (isSearchActive.value) {
    // Clear search when filtering
    store.clearGlobalSearch();
    isSearchActive.value = false;
  }

  store.loading = true;
  store.selectedCategory = category;
  try {
    const response = await modelsApi.getAll({
      page: 1,
      category,
      limit: 50,
      sort: sortField.value,
      order: sortOrder.value,
      hidePrinted: hidePrinted.value,
      hideQueued: hideQueued.value
    });
    store.models = response.data.models;
    store.currentPage = 1;
    store.totalPages = response.data.pagination.totalPages;
    totalModels.value = response.data.pagination.total;
  } catch (error) {
    console.error('Failed to filter models:', error);
  } finally {
    store.loading = false;
  }
}

async function handleSearch(query: string) {
  if (query.trim()) {
    store.loading = true;
    isSearchActive.value = true;
    try {
      const response = await modelsApi.search(query);
      store.models = response.data.models;
      totalModels.value = response.data.count;
      store.currentPage = 1;
      store.totalPages = 1; // Search returns all results
    } catch (error) {
      console.error('Failed to search models:', error);
    } finally {
      store.loading = false;
    }
  } else {
    clearSearch();
  }
}

function clearSearch() {
  store.clearGlobalSearch();
  isSearchActive.value = false;
  resetAndLoad();
}

function handleSortChange() {
  // Handled by watcher
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  // Handled by watcher
}

function toggleHidePrinted() {
  hidePrinted.value = !hidePrinted.value;
  // Handled by watcher
}

function toggleHideQueued() {
  hideQueued.value = !hideQueued.value;
  // Handled by watcher
}

function onImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.style.display = 'none';
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function openModal(model: Model) {
  selectedModelId.value = model.id;
}

function handleModelUpdated(updatedModel: any) {
  // Update the model in the list
  const index = store.models.findIndex(m => m.id === updatedModel.id);
  if (index !== -1) {
    store.models[index] = { ...store.models[index], ...updatedModel };
  }
}

async function openInFinder(model: Model) {
  try {
    await systemApi.openFolder(model.filepath);
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}

// Selection mode functions
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) {
    selectedModels.value.clear();
  }
}

function toggleModelSelection(modelId: number, event?: Event) {
  if (event) {
    event.stopPropagation();
  }
  const newSet = new Set(selectedModels.value);
  if (newSet.has(modelId)) {
    newSet.delete(modelId);
  } else {
    newSet.add(modelId);
  }
  selectedModels.value = newSet;
}

function selectAll() {
  selectedModels.value = new Set(store.models.map(m => m.id));
}

function deselectAll() {
  selectedModels.value.clear();
  selectedModels.value = new Set(); // Trigger reactivity
}

async function bulkAddToQueue() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await queueApi.bulk(ids, 'add');
    // Update local state
    for (const id of ids) {
      const model = store.models.find(m => m.id === id);
      if (model) model.isQueued = true;
    }
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to add to queue:', error);
  } finally {
    bulkLoading.value = false;
  }
}

async function bulkRemoveFromQueue() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await queueApi.bulk(ids, 'remove');
    // Update local state
    for (const id of ids) {
      const model = store.models.find(m => m.id === id);
      if (model) model.isQueued = false;
    }
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  } finally {
    bulkLoading.value = false;
  }
}

async function bulkMarkPrinted(rating: 'good' | 'bad' = 'good') {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await printedApi.bulk(ids, 'add', rating);
    // Update local state
    for (const id of ids) {
      const model = store.models.find(m => m.id === id);
      if (model) {
        model.isPrinted = true;
        model.printRating = rating;
      }
    }
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to mark as printed:', error);
  } finally {
    bulkLoading.value = false;
  }
}

async function bulkDelete() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  if (!confirm(`Are you sure you want to delete ${selectedCount.value} model(s)? This is a soft delete and can be undone.`)) {
    return;
  }
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await modelsApi.bulkDelete(ids);
    // Remove from local state
    store.models = store.models.filter(m => !ids.includes(m.id));
    totalModels.value -= ids.length;
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to delete models:', error);
  } finally {
    bulkLoading.value = false;
  }
}

async function bulkAddToFavorites() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await favoritesApi.bulk(ids, 'add');
    // Update local state
    for (const id of ids) {
      const model = store.models.find(m => m.id === id);
      if (model) model.isFavorite = true;
    }
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to add to favorites:', error);
  } finally {
    bulkLoading.value = false;
  }
}
</script>

<style scoped>
.browse-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: fadeIn 0.4s ease-out;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.header h2 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.model-count {
  font-size: 0.875rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* Search results bar */
.search-results-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--accent-primary-dim);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  font-size: 0.9rem;
}

.clear-search-btn {
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-base);
}

.clear-search-btn:hover {
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

.filters {
  background: var(--bg-surface);
  padding: 1rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.category-filters {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  flex: 1;
}

.category-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all var(--transition-base);
}

.category-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.category-btn.active {
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-color: var(--accent-primary);
}

.category-btn.active .cat-count {
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
}

.cat-count {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  padding: 0.125rem 0.375rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
}

.view-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.sort-controls {
  display: flex;
  gap: 0.25rem;
}

.sort-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}

.sort-select:hover {
  border-color: var(--border-strong);
}

.sort-order-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.sort-order-btn svg {
  width: 16px;
  height: 16px;
}

.sort-order-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* Filter toggles */
.filter-toggles {
  display: flex;
  gap: 0.375rem;
}

.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.filter-toggle-btn svg {
  width: 14px;
  height: 14px;
}

.filter-toggle-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-secondary);
}

.filter-toggle-btn.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* Selection mode toggle */
.select-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all var(--transition-base);
}

.select-btn svg {
  width: 16px;
  height: 16px;
}

.select-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.select-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--bg-deepest);
}

.view-toggle {
  display: flex;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-elevated);
}

.view-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-right: 1px solid var(--border-default);
}

.view-btn:last-child {
  border-right: none;
}

.view-btn svg {
  width: 16px;
  height: 16px;
}

.view-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.view-btn.active {
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

/* Grid View */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}

.model-card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  transition: all var(--transition-base);
  animation: fadeIn 0.4s ease-out backwards;
}

.model-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.model-image {
  width: 100%;
  aspect-ratio: 4/3;
  background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-deep) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.model-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-slow);
}

.model-card:hover .model-image img {
  transform: scale(1.05);
}

.no-image {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.no-image svg {
  width: 48px;
  height: 48px;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.model-image:hover .image-overlay {
  opacity: 1;
}

.open-hint {
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  border-radius: var(--radius-md);
}

.model-info {
  padding: 1rem;
}

.model-info h3 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  cursor: pointer;
}

.model-info h3:hover {
  color: var(--accent-primary);
}

.model-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
}

.category-tag {
  padding: 0.25rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.file-count {
  padding: 0.25rem 0.5rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.badge-paid {
  padding: 0.2rem 0.5rem;
  background: var(--paid-bg);
  color: var(--paid-text);
  border: 1px solid var(--paid-border);
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.badge-original {
  padding: 0.2rem 0.5rem;
  background: var(--original-bg);
  color: var(--original-text);
  border: 1px solid var(--original-border);
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.model-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  transition: all var(--transition-base);
}

.action-btn svg {
  width: 18px;
  height: 18px;
}

.action-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.action-btn.active {
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-color: var(--accent-primary);
}

.action-btn.printed-good {
  background: var(--success);
  color: var(--bg-deepest);
  border-color: var(--success);
}

.action-btn.printed-bad {
  background: var(--danger);
  color: var(--bg-deepest);
  border-color: var(--danger);
}

.action-btn-small.printed-good {
  color: var(--success);
}

.action-btn-small.printed-bad {
  color: var(--danger);
}

/* Table View */
.models-table-container {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}

.models-table {
  width: 100%;
  border-collapse: collapse;
}

.models-table th {
  background: var(--bg-elevated);
  padding: 0.875rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-default);
}

.models-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.models-table tr {
  cursor: pointer;
  transition: background var(--transition-fast);
  animation: fadeIn 0.3s ease-out backwards;
}

.models-table tbody tr:hover {
  background: var(--bg-hover);
}

.col-image {
  width: 56px;
}

.col-name {
  min-width: 200px;
}

.col-category {
  width: 140px;
}

.col-files {
  width: 70px;
  text-align: center;
}

.col-date {
  width: 130px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.col-actions {
  width: 120px;
}

.table-image {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
}

.table-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image-icon {
  width: 24px;
  height: 24px;
  color: var(--text-muted);
}

.model-name {
  font-weight: 500;
  color: var(--text-primary);
}

.name-badges {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.badge-small {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
}

.category-pill {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
}

.table-actions {
  display: flex;
  gap: 0.375rem;
}

.action-btn-small {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  transition: all var(--transition-base);
}

.action-btn-small svg {
  width: 14px;
  height: 14px;
}

.action-btn-small:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.action-btn-small.active {
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-color: var(--accent-primary);
}

/* Loading states */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  gap: 1rem;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-spinner.small {
  width: 24px;
  height: 24px;
  border-width: 2px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border-radius: 50%;
  margin-bottom: 1.5rem;
  color: var(--text-muted);
}

.empty-icon svg {
  width: 40px;
  height: 40px;
}

.empty h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.empty p {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* Infinite scroll */
.load-more-sentinel {
  display: flex;
  justify-content: center;
  padding: 2rem;
  min-height: 80px;
}

.loading-more {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.end-of-list {
  color: var(--text-tertiary);
  font-size: 0.875rem;
  font-family: var(--font-mono);
}

/* Bulk actions bar */
.bulk-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1.25rem;
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-lg);
  gap: 1rem;
}

.bulk-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.selected-count {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}

.select-all-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.select-all-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.bulk-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bulk-actions.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.bulk-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.bulk-btn svg {
  width: 16px;
  height: 16px;
}

.bulk-btn:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.bulk-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bulk-btn.printed-good-btn:hover:not(:disabled) {
  border-color: var(--success);
  color: var(--success);
  background: rgba(74, 222, 128, 0.1);
}

.bulk-btn.delete-btn:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
}

.bulk-loading {
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
}

/* Selection checkboxes */
.selection-checkbox {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 10;
  width: 24px;
  height: 24px;
  cursor: pointer;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
}

.selection-checkbox svg {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
}

.selection-checkbox:hover svg {
  color: var(--accent-primary);
}

.model-card {
  position: relative;
}

.model-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-dim);
}

/* Table checkbox */
.col-checkbox {
  width: 48px;
  text-align: center;
}

.table-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.table-checkbox svg {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
}

.table-checkbox:hover svg {
  color: var(--accent-primary);
}

.models-table tr.selected {
  background: var(--accent-primary-dim);
}

.models-table tr.selected:hover {
  background: var(--accent-primary-dim);
}

/* Responsive */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .search-input {
    min-width: 100%;
  }

  .controls {
    width: 100%;
  }

  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .view-controls {
    justify-content: flex-end;
  }

  .models-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}
</style>
