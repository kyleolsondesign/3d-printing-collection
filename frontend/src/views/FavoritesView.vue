<template>
  <div class="favorites-view">
    <div class="header">
      <div class="header-left">
        <h2>Favorites</h2>
        <span class="count-badge" v-if="favorites.length > 0">{{ favorites.length }}</span>
      </div>
      <div class="header-actions">
        <button
          v-if="favorites.length > 0"
          @click="toggleSelectionMode"
          :class="['select-btn', { active: selectionMode }]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path v-if="selectionMode" d="M9 12l2 2 4-4"/>
          </svg>
          <span>{{ selectionMode ? 'Cancel' : 'Select' }}</span>
        </button>
      </div>
    </div>
    <p class="subtitle">Your starred 3D models</p>

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
      <span>Loading favorites...</span>
    </div>

    <div v-else-if="favorites.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </div>
      <h3>No favorites yet</h3>
      <p>Star models from the Browse page to add them here.</p>
    </div>

    <div v-else class="favorites-list">
      <div
        v-for="(fav, index) in favorites"
        :key="fav.id"
        :class="['favorite-card', { selected: selectedItems.has(fav.model_id) }]"
        :style="{ animationDelay: `${index * 50}ms` }"
        @click="selectionMode ? toggleSelection(fav.model_id) : openModal(fav)"
      >
        <div v-if="selectionMode" class="selection-checkbox" @click.stop="toggleSelection(fav.model_id)">
          <svg v-if="selectedItems.has(fav.model_id)" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="var(--accent-primary)"/>
            <path d="M9 12l2 2 4-4" stroke="var(--bg-deepest)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
          </svg>
        </div>
        <div class="card-thumbnail">
          <img
            v-if="fav.primaryImage"
            :src="modelsApi.getFileUrl(fav.primaryImage)"
            :alt="fav.filename"
            @error="onImageError"
            loading="lazy"
          />
          <div v-else class="no-image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
            </svg>
          </div>
        </div>
        <div class="favorite-content">
          <h3>{{ fav.filename }}</h3>
          <div class="favorite-meta">
            <span class="category-tag">{{ fav.category }}</span>
            <span class="file-type">{{ fav.file_type }}</span>
          </div>
          <p v-if="fav.notes" class="notes">{{ fav.notes }}</p>
        </div>
        <div class="actions">
          <button @click.stop="removeFavorite(fav.id)" class="btn-remove" title="Remove from favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
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
import { ref, computed, onMounted } from 'vue';
import { favoritesApi, modelsApi } from '../services/api';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const favorites = ref<any[]>([]);
const loading = ref(true);
const selectedModelId = ref<number | null>(null);

// Selection mode state
const selectionMode = ref(false);
const selectedItems = ref<Set<number>>(new Set());
const bulkLoading = ref(false);

const selectedCount = computed(() => selectedItems.value.size);
const allSelected = computed(() => favorites.value.length > 0 && selectedItems.value.size === favorites.value.length);

onMounted(async () => {
  await loadFavorites();
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

function handleModelUpdated() {
  loadFavorites();
}

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
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
    // Remove from local state
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
  max-width: 900px;
  animation: fadeIn 0.4s ease-out;
}

.header {
  margin-bottom: 2rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
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
}

.favorites-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.favorite-card {
  background: var(--bg-surface);
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  display: flex;
  gap: 1rem;
  align-items: center;
  transition: all var(--transition-base);
  animation: fadeIn 0.4s ease-out backwards;
  cursor: pointer;
}

.favorite-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-elevated);
}

.card-thumbnail {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-hover);
}

.card-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-thumbnail .no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.card-thumbnail .no-image svg {
  width: 24px;
  height: 24px;
}

.favorite-content {
  flex: 1;
  min-width: 0;
}

.favorite-content h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.favorite-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.category-tag {
  padding: 0.25rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.file-type {
  padding: 0.25rem 0.5rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  text-transform: uppercase;
}

.notes {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-subtle);
}

.actions {
  flex-shrink: 0;
}

.btn-remove {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  transition: all var(--transition-base);
  cursor: pointer;
}

.btn-remove svg {
  width: 16px;
  height: 16px;
}

.btn-remove:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-dim);
}

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

/* Header actions */
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

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
  margin-bottom: 1.5rem;
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

.loading-spinner.small {
  width: 20px;
  height: 20px;
  border-width: 2px;
}

/* Selection checkbox */
.selection-checkbox {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
}

.selection-checkbox svg {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
}

.selection-checkbox:hover svg {
  color: var(--accent-primary);
}

.favorite-card.selected {
  border-color: var(--accent-primary);
  background: var(--accent-primary-dim);
}
</style>
