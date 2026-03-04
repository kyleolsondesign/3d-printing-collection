<template>
  <div class="designers-view">
    <div class="header">
      <div class="header-left">
        <h2>Designers</h2>
        <span class="count-badge" v-if="dStore.designers.length > 0">
          {{ filteredDesigners.length }}
        </span>
        <div
          v-if="isFetching"
          class="fetch-indicator"
          title="Refreshing..."
        ></div>
      </div>
    </div>

    <!-- Sort & Filter Controls -->
    <div v-if="!isLoading && dStore.designers.length > 0" class="view-controls">
      <div class="controls-left">
        <div class="sort-controls">
          <select v-model="sortField" class="sort-select">
            <option value="model_count">Model Count</option>
            <option value="name">Name</option>
            <option value="paid_model_count">Paid Count</option>
            <option value="latest_model_date">Latest Model</option>
          </select>
          <button
            @click="toggleSortOrder"
            class="sort-order-btn"
            :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'"
          >
            <svg
              v-if="sortOrder === 'desc'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        <div class="filter-toggles">
          <button
            @click="dStore.cyclePaidFilter()"
            :class="[
              'filter-toggle-btn',
              {
                active: activeFilter !== 'all',
                'filter-hide': activeFilter === 'free',
              },
            ]"
            :title="
              activeFilter === 'all'
                ? 'Click to show only paid designers'
                : activeFilter === 'paid'
                  ? 'Click to show only free designers'
                  : 'Click to clear filter'
            "
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <span>{{ paidFilterLabel }}</span>
          </button>
          <button
            @click="hideSmall = !hideSmall"
            :class="['filter-toggle-btn', { active: hideSmall }]"
            title="Hide designers with fewer than 2 models"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="18" y1="8" x2="23" y2="8" />
            </svg>
            <span>Hide &lt; 2 models</span>
          </button>
          <button
            @click="dStore.toggleFavoritesOnly()"
            :class="['filter-toggle-btn', { active: favoritesOnly }]"
            title="Show only favorited designers"
          >
            <svg
              viewBox="0 0 24 24"
              :fill="favoritesOnly ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
              />
            </svg>
            <span>Favorites</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading designers...</span>
    </div>

    <div v-else-if="dStore.designers.length === 0" class="empty">
      <div class="empty-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <h3>No designers yet</h3>
      <p>
        Run a scan from Settings to automatically detect designers from your
        folder structure and PDF metadata.
      </p>
    </div>

    <!-- Designer grid -->
    <div v-else class="designers-grid">
      <div
        v-for="(designer, index) in displayedDesigners"
        :key="designer.id"
        class="designer-card"
        :style="{ animationDelay: `${Math.min(index * 20, 300)}ms` }"
        @click="openDesigner(designer, $event)"
      >
        <!-- Image collage / avatar -->
        <div class="designer-preview">
          <div
            v-if="designer.preview_images && designer.preview_images.length > 0"
            class="preview-collage"
            :class="
              designer.preview_images.length === 1
                ? 'collage-1'
                : 'collage-multi'
            "
          >
            <div
              v-for="(img, i) in designer.preview_images.slice(0, 4)"
              :key="i"
              class="collage-cell"
            >
              <img
                :src="imageUrl(img)"
                :alt="designer.name"
                loading="lazy"
                @error="onImageError"
              />
            </div>
            <div
              v-for="i in emptyCollageCells(designer)"
              :key="`empty-${i}`"
              class="collage-cell empty"
            ></div>
          </div>
          <div v-else class="preview-avatar">
            {{ designer.name.charAt(0).toUpperCase() }}
          </div>

          <!-- Favorite indicator (always visible when favorited) -->
          <div v-if="designer.is_favorite" class="favorite-indicator">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path
                d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
              />
            </svg>
          </div>

          <!-- Hover overlay with actions -->
          <div class="preview-overlay">
            <button
              :class="['overlay-btn', { active: designer.is_favorite }]"
              @click.stop="dStore.toggleFavorite(designer)"
              :title="
                designer.is_favorite
                  ? 'Remove from favorites'
                  : 'Add to favorites'
              "
            >
              <svg
                viewBox="0 0 24 24"
                :fill="designer.is_favorite ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
                />
              </svg>
            </button>
            <a
              v-if="designer.profile_url"
              :href="designer.profile_url"
              target="_blank"
              rel="noopener"
              class="overlay-btn"
              @click.stop
              title="View profile"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
              </svg>
            </a>
            <button
              class="overlay-btn"
              @click.stop="startEditDesigner(designer)"
              title="Edit designer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Card info -->
        <div class="designer-info">
          <div class="designer-name">{{ designer.name }}</div>
          <div class="designer-stats">
            <span class="stat-models">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
                />
              </svg>
              {{ designer.model_count }} model{{
                designer.model_count !== 1 ? 's' : ''
              }}
            </span>
            <span
              v-if="(designer.paid_model_count || 0) > 0"
              class="paid-badge"
            >
              {{ designer.paid_model_count }} paid
            </span>
          </div>
          <div v-if="designer.latest_model_date" class="designer-date">
            {{ formatDate(designer.latest_model_date) }}
          </div>
          <div v-if="designer.notes" class="designer-notes">
            {{ designer.notes }}
          </div>
        </div>
      </div>
    </div>

    <!-- Infinite scroll sentinel -->
    <div v-if="hasMore" ref="sentinelRef" class="scroll-sentinel">
      <div class="loading-more">
        <div class="loading-spinner small"></div>
      </div>
    </div>

    <!-- Edit Designer Modal -->
    <div
      v-if="editingDesigner"
      class="edit-modal-overlay"
      @click.self="cancelEdit"
    >
      <div class="edit-modal">
        <h3>Edit Designer</h3>
        <div class="edit-form">
          <label>
            Name
            <input v-model="editForm.name" class="form-input" type="text" />
          </label>
          <label>
            Profile URL
            <input
              v-model="editForm.profile_url"
              class="form-input"
              type="url"
              placeholder="https://..."
            />
          </label>
          <label>
            Notes
            <textarea
              v-model="editForm.notes"
              class="form-textarea"
              rows="3"
              placeholder="Notes about this designer..."
            ></textarea>
          </label>
        </div>
        <div class="edit-modal-actions">
          <button
            @click="saveEdit"
            class="confirm-btn"
            :disabled="!editForm.name.trim()"
          >
            Save
          </button>
          <button @click="cancelEdit" class="cancel-btn">Cancel</button>
          <button @click="deleteDesigner" class="delete-btn">
            Delete Designer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { designersApi, modelsApi, type Designer } from '../services/api';
