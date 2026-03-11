<template>
  <div class="designer-detail-view">
    <Teleport to="#topbar-view-actions">
      <button
        @click="toggleSelectionMode"
        :class="['select-btn', { active: selectionMode }]"
        title="Toggle selection mode"
      >
        <AppIcon :name="selectionMode ? 'checkbox-checked' : 'checkbox'" />
        <span>{{ selectionMode ? 'Cancel' : 'Select' }}</span>
      </button>
    </Teleport>
    <div class="header">
      <div class="header-left">
        <router-link to="/designers" class="back-btn">
          <AppIcon name="arrow-left" />
          All Designers
        </router-link>
        <h2 v-if="designer">{{ designer.name }}</h2>
        <span class="count-badge" v-if="total > 0">{{ total }}</span>
      </div>
      <div class="header-actions" v-if="designer">
        <a v-if="designer.profile_url" :href="designer.profile_url" target="_blank" rel="noopener" class="profile-link-btn">
          <AppIcon name="external-link" />
          Profile
        </a>
        <button
          @click="toggleFavorite"
          :class="['favorite-btn', { active: designer.is_favorite }]"
          :title="designer.is_favorite ? 'Remove from favorites' : 'Add to favorites'"
        >
          <AppIcon name="heart" :fill="designer.is_favorite ? 'currentColor' : 'none'" />
          {{ designer.is_favorite ? 'Favorited' : 'Favorite' }}
        </button>
        <button @click="startEditDesigner" class="edit-btn">
          <AppIcon name="edit" />
          Edit
        </button>
      </div>
    </div>

    <div v-if="designer && designer.notes" class="detail-notes">{{ designer.notes }}</div>

    <!-- View Controls -->
    <div v-if="models.length > 0 || loading || hasActiveFilters" class="view-controls">
      <div class="controls-left">
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="date_added">Date Added</option>
            <option value="date_created">Date Created</option>
            <option value="name">Name</option>
            <option value="category">Category</option>
          </select>
          <button @click="toggleSortOrder" class="sort-order-btn"
                  :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'">
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
        <button @click="viewMode = 'grid'" :class="['view-btn', { active: viewMode === 'grid' }]" title="Grid view">
          <AppIcon name="grid" />
        </button>
        <button @click="viewMode = 'table'" :class="['view-btn', { active: viewMode === 'table' }]" title="Table view">
          <AppIcon name="list" />
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading models...</span>
    </div>

    <div v-else-if="models.length === 0 && !searchQuery" class="empty">
      <h3>No models</h3>
      <p>This designer has no models assigned yet.</p>
    </div>

    <div v-else-if="models.length === 0 && searchQuery" class="empty">
      <h3>No matches</h3>
      <p>No models matching "{{ searchQuery }}" for this designer.</p>
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
          <AppIcon name="star" />
          <span>Favorite</span>
        </button>
        <button @click="bulkAddToQueue" class="bulk-btn" title="Add to Queue" :disabled="bulkLoading || selectedCount === 0">
          <AppIcon name="plus" />
          <span>Queue</span>
        </button>
        <button @click="bulkRemoveFromQueue" class="bulk-btn" title="Remove from Queue" :disabled="bulkLoading || selectedCount === 0">
          <AppIcon name="minus" />
          <span>Unqueue</span>
        </button>
        <button @click="bulkMarkPrinted('good')" class="bulk-btn printed-good-btn" title="Mark as Printed (Good)" :disabled="bulkLoading || selectedCount === 0">
          <AppIcon name="printer" />
          <span>Printed</span>
        </button>
        <button
          @click="showRecategorizeModal = true"
          class="bulk-btn"
          title="Recategorize with suggestions"
          :disabled="bulkLoading || selectedCount === 0"
        >
          <AppIcon name="tag" />
          <span>Recategorize</span>
        </button>
        <div class="bulk-tag-wrapper">
          <button
            @click="showBulkTagInput = !showBulkTagInput; bulkTagInput = ''"
            class="bulk-btn"
            title="Add Tag"
            :disabled="bulkLoading || selectedCount === 0"
          >
            <AppIcon name="tag" />
            <span>Tag</span>
          </button>
          <div v-if="showBulkTagInput" class="bulk-tag-input-row">
            <input
              v-model="bulkTagInput"
              @keydown.enter="bulkAddTag"
              @keydown.escape="showBulkTagInput = false; bulkTagInput = ''"
              placeholder="Tag name..."
              class="bulk-tag-input"
              type="text"
              autofocus
            />
            <button @click="bulkAddTag" class="bulk-tag-confirm" :disabled="!bulkTagInput.trim()">Apply</button>
          </div>
        </div>
        <button @click="bulkRescan" class="bulk-btn" title="Rescan folders" :disabled="bulkLoading || selectedCount === 0">
          <AppIcon name="refresh" />
          <span>Rescan</span>
        </button>
        <button @click="bulkDelete" class="bulk-btn delete-btn" title="Delete" :disabled="bulkLoading || selectedCount === 0">
          <AppIcon name="trash" />
          <span>Delete</span>
        </button>
        <div v-if="bulkLoading" class="bulk-loading">
          <div class="loading-spinner small"></div>
        </div>
      </div>
    </div>

    <!-- Grid View -->
    <div v-if="viewMode === 'grid' && !loading && models.length > 0" class="models-grid">
      <ModelCard
        v-for="(model, index) in models"
        :key="model.id"
        :model="model"
        :selectionMode="selectionMode"
        :isSelected="selectedModels.has(model.id)"
        :animationDelay="Math.min(index * 30, 300)"
        @open="openModal(model.id)"
        @select="toggleModelSelection(model.id)"
      >
        <template #meta-badges>
          <span v-if="model.is_paid" class="badge-paid">Paid</span>
        </template>
        <template v-if="!selectionMode" #actions>
          <button @click.stop="store.toggleFavorite(model.id)" :class="['action-btn', { active: model.isFavorite }]" title="Favorite">
            <AppIcon name="heart" :fill="model.isFavorite ? 'currentColor' : 'none'" />
          </button>
          <button @click.stop="store.toggleQueue(model.id)" :class="['action-btn', { active: model.isQueued }]" title="Queue">
            <AppIcon name="list" />
          </button>
          <button @click.stop="store.cyclePrinted(model.id)" :class="['action-btn', { active: model.printRating, 'printed-good': model.printRating === 'good', 'printed-bad': model.printRating === 'bad' }]" title="Printed">
            <AppIcon name="check-circle" />
          </button>
          <button @click.stop="openInFinder(model)" class="action-btn" title="Show in Finder">
            <AppIcon name="folder" />
          </button>
        </template>
      </ModelCard>
    </div>

    <!-- Table View -->
    <div v-if="viewMode === 'table' && !loading && models.length > 0" class="models-table-container">
      <table class="models-table">
        <thead>
          <tr>
            <th v-if="selectionMode" class="col-checkbox"></th>
            <th class="col-image"></th>
            <th class="col-name sortable-header" @click="handleHeaderSort('name')">
              <span>Name</span>
              <span v-if="sortField === 'name'" class="sort-indicator">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="col-category sortable-header" @click="handleHeaderSort('category')">
              <span>Category</span>
              <span v-if="sortField === 'category'" class="sort-indicator">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="col-files">Files</th>
            <th class="col-date sortable-header" @click="handleHeaderSort('date_added')">
              <span>Date Added</span>
              <span v-if="sortField === 'date_added'" class="sort-indicator">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="col-date sortable-header" @click="handleHeaderSort('date_created')">
              <span>Date Created</span>
              <span v-if="sortField === 'date_created'" class="sort-indicator">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th v-if="!selectionMode" class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(model, index) in models"
            :key="model.id"
            :class="{ selected: selectedModels.has(model.id) }"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="selectionMode ? toggleModelSelection(model.id) : openModal(model.id)"
          >
            <td v-if="selectionMode" class="col-checkbox" @click.stop="toggleModelSelection(model.id)">
              <div class="table-checkbox">
                <AppIcon :name="selectedModels.has(model.id) ? 'checkbox-checked' : 'checkbox'" />
              </div>
            </td>
            <td class="col-image">
              <div class="table-image">
                <img v-if="model.primaryImage" :src="getFileUrl(model.primaryImage)" :alt="model.filename" @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'" />
                <AppIcon v-else name="package" stroke-width="1.5" class="no-image-icon" />
              </div>
            </td>
            <td class="col-name">
              <span class="model-name-text">{{ model.filename }}</span>
              <div class="name-badges">
                <span v-if="model.is_paid" class="badge-paid badge-small">Paid</span>
              </div>
            </td>
            <td class="col-category">
              <span class="category-pill">{{ model.category }}</span>
            </td>
            <td class="col-files">{{ model.file_count }}</td>
            <td class="col-date">{{ formatDate(model.date_added) }}</td>
            <td class="col-date">{{ formatDate(model.date_created) }}</td>
            <td v-if="!selectionMode" class="col-actions" @click.stop>
              <div class="table-actions">
                <button @click="store.toggleFavorite(model.id)" :class="['action-btn-small', { active: model.isFavorite }]" title="Favorite">
                  <AppIcon name="heart" :fill="model.isFavorite ? 'currentColor' : 'none'" />
                </button>
                <button @click="store.toggleQueue(model.id)" :class="['action-btn-small', { active: model.isQueued }]" title="Queue">
                  <AppIcon name="list" />
                </button>
                <button @click="store.cyclePrinted(model.id)" :class="['action-btn-small', { active: model.printRating, 'printed-good': model.printRating === 'good', 'printed-bad': model.printRating === 'bad' }]" title="Printed">
                  <AppIcon name="check-circle" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Infinite scroll sentinel -->
    <div ref="loadMoreSentinel" class="load-more-sentinel">
      <div v-if="loadingMore" class="loading-more">
        <div class="loading-spinner small"></div>
        <span>Loading more...</span>
      </div>
    </div>

    <!-- Edit Designer Modal -->
    <div v-if="editingDesigner" class="edit-modal-overlay" @click.self="cancelEdit">
      <div class="edit-modal">
        <h3>Edit Designer</h3>
        <div class="edit-form">
          <label>
            Name
            <input v-model="editForm.name" class="form-input" type="text" />
          </label>
          <label>
            Profile URL
            <input v-model="editForm.profile_url" class="form-input" type="url" placeholder="https://..." />
          </label>
          <label>
            Notes
            <textarea v-model="editForm.notes" class="form-textarea" rows="3" placeholder="Notes about this designer..."></textarea>
          </label>
        </div>
        <div class="edit-modal-actions">
          <button @click="saveEdit" class="confirm-btn" :disabled="!editForm.name.trim()">Save</button>
          <button @click="cancelEdit" class="cancel-btn">Cancel</button>
          <button @click="deleteDesigner" class="delete-btn">Delete Designer</button>
        </div>
      </div>
    </div>

    <!-- Recategorization Modal -->
    <RecategorizationModal
      v-if="showRecategorizeModal"
      :model-ids="Array.from(selectedModels)"
      @close="showRecategorizeModal = false"
      @applied="onRecategorizeApplied"
    />

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      :modelIds="models.map((m: any) => m.id)"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { designersApi, modelsApi, systemApi, queueApi, printedApi, favoritesApi, tagsApi, type Designer } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';
import RecategorizationModal from '../components/RecategorizationModal.vue';
import AppIcon from '../components/AppIcon.vue';
import ModelCard from '../components/ModelCard.vue';

