<template>
  <div class="designers-view">
    <div class="header">
      <div class="header-left">
        <h2>Designers</h2>
        <span class="count-badge" v-if="designers.length > 0">{{ filteredDesigners.length }}</span>
      </div>
    </div>

    <!-- Sort & Filter Controls -->
    <div v-if="!loading && designers.length > 0 " class="view-controls">
      <div class="controls-left">
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="model_count">Model Count</option>
            <option value="name">Name</option>
            <option value="paid_model_count">Paid Count</option>
            <option value="latest_model_date">Latest Model</option>
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
            @click="cyclePaidFilter"
            :class="['filter-toggle-btn', { active: activeFilter !== 'all', 'filter-hide': activeFilter === 'free' }]"
            :title="activeFilter === 'all' ? 'Click to show only paid designers' : activeFilter === 'paid' ? 'Click to show only free designers' : 'Click to clear filter'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            <span>{{ paidFilterLabel }}</span>
          </button>
          <button
            @click="hideSmall = !hideSmall"
            :class="['filter-toggle-btn', { active: hideSmall }]"
            title="Hide designers with fewer than 2 models"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="18" y1="8" x2="23" y2="8"/>
            </svg>
            <span>Hide &lt; 2 models</span>
          </button>
          <button
            @click="toggleFavoritesFilter"
            :class="['filter-toggle-btn', { active: favoritesOnly }]"
            title="Show only favorited designers"
          >
            <svg viewBox="0 0 24 24" :fill="favoritesOnly ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            <span>Favorites</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading designers...</span>
    </div>

    <div v-else-if="designers.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      </div>
      <h3>No designers yet</h3>
      <p>Run a scan from Settings to automatically detect designers from your folder structure and PDF metadata.</p>
    </div>

    <!-- Designer list -->
    <div v-else class="designers-grid">
      <div
        v-for="designer in filteredDesigners"
        :key="designer.id"
        class="designer-card"
        @click="openDesigner(designer)"
      >
        <div class="designer-avatar">
          {{ designer.name.charAt(0).toUpperCase() }}
        </div>
        <div class="designer-info">
          <div class="designer-name">{{ designer.name }}</div>
          <div class="designer-meta">
            <span class="model-count">{{ designer.model_count }} model{{ designer.model_count !== 1 ? 's' : '' }}</span>
            <span v-if="designer.paid_model_count > 0" class="paid-badge">{{ designer.paid_model_count }} paid</span>
            <a v-if="designer.profile_url" :href="designer.profile_url" target="_blank" rel="noopener" class="profile-link" @click.stop>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <path d="M15 3h6v6"/>
                <path d="M10 14L21 3"/>
              </svg>
              Profile
            </a>
          </div>
          <div v-if="designer.notes" class="designer-notes">{{ designer.notes }}</div>
        </div>
        <div class="card-actions">
          <button
            :class="['favorite-designer-btn', { active: designer.is_favorite }]"
            @click.stop="toggleFavorite(designer)"
            :title="designer.is_favorite ? 'Remove from favorites' : 'Add to favorites'"
          >
            <svg viewBox="0 0 24 24" :fill="designer.is_favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </button>
          <button class="edit-designer-btn" @click.stop="startEditDesigner(designer)" title="Edit designer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { designersApi, type Designer } from '../services/api';
import { useAppStore } from '../store';

const route = useRoute();
const router = useRouter();

const store = useAppStore();

const loading = ref(true);
const designers = ref<Designer[]>([]);

// Filter: 3-state cycle: all → paid → free → all
const activeFilter = ref<'all' | 'paid' | 'free'>('all');

function cyclePaidFilter() {
  if (activeFilter.value === 'all') activeFilter.value = 'paid';
  else if (activeFilter.value === 'paid') activeFilter.value = 'free';
  else activeFilter.value = 'all';
  loadDesigners();
}

const paidFilterLabel = computed(() => {
  if (activeFilter.value === 'paid') return 'Only Paid';
  if (activeFilter.value === 'free') return 'Only Free';
  return 'Paid/Free';
});

// Sort & hide
const sortField = ref('model_count');
const sortOrder = ref<'asc' | 'desc'>('desc');
const hideSmall = ref(true);
const favoritesOnly = ref(false);

// Edit designer
const editingDesigner = ref<Designer | null>(null);
const editForm = ref({ name: '', profile_url: '', notes: '' });

const filteredDesigners = computed(() => {
  let items = [...designers.value];

  // Search filter
  const q = store.globalSearchQuery.toLowerCase();
  if (q) {
    items = items.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.notes && d.notes.toLowerCase().includes(q))
    );
  }

  // Hide small designers
  if (hideSmall.value) {
    items = items.filter(d => (d.model_count || 0) >= 2);
  }

  // Sort
  items.sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortField.value) {
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        break;
      case 'model_count':
        aVal = a.model_count || 0;
        bVal = b.model_count || 0;
        break;
      case 'paid_model_count':
        aVal = a.paid_model_count || 0;
        bVal = b.paid_model_count || 0;
        break;
      case 'latest_model_date':
        aVal = (a as any).latest_model_date || '';
        bVal = (b as any).latest_model_date || '';
        break;
      default:
        return 0;
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder.value === 'asc' ? cmp : -cmp;
  });

  return items;
});

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
}

function toggleFavoritesFilter() {
  favoritesOnly.value = !favoritesOnly.value;
  loadDesigners();
}