import { useAppStore } from '../store';
import { useDesignersStore } from '../store/designers';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const dStore = useDesignersStore();

const {
  activeFilter,
  favoritesOnly,
  sortField,
  sortOrder,
  hideSmall,
  displayLimit,
  isLoading,
  isFetching,
} = storeToRefs(dStore);

// Infinite scroll sentinel
const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// Edit designer (local UI state only, not worth storing)
const editingDesigner = ref<Designer | null>(null);
const editForm = ref({ name: '', profile_url: '', notes: '' });

const paidFilterLabel = computed(() => {
  if (activeFilter.value === 'paid') return 'Only Paid';
  if (activeFilter.value === 'free') return 'Only Free';
  return 'Paid/Free';
});

const filteredDesigners = computed(() => {
  let items = [...dStore.designers];

  const q = appStore.globalSearchQuery.toLowerCase();
  if (q) {
    items = items.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.notes && d.notes.toLowerCase().includes(q))
    );
  }

  if (hideSmall.value) {
    items = items.filter((d) => (d.model_count || 0) >= 2);
  }

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
        aVal = a.latest_model_date || '';
        bVal = b.latest_model_date || '';
        break;
      default:
        return 0;
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder.value === 'asc' ? cmp : -cmp;
  });

  return items;
});

const displayedDesigners = computed(() =>
  filteredDesigners.value.slice(0, displayLimit.value)
);
const hasMore = computed(
  () => displayLimit.value < filteredDesigners.value.length
);

// Reset display limit when effective list changes (filter/sort/search)
watch(filteredDesigners, () => {
  dStore.displayLimit = 24;
});

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
}

function imageUrl(filepath: string): string {
  return modelsApi.getFileUrl(filepath);
}

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
}

function emptyCollageCells(designer: Designer): number {
  const count = designer.preview_images?.length || 0;
  if (count <= 1) return 0;
  return Math.max(0, 4 - count);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function initFromQueryParams() {
  const { sort, order, hideSmall: hs } = route.query;
  if (
    sort &&
    typeof sort === 'string' &&
    ['name', 'model_count', 'paid_model_count', 'latest_model_date'].includes(
      sort
    )
  ) {
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

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value) {
        dStore.displayLimit += 24;
      }
    },
    { rootMargin: '300px' }
  );
  if (sentinelRef.value) {
    observer.observe(sentinelRef.value);
  }
}

