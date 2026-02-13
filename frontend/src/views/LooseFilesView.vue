<template>
  <div class="loose-files-view">
    <div class="header">
      <div class="header-left">
        <h2>Loose Files</h2>
        <span class="count-badge warning" v-if="looseFiles.length > 0">{{ looseFiles.length }}</span>
      </div>
      <p class="subtitle">Model files that need to be organized into folders</p>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading loose files...</span>
    </div>

    <div v-else-if="looseFiles.length === 0" class="empty success">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
      </div>
      <h3>All organized!</h3>
      <p>No loose files found. All your models are properly organized in folders.</p>
    </div>

    <template v-else>
      <!-- Bulk Actions Bar -->
      <div class="bulk-actions-bar" v-if="selectedIds.size > 0 || looseFiles.length > 0">
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
          <span class="selection-count" v-if="selectedIds.size > 0">
            {{ selectedIds.size }} selected
          </span>
        </div>
        <div class="bulk-buttons" v-if="selectedIds.size > 0">
          <button
            @click="organizeSelected"
            class="btn-organize-bulk"
            :disabled="organizing"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              <path d="M12 11v6M9 14h6"/>
            </svg>
            Organize {{ selectedIds.size }} File{{ selectedIds.size > 1 ? 's' : '' }}
          </button>
        </div>
      </div>

      <!-- Results Panel -->
      <div v-if="lastResults" class="results-panel" :class="{ success: lastResults.succeeded > 0, error: lastResults.failed > 0 && lastResults.succeeded === 0 }">
        <div class="results-header">
          <svg v-if="lastResults.succeeded > 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M15 9l-6 6M9 9l6 6"/>
          </svg>
          <span>
            Organized {{ lastResults.succeeded }} of {{ lastResults.total }} file{{ lastResults.total > 1 ? 's' : '' }}
            <template v-if="lastResults.failed > 0">
              ({{ lastResults.failed }} failed)
            </template>
          </span>
        </div>
        <button @click="lastResults = null" class="dismiss-btn">Dismiss</button>
      </div>

      <div class="info-box">
        <div class="info-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
        </div>
        <div class="info-content">
          <h4>Organize automatically</h4>
          <p>Click "Organize" to automatically create a folder and move the file into it. The folder name will be cleaned up from the filename. You can also select multiple files and organize them in bulk.</p>
        </div>
      </div>

      <div class="loose-files-list">
        <div
          v-for="(file, index) in looseFiles"
          :key="file.id"
          class="file-card"
          :class="{ selected: selectedIds.has(file.id), organizing: organizingIds.has(file.id) }"
          :style="{ animationDelay: `${index * 40}ms` }"
        >
          <label class="checkbox-wrapper">
            <input
              type="checkbox"
              :checked="selectedIds.has(file.id)"
              @change="toggleSelect(file.id)"
              :disabled="organizingIds.has(file.id)"
            />
          </label>
          <div class="file-icon">
            <svg v-if="organizingIds.has(file.id)" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <path d="M13 2v7h7"/>
            </svg>
          </div>
          <div class="file-info">
            <h3>{{ file.filename }}</h3>
            <div class="file-meta">
              <span class="file-type">{{ file.file_type }}</span>
              <span class="file-size">{{ formatFileSize(file.file_size) }}</span>
              <span class="file-category" v-if="file.category">{{ file.category }}</span>
            </div>
            <p class="file-path">{{ file.filepath }}</p>
          </div>
          <div class="file-actions">
            <button
              @click="organizeFile(file)"
              class="btn-organize"
              :disabled="organizingIds.has(file.id)"
              title="Create folder and move file"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                <path d="M12 11v6M9 14h6"/>
              </svg>
              Organize
            </button>
            <button @click="openInFinder(file)" class="btn-secondary" title="Show in Finder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { systemApi } from '../services/api';

interface LooseFile {
  id: number;
  filename: string;
  filepath: string;
  file_size: number;
  file_type: string;
  category: string;
  discovered_at: string;
}

interface OrganizeResults {
  total: number;
  succeeded: number;
  failed: number;
}

const looseFiles = ref<LooseFile[]>([]);
const loading = ref(true);
const organizing = ref(false);
const selectedIds = ref<Set<number>>(new Set());
const organizingIds = ref<Set<number>>(new Set());
const lastResults = ref<OrganizeResults | null>(null);

const isAllSelected = computed(() =>
  looseFiles.value.length > 0 && selectedIds.value.size === looseFiles.value.length
);

const isPartiallySelected = computed(() =>
  selectedIds.value.size > 0 && selectedIds.value.size < looseFiles.value.length
);

onMounted(async () => {
  await loadLooseFiles();
});

