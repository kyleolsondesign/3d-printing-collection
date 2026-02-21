<template>
  <Teleport to="body">
    <!-- Lightbox overlay -->
    <div v-if="lightboxOpen && imageAssets.length > 0" class="lightbox-overlay" @click.self="closeLightbox">
      <button class="lightbox-close" @click="closeLightbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
      <button v-if="imageAssets.length > 1" class="lightbox-nav lightbox-prev" @click="lightboxPrev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <button v-if="imageAssets.length > 1" class="lightbox-nav lightbox-next" @click="lightboxNext">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      <img
        :src="getFileUrl(imageAssets[lightboxIndex]?.filepath)"
        :alt="'Image ' + (lightboxIndex + 1)"
        class="lightbox-image"
      />
      <div v-if="imageAssets.length > 1" class="lightbox-counter">
        {{ lightboxIndex + 1 }} / {{ imageAssets.length }}
      </div>
    </div>

    <div class="modal-overlay" @click.self="$emit('close')">
      <!-- Navigation arrows -->
      <button v-if="canNavigatePrev" class="nav-arrow nav-arrow-left" @click="navigatePrev" title="Previous model (Left arrow)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <button v-if="canNavigateNext" class="nav-arrow nav-arrow-right" @click="navigateNext" title="Next model (Right arrow)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

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
              <div class="primary-image" :class="{ clickable: primaryImage }" @click="primaryImage && openLightbox()">
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
                <div
                  v-for="asset in imageAssets"
                  :key="asset.id"
                  class="thumbnail-wrapper"
                >
                  <button
                    class="thumbnail"
                    :class="{
                      active: primaryImage === asset.filepath,
                      'is-primary': asset.is_primary
                    }"
                    @click="primaryImage = asset.filepath"
                  >
                    <img :src="getFileUrl(asset.filepath)" :alt="'Image ' + asset.id" />
                    <span v-if="asset.is_primary" class="primary-badge">Primary</span>
                  </button>
                  <button
                    v-if="!asset.is_primary"
                    class="set-primary-btn"
                    @click="setPrimaryImage(asset)"
                    title="Set as primary image"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </button>
                  <button
                    v-if="!asset.is_primary"
                    class="hide-asset-btn"
                    @click="hideAsset(asset)"
                    title="Hide this thumbnail"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Details Section -->
            <div class="details-section">
              <div class="model-name-section">
                <h2 v-if="!editingName">{{ modelDetails.filename }}</h2>
                <input
                  v-else
                  v-model="editingNameValue"
                  @keydown.enter="saveName"
                  @keydown.escape="cancelEditName"
                  type="text"
                  class="name-input"
                  ref="nameInputRef"
                />
                <button
                  v-if="!editingName"
                  @click="startEditName"
                  class="edit-name-btn"
                  title="Edit model name"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <div v-else class="edit-name-actions">
                  <button @click="saveName" class="save-name-btn" title="Save">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                  </button>
                  <button @click="cancelEditName" class="cancel-name-btn" title="Cancel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>

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

              <!-- Metadata from PDF -->
              <div class="metadata-section" v-if="modelDetails.metadata && hasMetadata">
                <div class="metadata-row" v-if="modelDetails.metadata.designer">
                  <span class="metadata-label">Designer</span>
                  <a v-if="modelDetails.metadata.designer_url" :href="modelDetails.metadata.designer_url" target="_blank" rel="noopener" class="metadata-link">{{ modelDetails.metadata.designer }}</a>
                  <span v-else class="metadata-value">{{ modelDetails.metadata.designer }}</span>
                </div>
                <div class="metadata-row" v-if="modelDetails.metadata.source_platform">
                  <span class="metadata-label">Source</span>
                  <a v-if="modelDetails.metadata.source_url" :href="modelDetails.metadata.source_url" target="_blank" rel="noopener" class="metadata-link">
                    <span :class="['platform-badge', modelDetails.metadata.source_platform]">{{ platformName(modelDetails.metadata.source_platform) }}</span>
                  </a>
                  <span v-else :class="['platform-badge', modelDetails.metadata.source_platform]">{{ platformName(modelDetails.metadata.source_platform) }}</span>
                </div>
                <div class="metadata-row" v-if="modelDetails.metadata.license">
                  <span class="metadata-label">License</span>
                  <a v-if="modelDetails.metadata.license_url" :href="modelDetails.metadata.license_url" target="_blank" rel="noopener" class="metadata-link license-text">{{ modelDetails.metadata.license }}</a>
                  <span v-else class="metadata-value license-text">{{ modelDetails.metadata.license }}</span>
                </div>
                <div class="metadata-row" v-if="modelDetails.metadata.description">
                  <span class="metadata-label">Description</span>
                  <span class="metadata-value description-text">{{ modelDetails.metadata.description }}</span>
                </div>
              </div>

              <!-- Tags -->
              <div class="tags-section" v-if="modelDetails.tags && modelDetails.tags.length > 0">
                <div class="tags-list">
                  <span v-for="tag in modelDetails.tags" :key="tag" class="tag-chip">{{ tag }}</span>
                </div>
              </div>

              <!-- Notes -->
              <div class="notes-section">
                <h3>Notes</h3>
                <textarea
                  v-model="notesValue"
                  class="notes-textarea"
                  placeholder="Add notes about this model (slicer settings, materials, assembly tips...)"
                  rows="3"
                  @blur="saveNotes"
                ></textarea>
              </div>

              <!-- Model Files -->
              <div class="files-section" v-if="modelFiles.length > 0">
                <h3>Model Files</h3>
                <div class="files-list">
                  <div
                    v-for="file in modelFiles"
                    :key="file.id"
                    class="file-item clickable"
                    @click="showFileInFinder(file.filepath)"
                    title="Show in Finder"
                  >
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

              <!-- ZIP Archives -->
              <div class="archives-section" v-if="modelDetails.zipFiles && modelDetails.zipFiles.length > 0">
                <h3>Archives</h3>
                <div class="archives-list">
                  <div
                    v-for="zip in modelDetails.zipFiles"
                    :key="zip.filepath"
                    class="archive-item"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                      <path d="M9 13v4M12 11v6M15 13v4"/>
                    </svg>
                    <span class="archive-name">{{ zip.filename }}</span>
                    <span class="archive-size">{{ formatFileSize(zip.size) }}</span>
                    <button
                      @click="extractZipFile(zip)"
                      class="extract-btn"
                      :disabled="!!extracting"
                      :title="extracting === zip.filepath ? 'Extracting...' : 'Extract contents'"
                    >
                      <svg v-if="extracting === zip.filepath" class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                      </svg>
                      {{ extracting === zip.filepath ? 'Extracting...' : 'Extract' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Makes (photos of printed models) -->
              <div class="makes-section" v-if="isPrinted">
                <h3>Makes</h3>
                <div class="makes-gallery" v-if="makeImages.length > 0">
                  <div v-for="img in makeImages" :key="img.id" class="make-image-wrapper">
                    <img :src="getMakeImageUrl(img.filepath)" :alt="img.filename" />
                    <button class="delete-make-btn" @click="deleteMakeImage(img.id)" title="Remove photo">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
                <p v-else class="no-makes">No make photos yet.</p>
                <label class="upload-make-btn">
                  <input type="file" accept="image/*" @change="uploadMakeImage" hidden />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  Add Photo
                </label>
              </div>

              <!-- Path -->
              <div class="path-section">
                <span class="path-label">Location</span>
                <code class="path-value">{{ relativePath }}</code>
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

                <button
                  @click="togglePrinted('good')"
                  class="action-btn"
                  :class="{ active: isPrinted && currentPrintRating === 'good' }"
                >
                  <svg viewBox="0 0 24 24" :fill="isPrinted && currentPrintRating === 'good' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                  </svg>
                  {{ isPrinted && currentPrintRating === 'good' ? 'Good Print' : 'Mark Good' }}
                </button>

                <button
                  @click="togglePrinted('bad')"
                  class="action-btn"
                  :class="{ active: isPrinted && currentPrintRating === 'bad', 'bad-active': isPrinted && currentPrintRating === 'bad' }"
                >
                  <svg viewBox="0 0 24 24" :fill="isPrinted && currentPrintRating === 'bad' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
                  </svg>
                  {{ isPrinted && currentPrintRating === 'bad' ? 'Bad Print' : 'Mark Bad' }}
                </button>

                <button @click="openInFinder" class="action-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  Show in Finder
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { modelsApi, systemApi, favoritesApi, queueApi, printedApi, type Model, type ModelAsset, type ModelMetadata, type MakeImage } from '../services/api';
import { useAppStore } from '../store';

interface ModelFile {
  id: number;
  model_id: number;
  filename: string;
  filepath: string;
  file_size: number;
  file_type: string;
}

interface ZipFile {
  filename: string;
  filepath: string;
  size: number;
}

interface PrintRecord {
  id: number;
  model_id: number;
  printed_at: string;
  rating: 'good' | 'bad' | null;
  notes: string | null;
}

interface ModelDetails extends Model {
  assets: ModelAsset[];
  zipFiles?: ZipFile[];
  isFavorite: boolean;
  isQueued: boolean;
  printHistory: PrintRecord[];
  metadata?: ModelMetadata | null;
  tags?: string[];
}

const props = defineProps<{
  modelId: number;
  modelIds?: number[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated', model: ModelDetails): void;
  (e: 'navigate', modelId: number): void;
}>();

const canNavigatePrev = computed(() => {
  if (!props.modelIds?.length) return false;
  const idx = props.modelIds.indexOf(props.modelId);
  return idx > 0;
});

const canNavigateNext = computed(() => {
  if (!props.modelIds?.length) return false;
  const idx = props.modelIds.indexOf(props.modelId);
  return idx >= 0 && idx < props.modelIds.length - 1;
});

function navigatePrev() {
  if (!props.modelIds?.length) return;
  const idx = props.modelIds.indexOf(props.modelId);
  if (idx > 0) {
    emit('navigate', props.modelIds[idx - 1]);
  }
}

function navigateNext() {
  if (!props.modelIds?.length) return;
  const idx = props.modelIds.indexOf(props.modelId);
  if (idx >= 0 && idx < props.modelIds.length - 1) {
    emit('navigate', props.modelIds[idx + 1]);
  }
}

const store = useAppStore();

const loading = ref(true);
const rescanning = ref(false);
const extracting = ref<string | null>(null); // filepath of ZIP being extracted
const modelDetails = ref<ModelDetails | null>(null);
const modelFiles = ref<ModelFile[]>([]);
const primaryImage = ref<string | null>(null);
const editingName = ref(false);
const editingNameValue = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);
const makeImages = ref<MakeImage[]>([]);
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const notesValue = ref('');
const savedNotes = ref('');

const imageAssets = computed(() =>
  modelDetails.value?.assets.filter(a => a.asset_type === 'image') || []
);

const isPrinted = computed(() =>
  (modelDetails.value?.printHistory?.length ?? 0) > 0
);

const currentPrintRating = computed(() =>
  modelDetails.value?.printHistory?.[0]?.rating || null
);

const pdfAssets = computed(() =>
  modelDetails.value?.assets.filter(a => a.asset_type === 'pdf') || []
);

const hasMetadata = computed(() => {
  const m = modelDetails.value?.metadata;
  if (!m) return false;
  return m.designer || m.source_platform || m.license || m.description;
});

function platformName(platform: string): string {
  const names: Record<string, string> = {
    makerworld: 'MakerWorld',
    printables: 'Printables',
    thangs: 'Thangs'
  };
  return names[platform] || platform;
}

const relativePath = computed(() => {
  if (!modelDetails.value?.filepath) return '';
  const fullPath = modelDetails.value.filepath;
  const modelDir = store.modelDirectory;
  if (modelDir && fullPath.startsWith(modelDir)) {
    // Remove the model directory prefix and leading slash
    return fullPath.slice(modelDir.length).replace(/^\//, '');
  }
  return fullPath;
});

function openLightbox() {
  if (imageAssets.value.length === 0) return;
  const currentIndex = imageAssets.value.findIndex(a => a.filepath === primaryImage.value);
  lightboxIndex.value = currentIndex >= 0 ? currentIndex : 0;
  lightboxOpen.value = true;
}

function closeLightbox() {
  lightboxOpen.value = false;
}

function lightboxPrev() {
  if (imageAssets.value.length <= 1) return;
  lightboxIndex.value = (lightboxIndex.value - 1 + imageAssets.value.length) % imageAssets.value.length;
}

function lightboxNext() {
  if (imageAssets.value.length <= 1) return;
  lightboxIndex.value = (lightboxIndex.value + 1) % imageAssets.value.length;
}

function handleKeydown(event: KeyboardEvent) {
  if (lightboxOpen.value) {
    if (event.key === 'Escape') {
      closeLightbox();
    } else if (event.key === 'ArrowLeft') {
      lightboxPrev();
    } else if (event.key === 'ArrowRight') {
      lightboxNext();
    }
    return;
  }
  if (event.key === 'Escape') {
    emit('close');
  } else if (event.key === 'ArrowLeft') {
    navigatePrev();
  } else if (event.key === 'ArrowRight') {
    navigateNext();
  }
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown);
  await loadModelDetails();
  modelsApi.recordView(props.modelId).catch(() => {});
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

watch(() => props.modelId, async (newId) => {
  await loadModelDetails();
  modelsApi.recordView(newId).catch(() => {});
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

    // Set notes
    notesValue.value = modelDetails.value?.notes || '';
    savedNotes.value = notesValue.value;

    // Load make images if printed
    if (modelDetails.value?.printHistory?.length) {
      await loadMakeImages();
    }
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

async function togglePrinted(rating: 'good' | 'bad') {
  if (!modelDetails.value) return;
  try {
    if (isPrinted.value && currentPrintRating.value === rating) {
      // Same rating clicked again — remove printed status
      await printedApi.toggle(modelDetails.value.id, rating);
      modelDetails.value.printHistory = [];
    } else if (isPrinted.value) {
      // Different rating — update existing record
      const record = modelDetails.value.printHistory[0];
      await printedApi.update(record.id, { rating });
      modelDetails.value.printHistory = [{ ...record, rating }];
    } else {
      // Not printed — mark as printed
      await printedApi.toggle(modelDetails.value.id, rating);
      modelDetails.value.printHistory = [{
        id: 0, model_id: modelDetails.value.id,
        printed_at: new Date().toISOString(),
        rating, notes: null
      }];
      // Marking as printed removes from queue
      modelDetails.value.isQueued = false;
    }
    emit('updated', modelDetails.value);
  } catch (error) {
    console.error('Failed to toggle printed:', error);
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

async function showFileInFinder(filepath: string) {
  try {
    await systemApi.openFolder(filepath);
  } catch (error) {
    console.error('Failed to show file in Finder:', error);
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

async function setPrimaryImage(asset: ModelAsset) {
  if (!modelDetails.value) return;
  try {
    await modelsApi.setPrimaryImage(modelDetails.value.id, asset.id);
    // Update local state
    modelDetails.value.assets.forEach(a => {
      a.is_primary = a.id === asset.id ? 1 : 0;
    });
    primaryImage.value = asset.filepath;
    // Also update the primaryImage property so browse cards update
    (modelDetails.value as any).primaryImage = asset.filepath;
    emit('updated', modelDetails.value);
  } catch (error) {
    console.error('Failed to set primary image:', error);
  }
}

async function hideAsset(asset: ModelAsset) {
  if (!modelDetails.value) return;
  try {
    await modelsApi.hideAsset(modelDetails.value.id, asset.id, true);
    await loadModelDetails();
    emit('updated', modelDetails.value!);
  } catch (error) {
    console.error('Failed to hide asset:', error);
  }
}

function startEditName() {
  if (!modelDetails.value) return;
  editingName.value = true;
  editingNameValue.value = modelDetails.value.filename;
  nextTick(() => {
    nameInputRef.value?.focus();
    nameInputRef.value?.select();
  });
}

function cancelEditName() {
  editingName.value = false;
  editingNameValue.value = '';
}

async function saveName() {
  if (!modelDetails.value || !editingNameValue.value.trim()) {
    cancelEditName();
    return;
  }
  const newName = editingNameValue.value.trim();
  if (newName === modelDetails.value.filename) {
    editingName.value = false;
    return;
  }
  try {
    await modelsApi.updateMetadata(modelDetails.value.id, newName);
    modelDetails.value.filename = newName;
    emit('updated', modelDetails.value);
    editingName.value = false;
  } catch (error) {
    console.error('Failed to update model name:', error);
  }
}

async function saveNotes() {
  if (!modelDetails.value || notesValue.value === savedNotes.value) return;
  try {
    await modelsApi.updateNotes(modelDetails.value.id, notesValue.value);
    savedNotes.value = notesValue.value;
    modelDetails.value.notes = notesValue.value;
  } catch (error) {
    console.error('Failed to save notes:', error);
  }
}

async function loadMakeImages() {
  if (!modelDetails.value?.printHistory?.length) return;
  try {
    const printedId = modelDetails.value.printHistory[0].id;
    if (printedId === 0) return; // Newly created record without real ID
    const res = await printedApi.getImages(printedId);
    makeImages.value = res.data.images;
  } catch (error) {
    console.error('Failed to load make images:', error);
  }
}

function getMakeImageUrl(filepath: string): string {
  const filename = filepath.split('/').pop() || filepath;
  return printedApi.getMakeImageUrl(filename);
}

async function uploadMakeImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !modelDetails.value?.printHistory?.length) return;

  const printedId = modelDetails.value.printHistory[0].id;
  try {
    await printedApi.uploadImage(printedId, file);
    await loadMakeImages();
  } catch (error) {
    console.error('Failed to upload make image:', error);
  }
  // Reset input so same file can be re-selected
  input.value = '';
}

async function deleteMakeImage(imageId: number) {
  if (!modelDetails.value?.printHistory?.length) return;
  const printedId = modelDetails.value.printHistory[0].id;
  try {
    await printedApi.deleteImage(printedId, imageId);
    makeImages.value = makeImages.value.filter(img => img.id !== imageId);
  } catch (error) {
    console.error('Failed to delete make image:', error);
  }
}

async function extractZipFile(zipFile: ZipFile) {
  if (!modelDetails.value || extracting.value) return;

  if (!confirm(`Extract "${zipFile.filename}"? The ZIP file will be moved to Trash after extraction.`)) {
    return;
  }

  extracting.value = zipFile.filepath;
  try {
    await modelsApi.extractZip(modelDetails.value.id, zipFile.filepath);
    // Reload model details to get updated files
    await loadModelDetails();
    emit('updated', modelDetails.value!);
  } catch (error) {
    console.error('Failed to extract ZIP:', error);
    alert('Failed to extract ZIP file. It may already be extracted or there was an error.');
  } finally {
    extracting.value = null;
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

.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 32, 36, 0.8);
  border: 1px solid var(--border-default);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  z-index: 10;
  transition: all var(--transition-base);
  opacity: 0;
  padding: 0;
}

.modal-overlay:hover .nav-arrow {
  opacity: 1;
}

.nav-arrow:hover {
  color: var(--text-primary);
  background: rgba(30, 32, 36, 0.95);
  border-color: var(--border-strong);
  transform: translateY(-50%) scale(1.1);
}

.nav-arrow svg {
  width: 24px;
  height: 24px;
}

.nav-arrow-left {
  left: 1rem;
}

.nav-arrow-right {
  right: 1rem;
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

.primary-image.clickable {
  cursor: zoom-in;
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

.thumbnail-wrapper {
  position: relative;
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
  position: relative;
}

.thumbnail:hover {
  border-color: var(--border-strong);
}

.thumbnail.active {
  border-color: var(--accent-primary);
}

.thumbnail.is-primary {
  border-color: var(--success);
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.primary-badge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--success);
  color: var(--bg-deepest);
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.125rem 0;
  text-align: center;
}

.set-primary-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all var(--transition-base);
  z-index: 5;
}

.set-primary-btn svg {
  width: 12px;
  height: 12px;
  color: var(--text-tertiary);
}

.thumbnail-wrapper:hover .set-primary-btn {
  opacity: 1;
}

.set-primary-btn:hover {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.set-primary-btn:hover svg {
  color: var(--bg-deepest);
}

.hide-asset-btn {
  position: absolute;
  bottom: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all var(--transition-base);
  z-index: 5;
}

.hide-asset-btn svg {
  width: 12px;
  height: 12px;
  color: var(--text-tertiary);
}

.thumbnail-wrapper:hover .hide-asset-btn {
  opacity: 1;
}

.hide-asset-btn:hover {
  background: var(--danger);
  border-color: var(--danger);
}

.hide-asset-btn:hover svg {
  color: var(--bg-deepest);
}

/* Details Section */
.details-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.model-name-section {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.model-name-section h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
  flex: 1;
  padding-right: 2rem;
}

.name-input {
  flex: 1;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  background: var(--bg-deep);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-md);
  padding: 0.25rem 0.5rem;
  line-height: 1.3;
  outline: none;
}

.edit-name-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-tertiary);
  transition: all var(--transition-base);
  opacity: 0;
}

.model-name-section:hover .edit-name-btn {
  opacity: 1;
}

.edit-name-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-default);
  background: var(--bg-hover);
}

.edit-name-btn svg {
  width: 14px;
  height: 14px;
}

.edit-name-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
  margin-top: 0.25rem;
}

.save-name-btn,
.cancel-name-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  cursor: pointer;
  transition: all var(--transition-base);
}

.save-name-btn {
  background: var(--success);
  border-color: var(--success);
  color: var(--bg-deepest);
}

.save-name-btn:hover {
  opacity: 0.85;
}

.save-name-btn svg,
.cancel-name-btn svg {
  width: 14px;
  height: 14px;
}

.cancel-name-btn {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.cancel-name-btn:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--bg-deepest);
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

/* Notes Section */
.notes-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notes-section h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.notes-textarea {
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 60px;
  transition: border-color var(--transition-fast);
}

.notes-textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.notes-textarea::placeholder {
  color: var(--text-muted);
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

.file-item.clickable {
  cursor: pointer;
  transition: all var(--transition-base);
}

.file-item.clickable:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
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

/* Archives Section */
.archives-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.archives-section h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.archives-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.archive-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-deep);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
}

