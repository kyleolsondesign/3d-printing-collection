<template>
  <div class="favorites-view">
    <Teleport to="#topbar-view-actions">
      <button
        @click="toggleSelectionMode"
        :class="['select-btn', { active: selectionMode }]"
      >
        <AppIcon :name="selectionMode ? 'checkbox-checked' : 'checkbox'" />
        <span>{{ selectionMode ? 'Cancel' : 'Select' }}</span>
      </button>
    </Teleport>
    <div class="header">
      <div class="header-left">
        <h2>Favorites</h2>
        <span class="count-badge" v-if="favorites.length > 0">{{ favorites.length }}</span>
      </div>
    </div>
    <p class="subtitle">Your starred 3D models</p>

    <!-- View Controls -->
    <div v-if="favorites.length > 0 || hasActiveFilters" class="view-controls">
      <div class="controls-left">
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="added_at">Date Favorited</option>
            <option value="date_added">Date Added</option>
            <option value="date_created">Date Created</option>
            <option value="name">Name</option>
            <option value="category">Category</option>
          </select>
          <button @click="toggleSortOrder" class="sort-order-btn" :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'">
            <AppIcon v-if="sortOrder === 'desc'" name="sort-desc" />
            <AppIcon v-else name="sort-asc" />
          </button>
        </div>
        <div class="filter-toggles">
          <button
            @click="filterQueued = cycleFilter(filterQueued)"
            :class="['filter-toggle-btn', { active: filterQueued, 'filter-hide': filterQueued === 'hide' }]"
            :title="filterQueued === 'only' ? 'Only queued (click to hide)' : filterQueued === 'hide' ? 'Hiding queued (click to clear)' : 'Click to show only queued'"
          >
            <AppIcon name="list" />
            <span>{{ filterLabel(filterQueued, 'Queued') }}</span>
          </button>
          <button
            @click="filterPrinted = cycleFilter(filterPrinted)"
            :class="['filter-toggle-btn', { active: filterPrinted, 'filter-hide': filterPrinted === 'hide' }]"
            :title="filterPrinted === 'only' ? 'Only printed (click to hide)' : filterPrinted === 'hide' ? 'Hiding printed (click to clear)' : 'Click to show only printed'"
          >
            <AppIcon name="check-circle" />
            <span>{{ filterLabel(filterPrinted, 'Printed') }}</span>
          </button>
        </div>
      </div>
      <div class="view-toggle">
        <button
          @click="viewMode = 'grid'"
          :class="['view-btn', { active: viewMode === 'grid' }]"
          title="Grid view"
        >
          <AppIcon name="grid" />
        </button>
        <button
          @click="viewMode = 'table'"
          :class="['view-btn', { active: viewMode === 'table' }]"
          title="Table view"
        >
          <AppIcon name="list" />
        </button>
      </div>
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
        <button @click="bulkRemove" class="bulk-btn delete-btn" :disabled="bulkLoading || selectedCount === 0">
          <AppIcon name="x" />
          <span>Remove Selected</span>
        </button>
        <div v-if="bulkLoading" class="bulk-loading">
          <div class="loading-spinner small"></div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading favorites...</span>
    </div>

    <div v-else-if="favorites.length === 0" class="empty">
      <div class="empty-icon">
        <AppIcon name="star" stroke-width="1.5" style="width: 40px; height: 40px;" />
      </div>
      <h3>No favorites yet</h3>
      <p>Star models from the Browse page to add them here.</p>
    </div>

    <div v-else-if="sortedFavorites.length === 0" class="empty">
      <h3>No matches</h3>
      <p>No favorites match your search.</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="models-grid">
      <div
        v-for="(fav, index) in sortedFavorites"
        :key="fav.id"
        :class="['model-card', { selected: selectedItems.has(fav.model_id) }]"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
        @click="selectionMode ? toggleSelection(fav.model_id) : null"
      >
        <div v-if="selectionMode" class="selection-checkbox" @click.stop="toggleSelection(fav.model_id)">
          <AppIcon :name="selectedItems.has(fav.model_id) ? 'checkbox-checked' : 'checkbox'" />
        </div>
        <div class="model-image" @click.stop="selectionMode ? toggleSelection(fav.model_id) : openModal(fav)">
          <img
            v-if="fav.primaryImage"
            :src="modelsApi.getFileUrl(fav.primaryImage)"
            :alt="fav.filename"
            @error="onImageError"
            loading="lazy"
          />
          <div v-else class="no-image">
            <AppIcon name="package" stroke-width="1.5" style="width: 48px; height: 48px;" />
          </div>
          <a class="image-overlay" :href="modelUrl(fav.model_id)" @click="onModelLinkClick($event)">
            <span class="open-hint">View details</span>
          </a>
        </div>
        <div class="model-info">
          <h3 :title="fav.filename" @click="openModal(fav)">{{ fav.filename }}</h3>
          <div class="model-meta">
            <span class="category-tag">{{ fav.category }}</span>
            <span v-if="fav.file_count > 1" class="file-count">{{ fav.file_count }} files</span>
          </div>
          <div class="model-actions">
            <button
              @click.stop="removeFavorite(fav.id)"
              class="action-btn active"
              title="Remove from favorites"
            >
              <AppIcon name="star" fill="currentColor" />
            </button>
            <button
              @click.stop="openInFinder(fav)"
              class="action-btn"
              title="Show in Finder"
            >
              <AppIcon name="folder" />
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
                <AppIcon :name="allSelected ? 'checkbox-checked' : 'checkbox'" />
              </div>
            </th>
            <th class="col-image"></th>
            <th class="col-name sortable" @click="handleSort('name')">
              <span>Name</span>
              <AppIcon v-if="sortField === 'name'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
            <th class="col-category sortable" @click="handleSort('category')">
              <span>Category</span>
              <AppIcon v-if="sortField === 'category'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
            <th class="col-files">Files</th>
            <th class="col-date sortable" @click="handleSort('date_added')">
              <span>Date Added</span>
              <AppIcon v-if="sortField === 'date_added'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
            <th class="col-date sortable" @click="handleSort('date_created')">
              <span>Date Created</span>
              <AppIcon v-if="sortField === 'date_created'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(fav, index) in sortedFavorites"
            :key="fav.id"
            :class="{ selected: selectedItems.has(fav.model_id) }"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="selectionMode ? toggleSelection(fav.model_id) : openModal(fav)"
          >
            <td v-if="selectionMode" class="col-checkbox" @click.stop="toggleSelection(fav.model_id)">
              <div class="table-checkbox">
                <AppIcon :name="selectedItems.has(fav.model_id) ? 'checkbox-checked' : 'checkbox'" />
              </div>
            </td>
            <td class="col-image">
              <div class="table-image">
                <img
                  v-if="fav.primaryImage"
                  :src="modelsApi.getFileUrl(fav.primaryImage)"
                  :alt="fav.filename"
                  @error="onImageError"
                  loading="lazy"
                />
                <AppIcon v-else name="package" stroke-width="1.5" class="no-image-icon" />
              </div>
            </td>
            <td class="col-name">
              <a class="model-name" :href="modelUrl(fav.model_id)" :title="fav.filename" @click="onModelLinkClick($event)">{{ fav.filename }}</a>
            </td>
            <td class="col-category">
              <span class="category-pill">{{ fav.category }}</span>
            </td>
            <td class="col-files">{{ fav.file_count }}</td>
            <td class="col-date">{{ formatDate(fav.date_added) }}</td>
            <td class="col-date">{{ formatDate(fav.date_created) }}</td>
            <td class="col-actions" @click.stop>
              <div class="table-actions">
                <button
                  @click="removeFavorite(fav.id)"
                  class="action-btn-small active"
                  title="Remove from favorites"
                >
                  <AppIcon name="star" fill="currentColor" />
                </button>
                <button
                  @click="openInFinder(fav)"
                  class="action-btn-small"
                  title="Show in Finder"
                >
                  <AppIcon name="folder" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      :modelIds="sortedFavorites.map((f: any) => f.model_id)"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { favoritesApi, modelsApi, systemApi } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';
