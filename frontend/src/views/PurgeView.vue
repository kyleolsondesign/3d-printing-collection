<template>
  <div class="purge-view">
    <div class="header">
      <div class="header-left">
        <button @click="router.push('/settings')" class="back-btn" title="Back to Settings">
          <AppIcon name="chevron-left" />
        </button>
        <h2>Purge Candidates</h2>
        <span class="count-badge warning" v-if="candidates.length > 0">{{ candidates.length }}</span>
      </div>
      <p class="subtitle">Models flagged for permanent removal. Review and select which to move to Trash.</p>
    </div>

    <!-- View Controls -->
    <div v-if="candidates.length > 0" class="view-controls">
      <div class="controls-left">
        <!-- placeholder for future filters -->
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
      <span>Loading purge candidates...</span>
    </div>

    <div v-else-if="candidates.length === 0" class="empty success">
      <div class="empty-icon">
        <AppIcon name="check-circle" />
      </div>
      <h3>No purge candidates</h3>
      <p>No models are flagged for purge. Models marked for purge, soft-deleted with missing folders, or with bad print ratings will appear here.</p>
    </div>

    <template v-else>
      <!-- Bulk Actions Bar -->
      <div class="bulk-actions-bar">
        <div class="selection-controls">
          <label class="checkbox-wrapper select-all">
            <input
              type="checkbox"
              :checked="isAllSelected"
              :indeterminate="isPartiallySelected"
              @change="toggleSelectAll"
            />
            <span class="checkbox-label">
              {{ isAllSelected ? 'Deselect All' : 'Select All' }}
            </span>
          </label>
          <div class="reason-selectors">
            <button
              v-if="candidates.some(c => c.reasons.includes('marked'))"
              @click="selectByReason('marked')"
              class="reason-select-btn marked"
              title="Select all models marked for purge"
            >Marked</button>
            <button
              v-if="candidates.some(c => c.reasons.includes('deleted'))"
              @click="selectByReason('deleted')"
              class="reason-select-btn deleted"
              title="Select all soft-deleted models with missing folders"
            >Deleted</button>
            <button
              v-if="candidates.some(c => c.reasons.includes('bad_print'))"
              @click="selectByReason('bad_print')"
              class="reason-select-btn bad-print"
              title="Select all models with bad print ratings"
            >Bad Print</button>
          </div>
          <span class="selection-count" v-if="selectedIds.size > 0">
            {{ selectedIds.size }} selected
          </span>
        </div>
        <div class="bulk-buttons" v-if="selectedIds.size > 0">
          <button @click="startPurge" class="btn-purge">
            <AppIcon name="trash" />
            Purge Selected ({{ selectedIds.size }})
          </button>
        </div>
      </div>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'" class="models-grid">
        <div
          v-for="c in candidates"
          :key="c.id"
          :class="['model-card', { selected: selectedIds.has(c.id) }]"
        >
          <!-- Checkbox -->
          <div class="selection-checkbox" @click.stop="toggleSelect(c.id)">
            <AppIcon :name="selectedIds.has(c.id) ? 'checkbox-checked-danger' : 'checkbox'" />
          </div>

          <!-- Image (click to toggle selection; overlay button opens modal) -->
          <div class="model-image" @click="toggleSelect(c.id)">
            <img
              v-if="c.primaryImage"
              :src="getFileUrl(c.primaryImage)"
              :alt="c.filename"
              @error="onImageError"
              loading="lazy"
            />
            <div v-else class="no-image">
              <AppIcon name="package" />
            </div>
            <div class="image-overlay">
              <span class="open-hint" @click.stop="openModal(c.id)">View details</span>
            </div>
          </div>

          <!-- Info -->
          <div class="model-info">
            <h3 :title="c.filename" @click="openModal(c.id)">{{ c.filename }}</h3>
            <div class="model-meta">
              <span class="category-tag">{{ c.category }}</span>
            </div>
            <div class="reason-badges">
              <span v-if="c.reasons.includes('marked')" class="reason-badge marked">Marked</span>
              <span v-if="c.reasons.includes('deleted')" class="reason-badge deleted">Deleted</span>
              <span v-if="c.reasons.includes('bad_print')" class="reason-badge bad-print">Bad Print</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <div v-else class="models-table-container">
        <table class="models-table">
          <thead>
            <tr>
              <th class="col-checkbox">
                <label class="checkbox-wrapper">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    :indeterminate="isPartiallySelected"
                    @change="toggleSelectAll"
                  />
                </label>
              </th>
              <th class="col-image"></th>
              <th class="col-name">Name</th>
              <th class="col-category">Category</th>
              <th class="col-reasons">Reasons</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in candidates"
              :key="c.id"
              :class="{ selected: selectedIds.has(c.id) }"
              @click="openModal(c.id)"
            >
              <td class="col-checkbox" @click.stop="toggleSelect(c.id)">
                <div class="table-checkbox">
                  <AppIcon :name="selectedIds.has(c.id) ? 'checkbox-checked-danger' : 'checkbox'" />
                </div>
              </td>
              <td class="col-image">
                <div class="table-image">
                  <img
                    v-if="c.primaryImage"
                    :src="getFileUrl(c.primaryImage)"
                    :alt="c.filename"
                    @error="onImageError"
                  />
                  <div v-else class="table-no-image">
                    <AppIcon name="package" />
                  </div>
                </div>
              </td>
              <td class="col-name">
                <span class="table-name">{{ c.filename }}</span>
              </td>
              <td class="col-category">{{ c.category }}</td>
              <td class="col-reasons">
                <div class="reason-badges">
                  <span v-if="c.reasons.includes('marked')" class="reason-badge marked">Marked</span>
                  <span v-if="c.reasons.includes('deleted')" class="reason-badge deleted">Deleted</span>
                  <span v-if="c.reasons.includes('bad_print')" class="reason-badge bad-print">Bad Print</span>
                </div>
              </td>
              <td class="col-actions" @click.stop>
                <button
                  class="action-btn"
                  title="Select for purge"
                  @click="toggleSelect(c.id)"
                >
                  <AppIcon name="trash" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Confirmation Modal -->
    <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm = false">
      <div class="confirm-modal">
        <h3>Confirm Purge</h3>
        <p>This will permanently move <strong>{{ selectedIds.size }} model folder{{ selectedIds.size === 1 ? '' : 's' }}</strong> to the macOS Trash and remove them from the database.</p>
        <p class="confirm-warning">This action cannot be undone from within the app.</p>

        <div class="confirm-actions">
          <button @click="showConfirm = false" class="btn-secondary">Cancel</button>
          <button
            @click="executePurge"
            class="btn-purge"
            :disabled="purging"
          >
            <AppIcon v-if="purging" name="spinner" class="spin" />
            {{ purging ? 'Purging...' : 'Move to Trash' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Results Panel -->
    <div v-if="purgeResults" class="results-panel">
      <div class="results-header">
        <AppIcon name="check-circle" class="results-icon success" />
        <div>
          <h4>Purge complete</h4>
          <p>{{ purgeResults.purged }} model{{ purgeResults.purged === 1 ? '' : 's' }} moved to Trash</p>
        </div>
        <button @click="purgeResults = null" class="dismiss-btn">
          <AppIcon name="x" />
        </button>
      </div>
      <div v-if="purgeResults.errors.length > 0" class="results-errors">
        <p class="error-label">Errors ({{ purgeResults.errors.length }}):</p>
        <ul>
          <li v-for="(e, i) in purgeResults.errors" :key="i">{{ e }}</li>
        </ul>
      </div>
    </div>

    <!-- Model Details Modal -->
    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      :modelIds="candidates.map(c => c.id)"
      @close="closeModal"
      @updated="handleModelUpdated"
      @navigate="openModal($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { purgeApi, modelsApi, type PurgeCandidate } from '../services/api';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';
import AppIcon from '../components/AppIcon.vue';

const router = useRouter();
const route = useRoute();

const loading = ref(true);
const purging = ref(false);
const candidates = ref<PurgeCandidate[]>([]);
const selectedIds = ref(new Set<number>());
const viewMode = ref<'grid' | 'table'>('grid');
const selectedModelId = ref<number | null>(null);
const showConfirm = ref(false);
const purgeResults = ref<{ purged: number; errors: string[] } | null>(null);

const isAllSelected = computed(() => candidates.value.length > 0 && selectedIds.value.size === candidates.value.length);
const isPartiallySelected = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < candidates.value.length);

function getFileUrl(filepath: string): string {
  return modelsApi.getFileUrl(filepath);
}

function onImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
}