async function toggleFavorite(designer: Designer) {
  try {
    const res = await designersApi.toggleFavorite(designer.id);
    designer.is_favorite = res.data.is_favorite ? 1 : 0;
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
  }
}

function initFromQueryParams() {
  const { sort, order, hideSmall: hs } = route.query;
  if (sort && typeof sort === 'string' && ['name', 'model_count', 'paid_model_count', 'latest_model_date'].includes(sort)) {
    sortField.value = sort;
  }
  if (order && typeof order === 'string' && ['asc', 'desc'].includes(order)) {
    sortOrder.value = order as 'asc' | 'desc';
  }
  if (hs === 'false') {
    hideSmall.value = false;
  }
}

function updateQueryParams() {
  const query: Record<string, string> = {};
  if (sortField.value !== 'model_count') query.sort = sortField.value;
  if (sortOrder.value !== 'desc') query.order = sortOrder.value;
  if (!hideSmall.value) query.hideSmall = 'false';
  router.replace({ query });
}

watch([sortField, sortOrder, hideSmall], () => {
  updateQueryParams();
});

onMounted(async () => {
  initFromQueryParams();
  await loadDesigners();
});

onUnmounted(() => {
  if (store.globalSearchQuery) store.clearGlobalSearch();
});

async function loadDesigners() {
  loading.value = true;
  try {
    const res = await designersApi.getAll(
      activeFilter.value === 'all' ? undefined : activeFilter.value,
      favoritesOnly.value || undefined
    );
    designers.value = res.data;
  } catch (error) {
    console.error('Failed to load designers:', error);
  } finally {
    loading.value = false;
  }
}

function openDesigner(designer: Designer) {
  router.push(`/designers/${designer.id}`);
}

function startEditDesigner(designer: Designer) {
  editingDesigner.value = designer;
  editForm.value = {
    name: designer.name,
    profile_url: designer.profile_url || '',
    notes: designer.notes || ''
  };
}

function cancelEdit() {
  editingDesigner.value = null;
}

async function saveEdit() {
  if (!editingDesigner.value || !editForm.value.name.trim()) return;
  try {
    await designersApi.update(editingDesigner.value.id, {
      name: editForm.value.name.trim(),
      profile_url: editForm.value.profile_url || undefined,
      notes: editForm.value.notes || undefined
    });
    editingDesigner.value = null;
    await loadDesigners();
  } catch (error) {
    console.error('Failed to update designer:', error);
  }
}

async function deleteDesigner() {
  if (!editingDesigner.value) return;
  if (!confirm(`Delete designer "${editingDesigner.value.name}"? Their models will not be deleted.`)) return;
  try {
    await designersApi.delete(editingDesigner.value.id);
    editingDesigner.value = null;
    await loadDesigners();
  } catch (error) {
    console.error('Failed to delete designer:', error);
  }
}
</script>

<style scoped>
.designers-view {
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

/* View Controls (sort + filters) */
.view-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.filter-toggles {
  display: flex;
  gap: 0.5rem;
}

.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition-base);
}
.filter-toggle-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
.filter-toggle-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.filter-toggle-btn.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.filter-toggle-btn.filter-hide {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

/* Paid Badge */
.paid-badge {
  font-size: 0.75rem;
  background: rgba(251, 191, 36, 0.15);
  color: var(--warning);
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-sm);
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
  flex: 1;
  min-width: 180px;
}

.form-input:focus {
  border-color: var(--accent-primary);
}

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

.form-textarea:focus {
  border-color: var(--accent-primary);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
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

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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

.cancel-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

/* Designers Grid */
.designers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.designer-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
}

.designer-card:hover {
  border-color: var(--accent-primary);
  background: var(--bg-elevated);
  transform: translateY(-1px);
}

.designer-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent-primary-dim);
  border: 1px solid rgba(34, 211, 238, 0.3);
  color: var(--accent-primary);
  font-size: 1.25rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.designer-info {
  flex: 1;
  min-width: 0;
}

.designer-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9375rem;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.designer-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
}

.model-count {
  color: var(--text-tertiary);
}

.profile-link {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--accent-primary);
  text-decoration: none;
  font-size: 0.8125rem;
  transition: opacity var(--transition-base);
}

.profile-link:hover {
  opacity: 0.8;
}

.profile-link svg {
  width: 12px;
  height: 12px;
}

.designer-notes {
  font-size: 0.8125rem;
  color: var(--text-tertiary);
  margin-top: 0.375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.favorite-designer-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all var(--transition-base);
}

.favorite-designer-btn.active {
  opacity: 1;
  color: #f87171;
}

.designer-card:hover .favorite-designer-btn {
  opacity: 1;
}

.favorite-designer-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.favorite-designer-btn svg {
  width: 16px;
  height: 16px;
  display: block;
}

.edit-designer-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all var(--transition-base);
  flex-shrink: 0;
}

.designer-card:hover .edit-designer-btn {
  opacity: 1;
}

.edit-designer-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.edit-designer-btn svg {
  width: 16px;
  height: 16px;
  display: block;
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

.edit-modal-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

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

.delete-btn:hover {
  background: rgba(248, 113, 113, 0.1);
}

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
  gap: 1rem;
  padding: 4rem;
  color: var(--text-tertiary);
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.empty-icon svg {
  width: 32px;
  height: 32px;
}

.empty h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty p {
  font-size: 0.875rem;
  color: var(--text-tertiary);
  max-width: 400px;
}
</style>