const route = useRoute();
const router = useRouter();
const store = useAppStore();

const loading = ref(true);
const loadingMore = ref(false);
const designer = ref<Designer | null>(null);
const models = ref<any[]>([]);
const total = ref(0);
const currentPage = ref(1);
const hasMore = computed(() => models.value.length < total.value);
const selectedModelId = ref<number | null>(null);
const loadMoreSentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// Selection mode state
const selectionMode = ref(false);
const selectedModels = ref<Set<number>>(new Set());
const bulkLoading = ref(false);
const showBulkTagInput = ref(false);
const bulkTagInput = ref('');
const showRecategorizeModal = ref(false);

const selectedCount = computed(() => selectedModels.value.size);
const allSelected = computed(() => models.value.length > 0 && selectedModels.value.size === models.value.length);

// View & sort
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('date_added');
const sortOrder = ref<'asc' | 'desc'>('desc');

// Status filters: '' = off, 'only' = show only, 'hide' = hide
type FilterState = '' | 'only' | 'hide';
const filterPrinted = ref<FilterState>('');
const filterQueued = ref<FilterState>('');
const filterFavorites = ref<FilterState>('');
const hasActiveFilters = computed(() => filterPrinted.value || filterQueued.value || filterFavorites.value);

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

// Edit designer
const editingDesigner = ref(false);
const editForm = ref({ name: '', profile_url: '', notes: '' });

