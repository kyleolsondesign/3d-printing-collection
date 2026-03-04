<template>
  <div class="designer-detail-view">
    <div class="header">
      <div class="header-left">
        <router-link to="/designers" class="back-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          All Designers
        </router-link>
        <h2 v-if="designer">{{ designer.name }}</h2>
        <span class="count-badge" v-if="total > 0">{{ total }}</span>
      </div>
      <div class="header-actions" v-if="designer">
        <a v-if="designer.profile_url" :href="designer.profile_url" target="_blank" rel="noopener" class="profile-link-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <path d="M15 3h6v6"/>
            <path d="M10 14L21 3"/>
          </svg>
          Profile
        </a>
        <button @click="startEditDesigner" class="edit-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
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
            @click="filterQueued = cycleFilter(filterQueued)"
            :class="['filter-toggle-btn', { active: filterQueued, 'filter-hide': filterQueued === 'hide' }]"
            :title="filterQueued === 'only' ? 'Only queued (click to hide)' : filterQueued === 'hide' ? 'Hiding queued (click to clear)' : 'Click to show only queued'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
            <span>{{ filterLabel(filterQueued, 'Queued') }}</span>
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
        <button @click="viewMode = 'grid'" :class="['view-btn', { active: viewMode === 'grid' }]" title="Grid view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
        <button @click="viewMode = 'table'" :class="['view-btn', { active: viewMode === 'table' }]" title="Table view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
          </svg>
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

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="models-grid">
      <div
        v-for="(model, index) in models"
        :key="model.id"
        class="model-card"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
      >
        <div class="model-image" @click="openModal(model.id)">
          <img
            v-if="model.primaryImage"
            :src="getFileUrl(model.primaryImage)"
            :alt="model.filename"
            @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
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
          <h3 :title="model.filename" @click="openModal(model.id)">{{ model.filename }}</h3>
          <div class="model-meta">
            <span class="category-tag">{{ model.category }}</span>
            <span v-if="model.file_count > 1" class="file-count">{{ model.file_count }} files</span>
            <span v-if="model.is_paid" class="badge-paid">Paid</span>
          </div>
          <div class="model-actions">
            <button @click="store.toggleFavorite(model.id)" :class="['action-btn', { active: model.isFavorite }]" title="Favorite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            </button>
            <button @click="store.toggleQueue(model.id)" :class="['action-btn', { active: model.isQueued }]" title="Queue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
            </button>
            <button @click="store.cyclePrinted(model.id)" :class="['action-btn', { active: model.printRating, 'printed-good': model.printRating === 'good', 'printed-bad': model.printRating === 'bad' }]" title="Printed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
            </button>
            <button @click="openInFinder(model)" class="action-btn" title="Show in Finder">
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
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(model, index) in models"
            :key="model.id"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="openModal(model.id)"
          >
            <td class="col-image">
              <div class="table-image">
                <img v-if="model.primaryImage" :src="getFileUrl(model.primaryImage)" :alt="model.filename" @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'" />
                <svg v-else class="no-image-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
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
            <td class="col-actions" @click.stop>
              <div class="table-actions">
                <button @click="store.toggleFavorite(model.id)" :class="['action-btn-small', { active: model.isFavorite }]" title="Favorite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                  </svg>
                </button>
                <button @click="store.toggleQueue(model.id)" :class="['action-btn-small', { active: model.isQueued }]" title="Queue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                  </svg>
                </button>
                <button @click="store.cyclePrinted(model.id)" :class="['action-btn-small', { active: model.printRating, 'printed-good': model.printRating === 'good', 'printed-bad': model.printRating === 'bad' }]" title="Printed">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button
        v-for="p in totalPages"
        :key="p"
        @click="loadPage(p)"
        :class="['page-btn', { active: currentPage === p }]"
      >{{ p }}</button>
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

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      @close="selectedModelId = null"
      @updated="reloadModels"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { designersApi, modelsApi, systemApi, type Designer } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const route = useRoute();
const router = useRouter();
const store = useAppStore();

const loading = ref(true);
const designer = ref<Designer | null>(null);
const models = ref<any[]>([]);
const total = ref(0);
const totalPages = ref(0);
const currentPage = ref(1);
const selectedModelId = ref<number | null>(null);

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
  const { sort, order, view, model, page, fp, fq, ff } = route.query;
  if (sort && typeof sort === 'string' && ['date_added', 'date_created', 'name', 'category'].includes(sort)) {
    sortField.value = sort;
  }
  if (order && typeof order === 'string' && ['asc', 'desc'].includes(order)) {
    sortOrder.value = order as 'asc' | 'desc';
  }
  if (view === 'table') viewMode.value = 'table';
  if (model) selectedModelId.value = parseInt(model as string);
  if (page) currentPage.value = parseInt(page as string) || 1;
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

watch([sortField, sortOrder, viewMode, selectedModelId, filterPrinted, filterQueued, filterFavorites], () => {
  updateQueryParams();
});

const searchQuery = computed(() => store.globalSearchQuery);

// Reload models when sort, search, or filters change
watch([sortField, sortOrder, filterPrinted, filterQueued, filterFavorites], () => {
  currentPage.value = 1;
  loadModels();
});

watch(searchQuery, () => {
  currentPage.value = 1;
  loadModels();
});

async function loadModels() {
  const id = parseInt(route.params.id as string);
  if (!id) return;
  loading.value = true;
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
    models.value = res.data.models;
    total.value = res.data.total;
    totalPages.value = res.data.totalPages;
  } catch (error) {
    console.error('Failed to load designer:', error);
  } finally {
    loading.value = false;
  }
}

async function reloadModels() {
  await loadModels();
}

function loadPage(page: number) {
  currentPage.value = page;
  loadModels();
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

onMounted(() => {
  initFromQueryParams();
  loadModels();
});

onUnmounted(() => {
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

.profile-link-btn, .edit-btn {
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

.profile-link-btn:hover, .edit-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.profile-link-btn svg, .edit-btn svg {
  width: 14px;
  height: 14px;
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
.model-image img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--transition-slow); }
.model-card:hover .model-image img { transform: scale(1.05); }

.no-image { color: var(--text-muted); }
.no-image svg { width: 48px; height: 48px; }

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
.model-image:hover .image-overlay { opacity: 1; }

.open-hint {
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  border-radius: var(--radius-md);
}

.model-info { padding: 1rem; }
.model-info h3 {
  font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--text-primary); cursor: pointer;
}
.model-info h3:hover { color: var(--accent-primary); }

.model-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; font-size: 0.8rem; }
.category-tag { padding: 0.25rem 0.5rem; background: var(--bg-hover); border-radius: var(--radius-sm); color: var(--text-secondary); font-weight: 500; }
.file-count { color: var(--text-tertiary); }

.badge-paid {
  padding: 0.125rem 0.375rem;
  background: rgba(251, 191, 36, 0.15);
  color: var(--warning);
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 0.75rem;
}
.badge-small { font-size: 0.7rem; }

.model-actions {
  display: flex;
  gap: 0.375rem;
}

.action-btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  padding: 0.5rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}
.action-btn svg { width: 18px; height: 18px; }
.action-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--accent-primary-dim); }
.action-btn.active { background: var(--accent-primary); color: var(--bg-deepest); border-color: var(--accent-primary); }
.action-btn.printed-good { background: var(--success); color: var(--bg-deepest); border-color: var(--success); }
.action-btn.printed-bad { background: var(--danger); color: var(--bg-deepest); border-color: var(--danger); }

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
</style>