.archive-item > svg {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.archive-name {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.archive-size {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.extract-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: var(--accent-primary-dim);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
}

.extract-btn svg {
  width: 14px;
  height: 14px;
}

.extract-btn:hover:not(:disabled) {
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

.extract-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.extract-btn svg.spinning {
  animation: spin 1s linear infinite;
}

/* Makes Section */
.makes-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.makes-section h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.makes-gallery {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.make-image-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-deep);
}

.make-image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.delete-make-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all var(--transition-base);
}

.delete-make-btn svg {
  width: 12px;
  height: 12px;
  color: white;
}

.make-image-wrapper:hover .delete-make-btn {
  opacity: 1;
}

.delete-make-btn:hover {
  background: var(--danger);
}

.no-makes {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin: 0;
}

.upload-make-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  width: fit-content;
}

.upload-make-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.upload-make-btn svg {
  width: 16px;
  height: 16px;
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
  grid-template-columns: repeat(3, 1fr);
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

.action-btn.bad-active {
  background: var(--danger-dim);
  border-color: var(--danger);
  color: var(--danger);
}

.action-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.action-btn svg.spinning {
  animation: spin 1s linear infinite;
}

/* Metadata Section */
.metadata-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  margin-bottom: 0.75rem;
}

.metadata-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.metadata-label {
  color: var(--text-secondary);
  min-width: 70px;
  flex-shrink: 0;
}