import AppIcon from '../components/AppIcon.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const favorites = ref<any[]>([]);
const loading = ref(true);
const selectedModelId = ref<number | null>(null);
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('added_at');
const sortOrder = ref<'asc' | 'desc'>('desc');

// Selection mode state
const selectionMode = ref(false);
const selectedItems = ref<Set<number>>(new Set());
const bulkLoading = ref(false);

const selectedCount = computed(() => selectedItems.value.size);
const allSelected = computed(() => favorites.value.length > 0 && selectedItems.value.size === favorites.value.length);

// 3-state filters
type FilterState = '' | 'only' | 'hide';
const filterPrinted = ref<FilterState>('');
const filterQueued = ref<FilterState>('');
const hasActiveFilters = computed(() => filterPrinted.value || filterQueued.value);

function cycleFilter(current: FilterState): FilterState {
  if (current === '') return 'only';
  if (current === 'only') return 'hide';
  return '';
}

function filterLabel(state: FilterState, name: string): string {
  if (state === 'only') return `Only ${name}`;
  if (state === 'hide') return `Hide ${name}`;
  return name;
}

const filteredFavorites = computed(() => {
  let items = favorites.value;
  const q = store.globalSearchQuery.toLowerCase();
  if (q) {
    items = items.filter((f: any) => f.filename?.toLowerCase().includes(q));
  }
  if (filterQueued.value === 'only') items = items.filter((f: any) => f.isQueued);
  if (filterQueued.value === 'hide') items = items.filter((f: any) => !f.isQueued);
  if (filterPrinted.value === 'only') items = items.filter((f: any) => f.printRating);
  if (filterPrinted.value === 'hide') items = items.filter((f: any) => !f.printRating);
  return items;
});

