<template>
  <div class="designers-view">
    <div class="header">
      <div class="header-left">
        <h2>Designers</h2>
        <span class="count-badge" v-if="designers.length > 0">{{ designers.length }}</span>
      </div>
      <div class="header-actions">
        <button @click="syncDesigners" class="sync-btn" :disabled="syncing" title="Sync designers from folder structure">
          <svg :class="{ spinning: syncing }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          {{ syncing ? 'Syncing...' : 'Sync Designers' }}
        </button>
        <button @click="showAddDesigner = true" class="add-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add Designer
        </button>
      </div>
    </div>

    <div v-if="syncResult" class="sync-result">
      Synced: {{ syncResult.created }} new designers, {{ syncResult.linked }} models linked.
      <button @click="syncResult = null" class="dismiss-btn">×</button>
    </div>

    <!-- Add Designer Form -->
    <div v-if="showAddDesigner" class="add-designer-form">
      <input v-model="newDesignerName" placeholder="Designer name" class="form-input" @keydown.enter="createDesigner" @keydown.escape="showAddDesigner = false" />
      <input v-model="newDesignerUrl" placeholder="Profile URL (optional)" class="form-input" type="url" />
      <div class="form-actions">
        <button @click="createDesigner" class="confirm-btn" :disabled="!newDesignerName.trim()">Create</button>
        <button @click="showAddDesigner = false; newDesignerName = ''; newDesignerUrl = ''" class="cancel-btn">Cancel</button>
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
      <p>Click "Sync Designers" to automatically detect designers from your Paid folder structure.</p>
    </div>

    <!-- Designer list view (no model selected) -->
    <div v-else-if="!selectedDesigner" class="designers-grid">
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
        <button class="edit-designer-btn" @click.stop="startEditDesigner(designer)" title="Edit designer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Designer detail view -->
    <div v-else class="designer-detail">
      <div class="detail-header">
        <button @click="selectedDesigner = null" class="back-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          All Designers
        </button>
        <div class="detail-title">
          <h3>{{ selectedDesigner.name }}</h3>
          <span class="model-count">{{ selectedDesigner.total }} model{{ selectedDesigner.total !== 1 ? 's' : '' }}</span>
        </div>
        <div class="detail-actions">
          <a v-if="selectedDesigner.profile_url" :href="selectedDesigner.profile_url" target="_blank" rel="noopener" class="profile-link-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <path d="M15 3h6v6"/>
              <path d="M10 14L21 3"/>
            </svg>
            View Profile
          </a>
          <button @click="startEditDesigner(selectedDesigner)" class="edit-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
        </div>
      </div>

      <div v-if="selectedDesigner.notes" class="detail-notes">{{ selectedDesigner.notes }}</div>

      <div v-if="loadingModels" class="loading">
        <div class="loading-spinner"></div>
        <span>Loading models...</span>
      </div>
      <div v-else class="models-grid">
        <div
          v-for="model in selectedDesigner.models"
          :key="model.id"
          class="model-card"
          @click="openModel(model.id)"
        >
          <div class="model-image">
            <img
              v-if="model.primaryImage"
              :src="getFileUrl(model.primaryImage)"
              :alt="model.filename"
              @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
            />
            <div v-else class="no-image">📦</div>
          </div>
          <div class="model-info">
            <div class="model-name">{{ model.filename }}</div>
            <div class="model-meta">
              <span class="file-count">{{ model.file_count }} file{{ model.file_count !== 1 ? 's' : '' }}</span>
              <span v-if="model.isPrinted" :class="['print-badge', model.printRating]">{{ model.printRating === 'good' ? '👍' : '👎' }}</span>
              <span v-if="model.isFavorite" class="fav-badge">★</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedDesigner.totalPages > 1" class="pagination">
        <button
          v-for="p in selectedDesigner.totalPages"
          :key="p"
          @click="loadDesignerPage(p)"
          :class="['page-btn', { active: currentPage === p }]"
        >{{ p }}</button>
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

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { designersApi, modelsApi, type Designer } from '../services/api';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

interface DesignerWithModels extends Designer {
  models: any[];
  total: number;
  totalPages: number;
}

const loading = ref(true);
const syncing = ref(false);
const loadingModels = ref(false);
const designers = ref<Designer[]>([]);
const selectedDesigner = ref<DesignerWithModels | null>(null);
const selectedModelId = ref<number | null>(null);
const currentPage = ref(1);
const syncResult = ref<{ created: number; linked: number } | null>(null);

