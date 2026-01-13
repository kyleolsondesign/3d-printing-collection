<template>
  <div class="browse-view">
    <div class="header">
      <h2>Browse Models</h2>
      <div class="controls">
        <input
          v-model="searchInput"
          @keyup.enter="handleSearch"
          type="text"
          placeholder="Search models..."
          class="search-input"
        />
        <button @click="handleSearch" class="btn-primary">Search</button>
      </div>
    </div>

    <div class="filters">
      <div class="filter-row">
        <div class="category-filters">
          <button
            @click="filterByCategory('all')"
            :class="['category-btn', { active: store.selectedCategory === 'all' }]"
          >
            All Models
          </button>
          <button
            v-for="cat in store.categories"
            :key="cat.category"
            @click="filterByCategory(cat.category)"
            :class="['category-btn', { active: store.selectedCategory === cat.category }]"
          >
            {{ cat.category }} ({{ cat.count }})
          </button>
        </div>
        <div class="view-controls">
          <div class="sort-controls">
            <select v-model="sortField" @change="handleSortChange" class="sort-select">
              <option value="date_added">Date Added</option>
              <option value="date_created">Date Created</option>
              <option value="name">Name</option>
              <option value="category">Category</option>
            </select>
            <button @click="toggleSortOrder" class="sort-order-btn" :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'">
              {{ sortOrder === 'desc' ? '↓' : '↑' }}
            </button>
          </div>
          <div class="view-toggle">
            <button
              @click="viewMode = 'grid'"
              :class="['view-btn', { active: viewMode === 'grid' }]"
              title="Grid view"
            >
              ▦
            </button>
            <button
              @click="viewMode = 'table'"
              :class="['view-btn', { active: viewMode === 'table' }]"
              title="Table view"
            >
              ≡
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.loading" class="loading">Loading models...</div>

    <div v-else-if="store.models.length === 0" class="empty">
      <p>No models found.</p>
      <p>Go to Settings to configure your model directory and run a scan.</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="models-grid">
      <div v-for="model in store.models" :key="model.id" class="model-card">
        <div class="model-image">
          <img
            v-if="model.primaryImage"
            :src="modelsApi.getFileUrl(model.primaryImage)"
            :alt="model.filename"
            @error="onImageError"
          />
          <div v-else class="no-image">📦</div>
        </div>
        <div class="model-info">
          <h3 :title="model.filename">{{ model.filename }}</h3>
          <div class="model-meta">
            <span class="category">{{ model.category }}</span>
            <span class="file-type">{{ model.file_type }}</span>
            <span v-if="model.is_paid" class="badge-paid">Paid</span>
            <span v-if="model.is_original" class="badge-original">Original</span>
          </div>
          <div class="model-actions">
            <button
              @click="openInFinder(model)"
              class="btn-icon"
              title="Open in Finder"
            >
              📁
            </button>
            <button
              @click="store.toggleFavorite(model.id)"
              :class="['btn-icon', { active: model.isFavorite }]"
              title="Favorite"
            >
              {{ model.isFavorite ? '★' : '☆' }}
            </button>
            <button
              @click="store.toggleQueue(model.id)"
              :class="['btn-icon', { active: model.isQueued }]"
              title="Add to Print Queue"
            >
              {{ model.isQueued ? '✓' : '+' }} Queue
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
            <th class="col-date">Date Added</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="model in store.models" :key="model.id">
            <td class="col-image">
              <div class="table-image">
                <img
                  v-if="model.primaryImage"
                  :src="modelsApi.getFileUrl(model.primaryImage)"
                  :alt="model.filename"
                  @error="onImageError"
                />
                <span v-else class="no-image-small">📦</span>
              </div>
            </td>
            <td class="col-name">
              <span class="model-name" :title="model.filename">{{ model.filename }}</span>
              <span v-if="model.is_paid" class="badge-paid badge-small">Paid</span>
              <span v-if="model.is_original" class="badge-original badge-small">Original</span>
            </td>
            <td class="col-category">{{ model.category }}</td>
            <td class="col-files">{{ model.file_count }}</td>
            <td class="col-date">{{ formatDate(model.date_added) }}</td>
            <td class="col-actions">
              <div class="table-actions">
                <button @click="openInFinder(model)" class="btn-icon-small" title="Open in Finder">📁</button>
                <button
                  @click="store.toggleFavorite(model.id)"
                  :class="['btn-icon-small', { active: model.isFavorite }]"
                  title="Favorite"
                >
                  {{ model.isFavorite ? '★' : '☆' }}
                </button>
                <button
                  @click="store.toggleQueue(model.id)"
                  :class="['btn-icon-small', { active: model.isQueued }]"
                  title="Add to Queue"
                >
                  {{ model.isQueued ? '✓' : '+' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="store.totalPages > 1" class="pagination">
      <button
        @click="prevPage"
        :disabled="store.currentPage === 1"
        class="btn-secondary"
      >
        Previous
      </button>
      <span>Page {{ store.currentPage }} of {{ store.totalPages }}</span>
      <button
        @click="nextPage"
        :disabled="store.currentPage === store.totalPages"
        class="btn-secondary"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAppStore } from '../store';
import { modelsApi, systemApi } from '../services/api';
import type { Model } from '../services/api';

const store = useAppStore();
const searchInput = ref('');
const viewMode = ref<'grid' | 'table'>('grid');
const sortField = ref('date_added');
const sortOrder = ref<'asc' | 'desc'>('desc');

onMounted(() => {
  store.loadModels(1, 'all', sortField.value, sortOrder.value);
});

function filterByCategory(category: string) {
  store.loadModels(1, category, sortField.value, sortOrder.value);
}

function handleSearch() {
  if (searchInput.value.trim()) {
    store.searchModels(searchInput.value);
  } else {
    store.loadModels(1, 'all', sortField.value, sortOrder.value);
  }
}

function handleSortChange() {
  store.loadModels(1, store.selectedCategory, sortField.value, sortOrder.value);
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  store.loadModels(store.currentPage, store.selectedCategory, sortField.value, sortOrder.value);
}

function prevPage() {
  if (store.currentPage > 1) {
    store.loadModels(store.currentPage - 1, store.selectedCategory, sortField.value, sortOrder.value);
  }
}

function nextPage() {
  if (store.currentPage < store.totalPages) {
    store.loadModels(store.currentPage + 1, store.selectedCategory, sortField.value, sortOrder.value);
  }
}

function onImageError(event: Event) {
  // Hide broken image, show placeholder instead
  const target = event.target as HTMLImageElement;
  target.style.display = 'none';
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function openInFinder(model: Model) {
  try {
    // The filepath is the folder path for folder-based models
    await systemApi.openFolder(model.filepath);
  } catch (error) {
    console.error('Failed to open folder:', error);
    alert('Failed to open folder in Finder');
  }
}
</script>

<style scoped>
.browse-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  font-size: 1.75rem;
  font-weight: 600;
}

.controls {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
  min-width: 300px;
}

.filters {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.category-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex: 1;
}

.view-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.sort-controls {
  display: flex;
  gap: 0.25rem;
}

.sort-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
}