function initFromQueryParams() {
  const { sort, order, view, model, fp, fq, ff } = route.query;
  if (sort && typeof sort === 'string' && ['date_added', 'date_created', 'name', 'category'].includes(sort)) {
    sortField.value = sort;
  }
  if (order && typeof order === 'string' && ['asc', 'desc'].includes(order)) {
    sortOrder.value = order as 'asc' | 'desc';
  }
  if (view === 'table') viewMode.value = 'table';
  if (model) selectedModelId.value = parseInt(model as string);
  if (fp === 'only' || fp === 'hide') filterPrinted.value = fp;
  if (fq === 'only' || fq === 'hide') filterQueued.value = fq;
  if (ff === 'only' || ff === 'hide') filterFavorites.value = ff;
}

function updateQueryParams() {
  const query: Record<string, string> = {};
  if (sortField.value !== 'date_added') query.sort = sortField.value;
  if (sortOrder.value !== 'desc') query.order = sortOrder.value;
  if (viewMode.value !== 'grid') query.view = viewMode.value;
  if (selectedModelId.value) query.model = String(selectedModelId.value);
  if (filterPrinted.value) query.fp = filterPrinted.value;
  if (filterQueued.value) query.fq = filterQueued.value;
  if (filterFavorites.value) query.ff = filterFavorites.value;
  router.replace({ params: route.params, query });
}