watch(hasMore, async (val) => {
  if (val) {
    await nextTick();
    setupObserver();
  }
});

onMounted(async () => {
  initFromQueryParams();
  await dStore.ensureLoaded();
  setupObserver();
});

onUnmounted(() => {
  observer?.disconnect();
  if (appStore.globalSearchQuery) appStore.clearGlobalSearch();
});

function openDesigner(designer: Designer, event?: MouseEvent) {
  if (event?.metaKey || event?.ctrlKey) {
    window.open(`/designers/${designer.id}`, '_blank');
    return;
  }
  router.push(`/designers/${designer.id}`);
}

function startEditDesigner(designer: Designer) {
  editingDesigner.value = designer;
  editForm.value = {
    name: designer.name,
    profile_url: designer.profile_url || '',
    notes: designer.notes || '',
  };
}

function cancelEdit() {
  editingDesigner.value = null;
}

async function saveEdit() {
  if (!editingDesigner.value || !editForm.value.name.trim()) return;
  const id = editingDesigner.value.id;
  try {
    const updated = await designersApi.update(id, {
      name: editForm.value.name.trim(),
      profile_url: editForm.value.profile_url || undefined,
      notes: editForm.value.notes || undefined,
    });
    dStore.updateDesigner(id, updated.data);
    editingDesigner.value = null;
  } catch (error) {
    console.error('Failed to update designer:', error);
  }
}

async function deleteDesigner() {
  if (!editingDesigner.value) return;
  if (
    !confirm(
      `Delete designer "${editingDesigner.value.name}"? Their models will not be deleted.`
    )
  )
    return;
  const id = editingDesigner.value.id;
  try {
    await designersApi.delete(id);
    dStore.removeDesigner(id);
    editingDesigner.value = null;
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
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

/* Subtle spinning dot shown during background refresh */
.fetch-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--border-subtle);
  border-top-color: var(--accent-primary);
  animation: spin 0.8s linear infinite;
}

/* View Controls */
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
  cursor: pointer;
}
.sort-order-btn svg {
  width: 16px;
  height: 16px;
}
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
.filter-toggle-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
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

/* Designers Grid */
.designers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

/* Designer Card */
.designer-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-base);
  animation: cardIn 0.3s ease-out both;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.designer-card:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

/* Preview / Image collage */
.designer-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--bg-elevated);
}

.preview-collage {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 2px;
}

.preview-collage.collage-1 {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.preview-collage.collage-multi {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.collage-cell {
  overflow: hidden;
  background: var(--bg-elevated);
  position: relative;
}

.collage-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.designer-card:hover .collage-cell img {
  transform: scale(1.05);
}

.collage-cell.empty {
  background: var(--bg-deep);
}

/* Avatar placeholder when no images */
.preview-avatar {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: 700;
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
  letter-spacing: -0.02em;
}

/* Favorite indicator badge */
.favorite-indicator {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f87171;
  z-index: 1;
  pointer-events: none;
}

.favorite-indicator svg {
  width: 13px;
  height: 13px;
  display: block;
}

/* Hover overlay on preview */
.preview-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 0.375rem;
  padding: 0.625rem;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.designer-card:hover .preview-overlay {
  opacity: 1;
}

.overlay-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-base);
  text-decoration: none;
  flex-shrink: 0;
}

.overlay-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.overlay-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
}

.overlay-btn.active {
  background: rgba(248, 113, 113, 0.6);
  border-color: #f87171;
  color: #fff;
}

/* Card info section */
.designer-info {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.designer-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.designer-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat-models {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.stat-models svg {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

.paid-badge {
  font-size: 0.6875rem;
  background: rgba(251, 191, 36, 0.15);
  color: var(--warning);
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.designer-date {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.designer-notes {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  margin-top: 0.125rem;
}

/* Infinite scroll sentinel */
.scroll-sentinel {
  padding: 1.5rem;
  display: flex;
  justify-content: center;
}

.loading-more {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-tertiary);
  font-size: 0.875rem;
}

/* Form inputs */
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

.loading-spinner.small {
  width: 18px;
  height: 18px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
