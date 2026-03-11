<template>
  <div class="printed-view">
    <div class="header">
      <div class="header-left">
        <h2>Printed</h2>
        <span class="count-badge" v-if="totalCount > 0">{{ totalCount }}</span>
      </div>
    </div>
    <p class="subtitle">Your printing history and quality ratings</p>

    <!-- View Controls -->
    <div v-if="printed.length > 0 || hasActiveFilters" class="view-controls">
      <div class="controls-left">
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="printed_at">Print Date</option>
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
            @click="filterFavorites = cycleFilter(filterFavorites)"
            :class="['filter-toggle-btn', { active: filterFavorites, 'filter-hide': filterFavorites === 'hide' }]"
            :title="filterFavorites === 'only' ? 'Only favorites (click to hide)' : filterFavorites === 'hide' ? 'Hiding favorites (click to clear)' : 'Click to show only favorites'"
          >
            <AppIcon name="heart" />
            <span>{{ filterLabel(filterFavorites, 'Favorites') }}</span>
          </button>
          <button
            @click="filterQueued = cycleFilter(filterQueued)"
            :class="['filter-toggle-btn', { active: filterQueued, 'filter-hide': filterQueued === 'hide' }]"
            :title="filterQueued === 'only' ? 'Only queued (click to hide)' : filterQueued === 'hide' ? 'Hiding queued (click to clear)' : 'Click to show only queued'"
          >
            <AppIcon name="list" />
            <span>{{ filterLabel(filterQueued, 'Queued') }}</span>
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

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading print history...</span>
    </div>

    <div v-else-if="printed.length === 0" class="empty">
      <div class="empty-icon">
        <AppIcon name="check-circle" stroke-width="1.5" style="width: 40px; height: 40px;" />
      </div>
      <h3>No prints recorded</h3>
      <p>Your print history will appear here once you start tracking prints.</p>
    </div>

    <div v-else-if="sortedPrinted.length === 0" class="empty">
      <h3>No matches</h3>
      <p>No printed models match your search.</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="models-grid">
      <div
        v-for="(item, index) in sortedPrinted"
        :key="item.id"
        class="model-card"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
      >
        <!-- Rating badge overlay -->
        <div class="rating-badge" :class="item.rating || 'neutral'">
          <AppIcon v-if="item.rating === 'good'" name="thumbs-up" />
          <AppIcon v-else-if="item.rating === 'bad'" name="thumbs-down" />
          <AppIcon v-else name="circle-neutral" />
        </div>
        <div class="model-image" @click="openModal(item)">
          <img
            v-if="item.primaryImage"
            :src="modelsApi.getFileUrl(item.primaryImage)"
            :alt="item.filename"
            @error="onImageError"
            loading="lazy"
          />
          <div v-else class="no-image">
            <AppIcon name="package" stroke-width="1.5" style="width: 48px; height: 48px;" />
          </div>
          <a class="image-overlay" :href="modelUrl(item.model_id)" @click="onModelLinkClick($event)">
            <span class="open-hint">View details</span>
          </a>
        </div>
        <div class="model-info">
          <h3 :title="item.filename" @click="openModal(item)">{{ item.filename }}</h3>
          <div class="model-meta">
            <span class="category-tag">{{ item.category }}</span>
            <span v-if="item.file_count > 1" class="file-count">{{ item.file_count }} files</span>
          </div>
          <div class="model-actions">
            <button
              @click.stop="setRating(item, 'good')"
              :class="['action-btn', { active: item.rating === 'good', 'printed-good': item.rating === 'good' }]"
              title="Good print"
            >
              <AppIcon name="thumbs-up" :fill="item.rating === 'good' ? 'currentColor' : 'none'" />
            </button>
            <button
              @click.stop="setRating(item, 'bad')"
              :class="['action-btn', { active: item.rating === 'bad', 'printed-bad': item.rating === 'bad' }]"
              title="Bad print"
            >
              <AppIcon name="thumbs-down" :fill="item.rating === 'bad' ? 'currentColor' : 'none'" />
            </button>
            <button
              @click.stop="openInFinder(item)"
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
            <th class="col-rating">Rating</th>
            <th class="col-image"></th>
            <th class="col-name sortable" @click="handleSort('name')">
              <span>Name</span>
              <AppIcon v-if="sortField === 'name'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
            <th class="col-category sortable" @click="handleSort('category')">
              <span>Category</span>
              <AppIcon v-if="sortField === 'category'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
            <th class="col-date sortable" @click="handleSort('printed_at')">
              <span>Print Date</span>
              <AppIcon v-if="sortField === 'printed_at'" :name="sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'" class="sort-icon" />
            </th>
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
            v-for="(item, index) in sortedPrinted"
            :key="item.id"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="openModal(item)"
          >
            <td class="col-rating">
              <div class="printed-status" :class="item.rating || 'neutral'">
                <AppIcon v-if="item.rating === 'good'" name="thumbs-up" />
                <AppIcon v-else-if="item.rating === 'bad'" name="thumbs-down" />
                <AppIcon v-else name="circle-neutral" />
              </div>
            </td>
            <td class="col-image">
              <div class="table-image">
                <img
                  v-if="item.primaryImage"
                  :src="modelsApi.getFileUrl(item.primaryImage)"
                  :alt="item.filename"
                  @error="onImageError"
                  loading="lazy"
                />
                <AppIcon v-else name="package" stroke-width="1.5" class="no-image-icon" />
              </div>
            </td>
            <td class="col-name">
              <a class="model-name" :href="modelUrl(item.model_id)" :title="item.filename" @click="onModelLinkClick($event)">{{ item.filename }}</a>
            </td>
            <td class="col-category">
              <span class="category-pill">{{ item.category }}</span>
            </td>
            <td class="col-date">{{ formatDate(item.printed_at) }}</td>
            <td class="col-date">{{ formatDate(item.date_added) }}</td>
            <td class="col-date">{{ formatDate(item.date_created) }}</td>
            <td class="col-actions" @click.stop>
              <div class="table-actions">
                <button
                  @click="setRating(item, 'good')"
                  :class="['action-btn-small', { active: item.rating === 'good', 'printed-good': item.rating === 'good' }]"
                  title="Good print"
                >
                  <AppIcon name="thumbs-up" :fill="item.rating === 'good' ? 'currentColor' : 'none'" />
                </button>
                <button
                  @click="setRating(item, 'bad')"
                  :class="['action-btn-small', { active: item.rating === 'bad', 'printed-bad': item.rating === 'bad' }]"
                  title="Bad print"
                >
                  <AppIcon name="thumbs-down" :fill="item.rating === 'bad' ? 'currentColor' : 'none'" />
                </button>
                <button
                  @click="openInFinder(item)"
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

    <!-- Infinite scroll sentinel -->
    <div v-if="!isSearchActive && hasMore" ref="loadMoreSentinel" class="load-more-sentinel">
      <div v-if="loadingMore" class="loading-more">
        <div class="loading-spinner small"></div>
        <span>Loading more...</span>
      </div>
    </div>

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      :modelIds="sortedPrinted.map((p: any) => p.model_id)"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { printedApi, modelsApi, systemApi } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';
import AppIcon from '../components/AppIcon.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const printed = ref<any[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const selectedModelId = ref<number | null>(null);
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('printed_at');
const sortOrder = ref<'asc' | 'desc'>('desc');

