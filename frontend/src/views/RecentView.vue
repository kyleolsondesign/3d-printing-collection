<template>
  <div class="recent-view">
    <div class="header">
      <div class="header-left">
        <h2>Recently Viewed</h2>
        <span class="count-badge" v-if="recentModels.length > 0">{{ recentModels.length }}</span>
      </div>
      <div class="header-actions" v-if="recentModels.length > 0">
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
    <p class="subtitle">Models you've recently opened</p>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading recent models...</span>
    </div>

    <div v-else-if="recentModels.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <h3>No recently viewed models</h3>
      <p>Open a model from the Browse page to see it here.</p>
    </div>

    <div v-else-if="filteredModels.length === 0" class="empty">
      <h3>No matches</h3>
      <p>No recently viewed models match your search.</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="models-grid">
      <div
        v-for="(model, index) in filteredModels"
        :key="model.id"
        class="model-card"
        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
      >
        <div class="model-image" @click="openModal(model)">
          <img
            v-if="model.primaryImage"
            :src="modelsApi.getFileUrl(model.primaryImage)"
            :alt="model.filename"
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
          <h3 :title="model.filename" @click="openModal(model)">{{ model.filename }}</h3>
          <div class="model-meta">
            <span class="category-tag">{{ model.category }}</span>
            <span class="viewed-at">{{ formatTimeAgo(model.viewed_at) }}</span>
          </div>
          <div class="model-actions">
            <button
              @click.stop="openInFinder(model)"
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
            <th class="col-image"></th>
            <th class="col-name">Name</th>
            <th class="col-category">Category</th>
            <th class="col-files">Files</th>
            <th class="col-date">Viewed</th>
            <th class="col-date">Date Added</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(model, index) in filteredModels"
            :key="model.id"
            :style="{ animationDelay: `${Math.min(index * 20, 200)}ms` }"
            @click="openModal(model)"
          >
            <td class="col-image">
              <div class="table-image">
                <img
                  v-if="model.primaryImage"
                  :src="modelsApi.getFileUrl(model.primaryImage)"
                  :alt="model.filename"
                  @error="onImageError"
                  loading="lazy"
                />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="no-image-icon">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
              </div>
            </td>
            <td class="col-name">
              <span class="model-name" :title="model.filename">{{ model.filename }}</span>
            </td>
            <td class="col-category">
              <span class="category-pill">{{ model.category }}</span>
            </td>
            <td class="col-files">{{ model.file_count }}</td>
            <td class="col-date">{{ formatTimeAgo(model.viewed_at) }}</td>
            <td class="col-date">{{ formatDate(model.date_added) }}</td>
            <td class="col-actions" @click.stop>
              <div class="table-actions">
                <button
                  @click="openInFinder(model)"
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
      :modelIds="filteredModels.map((m: any) => m.id)"
      @close="selectedModelId = null"
      @updated="handleModelUpdated"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { modelsApi, systemApi } from '../services/api';
import { useAppStore } from '../store';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const recentModels = ref<any[]>([]);
const loading = ref(true);
const selectedModelId = ref<number | null>(null);
const viewMode = ref<'grid' | 'table'>('grid');

const filteredModels = computed(() => {
  const q = store.globalSearchQuery.toLowerCase();
  if (!q) return recentModels.value;
  return recentModels.value.filter((m: any) => m.filename?.toLowerCase().includes(q));
});

function initFromQueryParams() {
  const { view, model } = route.query;
  if (view && typeof view === 'string' && ['grid', 'table'].includes(view)) {
    viewMode.value = view as 'grid' | 'table';
  }
  if (model) {
    selectedModelId.value = parseInt(model as string);
  }
}

function updateQueryParams() {
  const query: Record<string, string> = {};
  if (viewMode.value !== 'grid') query.view = viewMode.value;
  if (selectedModelId.value) query.model = String(selectedModelId.value);
  router.replace({ query });
}

watch(viewMode, () => {
  updateQueryParams();
});

watch(selectedModelId, () => {
  updateQueryParams();
});

onMounted(async () => {
  initFromQueryParams();
  await loadRecentModels();
});

onUnmounted(() => {
  if (store.globalSearchQuery) store.clearGlobalSearch();
});

async function loadRecentModels() {
  try {
    const response = await modelsApi.getRecent(50);
    recentModels.value = response.data.models;
  } catch (error) {
    console.error('Failed to load recent models:', error);
  } finally {
    loading.value = false;
  }
}

function openModal(model: any) {
  selectedModelId.value = model.id;
}

function handleModelUpdated() {
  loadRecentModels();
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

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

async function openInFinder(model: any) {
  try {
    await systemApi.openFolder(model.filepath);
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}
</script>

<style scoped>
.recent-view {
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

.viewed-at {
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
  width: 60px;
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

  .models-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}
</style>
