<template>
  <Teleport to="body">
    <!-- Lightbox overlay -->
    <div v-if="lightboxOpen && imageAssets.length > 0" class="lightbox-overlay" @click.self="closeLightbox">
      <button class="lightbox-close" @click="closeLightbox">
        <AppIcon name="x" />
      </button>
      <button v-if="imageAssets.length > 1" class="lightbox-nav lightbox-prev" @click="lightboxPrev">
        <AppIcon name="chevron-left" />
      </button>
      <button v-if="imageAssets.length > 1" class="lightbox-nav lightbox-next" @click="lightboxNext">
        <AppIcon name="chevron-right" />
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
        <AppIcon name="chevron-left" />
      </button>
      <button v-if="canNavigateNext" class="nav-arrow nav-arrow-right" @click="navigateNext" title="Next model (Right arrow)">
        <AppIcon name="chevron-right" />
      </button>

      <div class="modal-container" @click.stop>
        <button class="close-btn" @click="$emit('close')">
          <AppIcon name="x" />
        </button>

        <div v-if="loading" class="loading">
          <div class="loading-spinner"></div>
          <span>Loading model details...</span>
        </div>

        <template v-else-if="modelDetails">
          <div class="modal-content">
            <!-- Image Section -->
            <div class="image-section">
              <!-- 3D Viewer takes over the primary image area when active -->
              <div v-if="showingPreview" class="primary-image primary-image--3d">
                <ModelViewer
                  :key="previewFileId ?? 0"
                  :modelFiles="previewableFiles"
                  :modelId="modelDetails.id"
                  :initialFileId="previewFileId ?? undefined"
                  :autoActivate="true"
                  @imageCaptured="handlePreviewImageCaptured"
                />
              </div>
              <!-- Normal image display -->
              <div v-else class="primary-image" :class="{ clickable: primaryImage }" @click="primaryImage && openLightbox()">
                <img
                  v-if="primaryImage"
                  :src="getFileUrl(primaryImage)"
                  :alt="modelDetails.filename"
                  @error="handleImageError"
                />
                <div v-else class="no-image">
                  <button v-if="previewableFiles.length > 0" class="no-image-preview-btn" @click.stop="showingPreview = true; previewFileId = null">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 1 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                    Preview 3D Model
                  </button>
                  <span v-else class="emoji">📦</span>
                </div>
              </div>
              <!-- Thumbnail strip: visible when multiple images, or when previewable 3D files exist -->
              <div v-if="imageAssets.length > 1 || previewableFiles.length > 0" class="image-thumbnails">
                <div
                  v-for="asset in imageAssets"
                  :key="asset.id"
                  class="thumbnail-wrapper"
                >
                  <button
                    class="thumbnail"
                    :class="{
                      active: !showingPreview && primaryImage === asset.filepath,
                      'is-primary': asset.is_primary
                    }"
                    @click="primaryImage = asset.filepath; showingPreview = false"
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
                    <AppIcon name="star" />
                  </button>
                  <button
                    v-if="!asset.is_primary"
                    class="hide-asset-btn"
                    @click="hideAsset(asset)"
                    title="Hide this thumbnail"
                  >
                    <AppIcon name="eye-off" />
                  </button>
                </div>
                <!-- 3D Preview trigger thumbnail -->
                <button
                  class="thumbnail thumbnail--3d"
                  :class="{ active: showingPreview }"
                  @click="showingPreview = true; previewFileId = null"
                  title="3D Preview"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 1 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                </button>
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
                  <AppIcon name="edit" />
                </button>
                <div v-else class="edit-name-actions">
                  <button @click="saveName" class="save-name-btn" title="Save">
                    <AppIcon name="check" />
                  </button>
                  <button @click="cancelEditName" class="cancel-name-btn" title="Cancel">
                    <AppIcon name="x" />
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

              <!-- Designer link (when linked via folder structure, no PDF metadata) -->
              <div class="metadata-section" v-if="modelDetails.designer_id && modelDetails.designer_name && !(modelDetails.metadata && modelDetails.metadata.designer)">
                <div class="metadata-row">
                  <span class="metadata-label">Designer</span>
                  <a @click.prevent="goToDesigner" href="#" class="metadata-link">{{ modelDetails.designer_name }}</a>
                </div>
              </div>

              <!-- Metadata from PDF -->
              <div class="metadata-section" v-if="modelDetails.metadata && hasMetadata">
                <div class="metadata-row" v-if="modelDetails.metadata.designer">
                  <span class="metadata-label">Designer</span>
                  <a v-if="modelDetails.designer_id" @click.prevent="goToDesigner" href="#" class="metadata-link">{{ modelDetails.metadata.designer }}</a>
                  <a v-else-if="modelDetails.metadata.designer_url" :href="modelDetails.metadata.designer_url" target="_blank" rel="noopener" class="metadata-link">{{ modelDetails.metadata.designer }}</a>
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
              <div class="tags-section">
                <div class="tags-list">
                  <span v-for="tag in visibleModelTags" :key="tag.id" class="tag-chip editable">
                    <button class="tag-name-btn" @click="navigateToTag(tag.name)" :title="`Browse #${tag.name}`">{{ tag.name }}</button>
                    <button class="tag-remove-btn" @click="removeTag(tag)" title="Remove tag">×</button>
                  </span>
                  <div class="tag-input-wrapper" ref="tagInputWrapperRef">
                    <input
                      v-model="tagInput"
                      @keydown.enter.prevent="addTag"
                      @keydown.escape="tagInput = ''; showTagSuggestions = false"
                      @input="showTagSuggestions = true"
                      @focus="showTagSuggestions = true"
                      @blur="handleTagInputBlur"
                      placeholder="Add tag..."
                      class="tag-input"
                      type="text"
                    />
                    <div v-if="showTagSuggestions && filteredTagSuggestions.length > 0" class="tag-suggestions">
                      <button
                        v-for="suggestion in filteredTagSuggestions"
                        :key="suggestion.id"
                        class="tag-suggestion"
                        @mousedown.prevent="selectTagSuggestion(suggestion)"
                      >
                        {{ suggestion.name }}
                      </button>
                    </div>
                  </div>
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
                    <button
                      v-if="['stl', '3mf'].includes(file.file_type?.toLowerCase() ?? '')"
                      class="preview-file-btn"
                      @click.stop="previewFile(file)"
                      title="Preview in 3D"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 1 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      </svg>
                    </button>
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
                    <AppIcon name="file-text" />
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
                    <AppIcon name="folder-download" />
                    <span class="archive-name">{{ zip.filename }}</span>
                    <span class="archive-size">{{ formatFileSize(zip.size) }}</span>
                    <button
                      @click="extractZipFile(zip)"
                      class="extract-btn"
                      :disabled="!!extracting"
                      :title="extracting === zip.filepath ? 'Extracting...' : 'Extract contents'"
                    >
                      <AppIcon v-if="extracting === zip.filepath" name="refresh" class="spinning" />
                      <AppIcon v-else name="download" />
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
                      <AppIcon name="x" />
                    </button>
                  </div>
                </div>
                <p v-else class="no-makes">No make photos yet.</p>
                <label class="upload-make-btn">
                  <input type="file" accept="image/*" @change="uploadMakeImage" hidden />
                  <AppIcon name="camera" />
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
                  <AppIcon name="star" :fill="modelDetails.isFavorite ? 'currentColor' : 'none'" />
                  {{ modelDetails.isFavorite ? 'Favorited' : 'Add to Favorites' }}
                </button>

                <button
                  @click="toggleQueue"
                  class="action-btn"
                  :class="{ active: modelDetails.isQueued }"
                >
                  <AppIcon name="list" />
                  {{ modelDetails.isQueued ? 'In Queue' : 'Add to Queue' }}
                </button>

                <button
                  @click="togglePrinting"
                  class="action-btn action-btn--printing"
                  :class="{ active: modelDetails.isPrinting }"
                >
                  <span v-if="modelDetails.isPrinting" class="printing-pulse-dot"></span>
                  <AppIcon v-else name="printer" />
                  {{ modelDetails.isPrinting ? 'Printing Now' : 'Mark Printing' }}
                </button>

                <button
                  @click="togglePrinted('good')"
                  class="action-btn"
                  :class="{ active: isPrinted && currentPrintRating === 'good' }"
                >
                  <AppIcon name="thumbs-up" :fill="isPrinted && currentPrintRating === 'good' ? 'currentColor' : 'none'" />
                  {{ isPrinted && currentPrintRating === 'good' ? 'Good Print' : 'Mark Good' }}
                </button>

                <button
                  @click="togglePrinted('bad')"
                  class="action-btn"
                  :class="{ active: isPrinted && currentPrintRating === 'bad', 'bad-active': isPrinted && currentPrintRating === 'bad' }"
                >
                  <AppIcon name="thumbs-down" :fill="isPrinted && currentPrintRating === 'bad' ? 'currentColor' : 'none'" />
                  {{ isPrinted && currentPrintRating === 'bad' ? 'Bad Print' : 'Mark Bad' }}
                </button>

                <button @click="openInFinder" class="action-btn">
                  <AppIcon name="folder" />
                  Show in Finder
                </button>

                <button @click="rescanModel" class="action-btn" :disabled="rescanning">
                  <AppIcon name="refresh" :class="{ spinning: rescanning }" />
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
import { useRouter } from 'vue-router';
import { modelsApi, systemApi, favoritesApi, queueApi, printedApi, tagsApi, type Model, type ModelAsset, type ModelMetadata, type MakeImage, type Tag } from '../services/api';
import { useAppStore } from '../store';
import AppIcon from './AppIcon.vue';
import ModelViewer from './ModelViewer.vue';

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
  isPrinting: boolean;
  printHistory: PrintRecord[];
  metadata?: ModelMetadata | null;
  tags?: Tag[];
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
const router = useRouter();