async function loadCandidates() {
  loading.value = true;
  try {
    const response = await purgeApi.getCandidates();
    candidates.value = response.data.candidates;
  } catch (error) {
    console.error('Failed to load purge candidates:', error);
  } finally {
    loading.value = false;
  }
}

function openModal(id: number) {
  router.replace({ query: { ...route.query, model: String(id) } });
}

function closeModal() {
  const q = { ...route.query };
  delete q.model;
  router.replace({ query: q });
  selectedModelId.value = null;
}

function handleModelUpdated() {
  // Refresh candidates in case purge mark was toggled from modal
  loadCandidates();
}

// Sync selectedModelId with ?model= query param
watch(() => route.query.model, (val) => {
  selectedModelId.value = val ? Number(val) : null;
}, { immediate: true });

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(candidates.value.map(c => c.id));
  }
}

function selectByReason(reason: 'marked' | 'deleted' | 'bad_print') {
  const next = new Set(selectedIds.value);
  const matching = candidates.value.filter(c => c.reasons.includes(reason)).map(c => c.id);
  const allAlreadySelected = matching.every(id => next.has(id));
  if (allAlreadySelected) {
    matching.forEach(id => next.delete(id));
  } else {
    matching.forEach(id => next.add(id));
  }
  selectedIds.value = next;
}