function resetList() {
  models.value = [];
  currentPage.value = 1;
  total.value = 0;
}

watch([sortField, sortOrder, viewMode, selectedModelId, filterPrinted, filterQueued, filterFavorites], () => {
  updateQueryParams();
});

const searchQuery = computed(() => store.globalSearchQuery);

// Reload models when sort, search, or filters change
watch([sortField, sortOrder, filterPrinted, filterQueued, filterFavorites], () => {
  resetList();
  loadModels();
});

watch(searchQuery, () => {
  resetList();
  loadModels();
});

async function loadModels(append = false) {
  const id = parseInt(route.params.id as string);
  if (!id) return;
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  try {
    const res = await designersApi.getById(id, {
      page: currentPage.value,
      sort: sortField.value,
      order: sortOrder.value,
      q: searchQuery.value || undefined,
      filterPrinted: filterPrinted.value || undefined,
      filterQueued: filterQueued.value || undefined,
      filterFavorites: filterFavorites.value || undefined,
    });
    designer.value = res.data;
    if (append) {
      models.value = [...models.value, ...res.data.models];
    } else {
      models.value = res.data.models;
    }
    total.value = res.data.total;
  } catch (error) {
    console.error('Failed to load designer:', error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || loading.value || !hasMore.value) return;
  currentPage.value++;
  await loadModels(true);
}

async function reloadModels() {
  resetList();
  await loadModels();
}

function handleModelUpdated(updatedModel: any) {
  if (!updatedModel) { reloadModels(); return; }
  const index = models.value.findIndex((m: any) => m.id === updatedModel.id);
  if (index !== -1) {
    models.value[index] = { ...models.value[index], ...updatedModel };
  } else {
    reloadModels();
  }
}

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore.value) {
      loadMore();
    }
  }, { rootMargin: '200px' });
  if (loadMoreSentinel.value) {
    observer.observe(loadMoreSentinel.value);
  }
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
}

