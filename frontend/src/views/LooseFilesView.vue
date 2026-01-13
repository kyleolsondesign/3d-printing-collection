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
      <div class="info-box">
        <div class="info-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
        </div>
        <div class="info-content">
          <h4>Why organize these files?</h4>
          <p>These model files are not in proper model folders. To get them indexed:</p>
          <ol>
            <li>Create a folder for each model (or group related models together)</li>
            <li>Move the model file(s) into the folder</li>
            <li>Optionally add images or PDFs to the folder for better previews</li>
            <li>Run a new scan to index the organized models</li>
          </ol>
        </div>
      </div>

      <div class="loose-files-list">
        <div
          v-for="(file, index) in looseFiles"
          :key="file.id"
          class="file-card"
          :style="{ animationDelay: `${index * 40}ms` }"
        >
          <div class="file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
            <button @click="openInFinder(file)" class="btn-primary" title="Open in Finder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              Open
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

const looseFiles = ref<LooseFile[]>([]);
const loading = ref(true);

onMounted(async () => {
  await loadLooseFiles();
});

async function loadLooseFiles() {
  try {
    const response = await systemApi.getLooseFiles();
    looseFiles.value = response.data.looseFiles;
  } catch (error) {
    console.error('Failed to load loose files:', error);
  } finally {
    loading.value = false;
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
  margin-bottom: 0.75rem;
}

.info-content ol {
  margin-left: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.info-content li {
  margin: 0.375rem 0;
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
  flex-shrink: 0;
}

.btn-primary {
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

.btn-primary svg {
  width: 16px;
  height: 16px;
}

.btn-primary:hover {
  background: var(--accent-secondary);
  transform: translateY(-1px);
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