function startPurge() {
  showConfirm.value = true;
}

async function executePurge() {
  if (purging.value) return;
  purging.value = true;
  try {
    const ids = Array.from(selectedIds.value);
    const response = await purgeApi.execute(ids);
    const data = response.data;

    showConfirm.value = false;
    purgeResults.value = { purged: data.purged, errors: data.errors };
    selectedIds.value = new Set();
    await loadCandidates();
  } catch (error) {
    console.error('Failed to execute purge:', error);
  } finally {
    purging.value = false;
  }
}

onMounted(loadCandidates);
</script>

<style scoped>
.purge-view {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.back-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 6px 0 0;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  font-size: 0.75rem;
  font-weight: 600;
}

.count-badge.warning {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* View Controls */
.view-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  display: flex;
  gap: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 3px;
}

.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.view-btn:hover { color: var(--text-primary); }
.view-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.view-btn svg { width: 16px; height: 16px; }

.loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-secondary);
  justify-content: center;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.empty.success .empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.empty.success .empty-icon svg { width: 28px; height: 28px; }

.empty h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.empty p {
  font-size: 0.875rem;
  max-width: 400px;
  margin: 0 auto;
  line-height: 1.5;
}

/* Bulk Actions Bar */
.bulk-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  margin-bottom: 16px;
}

.selection-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.checkbox-wrapper input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--danger, #ef4444);
}

.checkbox-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.reason-selectors {
  display: flex;
  align-items: center;
  gap: 6px;
}

.reason-select-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
}

.reason-select-btn:hover { filter: brightness(1.15); }