function handleHeaderSort(field: string) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = (field === 'name' || field === 'category') ? 'asc' : 'desc';
  }
}

function openModal(modelId: number) {
  selectedModelId.value = modelId;
}

function getFileUrl(filepath: string): string {
  return modelsApi.getFileUrl(filepath);
}

async function openInFinder(model: any) {
  try {
    await systemApi.openFolder(model.filepath);
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function toggleFavorite() {
  if (!designer.value) return;
  const prev = designer.value.is_favorite;
  designer.value.is_favorite = prev ? 0 : 1;
  try {
    const res = await designersApi.toggleFavorite(designer.value.id);
    designer.value.is_favorite = res.data.is_favorite ? 1 : 0;
  } catch (error) {
    designer.value.is_favorite = prev;
    console.error('Failed to toggle favorite:', error);
  }
}

function startEditDesigner() {
  if (!designer.value) return;
  editingDesigner.value = true;
  editForm.value = {
    name: designer.value.name,
    profile_url: designer.value.profile_url || '',
    notes: designer.value.notes || ''
  };
}

function cancelEdit() {
  editingDesigner.value = false;
}

async function saveEdit() {
  if (!designer.value || !editForm.value.name.trim()) return;
  try {
    await designersApi.update(designer.value.id, {
      name: editForm.value.name.trim(),
      profile_url: editForm.value.profile_url || undefined,
      notes: editForm.value.notes || undefined
    });
    editingDesigner.value = false;
    await loadModels();
  } catch (error) {
    console.error('Failed to update designer:', error);
  }
}

async function deleteDesigner() {
  if (!designer.value) return;
  if (!confirm(`Delete designer "${designer.value.name}"? Their models will not be deleted.`)) return;
  try {
    await designersApi.delete(designer.value.id);
    router.push('/designers');
  } catch (error) {
    console.error('Failed to delete designer:', error);
  }
}

// Selection mode functions
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) selectedModels.value = new Set();
}

function toggleModelSelection(modelId: number) {
  const newSet = new Set(selectedModels.value);
  if (newSet.has(modelId)) newSet.delete(modelId);
  else newSet.add(modelId);
  selectedModels.value = newSet;
}

function selectAll() {
  selectedModels.value = new Set(models.value.map(m => m.id));
}

function deselectAll() {
  selectedModels.value = new Set();
}

