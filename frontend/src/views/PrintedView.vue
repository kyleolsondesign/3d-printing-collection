<template>
  <div class="printed-view">
    <div class="header">
      <div class="header-left">
        <h2>Printed</h2>
        <span class="count-badge" v-if="printed.length > 0">{{ printed.length }}</span>
      </div>
      <div class="header-actions" v-if="printed.length > 0">
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="printed_at">Print Date</option>
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
    <p class="subtitle">Your printing history and quality ratings</p>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading print history...</span>
    </div>

    <div v-else-if="printed.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
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
          <svg v-if="item.rating === 'good'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
          </svg>
          <svg v-else-if="item.rating === 'bad'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12h8"/>
          </svg>
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
              <svg viewBox="0 0 24 24" :fill="item.rating === 'good' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
              </svg>
            </button>
            <button
              @click.stop="setRating(item, 'bad')"
              :class="['action-btn', { active: item.rating === 'bad', 'printed-bad': item.rating === 'bad' }]"
              title="Bad print"
            >
              <svg viewBox="0 0 24 24" :fill="item.rating === 'bad' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
              </svg>
            </button>
            <button
              @click.stop="openInFinder(item)"
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
            <th class="col-rating">Rating</th>
            <th class="col-image"></th>
            <th class="col-name sortable" @click="handleSort('name')">
              <span>Name</span>
              <svg v-if="sortField === 'name'" class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="sortOrder === 'asc'" d="M12 19V5M5 12l7-7 7 7"/>
                <path v-else d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </th>
            <th class="col-category sortable" @click="handleSort('category')">
              <span>Category</span>
              <svg v-if="sortField === 'category'" class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="sortOrder === 'asc'" d="M12 19V5M5 12l7-7 7 7"/>
                <path v-else d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </th>
            <th class="col-date sortable" @click="handleSort('printed_at')">
              <span>Print Date</span>
              <svg v-if="sortField === 'printed_at'" class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="sortOrder === 'asc'" d="M12 19V5M5 12l7-7 7 7"/>
                <path v-else d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </th>
            <th class="col-date sortable" @click="handleSort('date_added')">
              <span>Date Added</span>
              <svg v-if="sortField === 'date_added'" class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="sortOrder === 'asc'" d="M12 19V5M5 12l7-7 7 7"/>
                <path v-else d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </th>
            <th class="col-date sortable" @click="handleSort('date_created')">
              <span>Date Created</span>
              <svg v-if="sortField === 'date_created'" class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="sortOrder === 'asc'" d="M12 19V5M5 12l7-7 7 7"/>
                <path v-else d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
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
                <svg v-if="item.rating === 'good'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                </svg>
                <svg v-else-if="item.rating === 'bad'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 12h8"/>
                </svg>
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
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="no-image-icon">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
              </div>
            </td>
            <td class="col-name">
              <span class="model-name" :title="item.filename">{{ item.filename }}</span>
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
                  <svg viewBox="0 0 24 24" :fill="item.rating === 'good' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                  </svg>
                </button>
                <button
                  @click="setRating(item, 'bad')"
                  :class="['action-btn-small', { active: item.rating === 'bad', 'printed-bad': item.rating === 'bad' }]"
                  title="Bad print"
                >
                  <svg viewBox="0 0 24 24" :fill="item.rating === 'bad' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
                  </svg>
                </button>
                <button
                  @click="openInFinder(item)"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { printedApi, modelsApi, systemApi } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const printed = ref<any[]>([]);
const loading = ref(true);
const selectedModelId = ref<number | null>(null);
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('printed_at');
const sortOrder = ref<'asc' | 'desc'>('desc');

const filteredPrinted = computed(() => {
  const q = store.globalSearchQuery.toLowerCase();
  if (!q) return printed.value;
  return printed.value.filter((item: any) => item.filename?.toLowerCase().includes(q));
});

const sortedPrinted = computed(() => {
  const items = [...filteredPrinted.value];
  items.sort((a, b) => {
    let aVal: string, bVal: string;
    switch (sortField.value) {
      case 'name': aVal = (a.filename || '').toLowerCase(); bVal = (b.filename || '').toLowerCase(); break;
      case 'category': aVal = (a.category || '').toLowerCase(); bVal = (b.category || '').toLowerCase(); break;
      case 'date_added': aVal = a.date_added || ''; bVal = b.date_added || ''; break;
      case 'date_created': aVal = a.date_created || ''; bVal = b.date_created || ''; break;
      case 'printed_at': aVal = a.printed_at || ''; bVal = b.printed_at || ''; break;
      default: return 0;
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder.value === 'asc' ? cmp : -cmp;
  });
  return items;
});

function initFromQueryParams() {
  const { view, sort, order } = route.query;
  if (view && typeof view === 'string' && ['grid', 'table'].includes(view)) {
    viewMode.value = view as 'grid' | 'table';
  }
  if (sort && typeof sort === 'string' && ['printed_at', 'date_added', 'date_created', 'name', 'category'].includes(sort)) {
    sortField.value = sort;
  }
  if (order && typeof order === 'string' && ['asc', 'desc'].includes(order)) {
    sortOrder.value = order as 'asc' | 'desc';
  }
}

function updateQueryParams() {
  const query: Record<string, string> = {};
  if (viewMode.value !== 'grid') query.view = viewMode.value;
  if (sortField.value !== 'printed_at') query.sort = sortField.value;
  if (sortOrder.value !== 'desc') query.order = sortOrder.value;
  router.replace({ query });
}

watch([viewMode, sortField, sortOrder], () => {
  updateQueryParams();
});

onMounted(async () => {
  initFromQueryParams();
  await loadPrinted();
});

onUnmounted(() => {
  if (store.globalSearchQuery) store.clearGlobalSearch();
});

async function loadPrinted() {
  try {
    const response = await printedApi.getAll();
    printed.value = response.data.printed;
  } catch (error) {
    console.error('Failed to load printed models:', error);
  } finally {
    loading.value = false;
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

function handleModelUpdated() {
  loadPrinted();
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

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
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