// Add designer form
const showAddDesigner = ref(false);
const newDesignerName = ref('');
const newDesignerUrl = ref('');

// Edit designer
const editingDesigner = ref<Designer | null>(null);
const editForm = ref({ name: '', profile_url: '', notes: '' });

const filteredDesigners = computed(() => {
  return designers.value.filter(d => d.model_count && d.model_count > 0 || true);
});

onMounted(async () => {
  await loadDesigners();
});

async function loadDesigners() {
  loading.value = true;
  try {
    const res = await designersApi.getAll();
    designers.value = res.data;
  } catch (error) {
    console.error('Failed to load designers:', error);
  } finally {
    loading.value = false;
  }
}

async function syncDesigners() {
  syncing.value = true;
  syncResult.value = null;
  try {
    const res = await designersApi.sync();
    syncResult.value = res.data;
    await loadDesigners();
  } catch (error) {
    console.error('Failed to sync designers:', error);
  } finally {
    syncing.value = false;
  }
}

async function openDesigner(designer: Designer) {
  loadingModels.value = true;
  currentPage.value = 1;
  try {
    const res = await designersApi.getById(designer.id, 1);
    selectedDesigner.value = res.data;
  } catch (error) {
    console.error('Failed to load designer details:', error);
  } finally {
    loadingModels.value = false;
  }
}

async function loadDesignerPage(page: number) {
  if (!selectedDesigner.value) return;
  loadingModels.value = true;
  currentPage.value = page;
  try {
    const res = await designersApi.getById(selectedDesigner.value.id, page);
    selectedDesigner.value = res.data;
  } catch (error) {
    console.error('Failed to load page:', error);
  } finally {
    loadingModels.value = false;
  }
}

async function createDesigner() {
  if (!newDesignerName.value.trim()) return;
  try {
    await designersApi.create({ name: newDesignerName.value.trim(), profile_url: newDesignerUrl.value || undefined });
    newDesignerName.value = '';
    newDesignerUrl.value = '';
    showAddDesigner.value = false;
    await loadDesigners();
  } catch (error) {
    console.error('Failed to create designer:', error);
  }
}

function startEditDesigner(designer: Designer | DesignerWithModels) {
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
    // Refresh detail view if open
    if (selectedDesigner.value) {
      const res = await designersApi.getById(selectedDesigner.value.id, currentPage.value);
      selectedDesigner.value = res.data;
    }
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
    if (selectedDesigner.value?.id === editingDesigner.value?.id) {
      selectedDesigner.value = null;
    }
    await loadDesigners();
    selectedDesigner.value = null;
  } catch (error) {
    console.error('Failed to delete designer:', error);
  }
}

function openModel(modelId: number) {
  selectedModelId.value = modelId;
}

function handleModelUpdated() {
  // Reload model list if needed
}

function getFileUrl(filepath: string): string {
  return modelsApi.getFileUrl(filepath);
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

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.sync-btn, .add-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
}

.sync-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.sync-btn:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-btn svg {
  width: 16px;
  height: 16px;
}

.add-btn {
  background: var(--accent-primary-dim);
  border: 1px solid rgba(34, 211, 238, 0.3);
  color: var(--accent-primary);
}

.add-btn:hover {
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

.add-btn svg {
  width: 16px;
  height: 16px;
}

.sync-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-surface);
  border: 1px solid var(--success);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  color: var(--success);
  font-size: 0.875rem;
}

.dismiss-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 1.125rem;
  padding: 0;
  line-height: 1;
}

/* Add Designer Form */
.add-designer-form {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 1rem;
  flex-wrap: wrap;
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

/* Designer Detail View */
.designer-detail {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
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
}

.back-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.detail-title h3 {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--text-primary);
}

.detail-actions {
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
}

.profile-link-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.profile-link-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.profile-link-btn svg {
  width: 14px;
  height: 14px;
}

.edit-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.edit-btn:hover {
  border-color: var(--border-default);
  color: var(--text-primary);
}

.edit-btn svg {
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

/* Models Grid (in detail view) */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}

.model-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-base);
}

.model-card:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
}

.model-image {
  aspect-ratio: 1;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.model-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  font-size: 2.5rem;
}

.model-info {
  padding: 0.75rem;
}

.model-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.25rem;
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.print-badge {
  font-size: 0.875rem;
}

.fav-badge {
  color: var(--warning);
}

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

.spinning {
  animation: spin 0.8s linear infinite;
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
