<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-container" @click.stop>
        <button class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div v-if="loading" class="loading">
          <div class="loading-spinner"></div>
          <span>Loading model details...</span>
        </div>

        <template v-else-if="modelDetails">
          <div class="modal-content">
            <!-- Image Section -->
            <div class="image-section">
              <div class="primary-image">
                <img
                  v-if="primaryImage"
                  :src="getFileUrl(primaryImage)"
                  :alt="modelDetails.filename"
                  @error="handleImageError"
                />
                <div v-else class="no-image">
                  <span class="emoji">📦</span>
                </div>
              </div>
              <div v-if="imageAssets.length > 1" class="image-thumbnails">
                <button
                  v-for="asset in imageAssets"
                  :key="asset.id"
                  class="thumbnail"
                  :class="{ active: primaryImage === asset.filepath }"
                  @click="primaryImage = asset.filepath"
                >
                  <img :src="getFileUrl(asset.filepath)" :alt="'Image ' + asset.id" />
                </button>
              </div>
            </div>

            <!-- Details Section -->
            <div class="details-section">
              <h2>{{ modelDetails.filename }}</h2>

              <div class="meta-tags">
                <span class="category-tag">{{ modelDetails.category }}</span>
                <span v-if="modelDetails.is_paid" class="paid-tag">Paid</span>
                <span v-if="modelDetails.is_original" class="original-tag">Original</span>
                <span class="file-count">{{ modelDetails.file_count }} file{{ modelDetails.file_count !== 1 ? 's' : '' }}</span>
              </div>

              <div class="info-grid">
                <div class="info-item" v-if="modelDetails.date_added">
                  <span class="info-label">Added</span>
                  <span class="info-value">{{ formatDate(modelDetails.date_added) }}</span>
                </div>
                <div class="info-item" v-if="modelDetails.date_created">
                  <span class="info-label">Created</span>
                  <span class="info-value">{{ formatDate(modelDetails.date_created) }}</span>
                </div>
              </div>

              <!-- Model Files -->
              <div class="files-section" v-if="modelFiles.length > 0">
                <h3>Model Files</h3>
                <div class="files-list">
                  <div v-for="file in modelFiles" :key="file.id" class="file-item">
                    <span class="file-type-badge">{{ file.file_type }}</span>
                    <span class="file-name">{{ file.filename }}</span>
                    <span class="file-size">{{ formatFileSize(file.file_size) }}</span>
                  </div>
                </div>
              </div>

              <!-- PDF Documents -->
              <div class="docs-section" v-if="pdfAssets.length > 0">
                <h3>Documents</h3>
                <div class="docs-list">
                  <a
                    v-for="pdf in pdfAssets"
                    :key="pdf.id"
                    :href="getFileUrl(pdf.filepath)"
                    target="_blank"
                    class="doc-link"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                    </svg>
                    {{ getFileName(pdf.filepath) }}
                  </a>
                </div>
              </div>

              <!-- Path -->
              <div class="path-section">
                <span class="path-label">Location</span>
                <code class="path-value">{{ modelDetails.filepath }}</code>
              </div>

              <!-- Actions -->
              <div class="actions-section">
                <button
                  @click="toggleFavorite"
                  class="action-btn"
                  :class="{ active: modelDetails.isFavorite }"
                >
                  <svg viewBox="0 0 24 24" :fill="modelDetails.isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  {{ modelDetails.isFavorite ? 'Favorited' : 'Add to Favorites' }}
                </button>

                <button
                  @click="toggleQueue"
                  class="action-btn"
                  :class="{ active: modelDetails.isQueued }"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                  </svg>
                  {{ modelDetails.isQueued ? 'In Queue' : 'Add to Queue' }}
                </button>

                <button @click="openInFinder" class="action-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  Open in Finder
                </button>

                <button @click="rescanModel" class="action-btn" :disabled="rescanning">
                  <svg :class="{ spinning: rescanning }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                  </svg>
                  {{ rescanning ? 'Rescanning...' : 'Rescan Folder' }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { modelsApi, systemApi, favoritesApi, queueApi, type Model, type ModelAsset } from '../services/api';

interface ModelFile {
  id: number;
  model_id: number;
  filename: string;
  filepath: string;
  file_size: number;
  file_type: string;
}

interface ModelDetails extends Model {
  assets: ModelAsset[];
  isFavorite: boolean;
  isQueued: boolean;
}

const props = defineProps<{
  modelId: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated', model: ModelDetails): void;
}>();

const loading = ref(true);
const rescanning = ref(false);
const modelDetails = ref<ModelDetails | null>(null);
const modelFiles = ref<ModelFile[]>([]);
const primaryImage = ref<string | null>(null);

const imageAssets = computed(() =>
  modelDetails.value?.assets.filter(a => a.asset_type === 'image') || []
);

const pdfAssets = computed(() =>
  modelDetails.value?.assets.filter(a => a.asset_type === 'pdf') || []
);

onMounted(async () => {
  await loadModelDetails();
});

watch(() => props.modelId, async () => {
  await loadModelDetails();
});

async function loadModelDetails() {
  loading.value = true;
  try {
    const [detailsRes, filesRes] = await Promise.all([
      modelsApi.getById(props.modelId),
      modelsApi.getFiles(props.modelId)
    ]);

    modelDetails.value = detailsRes.data;
    modelFiles.value = filesRes.data.files;

    // Set primary image
    const primary = imageAssets.value.find(a => a.is_primary);
    primaryImage.value = primary?.filepath || imageAssets.value[0]?.filepath || null;
  } catch (error) {
    console.error('Failed to load model details:', error);
  } finally {
    loading.value = false;
  }
}

function getFileUrl(filepath: string): string {
  return modelsApi.getFileUrl(filepath);
}

function getFileName(filepath: string): string {
  return filepath.split('/').pop() || filepath;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
}

async function toggleFavorite() {
  if (!modelDetails.value) return;
  try {
    await favoritesApi.toggle(modelDetails.value.id);
    modelDetails.value.isFavorite = !modelDetails.value.isFavorite;
    emit('updated', modelDetails.value);
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
  }
}

async function toggleQueue() {
  if (!modelDetails.value) return;
  try {
    await queueApi.toggle(modelDetails.value.id);
    modelDetails.value.isQueued = !modelDetails.value.isQueued;
    emit('updated', modelDetails.value);
  } catch (error) {
    console.error('Failed to toggle queue:', error);
  }
}

async function openInFinder() {
  if (!modelDetails.value) return;
  try {
    await systemApi.openFolder(modelDetails.value.filepath);
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}

async function rescanModel() {
  if (!modelDetails.value || rescanning.value) return;
  rescanning.value = true;
  try {
    const response = await modelsApi.rescan(modelDetails.value.id);
    // Reload with new data
    await loadModelDetails();
    emit('updated', modelDetails.value!);
  } catch (error) {
    console.error('Failed to rescan model:', error);
  } finally {
    rescanning.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
  animation: fadeIn 0.2s ease-out;
}

.modal-container {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  z-index: 10;
  transition: all var(--transition-base);
}

.close-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.close-btn svg {
  width: 18px;
  height: 18px;
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

.modal-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 2rem;
}

@media (max-width: 768px) {
  .modal-content {
    grid-template-columns: 1fr;
  }
}

/* Image Section */
.image-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.primary-image {
  aspect-ratio: 1;
  background: var(--bg-deep);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.primary-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-image {
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-image .emoji {
  font-size: 4rem;
  opacity: 0.5;
}

.image-thumbnails {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.thumbnail {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid var(--border-subtle);
  cursor: pointer;
  transition: all var(--transition-base);
  padding: 0;
  background: var(--bg-deep);
}

.thumbnail:hover {
  border-color: var(--border-strong);
}

.thumbnail.active {
  border-color: var(--accent-primary);
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Details Section */
.details-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.details-section h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
  padding-right: 2rem;
}

.meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.category-tag,
.paid-tag,
.original-tag,
.file-count {
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
}

.category-tag {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.paid-tag {
  background: var(--warning-dim);
  color: var(--warning);
}

.original-tag {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
}

.file-count {
  background: var(--bg-hover);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-label {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 0.9rem;
  color: var(--text-primary);
}

/* Files Section */
.files-section,
.docs-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.files-section h3,
.docs-section h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 150px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-deep);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
}

.file-type-badge {
  padding: 0.125rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  font-weight: 600;
}

.file-name {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.docs-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.doc-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-deep);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  text-decoration: none;
  font-size: 0.85rem;
  transition: all var(--transition-base);
}

.doc-link:hover {
  background: var(--bg-hover);
}

.doc-link svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Path Section */
.path-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.path-label {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.path-value {
  font-size: 0.8rem;
  color: var(--text-secondary);
  background: var(--bg-deep);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  word-break: break-all;
  font-family: var(--font-mono);
}

/* Actions Section */
.actions-section {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
}

.action-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.action-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.action-btn svg.spinning {
  animation: spin 1s linear infinite;
}
</style>