const sortedFavorites = computed(() => {
  const items = [...filteredFavorites.value];
  items.sort((a, b) => {
    let aVal: string, bVal: string;
    switch (sortField.value) {
      case 'name': aVal = (a.filename || '').toLowerCase(); bVal = (b.filename || '').toLowerCase(); break;
      case 'category': aVal = (a.category || '').toLowerCase(); bVal = (b.category || '').toLowerCase(); break;
      case 'date_added': aVal = a.date_added || ''; bVal = b.date_added || ''; break;
      case 'date_created': aVal = a.date_created || ''; bVal = b.date_created || ''; break;
      case 'added_at': aVal = a.added_at || ''; bVal = b.added_at || ''; break;
      default: return 0;
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder.value === 'asc' ? cmp : -cmp;
  });
  return items;
});

function initFromQueryParams() {
  const { view, sort, order, model } = route.query;
  if (view && typeof view === 'string' && ['grid', 'table'].includes(view)) {
    viewMode.value = view as 'grid' | 'table';
  }
  if (sort && typeof sort === 'string' && ['added_at', 'date_added', 'date_created', 'name', 'category'].includes(sort)) {
    sortField.value = sort;
  }
  if (order && typeof order === 'string' && ['asc', 'desc'].includes(order)) {
    sortOrder.value = order as 'asc' | 'desc';
  }
  if (model && typeof model === 'string') {
    const modelId = parseInt(model);
    if (!isNaN(modelId)) selectedModelId.value = modelId;
  }
}

function updateQueryParams() {
  const query: Record<string, string> = {};
  if (viewMode.value !== 'grid') query.view = viewMode.value;
  if (sortField.value !== 'added_at') query.sort = sortField.value;
  if (sortOrder.value !== 'desc') query.order = sortOrder.value;
  if (selectedModelId.value) query.model = String(selectedModelId.value);
  router.replace({ query });
}

watch([viewMode, sortField, sortOrder, selectedModelId], () => {
  updateQueryParams();
});

onMounted(async () => {
  initFromQueryParams();
  await loadFavorites();
});

onUnmounted(() => {
  if (store.globalSearchQuery) store.clearGlobalSearch();
});

async function loadFavorites() {
  try {
    const response = await favoritesApi.getAll();
    favorites.value = response.data.favorites;
  } catch (error) {
    console.error('Failed to load favorites:', error);
  } finally {
    loading.value = false;
  }
}

async function removeFavorite(id: number) {
  try {
    await favoritesApi.delete(id);
    favorites.value = favorites.value.filter(f => f.id !== id);
  } catch (error) {
    console.error('Failed to remove favorite:', error);
  }
}

function openModal(fav: any) {
  selectedModelId.value = fav.model_id;
}

function modelUrl(modelId: number): string {
  return router.resolve({ path: route.path, query: { model: String(modelId) } }).href;
}

function onModelLinkClick(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey) {
    event.stopPropagation();
    return;
  }
  event.preventDefault();
}