// Pagination state
const currentPage = ref(1);
const totalCount = ref(0);
const pageSize = 50;
const hasMore = computed(() => printed.value.length < totalCount.value);

// Intersection observer
const loadMoreSentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// 3-state filters
type FilterState = '' | 'only' | 'hide';
const filterFavorites = ref<FilterState>('');
const filterQueued = ref<FilterState>('');
const hasActiveFilters = computed(() => filterFavorites.value || filterQueued.value);

const isSearchActive = computed(() => !!store.globalSearchQuery);

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

const sortedPrinted = computed(() => {
  let items = printed.value;
  const q = store.globalSearchQuery.toLowerCase();
  if (q) {
    items = items.filter((item: any) => item.filename?.toLowerCase().includes(q));
  }
  return items;
});

function initFromQueryParams() {
  const { view, sort, order, model } = route.query;
  if (view && typeof view === 'string' && ['grid', 'table'].includes(view)) {
    viewMode.value = view as 'grid' | 'table';
  }
  if (sort && typeof sort === 'string' && ['printed_at', 'date_added', 'date_created', 'name', 'category'].includes(sort)) {
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
  if (sortField.value !== 'printed_at') query.sort = sortField.value;
  if (sortOrder.value !== 'desc') query.order = sortOrder.value;
  if (selectedModelId.value) query.model = String(selectedModelId.value);
  router.replace({ query });
}

watch([viewMode, selectedModelId], () => {
  updateQueryParams();
});

// Reload from page 1 when sort or filters change
watch([sortField, sortOrder, filterFavorites, filterQueued], () => {
  updateQueryParams();
  resetAndLoad();
});

onMounted(async () => {
  initFromQueryParams();
  await loadPrinted();
  await nextTick();
  setupObserver();
});

onUnmounted(() => {
  if (store.globalSearchQuery) store.clearGlobalSearch();
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && hasMore.value && !loading.value && !loadingMore.value && !isSearchActive.value) {
        loadMore();
      }
    },
    { rootMargin: '200px' }
  );
  if (loadMoreSentinel.value) {
    observer.observe(loadMoreSentinel.value);
  }
}

