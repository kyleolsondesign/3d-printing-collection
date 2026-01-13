<template>
  <div class="browse-view">
    <div class="header">
      <div class="header-left">
        <h2>Browse Models</h2>
        <span class="model-count" v-if="store.models.length > 0">
          {{ store.models.length }} of {{ totalModels }} models
        </span>
      </div>
      <div class="controls">
        <div class="search-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="searchInput"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="Search models..."
            class="search-input"
          />
          <button v-if="searchInput" @click="clearSearch" class="search-clear">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
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
      <span>Search results for "{{ searchInput }}"</span>
      <button @click="clearSearch" class="clear-search-btn">Clear search</button>
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
        class="model-card"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
      >
        <div class="model-image" @click="openModal(model)">
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
              @click="openInFinder(model)"
              class="action-btn"
              title="Open in Finder"
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
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="openModal(model)"
          >
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
                  @click="openInFinder(model)"
                  class="action-btn-small"
                  title="Open in Finder"
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
import { useAppStore } from '../store';
import { modelsApi, systemApi } from '../services/api';
import type { Model } from '../services/api';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const store = useAppStore();
const searchInput = ref('');
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('date_added');
const sortOrder = ref<'asc' | 'desc'>('desc');
const loadMoreSentinel = ref<HTMLElement | null>(null);
const totalModels = ref(0);
const isSearchActive = ref(false);
const selectedModelId = ref<number | null>(null);

const hasMoreModels = computed(() => !isSearchActive.value && store.models.length < totalModels.value);

let observer: IntersectionObserver | null = null;

onMounted(async () => {
  await loadInitialModels();
  setupIntersectionObserver();
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
});

// Watch for changes that require reloading
watch([sortField, sortOrder], () => {
  if (!isSearchActive.value) {
    resetAndLoad();
  }
});

async function loadInitialModels() {
  const response = await modelsApi.getAll({
    page: 1,
    category: 'all',
    limit: 50,
    sort: sortField.value,
    order: sortOrder.value
  });
  store.models = response.data.models;
  store.currentPage = 1;
  store.totalPages = response.data.pagination.totalPages;
  totalModels.value = response.data.pagination.total;
  store.selectedCategory = 'all';
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
      order: sortOrder.value
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
    searchInput.value = '';
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
      order: sortOrder.value
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

async function handleSearch() {
  if (searchInput.value.trim()) {
    store.loading = true;
    isSearchActive.value = true;
    try {
      const response = await modelsApi.search(searchInput.value);
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
  searchInput.value = '';
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

.controls {
  display: flex;
  gap: 0.5rem;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 1rem;
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  padding: 0.625rem 2.5rem 0.625rem 2.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: 0.9rem;
  min-width: 280px;
  color: var(--text-primary);
}

.search-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.search-clear {
  position: absolute;
  right: 0.75rem;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: var(--bg-hover);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.search-clear svg {
  width: 12px;
  height: 12px;
  color: var(--text-tertiary);
}

.search-clear:hover {
  background: var(--text-tertiary);
}

.search-clear:hover svg {
  color: var(--bg-deepest);
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
