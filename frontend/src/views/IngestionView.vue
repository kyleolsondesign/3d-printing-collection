<template>
  <div class="ingestion-view">
    <div class="header">
      <div class="header-left">
        <h2>Import Models</h2>
        <span class="count-badge" v-if="items.length > 0">{{ filteredItems.length !== items.length ? `${filteredItems.length} / ${items.length}` : items.length }}</span>
      </div>
      <p class="subtitle">Scan a folder for model files and import them into your collection</p>
    </div>

    <!-- Config Bar -->
    <div class="config-bar">
      <div class="config-sections">
        <div class="config-row">
          <label class="config-label">Ingestion folder</label>
          <div class="config-path-row">
            <template v-if="editingPath">
              <input
                v-model="editPathValue"
                class="path-input"
                @keydown.enter="savePath"
                @keydown.escape="editingPath = false"
                ref="pathInputRef"
                placeholder="/path/to/folder"
              />
              <button @click="savePath" class="btn-sm btn-primary">Save</button>
              <button @click="editingPath = false" class="btn-sm btn-ghost">Cancel</button>
            </template>
            <template v-else>
              <span class="config-path">{{ ingestionDir || 'Not configured' }}</span>
              <button @click="startEditPath" class="btn-sm btn-ghost" title="Change folder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </template>
          </div>
        </div>
      </div>
      <button @click="scanFolder" class="btn-scan" :disabled="scanning || !ingestionDir">
        <svg v-if="scanning" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        {{ scanning ? 'Scanning...' : 'Scan' }}
      </button>
    </div>

    <!-- AI Categorization Section -->
    <div class="ai-categorize-bar">
      <div class="ai-categorize-header">
        <div class="ai-categorize-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a7 7 0 017 7c0 3-2 5.5-5 7-.5.25-1 .5-1.5.5H11.5c-.5 0-1-.25-1.5-.5-3-1.5-5-4-5-7a7 7 0 017-7z"/>
            <path d="M9 22h6M12 18v4"/>
          </svg>
          <div>
            <span class="ai-title" v-if="!categorizing && !aiDone">Use AI to improve category suggestions</span>
            <span class="ai-title" v-else-if="categorizing">{{ aiProgress.status }}</span>
            <span class="ai-title" v-else-if="aiDone">{{ aiProgress.status }}</span>
            <span class="ai-hint" v-if="!categorizing && !aiDone">Sends model names and metadata to Claude API (costs apply)</span>
          </div>
        </div>
        <div class="ai-categorize-actions">
          <div v-if="categorizing" class="ai-progress">
            <div class="ai-progress-bar">
              <div class="ai-progress-fill" :style="{ width: aiProgressPercent + '%' }"></div>
            </div>
            <span class="ai-progress-text">Batch {{ aiProgress.currentBatch }}/{{ aiProgress.totalBatches }}</span>
          </div>
          <button v-if="!categorizing && items.length > 0 && hasApiKey" @click="categorizeWithAI" class="btn-ai" :disabled="scanning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a7 7 0 017 7c0 3-2 5.5-5 7-.5.25-1 .5-1.5.5H11.5c-.5 0-1-.25-1.5-.5-3-1.5-5-4-5-7a7 7 0 017-7z"/>
              <path d="M9 22h6M12 18v4"/>
            </svg>
            {{ aiDone ? 'Re-categorize with AI' : 'Categorize with AI' }}
          </button>
        </div>
      </div>
      <div class="ai-config-rows">
        <div class="config-row">
          <label class="config-label">Claude API key</label>
          <div class="config-path-row">
            <template v-if="editingApiKey">
              <input
                v-model="editApiKeyValue"
                class="path-input"
                type="password"
                @keydown.enter="saveApiKey"
                @keydown.escape="editingApiKey = false"
                placeholder="sk-ant-..."
              />
              <button @click="saveApiKey" class="btn-sm btn-primary">Save</button>
              <button @click="editingApiKey = false" class="btn-sm btn-ghost">Cancel</button>
            </template>
            <template v-else>
              <span class="config-path" :class="{ configured: hasApiKey, unconfigured: !hasApiKey }">
                {{ hasApiKey ? 'Configured' : 'Not set' }}
              </span>
              <button @click="editingApiKey = true; editApiKeyValue = ''" class="btn-sm btn-ghost" :title="hasApiKey ? 'Change API key' : 'Set API key'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button v-if="hasApiKey" @click="clearApiKey" class="btn-sm btn-ghost" title="Remove API key">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </template>
          </div>
        </div>
        <div class="config-row">
          <button @click="showPromptEditor = !showPromptEditor" class="prompt-toggle" :class="{ active: showPromptEditor }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <label class="config-label" style="margin-bottom: 0; cursor: pointer;">
              Categorization prompt
            </label>
          </button>
          <div v-if="showPromptEditor" class="prompt-editor-wrapper">
            <textarea
              v-model="promptValue"
              class="prompt-textarea"
              rows="12"
              placeholder="Enter categorization prompt..."
            ></textarea>
            <div class="prompt-help">
              Placeholders: <code>{categories}</code> = category list, <code>{items}</code> = items to categorize, <code>{category_definitions}</code> = contents of <code>backend/data/categories.md</code>
            </div>
            <div class="prompt-actions">
              <button @click="savePrompt" class="btn-sm btn-primary" :disabled="!promptDirty">Save Prompt</button>
              <button @click="resetPrompt" class="btn-sm btn-ghost">Reset to Default</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Results Panel -->
    <div v-if="lastResults" class="results-panel" :class="{ success: lastResults.succeeded > 0, error: lastResults.failed > 0 && lastResults.succeeded === 0 }">
      <div class="results-content">
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
            Imported {{ lastResults.succeeded }} of {{ lastResults.total }} item{{ lastResults.total > 1 ? 's' : '' }}
            <template v-if="lastResults.failed > 0">
              ({{ lastResults.failed }} failed)
            </template>
          </span>
          <button @click="lastResults = null" class="dismiss-btn">Dismiss</button>
        </div>
        <div v-if="lastResults.details && lastResults.details.length > 0" class="results-details">
          <div
            v-for="(detail, i) in lastResults.details"
            :key="i"
            class="result-item"
            :class="{ success: detail.success, error: !detail.success }"
          >
            <svg v-if="detail.success" class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4"/>
            </svg>
            <svg v-else class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            <span class="result-filename">{{ detail.filename }}</span>
            <span v-if="detail.success && detail.category" class="result-folder">
              &rarr; {{ detail.category }}/
            </span>
            <span v-if="!detail.success && detail.error" class="result-error">
              {{ detail.error }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="scanning" class="loading">
      <div class="loading-spinner"></div>
      <span>Scanning for model files...</span>
    </div>

    <!-- Not scanned yet -->
    <div v-else-if="!hasScanned && items.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <path d="M7 10l5 5 5-5"/>
          <path d="M12 15V3"/>
        </svg>
      </div>
      <h3>Import models from a folder</h3>
      <p>Click "Scan" to search for 3D model files in your ingestion folder.</p>
    </div>

    <!-- Empty results -->
    <div v-else-if="hasScanned && items.length === 0" class="empty">
      <div class="empty-icon success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
      </div>
      <h3>No model files found</h3>
      <p>No 3D model files were found in {{ ingestionDir }}</p>
    </div>

    <!-- Items List -->
    <template v-else-if="items.length > 0">
      <!-- Bulk Actions Bar -->
      <div class="bulk-actions-bar">
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
          <span class="selection-separator">|</span>
          <button @click="selectByConfidence('high')" class="btn-filter" :class="{ active: isHighSelected }">
            <span class="confidence-dot high"></span> High
          </button>
          <button @click="selectByConfidence('medium')" class="btn-filter" :class="{ active: isMediumPlusSelected }">
            <span class="confidence-dot medium"></span> Medium+
          </button>
          <span class="selection-count" v-if="selectedIds.size > 0">
            {{ selectedIds.size }} selected
          </span>
        </div>
        <div class="bulk-buttons" v-if="selectedIds.size > 0">
          <div class="batch-category-control">
            <input
              type="text"
              v-model="batchCategory"
              class="category-input batch-category-input"
              list="category-options"
              placeholder="Set category..."
              @click.stop
            />
            <button @click="applyBatchCategory" class="btn-sm btn-ghost" :disabled="!batchCategory.trim()" title="Apply category to selected">
              Apply
            </button>
          </div>
          <button @click="importSelected" class="btn-import-bulk" :disabled="importing">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <path d="M7 10l5 5 5-5"/>
              <path d="M12 15V3"/>
            </svg>
            Import {{ selectedIds.size }} Item{{ selectedIds.size > 1 ? 's' : '' }}
          </button>
        </div>
        <!-- Import progress bar -->
        <div v-if="importing" class="import-progress">
          <div class="import-progress-bar">
            <div class="import-progress-fill"></div>
          </div>
          <span class="import-progress-text">Importing {{ selectedIds.size }} item{{ selectedIds.size > 1 ? 's' : '' }}...</span>
        </div>
      </div>

      <div v-if="filteredItems.length === 0 && store.globalSearchQuery" class="empty">
        <h3>No matching models</h3>
        <p>No items match "{{ store.globalSearchQuery }}"</p>
      </div>
      <div v-else class="items-list">
        <div
          v-for="item in filteredItems"
          :key="item.filepath"
          class="item-card"
          :class="{ selected: selectedIds.has(item.filepath), importing: importingPaths.has(item.filepath) }"
          @click="toggleSelect(item.filepath)"
        >
          <label class="checkbox-wrapper" @click.stop>
            <input
              type="checkbox"
              :checked="selectedIds.has(item.filepath)"
              @change="toggleSelect(item.filepath)"
              :disabled="importingPaths.has(item.filepath)"
            />
          </label>
          <div class="item-icon" :class="{ folder: item.isFolder }">
            <svg v-if="importingPaths.has(item.filepath)" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
            </svg>
            <svg v-else-if="item.isFolder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <path d="M13 2v7h7"/>
            </svg>
          </div>
          <div class="item-info">
            <h3>{{ item.filename }}</h3>
            <div class="item-meta">
              <span class="meta-tag" v-if="item.isFolder">folder</span>
              <span class="meta-tag" v-else>file</span>
              <span class="file-count" v-if="item.fileCount > 1">{{ item.fileCount }} model files</span>
              <span class="file-size">{{ formatFileSize(item.fileSize) }}</span>
            </div>
          </div>
          <div class="item-actions" @click.stop>
            <button @click="openInFinder(item.filepath)" class="btn-finder" title="Show in Finder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </button>
          </div>
          <div class="item-category" @click.stop>
            <div class="confidence-dot" :class="item.confidence" :title="`${item.confidence} confidence match`"></div>
            <div class="category-select-wrapper">
              <input
                type="text"
                :value="item.selectedCategory"
                @input="updateCategory(item, ($event.target as HTMLInputElement).value)"
                @focus="showCategoryDropdown(item)"
                @blur="hideCategoryDropdown"
                class="category-input"
                list="category-options"
              />
              <datalist id="category-options">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                <option value="Uncategorized">Uncategorized</option>
              </datalist>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { ingestionApi, systemApi } from '../services/api';
import { useAppStore } from '../store';

interface IngestionItem {
  filename: string;
  filepath: string;
  isFolder: boolean;
  fileCount: number;
  fileSize: number;
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  selectedCategory: string;
}

interface ImportDetail {
  filename: string;
  success: boolean;
  error?: string;
  category?: string;
}

interface ImportResults {
  total: number;
  succeeded: number;
  failed: number;
  details: ImportDetail[];
}

const store = useAppStore();
const ingestionDir = ref('');
const hasApiKey = ref(false);
const batchCategory = ref('');
const editingPath = ref(false);
const editPathValue = ref('');
const editingApiKey = ref(false);
const editApiKeyValue = ref('');
const showPromptEditor = ref(false);
const promptValue = ref('');
const savedPromptValue = ref('');
const pathInputRef = ref<HTMLInputElement | null>(null);
const items = ref<IngestionItem[]>([]);
const categories = ref<string[]>([]);
const scanning = ref(false);
const importing = ref(false);
const categorizing = ref(false);
const aiDone = ref(false);
const hasScanned = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const aiProgress = ref({
  active: false,
  totalItems: 0,
  processedItems: 0,
  currentBatch: 0,
  totalBatches: 0,
  status: ''
});
const aiProgressPercent = computed(() => {
  if (aiProgress.value.totalBatches === 0) return 0;
  return Math.round((aiProgress.value.currentBatch / aiProgress.value.totalBatches) * 100);
});
const importingPaths = ref<Set<string>>(new Set());
const lastResults = ref<ImportResults | null>(null);

const promptDirty = computed(() =>
  promptValue.value !== savedPromptValue.value
);

const isAllSelected = computed(() =>
  filteredItems.value.length > 0 && filteredItems.value.every(i => selectedIds.value.has(i.filepath))
);

const isPartiallySelected = computed(() =>
  selectedIds.value.size > 0 && !isAllSelected.value
);

const highConfidenceItems = computed(() =>
  items.value.filter(i => i.confidence === 'high')
);

const mediumPlusItems = computed(() =>
  items.value.filter(i => i.confidence === 'high' || i.confidence === 'medium')
);

const isHighSelected = computed(() =>
  highConfidenceItems.value.length > 0 &&
  highConfidenceItems.value.every(i => selectedIds.value.has(i.filepath))
);

const isMediumPlusSelected = computed(() =>
  mediumPlusItems.value.length > 0 &&
  mediumPlusItems.value.every(i => selectedIds.value.has(i.filepath))
);

const filteredItems = computed(() => {
  const q = store.globalSearchQuery.toLowerCase();
  if (!q) return items.value;
  return items.value.filter(i => i.filename.toLowerCase().includes(q));
});

onMounted(async () => {
  await loadConfig();
  await loadCategories();
  if (ingestionDir.value) {
    await scanFolder();
  }
});

async function loadConfig() {
  try {
    const response = await ingestionApi.getConfig();
    ingestionDir.value = response.data.directory || '';
    hasApiKey.value = response.data.hasApiKey || false;
    promptValue.value = response.data.prompt || '';
    savedPromptValue.value = response.data.prompt || '';
  } catch (error) {
    console.error('Failed to load ingestion config:', error);
  }
}

async function loadCategories() {
  try {
    const response = await systemApi.getCategories();
    categories.value = response.data.categories.map((c: any) => c.category).filter(Boolean);
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

function startEditPath() {
  editPathValue.value = ingestionDir.value;
  editingPath.value = true;
  nextTick(() => {
    pathInputRef.value?.focus();
    pathInputRef.value?.select();
  });
}

async function savePath() {
  const newPath = editPathValue.value.trim();
  if (!newPath) return;

  try {
    const response = await ingestionApi.setConfig({ directory: newPath });
    ingestionDir.value = response.data.directory;
    hasApiKey.value = response.data.hasApiKey;
    editingPath.value = false;
    // Auto-scan after changing path
    await scanFolder();
  } catch (error: any) {
    console.error('Failed to save ingestion path:', error);
    alert(error.response?.data?.error || 'Failed to save path');
  }
}

async function saveApiKey() {
  const key = editApiKeyValue.value.trim();
  if (!key) return;

  try {
    const response = await ingestionApi.setConfig({ apiKey: key });
    hasApiKey.value = response.data.hasApiKey;
    editingApiKey.value = false;
    editApiKeyValue.value = '';
  } catch (error: any) {
    console.error('Failed to save API key:', error);
    alert(error.response?.data?.error || 'Failed to save API key');
  }
}

async function clearApiKey() {
  try {
    const response = await ingestionApi.setConfig({ apiKey: '' });
    hasApiKey.value = response.data.hasApiKey;
  } catch (error) {
    console.error('Failed to clear API key:', error);
  }
}

async function savePrompt() {
  try {
    const response = await ingestionApi.setConfig({ prompt: promptValue.value });
    savedPromptValue.value = response.data.prompt || '';
    promptValue.value = savedPromptValue.value;
  } catch (error: any) {
    console.error('Failed to save prompt:', error);
    alert(error.response?.data?.error || 'Failed to save prompt');
  }
}

async function resetPrompt() {
  try {
    const response = await ingestionApi.setConfig({ prompt: '' });
    savedPromptValue.value = response.data.prompt || '';
    promptValue.value = savedPromptValue.value;
  } catch (error: any) {
    console.error('Failed to reset prompt:', error);
  }
}

async function scanFolder() {
  scanning.value = true;
  hasScanned.value = false;
  items.value = [];
  aiDone.value = false;
  selectedIds.value.clear();

  try {
    const response = await ingestionApi.scan();
    items.value = (response.data.items || []).map((item: any) => ({
      ...item,
      selectedCategory: item.suggestedCategory
    }));
    hasScanned.value = true;
  } catch (error: any) {
    console.error('Failed to scan:', error);
    alert(error.response?.data?.error || 'Failed to scan folder');
    hasScanned.value = true;
  } finally {
    scanning.value = false;
  }
}

async function categorizeWithAI() {
  if (categorizing.value) return;
  categorizing.value = true;
  aiDone.value = false;
  aiProgress.value = { active: true, totalItems: items.value.length, processedItems: 0, currentBatch: 0, totalBatches: 0, status: 'Starting AI categorization...' };

  // Poll for progress
  const pollInterval = setInterval(async () => {
    try {
      const status = await ingestionApi.categorizeStatus();
      aiProgress.value = status.data;
    } catch { /* ignore polling errors */ }
  }, 1000);

  try {
    const response = await ingestionApi.categorize();
    clearInterval(pollInterval);

    // Update items with AI suggestions
    const aiItems = response.data.items || [];
    for (const aiItem of aiItems) {
      const existing = items.value.find(i => i.filepath === aiItem.filepath);
      if (existing) {
        existing.suggestedCategory = aiItem.suggestedCategory;
        existing.confidence = aiItem.confidence;
        existing.selectedCategory = aiItem.suggestedCategory;
      }
    }

    aiDone.value = true;
    aiProgress.value = {
      active: false,
      totalItems: aiItems.length,
      processedItems: aiItems.length,
      currentBatch: response.data.batches || 0,
      totalBatches: response.data.batches || 0,
      status: `AI categorized ${response.data.aiCategorized || 0} of ${aiItems.length} items`
    };
  } catch (error: any) {
    clearInterval(pollInterval);
    console.error('AI categorization failed:', error);
    aiProgress.value.status = 'AI categorization failed';
    aiProgress.value.active = false;
    alert(error.response?.data?.error || 'AI categorization failed');
  } finally {
    categorizing.value = false;
  }
}

function toggleSelect(filepath: string) {
  const newSet = new Set(selectedIds.value);
  if (newSet.has(filepath)) {
    newSet.delete(filepath);
  } else {
    newSet.add(filepath);
  }
  selectedIds.value = newSet;
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    // Deselect only the filtered items (preserve selections outside the filter)
    const newSet = new Set(selectedIds.value);
    for (const item of filteredItems.value) {
      newSet.delete(item.filepath);
    }
    selectedIds.value = newSet;
  } else {
    const newSet = new Set(selectedIds.value);
    for (const item of filteredItems.value) {
      newSet.add(item.filepath);
    }
    selectedIds.value = newSet;
  }
}

function selectByConfidence(level: 'high' | 'medium') {
  const targetItems = level === 'high' ? highConfidenceItems.value : mediumPlusItems.value;
  const allSelected = targetItems.every(i => selectedIds.value.has(i.filepath));

  if (allSelected) {
    // Deselect these items
    const newSet = new Set(selectedIds.value);
    targetItems.forEach(i => newSet.delete(i.filepath));
    selectedIds.value = newSet;
  } else {
    // Select these items (add to existing selection)
    const newSet = new Set(selectedIds.value);
    targetItems.forEach(i => newSet.add(i.filepath));
    selectedIds.value = newSet;
  }
}

function updateCategory(item: IngestionItem, value: string) {
  item.selectedCategory = value;
  if (value && !selectedIds.value.has(item.filepath)) {
    const newSet = new Set(selectedIds.value);
    newSet.add(item.filepath);
    selectedIds.value = newSet;
  }
}

function showCategoryDropdown(_item: IngestionItem) {
  // datalist handles this natively
}

function hideCategoryDropdown() {
  // datalist handles this natively
}

async function importSelected() {
  if (selectedIds.value.size === 0) return;

  importing.value = true;
  const selectedItems = items.value.filter(i => selectedIds.value.has(i.filepath));

  // Build filename lookup
  const filenameLookup = new Map<string, { filename: string; category: string }>();
  selectedItems.forEach(i => filenameLookup.set(i.filepath, { filename: i.filename, category: i.selectedCategory }));

  // Mark as importing
  selectedItems.forEach(i => importingPaths.value.add(i.filepath));

  try {
    const payload = selectedItems.map(i => ({
      filepath: i.filepath,
      category: i.selectedCategory,
      isFolder: i.isFolder
    }));

    const response = await ingestionApi.importItems(payload);
    const details: ImportDetail[] = (response.data.results || []).map((r: any) => {
      const info = filenameLookup.get(r.filepath);
      return {
        filename: info?.filename || path_basename(r.filepath),
        success: r.success,
        error: r.error,
        category: info?.category
      };
    });
    lastResults.value = { ...response.data.summary, details };

    // Re-scan to update list
    await scanFolder();
  } catch (error) {
    console.error('Failed to import:', error);
    const details: ImportDetail[] = selectedItems.map(i => ({
      filename: i.filename,
      success: false,
      error: 'Request failed'
    }));
    lastResults.value = { total: selectedItems.length, succeeded: 0, failed: selectedItems.length, details };
  } finally {
    importing.value = false;
    importingPaths.value.clear();
    selectedIds.value.clear();
  }
}

function applyBatchCategory() {
  const cat = batchCategory.value.trim();
  if (!cat || selectedIds.value.size === 0) return;
  items.value.forEach(item => {
    if (selectedIds.value.has(item.filepath)) {
      item.selectedCategory = cat;
    }
  });
}

async function openInFinder(filepath: string) {
  try {
    await systemApi.openFolder(filepath);
  } catch (error) {
    console.error('Failed to open in Finder:', error);
  }
}

function path_basename(filepath: string): string {
  return filepath.split('/').pop() || filepath;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
</script>

<style scoped>
.ingestion-view {
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
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* Config Bar */
.config-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 1.25rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  margin-bottom: 1.5rem;
  gap: 1rem;
}

.config-sections {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.config-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.config-hint {
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  text-transform: none;
  letter-spacing: normal;
}

.config-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.config-path-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.config-path {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--text-primary);
  word-break: break-all;
}

.path-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.path-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  border: none;
}

.btn-primary {
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

.btn-primary:hover {
  background: var(--accent-secondary);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.btn-ghost:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.btn-ghost svg {
  width: 16px;
  height: 16px;
}

.btn-scan {
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
  flex-shrink: 0;
}

.btn-scan:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.btn-scan:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-scan svg {
  width: 18px;
  height: 18px;
}

/* Prompt Editor */
.prompt-toggle {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-secondary);
}

.prompt-toggle svg {
  width: 16px;
  height: 16px;
  transition: transform var(--transition-base);
  flex-shrink: 0;
}

.prompt-toggle.active svg {
  transform: rotate(90deg);
}

.prompt-editor-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.prompt-textarea {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 100px;
}

.prompt-textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.prompt-help {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.prompt-help code {
  background: var(--bg-hover);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent-primary);
}

.prompt-actions {
  display: flex;
  gap: 0.5rem;
}

/* AI Categorize Section */
.ai-categorize-bar {
  padding: 0.875rem 1rem;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: var(--radius-md);
  margin-bottom: 1rem;
}

.ai-categorize-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.ai-categorize-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.ai-config-rows {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(139, 92, 246, 0.15);
}

.ai-config-rows .config-row {
  padding: 0;
}

.ai-categorize-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
}

.ai-categorize-info > svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: rgb(167, 139, 250);
}

.ai-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.ai-progress {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 160px;
}

.ai-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-elevated);
  border-radius: 3px;
  overflow: hidden;
}

