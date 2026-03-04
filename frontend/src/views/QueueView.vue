<template>
  <div class="queue-view">
    <div class="header">
      <div class="header-left">
        <h2>Print Queue</h2>
        <span class="count-badge" v-if="queue.length > 0">{{ queue.length }}</span>
      </div>
    </div>
    <p class="subtitle">Models waiting to be printed</p>

    <!-- View Controls -->
    <div v-if="queue.length > 0 || hasActiveFilters" class="view-controls">
      <div class="controls-left">
        <button
          @click="toggleSelectionMode"
          :class="['select-btn', { active: selectionMode }]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path v-if="selectionMode" d="M9 12l2 2 4-4"/>
          </svg>
          <span>{{ selectionMode ? 'Cancel' : 'Select' }}</span>
        </button>
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="priority">Queue Order</option>
            <option value="added_at">Date Queued</option>
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
        <div class="filter-toggles">
          <button
            @click="filterFavorites = cycleFilter(filterFavorites)"
            :class="['filter-toggle-btn', { active: filterFavorites, 'filter-hide': filterFavorites === 'hide' }]"
            :title="filterFavorites === 'only' ? 'Only favorites (click to hide)' : filterFavorites === 'hide' ? 'Hiding favorites (click to clear)' : 'Click to show only favorites'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            <span>{{ filterLabel(filterFavorites, 'Favorites') }}</span>
          </button>
          <button
            @click="filterPrinted = cycleFilter(filterPrinted)"
            :class="['filter-toggle-btn', { active: filterPrinted, 'filter-hide': filterPrinted === 'hide' }]"
            :title="filterPrinted === 'only' ? 'Only printed (click to hide)' : filterPrinted === 'hide' ? 'Hiding printed (click to clear)' : 'Click to show only printed'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          <span>Remove Selected</span>
        </button>
        <div v-if="bulkLoading" class="bulk-loading">
          <div class="loading-spinner small"></div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading queue...</span>
    </div>

    <div v-else-if="queue.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
        </svg>
      </div>
      <h3>Queue is empty</h3>
      <p>Add models to your print queue from the Browse page.</p>
    </div>

    <div v-else-if="sortedQueue.length === 0 && printingItems.length === 0" class="empty">
      <h3>No matches</h3>
      <p>No queue items match your search.</p>
    </div>

    <template v-else>
    <!-- Currently Printing section — always visible, separate from normal queue -->
    <div v-if="printingItems.length > 0" class="printing-section">
      <div class="printing-section-header">
        <span class="printing-pulse-dot-lg"></span>
        <span>Currently Printing</span>
        <span class="printing-count-badge">{{ printingItems.length }}</span>
      </div>
      <div class="printing-cards">
        <div
          v-for="item in printingItems"
          :key="`p-${item.model_id}`"
          class="printing-card"
          @click="openModal(item)"
        >
          <div class="printing-card-image">
            <img
              v-if="item.primaryImage"
              :src="modelsApi.getFileUrl(item.primaryImage)"
              :alt="item.filename"
              @error="onImageError"
              loading="lazy"
            />
            <div v-else class="printing-card-no-image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/>
              </svg>
            </div>
          </div>
          <div class="printing-card-info">
            <div class="printing-card-name" :title="item.filename">{{ item.filename }}</div>
            <div class="printing-card-meta">
              <span class="printing-card-category">{{ item.category }}</span>
              <span v-if="item.file_count > 1" class="printing-card-files">{{ item.file_count }} files</span>
            </div>
          </div>
          <div class="printing-card-actions" @click.stop>
            <button
              @click="markAsPrinted(item)"
              class="printing-card-btn printing-card-btn--done"
              title="Mark as printed (good)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
              </svg>
              Done
            </button>
            <button
              @click="stopPrinting(item.model_id)"
              class="printing-card-btn printing-card-btn--stop"
              title="Stop printing"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="1"/>
              </svg>
              Stop
            </button>
          </div>
        </div>
      </div>
      <div v-if="sortedQueue.length > 0" class="queue-section-divider">
        <span>Next in Queue</span>
      </div>
    </div>

    <!-- Grid View -->
    <div v-if="viewMode === 'grid'" class="models-grid">
      <div
        v-for="(item, index) in sortedQueue"
        :key="item.is_printing ? `p-${item.model_id}` : item.id"
        :class="['model-card', { selected: selectedItems.has(item.model_id), 'model-card--printing': item.is_printing }]"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
        @click="selectionMode ? toggleSelection(item.model_id) : null"
      >
        <div v-if="selectionMode" class="selection-checkbox" @click.stop="toggleSelection(item.model_id)">
          <svg v-if="selectedItems.has(item.model_id)" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent-primary)"/>
            <path d="M9 12l2 2 4-4" stroke="var(--bg-deepest)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
          </svg>
        </div>
        <div v-else-if="sortField === 'priority'" class="queue-badge">{{ index + 1 }}</div>
        <div class="model-image" @click.stop="selectionMode ? toggleSelection(item.model_id) : openModal(item)">
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
          <a class="image-overlay" :href="modelUrl(item.model_id)" @click="onModelLinkClick($event)">
            <span class="open-hint">View details</span>
          </a>
        </div>
        <div class="model-info">
          <h3 :title="item.filename" @click="openModal(item)">{{ item.filename }}</h3>
          <div class="model-meta">
            <span v-if="item.is_printing" class="printing-badge">
              <span class="printing-dot"></span>
              Printing
            </span>
            <span class="category-tag">{{ item.category }}</span>
            <span v-if="item.file_count > 1" class="file-count">{{ item.file_count }} files</span>
          </div>
          <div class="model-actions">
            <button
              @click.stop="cyclePrintedItem(item)"
              :class="['action-btn', { active: item.is_printing || item.printRating, 'printed-printing': item.is_printing && !item.printRating, 'printed-good': item.printRating === 'good', 'printed-bad': item.printRating === 'bad' }]"
              :title="item.is_printing && !item.printRating ? 'Mark as printed (good)' : item.printRating === 'good' ? 'Mark as bad print' : item.printRating ? 'Remove from printed' : 'Mark as printing'"
            >
              <svg viewBox="0 0 24 24" :fill="item.is_printing || item.printRating ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <path d="M6 14h12v8H6z"/>
              </svg>
            </button>
            <button
              @click.stop="item.id ? removeFromQueue(item.id) : stopPrinting(item.model_id)"
              class="action-btn"
              :title="item.id ? 'Remove from queue' : 'Stop printing'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
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
            <th v-if="canDrag" class="col-drag"></th>
            <th v-if="sortField === 'priority'" class="col-number">#</th>
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
            <th class="col-date sortable" @click="handleSort('added_at')">
              <span>Date Queued</span>
              <svg v-if="sortField === 'added_at'" class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
            v-for="(item, index) in sortedQueue"
            :key="item.is_printing ? `p-${item.model_id}` : item.id"
            :class="{
              selected: selectedItems.has(item.model_id),
              dragging: dragIndex === index,
              'drag-over': dragOverIndex === index && dragIndex !== index,
              'row--printing': item.is_printing
            }"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            :draggable="canDrag"
            @click="selectionMode ? toggleSelection(item.model_id) : openModal(item)"
            @dragstart="handleDragStart(index, $event)"
            @dragend="handleDragEnd"
            @dragover.prevent="handleDragOver(index)"
            @dragleave="handleDragLeave"
            @drop.prevent="handleDrop(index)"
          >
            <td v-if="selectionMode" class="col-checkbox" @click.stop="toggleSelection(item.model_id)">
              <div class="table-checkbox">
                <svg v-if="selectedItems.has(item.model_id)" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent-primary)"/>
                  <path d="M9 12l2 2 4-4" stroke="var(--bg-deepest)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                </svg>
              </div>
            </td>
            <td v-if="canDrag" class="col-drag">
              <div class="drag-handle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 6h.01M8 12h.01M8 18h.01M12 6h.01M12 12h.01M12 18h.01"/>
                </svg>
              </div>
            </td>
            <td v-if="sortField === 'priority'" class="col-number">
              <div class="queue-number">{{ index + 1 }}</div>
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
              <a class="model-name" :href="modelUrl(item.model_id)" :title="item.filename" @click="onModelLinkClick($event)">{{ item.filename }}</a>
              <span v-if="item.is_printing" class="printing-badge printing-badge--inline">
                <span class="printing-dot"></span>
                Printing
              </span>
            </td>
            <td class="col-category">
              <span class="category-pill">{{ item.category }}</span>
            </td>
            <td class="col-date">{{ formatDate(item.added_at) }}</td>
            <td class="col-date">{{ formatDate(item.date_added) }}</td>
            <td class="col-date">{{ formatDate(item.date_created) }}</td>
            <td class="col-actions" @click.stop>
              <div class="table-actions">
                <button
                  @click="cyclePrintedItem(item)"
                  :class="['action-btn-small', { active: item.is_printing || item.printRating, 'printed-printing': item.is_printing && !item.printRating, 'printed-good': item.printRating === 'good', 'printed-bad': item.printRating === 'bad' }]"
                  :title="item.is_printing && !item.printRating ? 'Mark as printed (good)' : item.printRating === 'good' ? 'Mark as bad print' : item.printRating ? 'Remove from printed' : 'Mark as printing'"
                >
                  <svg viewBox="0 0 24 24" :fill="item.is_printing || item.printRating ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                    <path d="M6 14h12v8H6z"/>
                  </svg>
                </button>
                <button
                  @click="item.id ? removeFromQueue(item.id) : stopPrinting(item.model_id)"
                  class="action-btn-small"
                  :title="item.id ? 'Remove from queue' : 'Stop printing'"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
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
    </template>

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      :modelIds="sortedQueue.map((q: any) => q.model_id)"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { queueApi, printedApi, modelsApi, systemApi } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const queue = ref<any[]>([]);
const loading = ref(true);
const selectedModelId = ref<number | null>(null);
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('added_at');
const sortOrder = ref<'asc' | 'desc'>('desc');