// Watch for sentinel element appearing in DOM
watch(loadMoreSentinel, (el) => {
  if (el && observer) {
    observer.observe(el);
  }
});

async function resetAndLoad() {
  currentPage.value = 1;
  printed.value = [];
  totalCount.value = 0;
  loading.value = true;
  await loadPrinted();
}

async function loadPrinted() {
  try {
    const response = await printedApi.getAll({
      page: currentPage.value,
      limit: pageSize,
      sort: sortField.value,
      order: sortOrder.value,
      filterFavorites: filterFavorites.value || undefined,
      filterQueued: filterQueued.value || undefined
    });
    printed.value = response.data.printed;
    totalCount.value = response.data.pagination.total;
  } catch (error) {
    console.error('Failed to load printed models:', error);
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value || isSearchActive.value) return;
  loadingMore.value = true;
  try {
    const nextPage = currentPage.value + 1;
    const response = await printedApi.getAll({
      page: nextPage,
      limit: pageSize,
      sort: sortField.value,
      order: sortOrder.value,
      filterFavorites: filterFavorites.value || undefined,
      filterQueued: filterQueued.value || undefined
    });
    printed.value = [...printed.value, ...response.data.printed];
    currentPage.value = nextPage;
    totalCount.value = response.data.pagination.total;
  } catch (error) {
    console.error('Failed to load more printed models:', error);
  } finally {
    loadingMore.value = false;
  }
}

async function setRating(item: any, rating: 'good' | 'bad') {
  try {
    await printedApi.update(item.id, { rating });
    item.rating = rating;
  } catch (error) {
    console.error('Failed to update rating:', error);
  }
}

function openModal(item: any) {
  selectedModelId.value = item.model_id;
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

function handleModelUpdated(updatedModel: any) {
  if (!updatedModel) { resetAndLoad(); return; }
  const index = printed.value.findIndex(p => p.model_id === updatedModel.id || p.id === updatedModel.id);
  if (index !== -1) {
    printed.value[index] = { ...printed.value[index], ...updatedModel };
  } else {
    resetAndLoad();
  }
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

async function openInFinder(item: any) {
  try {
    await systemApi.openFolder(item.filepath);
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
</script>

<style scoped>
.printed-view {
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

/* Rating badge on grid cards */
.rating-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
}

.rating-badge svg {
  width: 16px;
  height: 16px;
}

.rating-badge.good {
  background: var(--success-dim);
  color: var(--success);
  border: 1px solid var(--success);
}

.rating-badge.bad {
  background: var(--danger-dim);
  color: var(--danger);
  border: 1px solid var(--danger);
}

.rating-badge.neutral {
  background: var(--bg-surface);
  color: var(--text-muted);
  border: 1px solid var(--border-default);
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

.col-rating {
  width: 56px;
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

.col-date {
  width: 120px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.col-actions {
  width: 120px;
}

.printed-status {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
}

.printed-status svg {
  width: 18px;
  height: 18px;
}

.printed-status.good {
  background: var(--success-dim);
  color: var(--success);
}

.printed-status.bad {
  background: var(--danger-dim);
  color: var(--danger);
}

.printed-status.neutral {
  background: var(--bg-hover);
  color: var(--text-muted);
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

.action-btn-small.printed-good {
  color: var(--success);
  border-color: var(--success);
  background: var(--success-dim);
}

.action-btn-small.printed-bad {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-dim);
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

/* Load more sentinel */
.load-more-sentinel {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
  min-height: 1px;
}

.loading-more {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.loading-spinner.small {
  width: 24px;
  height: 24px;
  border-width: 2px;
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