async function loadLooseFiles() {
  try {
    const response = await systemApi.getLooseFiles();
    looseFiles.value = response.data.looseFiles;
    // Clear selections that no longer exist
    const currentIds = new Set(looseFiles.value.map(f => f.id));
    selectedIds.value = new Set([...selectedIds.value].filter(id => currentIds.has(id)));
  } catch (error) {
    console.error('Failed to load loose files:', error);
  } finally {
    loading.value = false;
  }
}

function toggleSelect(id: number) {
  const newSet = new Set(selectedIds.value);
  if (newSet.has(id)) {
    newSet.delete(id);
  } else {
    newSet.add(id);
  }
  selectedIds.value = newSet;
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(looseFiles.value.map(f => f.id));
  }
}

async function organizeFile(file: LooseFile) {
  organizingIds.value.add(file.id);
  try {
    await systemApi.organizeLooseFile(file.id);
    lastResults.value = { total: 1, succeeded: 1, failed: 0 };
    // Remove from local list
    looseFiles.value = looseFiles.value.filter(f => f.id !== file.id);
    selectedIds.value.delete(file.id);
  } catch (error) {
    console.error('Failed to organize file:', error);
    lastResults.value = { total: 1, succeeded: 0, failed: 1 };
  } finally {
    organizingIds.value.delete(file.id);
  }
}

async function organizeSelected() {
  if (selectedIds.value.size === 0) return;

  organizing.value = true;
  const idsToOrganize = [...selectedIds.value];

  // Mark all as organizing
  idsToOrganize.forEach(id => organizingIds.value.add(id));

  try {
    const response = await systemApi.organizeLooseFiles(idsToOrganize);
    lastResults.value = response.data.summary;

    // Reload the list
    await loadLooseFiles();
  } catch (error) {
    console.error('Failed to organize files:', error);
    lastResults.value = { total: idsToOrganize.length, succeeded: 0, failed: idsToOrganize.length };
  } finally {
    organizing.value = false;
    organizingIds.value.clear();
    selectedIds.value.clear();
  }
}

async function openInFinder(file: LooseFile) {
  try {
    const folderPath = file.filepath.substring(0, file.filepath.lastIndexOf('/'));
    await systemApi.openFolder(folderPath);
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
</script>

<style scoped>
.loose-files-view {
  max-width: 1000px;
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
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  font-family: var(--font-mono);
}

.count-badge.warning {
  background: var(--warning);
  color: var(--bg-deepest);
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* Bulk Actions Bar */
.bulk-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  margin-bottom: 1rem;
}

.selection-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-wrapper input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.checkbox-label {
  margin-left: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
}

.selection-count {
  color: var(--accent-primary);
  font-weight: 600;
  font-size: 0.9rem;
}

.btn-organize-bulk {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-organize-bulk:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.btn-organize-bulk:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-organize-bulk svg {
  width: 18px;
  height: 18px;
}

/* Results Panel */
.results-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  margin-bottom: 1rem;
  animation: slideIn 0.3s ease-out;
}

.results-panel.success {
  background: var(--success-dim);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.results-panel.error {
  background: var(--danger-dim);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.results-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
}

.results-panel.success .results-header {
  color: var(--success);
}

.results-panel.error .results-header {
  color: var(--danger);
}

.results-header svg {
  width: 20px;
  height: 20px;
}

.dismiss-btn {
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity var(--transition-base);
}

.dismiss-btn:hover {
  opacity: 1;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.info-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-left: 3px solid var(--accent-primary);
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1rem;
}

.info-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  flex-shrink: 0;
}

.info-icon svg {
  width: 20px;
  height: 20px;
}

.info-content {
  flex: 1;
}

.info-content h4 {
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.info-content p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.loose-files-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.file-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  transition: all var(--transition-base);
  animation: fadeIn 0.4s ease-out backwards;
}

.file-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-elevated);
}

.file-card.selected {
  border-color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.file-card.organizing {
  opacity: 0.7;
  pointer-events: none;
}

.file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--warning-dim);
  border-radius: var(--radius-md);
  color: var(--warning);
  flex-shrink: 0;
}

.file-icon svg {
  width: 24px;
  height: 24px;
}

.file-icon svg.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-info h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  word-break: break-word;
}

.file-meta {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.file-type {
  background: var(--bg-hover);
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.file-size {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.file-category {
  padding: 0.2rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.file-path {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  word-break: break-all;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-organize {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-organize svg {
  width: 16px;
  height: 16px;
}

.btn-organize:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.btn-organize:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-secondary svg {
  width: 18px;
  height: 18px;
}

.btn-secondary:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-hover);
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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty.success .empty-icon {
  background: var(--success-dim);
  color: var(--success);
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
</style>