// Selection mode state
const selectionMode = ref(false);
const selectedItems = ref<Set<number>>(new Set());
const bulkLoading = ref(false);

// Drag and drop state
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

const selectedCount = computed(() => selectedItems.value.size);
const allSelected = computed(() => queue.value.length > 0 && selectedItems.value.size === queue.value.length);
const canDrag = computed(() => sortField.value === 'priority' && viewMode.value === 'table' && !selectionMode.value);

// 3-state filters
type FilterState = '' | 'only' | 'hide';
const filterPrinted = ref<FilterState>('');
const filterFavorites = ref<FilterState>('');
const hasActiveFilters = computed(() => filterPrinted.value || filterFavorites.value);

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

const filteredQueue = computed(() => {
  let items = queue.value;
  const q = store.globalSearchQuery.toLowerCase();
  if (q) {
    items = items.filter((item: any) => item.filename?.toLowerCase().includes(q));
  }
  if (filterFavorites.value === 'only') items = items.filter((item: any) => item.isFavorite);
  if (filterFavorites.value === 'hide') items = items.filter((item: any) => !item.isFavorite);
  if (filterPrinted.value === 'only') items = items.filter((item: any) => item.printRating);
  if (filterPrinted.value === 'hide') items = items.filter((item: any) => !item.printRating);
  return items;
});