function goToDesigner() {
  const designerId = modelDetails.value?.designer_id;
  if (designerId) {
    router.push(`/designers/${designerId}`);
  }
}

const loading = ref(true);
const rescanning = ref(false);
const extracting = ref<string | null>(null); // filepath of ZIP being extracted
const modelDetails = ref<ModelDetails | null>(null);
const modelFiles = ref<ModelFile[]>([]);
const primaryImage = ref<string | null>(null);
const showingPreview = ref(false);
const previewFileId = ref<number | null>(null);
const editingName = ref(false);
const editingNameValue = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);
const makeImages = ref<MakeImage[]>([]);
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const notesValue = ref('');
const savedNotes = ref('');

// Tags state
const modelTags = ref<Tag[]>([]);
const allTags = ref<Tag[]>([]);
const tagInput = ref('');
const showTagSuggestions = ref(false);
const tagInputWrapperRef = ref<HTMLElement | null>(null);

const visibleModelTags = computed(() =>
  modelTags.value.filter(t => (t.model_count ?? 0) >= 2)
);

const filteredTagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase();
  const existingIds = new Set(modelTags.value.map(t => t.id));
  return allTags.value.filter(t =>
    !existingIds.has(t.id) && (t.model_count ?? 0) >= 2 && (q === '' || t.name.includes(q))
  ).slice(0, 8);
});

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