.ai-progress-fill {
  height: 100%;
  background: rgb(139, 92, 246);
  transition: width 0.3s ease;
  border-radius: 3px;
}

.ai-progress-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  white-space: nowrap;
}

.btn-ai {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: rgba(139, 92, 246, 0.15);
  color: rgb(167, 139, 250);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.btn-ai svg {
  width: 16px;
  height: 16px;
}

.btn-ai:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.25);
  border-color: rgba(139, 92, 246, 0.5);
}

.btn-ai:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Config state indicators */
.config-path.configured {
  color: var(--success);
}

.config-path.unconfigured {
  color: var(--text-tertiary);
  font-style: italic;
}

/* Results Panel */
.results-panel {
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  margin-bottom: 1rem;
  animation: slideIn 0.3s ease-out;
}

.results-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
  flex-shrink: 0;
}

.dismiss-btn {
  margin-left: auto;
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity var(--transition-base);
  flex-shrink: 0;
}

.dismiss-btn:hover {
  opacity: 1;
}

.results-details {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 200px;
  overflow-y: auto;
  padding-left: 2rem;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.4;
}

.result-item.success { color: var(--success); }
.result-item.error { color: var(--danger); }

.result-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.result-filename {
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.result-folder {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.result-error {
  color: var(--danger);
  font-size: 0.8rem;
  font-style: italic;
}

/* Bulk Actions Bar */
.bulk-actions-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  margin-bottom: 1rem;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

.selection-separator {
  color: var(--border-default);
  font-size: 0.9rem;
}

.btn-filter {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-filter:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn-filter.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.btn-filter .confidence-dot {
  width: 6px;
  height: 6px;
}

.selection-count {
  color: var(--accent-primary);
  font-weight: 600;
  font-size: 0.9rem;
}

.btn-import-bulk {
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

.btn-import-bulk:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.btn-import-bulk:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-import-bulk svg {
  width: 18px;
  height: 18px;
}

.bulk-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Batch Category */
.batch-category-control {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.batch-category-input {
  width: 150px;
  font-size: 0.8rem;
  padding: 0.375rem 0.625rem;
}

/* Import Progress */
.import-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.75rem;
}

.import-progress-bar {
  width: 100%;
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.import-progress-fill {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 2px;
  animation: progressIndeterminate 1.5s ease-in-out infinite;
}

@keyframes progressIndeterminate {
  0% { width: 0%; margin-left: 0%; }
  50% { width: 40%; margin-left: 30%; }
  100% { width: 0%; margin-left: 100%; }
}

.import-progress-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

/* Show in Finder button */
.item-actions {
  flex-shrink: 0;
}

.btn-finder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-finder:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.btn-finder svg {
  width: 16px;
  height: 16px;
}

/* Items List */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all var(--transition-base);
  cursor: pointer;
  animation: fadeIn 0.4s ease-out backwards;
}

.item-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-elevated);
}

.item-card.selected {
  border-color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.item-card.importing {
  opacity: 0.7;
  pointer-events: none;
}

.item-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  flex-shrink: 0;
}

.item-icon.folder {
  background: var(--warning-dim);
  color: var(--warning);
}

.item-icon svg {
  width: 24px;
  height: 24px;
}

.item-icon svg.spinner {
  animation: spin 1s linear infinite;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-info h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.375rem;
  word-break: break-word;
}

.item-meta {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.meta-tag {
  background: var(--bg-hover);
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.file-count {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.file-size {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

/* Category */
.item-category {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.confidence-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.confidence-dot.high { background: var(--success); }
.confidence-dot.medium { background: var(--warning); }
.confidence-dot.low { background: var(--text-tertiary); }

.category-select-wrapper {
  position: relative;
}

.category-input {
  width: 180px;
  padding: 0.5rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: all var(--transition-base);
}

.category-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

/* Loading & Empty */
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

.empty-icon.success {
  background: var(--success-dim);
  color: var(--success);
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