.metadata-value {
  color: var(--text-primary);
}

.metadata-link {
  color: var(--accent-primary);
  text-decoration: none;
}

.metadata-link:hover {
  text-decoration: underline;
}

.platform-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.platform-badge.makerworld {
  background: #1a7a3a20;
  color: #1a7a3a;
}

.platform-badge.printables {
  background: #e6650020;
  color: #e66500;
}

.platform-badge.thangs {
  background: #3b82f620;
  color: #3b82f6;
}

.license-text {
  font-size: 0.8rem;
  opacity: 0.8;
}

.description-text {
  color: var(--text-secondary);
  line-height: 1.4;
  font-size: 0.85rem;
}

/* Tags Section */
.tags-section {
  margin-bottom: 0.75rem;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tag-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease-out;
}

.lightbox-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: var(--radius-md);
}

.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 1;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lightbox-close svg {
  width: 24px;
  height: 24px;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 1;
}

.lightbox-nav:hover {
  background: rgba(255, 255, 255, 0.25);
}

.lightbox-nav svg {
  width: 28px;
  height: 28px;
}

.lightbox-prev {
  left: 1rem;
}

.lightbox-next {
  right: 1rem;
}

.lightbox-counter {
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.5);
  padding: 0.375rem 1rem;
  border-radius: var(--radius-md);
}
</style>