// Bulk action functions
async function bulkAddToFavorites() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await favoritesApi.bulk(ids, 'add');
    for (const id of ids) {
      const model = models.value.find(m => m.id === id);
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

async function bulkAddToQueue() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await queueApi.bulk(ids, 'add');
    for (const id of ids) {
      const model = models.value.find(m => m.id === id);
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
    for (const id of ids) {
      const model = models.value.find(m => m.id === id);
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
    for (const id of ids) {
      const model = models.value.find(m => m.id === id);
      if (model) { model.isPrinted = true; model.printRating = rating; }
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
  if (!confirm(`Are you sure you want to delete ${selectedCount.value} model(s)? This is a soft delete and can be undone.`)) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await modelsApi.bulkDelete(ids);
    models.value = models.value.filter(m => !ids.includes(m.id));
    total.value -= ids.length;
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to delete models:', error);
  } finally {
    bulkLoading.value = false;
  }
}

async function bulkRescan() {
  if (selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await modelsApi.bulkRescan(ids);
    await reloadModels();
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to rescan models:', error);
  } finally {
    bulkLoading.value = false;
  }
}


async function bulkAddTag() {
  const tagName = bulkTagInput.value.trim();
  if (!tagName || selectedCount.value === 0 || bulkLoading.value) return;
  bulkLoading.value = true;
  try {
    const ids = Array.from(selectedModels.value);
    await tagsApi.bulkAddToModels(ids, tagName);
    showBulkTagInput.value = false;
    bulkTagInput.value = '';
    deselectAll();
    selectionMode.value = false;
  } catch (error) {
    console.error('Failed to add tag:', error);
  } finally {
    bulkLoading.value = false;
  }
}

async function onRecategorizeApplied() {
  showRecategorizeModal.value = false;
  toggleSelectionMode();
  await reloadModels();
}

onMounted(() => {
  initFromQueryParams();
  loadModels().then(() => nextTick(setupObserver));
});

onUnmounted(() => {
  if (observer) observer.disconnect();
  if (store.globalSearchQuery) store.clearGlobalSearch();
});
</script>

<style scoped>
.designer-detail-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
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
  align-items: center;
  gap: 1rem;
}

.header-left h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.count-badge {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.625rem;
  font-size: 0.8125rem;
  color: var(--text-tertiary);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.875rem;
  padding: 0.5rem 0.875rem;
  cursor: pointer;
  transition: all var(--transition-base);
  text-decoration: none;
}

.back-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.profile-link-btn, .edit-btn, .favorite-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  text-decoration: none;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.profile-link-btn:hover, .edit-btn:hover, .favorite-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.profile-link-btn svg, .edit-btn svg, .favorite-btn svg {
  width: 14px;
  height: 14px;
}

.favorite-btn.active {
  background: rgba(248, 113, 113, 0.1);
  border-color: #f87171;
  color: #f87171;
}

.favorite-btn.active:hover {
  background: rgba(248, 113, 113, 0.2);
  border-color: #f87171;
  color: #f87171;
}

.detail-notes {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0.875rem 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
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

.sort-controls {
  display: flex;
  gap: 0.25rem;
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

.sort-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}
.sort-select:hover { border-color: var(--border-strong); }

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
  cursor: pointer;
}
.sort-order-btn svg { width: 16px; height: 16px; }
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
  cursor: pointer;
  border-right: 1px solid var(--border-default);
}
.view-btn:last-child { border-right: none; }
.view-btn svg { width: 16px; height: 16px; }
.view-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.view-btn.active { background: var(--accent-primary); color: var(--bg-deepest); }

/* Grid View */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}

.badge-paid {
  padding: 0.25rem 0.5rem;
  background: rgba(251, 191, 36, 0.15);
  color: var(--warning);
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 0.75rem;
}
.badge-small { font-size: 0.7rem; }

/* Table View */
.models-table-container {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}
.models-table { width: 100%; border-collapse: collapse; }
.models-table th {
  background: var(--bg-elevated);
  padding: 0.875rem 1rem;
  text-align: left;
  font-weight: 600; font-size: 0.75rem;
  color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-default);
}
.sortable-header { cursor: pointer; user-select: none; transition: color var(--transition-fast); }
.sortable-header:hover { color: var(--text-primary); }
.sort-indicator { margin-left: 4px; font-size: 0.6rem; color: var(--accent-primary); }
.models-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
.models-table tr { cursor: pointer; transition: background var(--transition-fast); animation: fadeIn 0.3s ease-out backwards; }
.models-table tbody tr:hover { background: var(--bg-hover); }

.col-image { width: 56px; }
.col-name { min-width: 200px; }
.col-category { width: 140px; }
.col-files { width: 70px; text-align: center; }
.col-date { width: 130px; font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); }
.col-actions { width: 120px; }

.table-image {
  width: 44px; height: 44px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-elevated);
  display: flex; align-items: center; justify-content: center;
}
.table-image img { width: 100%; height: 100%; object-fit: cover; }
.no-image-icon { width: 20px; height: 20px; color: var(--text-muted); }

.model-name-text {
  font-weight: 500;
  color: var(--text-primary);
}

.name-badges {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.125rem;
}

.category-pill {
  padding: 0.125rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
}

.table-actions {
  display: flex;
  gap: 0.25rem;
}

.action-btn-small {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}
.action-btn-small svg { width: 14px; height: 14px; }
.action-btn-small:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.action-btn-small.active { background: var(--accent-primary); color: var(--bg-deepest); border-color: var(--accent-primary); }
.action-btn-small.printed-good { color: var(--success); }
.action-btn-small.printed-bad { color: var(--danger); }