const previewableFiles = computed(() =>
  modelFiles.value.filter(f => ['stl', '3mf'].includes(f.file_type?.toLowerCase() ?? ''))
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
  const tag = (event.target as HTMLElement)?.tagName;
  const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable;
  if (event.key === 'Escape') {
    emit('close');
  } else if (!isInputFocused && event.key === 'ArrowLeft') {
    navigatePrev();
  } else if (!isInputFocused && event.key === 'ArrowRight') {
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
  showingPreview.value = false;
  previewFileId.value = null;
  try {
    const [detailsRes, filesRes, allTagsRes] = await Promise.all([
      modelsApi.getById(props.modelId),
      modelsApi.getFiles(props.modelId),
      tagsApi.getAll()
    ]);

    modelDetails.value = detailsRes.data;
    modelFiles.value = filesRes.data.files;
    modelTags.value = detailsRes.data.tags || [];
    allTags.value = allTagsRes.data;

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

function previewFile(file: ModelFile) {
  previewFileId.value = file.id;
  showingPreview.value = true;
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

async function togglePrinting() {
  if (!modelDetails.value) return;
  try {
    const response = await queueApi.togglePrinting(modelDetails.value.id);
    modelDetails.value.isPrinting = response.data.printing;
    emit('updated', modelDetails.value);
  } catch (error) {
    console.error('Failed to toggle printing:', error);
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
      // Marking as printed removes from queue and clears printing state
      modelDetails.value.isQueued = false;
      modelDetails.value.isPrinting = false;
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

async function handlePreviewImageCaptured(dataUrl: string) {
  if (!modelDetails.value) return;
  try {
    const resp = await modelsApi.savePreviewImage(modelDetails.value.id, dataUrl);
    const newAsset: ModelAsset = resp.data.asset;
    // Upsert into local assets array (avoid duplicates on re-capture)
    const existingIdx = modelDetails.value.assets.findIndex(a => a.filepath === newAsset.filepath);
    if (existingIdx >= 0) {
      modelDetails.value.assets[existingIdx] = newAsset;
    } else {
      modelDetails.value.assets.push(newAsset);
    }
    if (resp.data.isPrimary) {
      primaryImage.value = newAsset.filepath;
      (modelDetails.value as any).primaryImage = newAsset.filepath;
    }
    emit('updated', modelDetails.value);
  } catch (error) {
    console.error('Failed to save preview image:', error);
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

function navigateToTag(tagName: string) {
  router.push({ path: '/', query: { tags: tagName } }).then(() => emit('close'));
}

async function addTag() {
  if (!modelDetails.value || !tagInput.value.trim()) return;
  const name = tagInput.value.trim();
  try {
    const res = await tagsApi.addToModel(modelDetails.value.id, name);
    const tag: Tag = res.data.tag;
    if (!modelTags.value.find(t => t.id === tag.id)) {
      modelTags.value.push(tag);
    }
    // Add to allTags if new
    if (!allTags.value.find(t => t.id === tag.id)) {
      allTags.value.push(tag);
    }
    tagInput.value = '';
    showTagSuggestions.value = false;
  } catch (error) {
    console.error('Failed to add tag:', error);
  }
}

async function removeTag(tag: Tag) {
  if (!modelDetails.value) return;
  try {
    await tagsApi.removeFromModel(modelDetails.value.id, tag.id);
    modelTags.value = modelTags.value.filter(t => t.id !== tag.id);
  } catch (error) {
    console.error('Failed to remove tag:', error);
  }
}

async function selectTagSuggestion(tag: Tag) {
  if (!modelDetails.value) return;
  showTagSuggestions.value = false;
  tagInput.value = '';
  try {
    await tagsApi.addToModel(modelDetails.value.id, tag.name);
    if (!modelTags.value.find(t => t.id === tag.id)) {
      modelTags.value.push(tag);
    }
  } catch (error) {
    console.error('Failed to add tag:', error);
  }
}

function handleTagInputBlur() {
  // Small delay to allow mousedown on suggestions to fire first
  setTimeout(() => { showTagSuggestions.value = false; }, 150);
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

.no-image-preview-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 2rem;
  background: transparent;
  border: 2px dashed var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all var(--transition-base);
}

.no-image-preview-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
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

/* 3D Preview primary area */
.primary-image--3d {
  cursor: default;
  padding: 0;
  overflow: hidden;
}

.primary-image--3d .model-viewer {
  border-radius: var(--radius-lg);
}

/* 3D Preview thumbnail in strip */
.thumbnail--3d {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-default);
  background: var(--bg-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.thumbnail--3d:hover {
  border-color: var(--border-strong);
  color: var(--text-secondary);
}

.thumbnail--3d.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

/* Per-file preview button in files list */
.preview-file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.375rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.file-item:hover .preview-file-btn {
  opacity: 1;
}

.preview-file-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-default);
  color: var(--accent-primary);
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

.action-btn--printing.active {
  background: rgba(249, 115, 22, 0.15);
  border-color: #f97316;
  color: #f97316;
}

.action-btn--printing.active:hover:not(:disabled) {
  background: rgba(249, 115, 22, 0.25);
  border-color: #ea6c00;
  color: #ea6c00;
}

.printing-pulse-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  animation: printing-pulse 1.4s ease-in-out infinite;
}

@keyframes printing-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.4); }
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
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.tag-chip.editable {
  padding-right: 0.25rem;
}

.tag-name-btn {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  font-size: inherit;
  line-height: 1;
  transition: color var(--transition-base);
}

.tag-name-btn:hover {
  color: var(--accent);
  text-decoration: underline;
}

.tag-remove-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 0.875rem;
  line-height: 1;
  display: flex;
  align-items: center;
  border-radius: 2px;
  transition: color var(--transition-base);
}

.tag-remove-btn:hover {
  color: var(--danger);
}

.tag-input-wrapper {
  position: relative;
}

.tag-input {
  background: var(--bg-surface);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  width: 120px;
  outline: none;
  transition: border-color var(--transition-base);
}

.tag-input::placeholder {
  color: var(--text-tertiary);
}

.tag-input:focus {
  border-color: var(--accent-primary);
  border-style: solid;
}

.tag-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  min-width: 150px;
  max-height: 200px;
  overflow-y: auto;
}

.tag-suggestion {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-base);
}

.tag-suggestion:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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
