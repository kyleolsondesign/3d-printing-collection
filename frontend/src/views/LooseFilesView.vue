<template>
  <div class="loose-files-view">
    <div class="header">
      <div>
        <h2>Loose Files</h2>
        <p class="subtitle">Model files that need to be organized into folders</p>
      </div>
      <div class="stats-badge" v-if="looseFiles.length > 0">
        {{ looseFiles.length }} file{{ looseFiles.length !== 1 ? 's' : '' }} to organize
      </div>
    </div>

    <div v-if="loading" class="loading">Loading loose files...</div>

    <div v-else-if="looseFiles.length === 0" class="empty">
      <div class="empty-icon">✨</div>
      <h3>All organized!</h3>
      <p>No loose files found. All your models are properly organized in folders.</p>
    </div>

    <div v-else class="info-box">
      <h4>Why organize these files?</h4>
      <p>These model files are directly in your root directory without a folder. To get them indexed:</p>
      <ol>
        <li>Create a folder for each model (or group related models together)</li>
        <li>Move the model file(s) into the folder</li>
        <li>Optionally add images or PDFs to the folder for better previews</li>
        <li>Run a new scan to index the organized models</li>
      </ol>
    </div>

    <div v-if="!loading && looseFiles.length > 0" class="loose-files-list">
      <div v-for="file in looseFiles" :key="file.id" class="file-item">
        <div class="file-icon">📄</div>
        <div class="file-info">
          <h3>{{ file.filename }}</h3>
          <div class="file-meta">
            <span class="file-type">{{ file.file_type }}</span>
            <span class="file-size">{{ formatFileSize(file.file_size) }}</span>
          </div>
          <p class="file-path">{{ file.filepath }}</p>
        </div>
        <div class="file-actions">
          <button @click="openInFinder(file)" class="btn-primary" title="Open in Finder">
            📁 Open in Finder
          </button>
        </div>
      </div>
    </div>
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
    // Open the parent directory
    const folderPath = file.filepath.substring(0, file.filepath.lastIndexOf('/'));
    await systemApi.openFolder(folderPath);
  } catch (error) {
    console.error('Failed to open folder:', error);
    alert('Failed to open folder in Finder');
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
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

h2 {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
}

.stats-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
}

.info-box {
  background: #f0f7ff;
  border: 1px solid #0066cc;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.info-box h4 {
  margin-bottom: 0.75rem;
  color: #0066cc;
}

.info-box p {
  margin-bottom: 0.75rem;
  color: #333;
}

.info-box ol {
  margin-left: 1.5rem;
  color: #333;
}

.info-box li {
  margin: 0.5rem 0;
}

.loose-files-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.file-item {
  background: white;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.2s;
}

.file-item:hover {
  border-color: #0066cc;
  box-shadow: 0 2px 8px rgba(0, 102, 204, 0.1);
}

.file-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-info h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  word-break: break-word;
}

.file-meta {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.file-type {
  background: #f0f0f0;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: #666;
  text-transform: uppercase;
  font-weight: 600;
}

.file-size {
  color: #999;
}

.file-path {
  font-size: 0.85rem;
  color: #666;
  font-family: 'Monaco', 'Courier New', monospace;
  word-break: break-all;
}

.file-actions {
  flex-shrink: 0;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-primary:hover {
  background: #0052a3;
}

.loading, .empty {
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.empty p {
  font-size: 1rem;
  color: #666;
}
</style>