/* Pagination */
.pagination {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

.page-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.875rem;
  padding: 0.375rem 0.75rem;
  cursor: pointer;
  transition: all var(--transition-base);
}

.page-btn:hover, .page-btn.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

/* Edit Modal */
.edit-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.edit-modal {
  background: var(--bg-deep);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 2rem;
  width: 480px;
  max-width: 90vw;
}

.edit-modal h3 {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 1.5rem;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.form-input {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  outline: none;
  transition: border-color var(--transition-base);
  width: 100%;
}
.form-input:focus { border-color: var(--accent-primary); }

.form-textarea {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  outline: none;
  resize: vertical;
  width: 100%;
  font-family: inherit;
  transition: border-color var(--transition-base);
}
.form-textarea:focus { border-color: var(--accent-primary); }

.edit-modal-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.confirm-btn {
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--bg-deepest);
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: opacity var(--transition-base);
}
.confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cancel-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: all var(--transition-base);
}
.cancel-btn:hover { border-color: var(--text-secondary); color: var(--text-primary); }

.delete-btn {
  background: none;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  margin-left: auto;
  transition: all var(--transition-base);
}
.delete-btn:hover { background: rgba(248, 113, 113, 0.1); }

/* Loading and Empty states */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem;
  color: var(--text-tertiary);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem;
  color: var(--text-tertiary);
  text-align: center;
}

.empty h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty p {
  font-size: 0.875rem;
  color: var(--text-tertiary);
}

/* Select button (teleported to topbar) */
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
  cursor: pointer;
  transition: all var(--transition-base);
}
.select-btn svg { width: 16px; height: 16px; }
.select-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.select-btn.active { background: var(--accent-primary); border-color: var(--accent-primary); color: var(--bg-deepest); }

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
  position: sticky;
  top: 52px;
  z-index: 40;
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
.select-all-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

.bulk-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.bulk-actions.disabled { opacity: 0.5; pointer-events: none; }

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
.bulk-btn svg { width: 16px; height: 16px; }
.bulk-btn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--accent-primary-dim); }
.bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bulk-btn.printed-good-btn:hover:not(:disabled) { border-color: var(--success); color: var(--success); background: rgba(74, 222, 128, 0.1); }
.bulk-btn.delete-btn:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: rgba(248, 113, 113, 0.1); }

.bulk-loading { display: flex; align-items: center; margin-left: 0.5rem; }

.bulk-tag-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bulk-tag-input-row {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  display: flex;
  gap: 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0.5rem;
  box-shadow: var(--shadow-lg);
  z-index: 10;
  white-space: nowrap;
}

.bulk-tag-input {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.8125rem;
  padding: 0.3rem 0.625rem;
  outline: none;
  width: 140px;
  transition: border-color var(--transition-base);
}
.bulk-tag-input:focus { border-color: var(--accent-primary); }

.bulk-tag-confirm {
  background: var(--accent-primary-dim);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  cursor: pointer;
  transition: all var(--transition-base);
}
.bulk-tag-confirm:hover:not(:disabled) { background: var(--accent-primary); color: var(--bg-deepest); }
.bulk-tag-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

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
.selection-checkbox svg { width: 20px; height: 20px; color: var(--text-tertiary); }
.selection-checkbox:hover svg { color: var(--accent-primary); }

.model-card {
  position: relative;
}
.model-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-dim);
}

/* Table checkbox */
.col-checkbox { width: 48px; text-align: center; }
.table-checkbox { display: flex; align-items: center; justify-content: center; cursor: pointer; }
.table-checkbox svg { width: 20px; height: 20px; color: var(--text-tertiary); }
.table-checkbox:hover svg { color: var(--accent-primary); }
.models-table tr.selected { background: var(--accent-primary-dim); }
.models-table tr.selected:hover { background: var(--accent-primary-dim); }

/* Infinite scroll */
.load-more-sentinel { height: 1px; }

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--text-tertiary);
  font-size: 0.875rem;
}

.loading-spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
</style>