function handleModelUpdated() {
  loadFavorites();
}

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function openInFinder(fav: any) {
  try {
    await systemApi.openFolder(fav.filepath);
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}

function handleSort(field: string) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = (field === 'name' || field === 'category') ? 'asc' : 'desc';
  }
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
}

// Selection mode functions
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) {
    selectedItems.value.clear();
  }
}

function toggleSelection(modelId: number) {
  const newSet = new Set(selectedItems.value);
  if (newSet.has(modelId)) {
    newSet.delete(modelId);
  } else {
    newSet.add(modelId);
  }
  selectedItems.value = newSet;
}

function selectAll() {
  selectedItems.value = new Set(favorites.value.map(f => f.model_id));
}

function deselectAll() {
  selectedItems.value = new Set();
}

async function bulkRemove() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedItems.value);
    await favoritesApi.bulk(ids, 'remove');
    favorites.value = favorites.value.filter(f => !ids.includes(f.model_id));
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to remove from favorites:', error);
  } finally {
    bulkLoading.value = false;
  }
}
</script>

<style scoped>
.favorites-view {
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
  gap: 0.75rem;
}

h2 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.count-badge {
  background: var(--accent-primary);
  color: var(--bg-deepest);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  font-family: var(--font-mono);
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin-top: -0.5rem;
}

/* View Controls */
.view-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.filter-toggles {
  display: flex;
  gap: 0.375rem;
}

.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}
.filter-toggle-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
.filter-toggle-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-secondary);
}
.filter-toggle-btn.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.filter-toggle-btn.filter-hide {
  background: rgba(248, 113, 113, 0.1);
  border-color: var(--danger);
  color: var(--danger);
}

/* Sort controls */
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

/* View toggle */
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
  cursor: pointer;
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

/* Grid View */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}

.model-card {
  position: relative;
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

.model-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-dim);
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

/* Selection checkboxes (grid) */
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

.models-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-base);
}

.models-table th.sortable:hover {
  color: var(--accent-primary);
}

.models-table th.sortable span {
  display: inline;
}

.sort-icon {
  width: 14px;
  height: 14px;
  vertical-align: middle;
  margin-left: 0.25rem;
  color: var(--accent-primary);
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

.models-table tr.selected {
  background: var(--accent-primary-dim);
}

.models-table tr.selected:hover {
  background: var(--accent-primary-dim);
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
  width: 100px;
}

.col-checkbox {
  width: 48px;
  text-align: center;
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
  text-decoration: none;
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

/* Loading & empty states */
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
  width: 20px;
  height: 20px;
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

/* Responsive */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .models-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}
</style>