.sort-order-btn {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
}

.sort-order-btn:hover {
  border-color: #0066cc;
  color: #0066cc;
}

.view-toggle {
  display: flex;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
}

.view-btn {
  padding: 0.5rem 0.75rem;
  border: none;
  background: white;
  font-size: 1rem;
  cursor: pointer;
  border-right: 1px solid #ddd;
}

.view-btn:last-child {
  border-right: none;
}

.view-btn:hover {
  background: #f0f7ff;
}

.view-btn.active {
  background: #0066cc;
  color: white;
}

.category-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.category-btn:hover {
  border-color: #0066cc;
  color: #0066cc;
}

.category-btn.active {
  background: #0066cc;
  color: white;
  border-color: #0066cc;
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.model-card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.model-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.model-image {
  width: 100%;
  aspect-ratio: 4/3;
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.model-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.model-card:hover .model-image img {
  transform: scale(1.05);
}

.no-image {
  color: #ccc;
  font-size: 3rem;
}

.model-info {
  padding: 1rem;
}

.model-info h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}

.category, .file-type {
  padding: 0.25rem 0.5rem;
  background: #f0f0f0;
  border-radius: 4px;
  color: #666;
}

.badge-paid {
  padding: 0.25rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-weight: 500;
}

.badge-original {
  padding: 0.25rem 0.5rem;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 4px;
  font-weight: 500;
}

.model-actions {
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  gap: 0.5rem;
}

.btn-icon {
  padding: 0.5rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-icon:hover {
  border-color: #0066cc;
  background: #f0f7ff;
}

.btn-icon.active {
  background: #0066cc;
  color: white;
  border-color: #0066cc;
}

.btn-primary {
  padding: 0.5rem 1.5rem;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #0052a3;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: white;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  border-color: #0066cc;
  color: #0066cc;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.loading, .empty {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.empty p {
  margin: 0.5rem 0;
}

/* Table View Styles */
.models-table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.models-table {
  width: 100%;
  border-collapse: collapse;
}

.models-table th {
  background: #f5f5f5;
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  color: #666;
  border-bottom: 1px solid #ddd;
}

.models-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #eee;
  vertical-align: middle;
}

.models-table tr:hover {
  background: #f9f9f9;
}

.col-image {
  width: 60px;
}

.col-name {
  min-width: 200px;
}

.col-category {
  width: 120px;
}

.col-files {
  width: 60px;
  text-align: center;
}

.col-date {
  width: 120px;
}

.col-actions {
  width: 120px;
}

.table-image {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.table-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image-small {
  font-size: 1.25rem;
}

.model-name {
  font-weight: 500;
  margin-right: 0.5rem;
}

.badge-small {
  font-size: 0.7rem;
  padding: 0.15rem 0.35rem;
  margin-left: 0.25rem;
}

.table-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-icon-small {
  padding: 0.35rem 0.5rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-icon-small:hover {
  border-color: #0066cc;
  background: #f0f7ff;
}

.btn-icon-small.active {
  background: #0066cc;
  color: white;
  border-color: #0066cc;
}
</style>