const printingItems = computed(() => filteredQueue.value.filter((item: any) => item.is_printing));
const queuedItems = computed(() => filteredQueue.value.filter((item: any) => !item.is_printing));

const sortedQueue = computed(() => {
  // Priority sort is the default from the API (already sorted by priority DESC, added_at ASC)
  // Only includes non-printing items — printing items are shown in their own section above
  if (sortField.value === 'priority') {
    return queuedItems.value;
  }
  const items = [...queuedItems.value];
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
  if (sort && typeof sort === 'string' && ['priority', 'added_at', 'date_added', 'date_created', 'name', 'category'].includes(sort)) {
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
  if (sortField.value !== 'priority') query.sort = sortField.value;
  if (sortOrder.value !== 'desc') query.order = sortOrder.value;
  if (selectedModelId.value) query.model = String(selectedModelId.value);
  router.replace({ query });
}

watch([viewMode, sortField, sortOrder, selectedModelId], () => {
  updateQueryParams();
});

onMounted(async () => {
  initFromQueryParams();
  await loadQueue();
});

onUnmounted(() => {
  if (store.globalSearchQuery) store.clearGlobalSearch();
});

async function loadQueue() {
  try {
    const response = await queueApi.getAll();
    queue.value = response.data.queue;
  } catch (error) {
    console.error('Failed to load queue:', error);
  } finally {
    loading.value = false;
  }
}

async function removeFromQueue(id: number) {
  try {
    await queueApi.delete(id);
    queue.value = queue.value.filter(q => q.id !== id);
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  }
}

async function stopPrinting(modelId: number) {
  try {
    await queueApi.togglePrinting(modelId);
    queue.value = queue.value.filter((q: any) => q.model_id !== modelId || q.id !== null);
    // Reload to get the accurate state after toggling
    await loadQueue();
  } catch (error) {
    console.error('Failed to stop printing:', error);
  }
}

async function markAsPrinted(item: any) {
  try {
    await printedApi.toggle(item.model_id, 'good');
    queue.value = queue.value.filter(q => q.id !== item.id);
  } catch (error) {
    console.error('Failed to mark as printed:', error);
  }
}

async function cyclePrintedItem(item: any) {
  try {
    const response = await printedApi.cycle(item.model_id);
    if (response.data.removedFromQueue || response.data.printed) {
      // Reload to reflect changes (removed from queue, state changes)
      await loadQueue();
    } else {
      // Just update the item in place (e.g. toggling to printing state)
      const queueItem = queue.value.find((q: any) => q.model_id === item.model_id);
      if (queueItem) {
        queueItem.is_printing = response.data.printing ? 1 : 0;
        queueItem.printRating = response.data.rating || null;
      }
    }
  } catch (error) {
    console.error('Failed to cycle printed:', error);
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

function handleModelUpdated() {
  loadQueue();
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
  selectedItems.value = new Set(queue.value.map(q => q.model_id));
}

function deselectAll() {
  selectedItems.value = new Set();
}

async function bulkRemove() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedItems.value);
    await queueApi.bulk(ids, 'remove');
    queue.value = queue.value.filter(q => !ids.includes(q.model_id));
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  } finally {
    bulkLoading.value = false;
  }
}

// Drag and drop functions
function handleDragStart(index: number, event: DragEvent) {
  if (!canDrag.value) return;
  dragIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function handleDragEnd() {
  dragIndex.value = null;
  dragOverIndex.value = null;
}

function handleDragOver(index: number) {
  if (!canDrag.value || dragIndex.value === null) return;
  dragOverIndex.value = index;
}

function handleDragLeave() {
  dragOverIndex.value = null;
}

async function handleDrop(targetIndex: number) {
  if (!canDrag.value || dragIndex.value === null || dragIndex.value === targetIndex) {
    handleDragEnd();
    return;
  }

  const sourceIndex = dragIndex.value;
  const items = [...queue.value];
  const [movedItem] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, movedItem);

  queue.value = items;
  handleDragEnd();

  try {
    const reorderItems = items.map((item, idx) => ({
      id: item.id,
      priority: items.length - idx
    }));
    await queueApi.reorder(reorderItems);
  } catch (error) {
    console.error('Failed to save reorder:', error);
    await loadQueue();
  }
}
</script>

<style scoped>
.queue-view {
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

/* Queue badge on grid cards */
.queue-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 10;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 700;
  font-family: var(--font-mono);
  box-shadow: var(--shadow-md);
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

.action-btn.printed-printing {
  background: var(--warning);
  color: var(--bg-deepest);
  border-color: var(--warning);
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

.action-btn-small.printed-printing {
  color: var(--warning);
}

.action-btn-small.printed-good {
  color: var(--success);
}

.action-btn-small.printed-bad {
  color: var(--danger);
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

.col-checkbox {
  width: 48px;
  text-align: center;
}

.col-drag {
  width: 36px;
}

.col-number {
  width: 48px;
  text-align: center;
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
  width: 130px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.col-actions {
  width: 120px;
}

.queue-number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 700;
  font-family: var(--font-mono);
}

.drag-handle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: grab;
}

.drag-handle svg {
  width: 16px;
  height: 16px;
}

.drag-handle:hover {
  color: var(--accent-primary);
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

/* Drag and drop styles */
.models-table tr.dragging {
  opacity: 0.5;
  border-color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.models-table tr.drag-over {
  box-shadow: 0 -2px 0 0 var(--accent-primary);
}

.models-table tr[draggable="true"] {
  cursor: pointer;
}

.models-table tr[draggable="true"]:active {
  cursor: grabbing;
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

/* Currently Printing section */
.printing-section {
  margin-bottom: 0.5rem;
}

.printing-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0 0.75rem;
  color: #f97316;
  font-weight: 600;
  font-size: 0.9rem;
}

.printing-pulse-dot-lg {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f97316;
  flex-shrink: 0;
  animation: printing-pulse 1.4s ease-in-out infinite;
}

.printing-count-badge {
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}

/* Printing cards — horizontal list, one per row */
.printing-cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.printing-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: rgba(249, 115, 22, 0.06);
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-left: 3px solid #f97316;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.printing-card:hover {
  background: rgba(249, 115, 22, 0.1);
}

.printing-card-image {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-surface);
}

.printing-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.printing-card-no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.printing-card-no-image svg {
  width: 24px;
  height: 24px;
  color: #f97316;
  opacity: 0.5;
}

.printing-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.printing-card-name {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.printing-card-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.printing-card-category {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 1px 6px;
  border-radius: 4px;
}

.printing-card-files {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.printing-card-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.printing-card-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.printing-card-btn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.printing-card-btn--done {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.3);
  color: #16a34a;
}

.printing-card-btn--done:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: #16a34a;
}

.printing-card-btn--stop {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.3);
  color: #f97316;
}

.printing-card-btn--stop:hover {
  background: rgba(249, 115, 22, 0.2);
  border-color: #f97316;
}

/* Divider between printing section and regular queue */
.queue-section-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.queue-section-divider::before,
.queue-section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.model-card--printing {
  border-left: 3px solid #f97316;
  background: rgba(249, 115, 22, 0.04);
}

.row--printing {
  border-left: 3px solid #f97316;
  background: rgba(249, 115, 22, 0.04) !important;
}

.printing-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.printing-badge--inline {
  margin-left: 0.5rem;
  vertical-align: middle;
}

.printing-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: printing-pulse 1.4s ease-in-out infinite;
}

@keyframes printing-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.5); }
}
</style>