.reason-select-btn.marked {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.reason-select-btn.deleted {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.reason-select-btn.bad-print {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
  border: 1px solid rgba(249, 115, 22, 0.3);
}

.selection-count {
  font-size: 0.875rem;
  color: var(--text-primary);
  font-weight: 500;
}

.btn-purge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid #ef4444;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-purge:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); }
.btn-purge:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-purge svg { width: 16px; height: 16px; }

.spin { animation: spin 0.8s linear infinite; }

/* Grid View */
.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.model-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  position: relative;
}

.model-card:hover {
  border-color: var(--border-strong);
}

.model-card.selected {
  border-color: #ef4444;
  box-shadow: 0 0 0 1px #ef4444;
}

.model-card.is-paid {
  border-left: 3px solid #f59e0b;
}

.selection-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 5;
  width: 22px;
  height: 22px;
  cursor: pointer;
  background: rgba(0,0,0,0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.selection-checkbox:hover { background: rgba(0,0,0,0.7); }

.selection-checkbox svg {
  width: 18px;
  height: 18px;
  color: rgba(255,255,255,0.8);
}

.model-image {
  aspect-ratio: 1;
  background: var(--bg-deep);
  overflow: hidden;
  position: relative;
  cursor: pointer;
}

.model-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}

.model-card:hover .model-image img { transform: scale(1.04); }

.no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.no-image svg { width: 40px; height: 40px; opacity: 0.4; }

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.model-card:hover .image-overlay { opacity: 1; }

.open-hint {
  color: white;
  font-size: 0.8rem;
  font-weight: 500;
  background: rgba(0,0,0,0.4);
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
}

.model-info {
  padding: 10px 12px;
}

.model-info h3 {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.model-info h3:hover { color: var(--accent-primary); }

.model-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.category-tag {
  font-size: 0.72rem;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
}

.paid-tag {
  font-size: 0.72rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* Reason Badges */
.reason-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.reason-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.reason-badge.marked {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.reason-badge.deleted {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.reason-badge.bad-print {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
  border: 1px solid rgba(249, 115, 22, 0.3);
}

/* Table View */
.models-table-container {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: 8px;
}

.models-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.models-table thead tr {
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-default);
}

.models-table th {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.models-table tbody tr {
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background 0.1s;
}

.models-table tbody tr:last-child { border-bottom: none; }
.models-table tbody tr:hover { background: var(--bg-hover); }
.models-table tbody tr.selected { background: rgba(239, 68, 68, 0.06); }
.models-table tbody tr.is-paid-row { border-left: 3px solid #f59e0b; }

.models-table td {
  padding: 10px 12px;
  color: var(--text-primary);
  vertical-align: middle;
}

.col-checkbox { width: 40px; }

.table-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.table-checkbox svg { width: 18px; height: 18px; color: var(--text-muted); }

.col-image { width: 56px; }

.table-image {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-deep);
}

.table-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.table-no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.table-no-image svg { width: 20px; height: 20px; opacity: 0.4; }

.col-name { min-width: 200px; }

.table-name {
  font-weight: 500;
  color: var(--text-primary);
}

.paid-tag-small {
  display: inline-block;
  font-size: 0.7rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  margin-left: 6px;
}

.col-category { white-space: nowrap; color: var(--text-secondary); }

.col-reasons { min-width: 160px; }

.col-actions { width: 60px; text-align: center; }

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  color: #ef4444;
  border-color: #ef4444;
}

.action-btn svg { width: 14px; height: 14px; }

/* Confirmation Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.confirm-modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 24px;
  max-width: 460px;
  width: 100%;
}

.confirm-modal h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-primary);
}

.confirm-modal p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0 0 12px;
  line-height: 1.5;
}

.confirm-warning { color: #ef4444 !important; font-weight: 500; }


.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-secondary:hover { border-color: var(--border-strong); color: var(--text-primary); }

/* Results Panel */
.results-panel {
  margin-top: 24px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
}

.results-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.results-icon { width: 24px; height: 24px; flex-shrink: 0; }
.results-icon.success { color: #22c55e; }

.results-header h4 { margin: 0 0 2px; font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }
.results-header p { margin: 0; font-size: 0.825rem; color: var(--text-secondary); }

.dismiss-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}

.dismiss-btn:hover { color: var(--text-secondary); background: var(--bg-surface); }
.dismiss-btn svg { width: 14px; height: 14px; }

.results-errors {
  border-top: 1px solid var(--border-default);
  padding: 12px 16px;
}

.error-label { font-size: 0.8rem; font-weight: 500; color: #ef4444; margin: 0 0 8px; }

.results-errors ul { margin: 0; padding-left: 16px; }
.results-errors li { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px; }
</style>
