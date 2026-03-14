<template>
  <div class="ingestion-view">
    <div class="header">
      <div class="header-left">
        <h2>Import Models</h2>
        <span class="count-badge" v-if="items.length > 0">{{ filteredItems.length !== items.length ? `${filteredItems.length} / ${items.length}` : items.length }}</span>
      </div>
      <p class="subtitle">Scan a folder for model files and import them into your collection</p>
    </div>

    <!-- Tab Bar -->
    <div class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'import' }]" @click="switchToImport">Import</button>
      <button :class="['tab-btn', { active: activeTab === 'paid' }]" @click="switchToPaid">
        Paid Models
        <span v-if="paidItems.length" class="tab-badge">{{ paidItems.length }}</span>
      </button>
    </div>

    <!-- ── Import Tab ── -->
    <div v-if="activeTab === 'import'">

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
                <AppIcon name="edit" />
              </button>
            </template>
          </div>
        </div>
      </div>
      <button @click="scanFolder" class="btn-scan" :disabled="scanning || !ingestionDir">
        <AppIcon v-if="scanning" name="spinner" class="spinner" />
        <AppIcon v-else name="search" />
        {{ scanning ? 'Scanning...' : 'Scan' }}
      </button>
    </div>

    <!-- AI Categorization Section -->
    <div class="ai-categorize-bar">
      <div class="ai-categorize-header">
        <div class="ai-categorize-info">
          <AppIcon name="brain" />
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
            <AppIcon name="brain" />
            {{ aiDone ? 'Re-categorize with AI' : 'Categorize with AI' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Results Panel -->
    <div v-if="lastResults" class="results-panel" :class="{ success: lastResults.succeeded > 0, error: lastResults.failed > 0 && lastResults.succeeded === 0 }">
      <div class="results-content">
        <div class="results-header">
          <AppIcon v-if="lastResults.succeeded > 0" name="check-circle" />
          <AppIcon v-else name="circle-x" />
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
            <AppIcon v-if="detail.success" name="check" class="result-icon" />
            <AppIcon v-else name="x" class="result-icon" />
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
        <AppIcon name="folder-download" stroke-width="1.5" />
      </div>
      <h3>Import models from a folder</h3>
      <p>Click "Scan" to search for 3D model files in your ingestion folder.</p>
    </div>

    <!-- Empty results -->
    <div v-else-if="hasScanned && items.length === 0" class="empty">
      <div class="empty-icon success">
        <AppIcon name="check-circle" stroke-width="1.5" />
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
            <AppIcon name="folder-download" />
            Import {{ selectedIds.size }} Item{{ selectedIds.size > 1 ? 's' : '' }}
          </button>
        </div>
        <!-- Import progress bar -->
        <div v-if="importing" class="import-progress">
          <div class="import-progress-bar">
            <div class="import-progress-fill" :style="{ width: importProgressPercent + '%' }"></div>
          </div>
          <span class="import-progress-text">{{ importProgress.status || `Importing ${importProgress.processedItems}/${importProgress.totalItems}...` }}</span>
        </div>
      </div>

      <div v-if="filteredItems.length === 0 && store.globalSearchQuery" class="empty">
        <h3>No matching models</h3>
        <p>No items match "{{ store.globalSearchQuery }}"</p>
      </div>
      <div v-else class="items-list">
        <template
          v-for="item in filteredItems"
          :key="item.filepath"
        >
        <div
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
          <div class="item-thumb" v-if="item.imageFile">
            <img
              :src="ingestionApi.getPreviewImageUrl(item.imageFile)"
              :alt="item.filename"
              @error="onImageError"
              loading="lazy"
            />
            <div v-if="importingPaths.has(item.filepath)" class="thumb-spinner">
              <AppIcon name="spinner" class="spinner" />
            </div>
          </div>
          <div class="item-icon-mini" v-else-if="importingPaths.has(item.filepath)">
            <AppIcon name="spinner" class="spinner" />
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
              <AppIcon name="folder" />
            </button>
          </div>
          <div class="item-category" @click.stop>
            <div class="confidence-dot" :class="item.confidence" :title="`${item.confidence} confidence match`"></div>
            <button
              class="debug-btn"
              :class="{ active: activeDebugPath === item.filepath }"
              @click.stop="toggleDebug(item)"
              title="Show score breakdown"
            >?</button>
            <div class="category-select-wrapper">
              <input
                type="text"
                :value="item.selectedCategory"
                @input="onCategoryInput(item, ($event.target as HTMLInputElement).value)"
                @focus="onCategoryFocus(item)"
                @blur="onCategoryBlur"
                @keydown.escape="onCategoryBlur"
                class="category-input"
              />
              <div v-if="activeDropdownPath === item.filepath" class="category-dropdown">
                <button
                  v-for="cat in getCategoryOptions(item)"
                  :key="cat"
                  class="category-option"
                  :class="{ current: cat === item.selectedCategory }"
                  @mousedown.prevent="selectCategory(item, cat)"
                >
                  <span class="cat-name">{{ cat }}</span>
                  <span v-if="getDebugScore(item, cat) !== null" class="cat-score">{{ getDebugScore(item, cat) }}%</span>
                </button>
                <div v-if="getCategoryOptions(item).length === 0" class="category-option-empty">No matching categories</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tags row -->
        <div v-if="item.selectedTags.length > 0 || item.suggestedTags.length > 0" class="item-tags" @click.stop>
          <span class="item-tags-label">Tags:</span>
          <span
            v-for="tag in item.selectedTags"
            :key="tag"
            class="ingestion-tag-chip"
          >{{ tag }}<button class="ingestion-tag-remove" @click.stop="item.selectedTags = item.selectedTags.filter(t => t !== tag)">×</button></span>
          <input
            class="ingestion-tag-input"
            placeholder="add tag..."
            @keydown.enter.prevent="(e) => { const v = (e.target as HTMLInputElement).value.trim().toLowerCase(); if (v && !item.selectedTags.includes(v)) item.selectedTags.push(v); (e.target as HTMLInputElement).value = ''; }"
          />
        </div>

        <div v-if="activeDebugPath === item.filepath" class="debug-panel">
          <div class="debug-panel-title">Score breakdown — {{ item.filename }}</div>
          <div v-for="entry in item.debugScores" :key="entry.category" class="debug-row">
            <span class="debug-cat">{{ entry.category }}</span>
            <span class="debug-source" :data-source="entry.source">{{ entry.source }}</span>
            <div class="debug-bar-wrap">
              <div class="debug-bar" :style="{ width: entry.score + '%' }"></div>
            </div>
            <span class="debug-pct">{{ entry.score }}%</span>
          </div>
          <div v-if="item.debugScores.length === 0" class="debug-empty">No matching signal found — category was not determinable from filename or context.</div>
        </div>
        </template>
      </div>
    </template>
    </div><!-- end import tab -->

    <!-- ── Paid Models Tab ── -->
    <div v-else-if="activeTab === 'paid'" class="paid-tab">

      <!-- Toolbar -->
      <div class="paid-toolbar">
        <div class="paid-toolbar-left">
          <label class="paid-select-all-wrap">
            <input
              type="checkbox"
              class="paid-select-all-check"
              :checked="isPaidAllSelected"
              :indeterminate="isPaidPartiallySelected"
              @change="togglePaidSelectAll"
            />
          </label>
          <span class="paid-selection-count">
            <template v-if="paidSelectedIds.size > 0">{{ paidSelectedIds.size }} selected</template>
            <template v-else>{{ paidTotal.toLocaleString() }} models</template>
          </span>
          <div class="paid-search-wrap" :class="{ focused: paidSearchFocused }">
            <AppIcon name="search" class="paid-search-icon" />
            <input
              v-model="paidSearch"
              @input="onPaidSearchInput"
              @focus="paidSearchFocused = true"
              @blur="onPaidSearchBlur"
              @keydown.escape="paidSearchFocused = false; ($event.target as HTMLInputElement).blur()"
              placeholder="Filter by name or designer..."
              class="paid-search-input"
              autocomplete="off"
            />
            <button v-if="paidSearch" @click="paidSearch = ''; loadPaidItems(1)" class="paid-search-clear">
              <AppIcon name="x" />
            </button>
            <!-- Designer suggestions dropdown -->
            <div v-if="paidSearchFocused && paidDesignerSuggestions.length > 0" class="paid-search-dropdown">
              <div class="paid-search-dropdown-label">Designers</div>
              <button
                v-for="designer in paidDesignerSuggestions"
                :key="designer"
                class="paid-search-option"
                @mousedown.prevent="selectPaidDesigner(designer)"
              >
                <AppIcon name="users" class="paid-search-option-icon" />
                {{ designer }}
              </button>
            </div>
          </div>
        </div>
        <div class="paid-toolbar-right">
          <div v-if="paidSelectedIds.size > 0" class="paid-batch-wrap">
            <input
              v-model="paidBatchCategory"
              @keydown.enter="applyPaidBatchCategory"
              placeholder="Batch assign..."
              class="paid-batch-input"
              list="paid-cats-datalist"
            />
            <datalist id="paid-cats-datalist">
              <option v-for="cat in categories" :key="cat" :value="cat" />
            </datalist>
            <button @click="applyPaidBatchCategory" class="btn-sm btn-ghost" :disabled="!paidBatchCategory.trim()">Apply</button>
          </div>
          <button
            @click="categorizePaidWithAI"
            class="btn-ai-suggest"
            :disabled="!hasApiKey || paidCategorizing || paidApplying"
            :title="!hasApiKey ? 'Configure an Anthropic API key in the Import tab' : 'Use AI to suggest categories'"
          >
            <AppIcon v-if="paidCategorizing" name="spinner" class="spin" />
            <AppIcon v-else name="brain" />
            {{ paidCategorizing ? 'Running...' : 'AI Suggest' }}
          </button>
          <button
            @click="applyPaidCategories"
            class="btn-apply-paid"
            :disabled="paidChangedCount === 0 || paidApplying || paidCategorizing"
          >
            <AppIcon v-if="paidApplying" name="spinner" class="spin" />
            <AppIcon v-else name="check" />
            {{ paidApplying ? 'Saving...' : `Save ${paidChangedCount > 0 ? paidChangedCount : ''} Change${paidChangedCount !== 1 ? 's' : ''}` }}
          </button>
        </div>
      </div>

      <!-- No API key notice -->
      <div v-if="!hasApiKey" class="paid-notice">
        <AppIcon name="info" />
        AI suggestions require an Anthropic API key — configure it in Settings.
      </div>

      <!-- AI progress -->
      <div v-if="paidCategorizing" class="paid-ai-progress">
        <div class="paid-ai-bar">
          <div class="paid-ai-fill" :style="{ width: paidProgressPercent + '%' }"></div>
        </div>
        <span class="paid-ai-label">{{ paidProgress.status || 'Processing...' }}</span>
      </div>

      <!-- Success banner -->
      <div v-if="paidResults" class="paid-results-banner" :class="paidResults.failed > 0 && paidResults.succeeded === 0 ? 'error' : 'success'">
        <AppIcon :name="paidResults.succeeded > 0 ? 'check-circle' : 'circle-x'" />
        <span>Saved {{ paidResults.succeeded }} of {{ paidResults.total }} category assignment{{ paidResults.total !== 1 ? 's' : '' }}</span>
        <button @click="paidResults = null" class="paid-results-dismiss">Dismiss</button>
      </div>

      <!-- Loading -->
      <div v-if="paidLoading" class="loading">
        <div class="loading-spinner"></div>
        <span>Loading paid models...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="!paidLoading && paidItems.length === 0" class="empty">
        <div class="empty-icon success">
          <AppIcon name="check-circle" stroke-width="1.5" />
        </div>
        <h3>All paid models are categorized</h3>
        <p>No paid models with "Uncategorized" or "Paid" category found.</p>
      </div>

      <!-- Items table -->
      <template v-else>
        <div class="paid-table">
          <!-- Table header -->
          <div class="paid-table-header">
            <div class="ptcol-check"></div>
            <div class="ptcol-thumb"></div>
            <div class="ptcol-name">Model</div>
            <div class="ptcol-assign">Assign Category</div>
            <div class="ptcol-finder"></div>
          </div>

          <!-- Rows -->
          <div
            v-for="item in paidDisplayItems"
            :key="item.model_id"
            class="paid-row"
            :class="{ selected: paidSelectedIds.has(item.model_id), changed: item.selected_category !== item.current_category }"
            @click="togglePaidItem(item.model_id)"
          >
            <div class="ptcol-check" @click.stop>
              <input type="checkbox" class="paid-row-check" :checked="paidSelectedIds.has(item.model_id)" @change="togglePaidItem(item.model_id)" />
            </div>
            <div class="ptcol-thumb">
              <div class="paid-thumb">
                <img v-if="getModelThumb(item)" :src="getModelThumb(item)!" @error="onImageError" loading="lazy" />
                <span v-else class="paid-thumb-placeholder">
                  <AppIcon name="package" stroke-width="1.5" />
                </span>
              </div>
            </div>
            <div class="ptcol-name">
              <span class="paid-model-name">{{ item.model_name }}</span>
              <span v-if="item.designer" class="paid-designer">{{ item.designer }}</span>
            </div>
            <div class="ptcol-assign" @click.stop>
              <div class="paid-cat-wrap">
                <span v-if="item.confidence" class="confidence-dot" :class="item.confidence" :title="item.confidence + ' confidence'"></span>
                <input
                  type="text"
                  :value="item.selected_category"
                  @input="onPaidCategoryInput($event, item)"
                  @focus="onPaidCategoryFocus(item)"
                  @blur="onPaidCategoryBlur"
                  class="paid-cat-input"
                  :class="{ changed: item.selected_category !== item.current_category }"
                  placeholder="Category..."
                />
                <div v-if="paidActiveDropdown === item.model_id" class="paid-cat-dropdown">
                  <div v-if="getPaidCategoryOptions(item).length === 0" class="paid-cat-empty">No matches</div>
                  <button
                    v-for="cat in getPaidCategoryOptions(item)"
                    :key="cat"
                    class="paid-cat-option"
                    :class="{ active: cat === item.selected_category }"
                    @mousedown.prevent="selectPaidCategory(item, cat)"
                  >
                    <span class="paid-cat-option-name">{{ cat }}</span>
                    <span v-if="getDebugScoreFromList(item.debug_scores, cat) !== null" class="paid-cat-score">{{ getDebugScoreFromList(item.debug_scores, cat) }}%</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="ptcol-finder" @click.stop>
              <button class="paid-finder-btn" @click="openInFinder(item.model_filepath)" title="Show in Finder">
                <AppIcon name="folder" />
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="paidTotalPages > 1" class="paid-pagination">
          <button class="pgbtn" :disabled="paidPage === 1" @click="loadPaidItems(paidPage - 1)">
            <AppIcon name="chevron-left" />
          </button>
          <span class="pginfo">Page {{ paidPage }} of {{ paidTotalPages }} &middot; {{ paidTotal.toLocaleString() }} models</span>
          <button class="pgbtn" :disabled="paidPage >= paidTotalPages" @click="loadPaidItems(paidPage + 1)">
            <AppIcon name="chevron-right" />
          </button>
        </div>
      </template>

    </div><!-- end paid tab -->

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ingestionApi, systemApi } from '../services/api';
import { useAppStore } from '../store';
import AppIcon from '../components/AppIcon.vue';

const route = useRoute();
const router = useRouter();

interface ScoreDebugEntry {
  category: string;
  score: number;
  source: 'exact' | 'name' | 'files' | 'tags' | 'text' | 'hint';
}

interface IngestionItem {
  filename: string;
  filepath: string;
  isFolder: boolean;
  fileCount: number;
  fileSize: number;
  imageFile: string | null;
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  selectedCategory: string;
  debugScores: ScoreDebugEntry[];
  designer: string | null;
  suggestedTags: string[];
  selectedTags: string[];
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

// ── Tab state ──────────────────────────────────────────────────────────────
const activeTab = ref<'import' | 'paid'>('import');

interface PaidCategoryItem {
  model_id: number;
  model_name: string;
  model_filepath: string;
  current_category: string;
  selected_category: string;
  suggested_category: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  debug_scores: ScoreDebugEntry[];
  designer: string | null;
  primary_image: string | null;
}

interface PaidResults {
  total: number;
  succeeded: number;
  failed: number;
}

const paidItems = ref<PaidCategoryItem[]>([]);
const paidLoading = ref(false);
const paidCategorizing = ref(false);
const paidApplying = ref(false);
const paidSelectedIds = ref<Set<number>>(new Set());
const paidBatchCategory = ref('');
const paidActiveDropdown = ref<number | null>(null);
const paidDropdownTyped = ref(false);
const paidResults = ref<PaidResults | null>(null);
const paidProgress = ref({ active: false, totalItems: 0, processedItems: 0, currentBatch: 0, totalBatches: 0, status: '' });
const paidPage = ref(1);
const paidPageSize = 100;
const paidTotal = ref(0);
const paidTotalPages = ref(1);
const paidSearch = ref('');
const paidSearchFocused = ref(false);
const paidAllDesigners = ref<string[]>([]);
// Cache AI suggestions keyed by model_id so they survive page navigation
const pendingAiSuggestions = ref(new Map<number, { suggested_category: string; confidence: string }>());
let paidSearchTimer: ReturnType<typeof setTimeout> | null = null;

const paidProgressPercent = computed(() => {
  if (paidProgress.value.totalBatches === 0) return 0;
  return Math.round((paidProgress.value.currentBatch / paidProgress.value.totalBatches) * 100);
});

// Items displayed = current page from server (already filtered)
const paidDisplayItems = computed(() => paidItems.value);

const paidDesignerSuggestions = computed(() => {
  const q = paidSearch.value.toLowerCase().trim();
  if (!q) return paidAllDesigners.value.slice(0, 20);
  return paidAllDesigners.value.filter(d => d.toLowerCase().includes(q)).slice(0, 20);
});

const paidChangedCount = computed(() =>
  paidItems.value.filter(i => paidSelectedIds.value.has(i.model_id) && i.selected_category.trim() && i.selected_category !== i.current_category).length
);

const isPaidAllSelected = computed(() =>
  paidDisplayItems.value.length > 0 && paidDisplayItems.value.every(i => paidSelectedIds.value.has(i.model_id))
);

const isPaidPartiallySelected = computed(() => {
  const onPage = paidDisplayItems.value.filter(i => paidSelectedIds.value.has(i.model_id)).length;
  return onPage > 0 && !isPaidAllSelected.value;
});

async function switchToPaid() {
  activeTab.value = 'paid';
  router.replace({ query: { ...route.query, tab: 'paid' } });
  if (paidTotal.value === 0 && !paidLoading.value) {
    await loadPaidItems(1, true);
  }
}

function switchToImport() {
  activeTab.value = 'import';
  const q = { ...route.query };
  delete q.tab;
  router.replace({ query: q });
}

async function loadPaidItems(page = 1, resetSearch = false) {
  if (resetSearch) {
    paidSearch.value = '';
    paidPage.value = 1;
  }
  paidLoading.value = true;
  try {
    const res = await ingestionApi.getPaidUncategorized(page, paidPageSize, paidSearch.value);
    const pending = pendingAiSuggestions.value;
    paidItems.value = res.data.items.map((item: any) => {
      const ai = pending.get(item.model_id);
      return {
        ...item,
        selected_category: ai?.suggested_category ?? item.current_category,
        suggested_category: ai?.suggested_category ?? null,
        confidence: (ai?.confidence ?? null) as 'high' | 'medium' | 'low' | null,
        debug_scores: [],
        primary_image: item.primary_image ?? null,
        model_filepath: item.model_filepath ?? '',
      };
    });
    paidTotal.value = res.data.total;
    paidTotalPages.value = res.data.totalPages;
    paidPage.value = res.data.page;
    paidAllDesigners.value = res.data.designers ?? [];
  } catch (e) {
    console.error('Failed to load paid uncategorized models:', e);
  } finally {
    paidLoading.value = false;
  }
}

async function categorizePaidWithAI() {
  if (!hasApiKey.value || paidCategorizing.value) return;
  paidCategorizing.value = true;
  paidProgress.value = { active: true, totalItems: 0, processedItems: 0, currentBatch: 0, totalBatches: 0, status: 'Starting...' };

  const poll = setInterval(async () => {
    try {
      const status = await ingestionApi.getCategorizePaidStatus();
      paidProgress.value = status.data;
    } catch { /* ignore */ }
  }, 1000);

  try {
    const res = await ingestionApi.categorizePaid();
    const aiItems = res.data.items as Array<{ model_id: number; suggested_category: string | null; confidence: string | null }>;
    const map = new Map(pendingAiSuggestions.value);
    for (const aiItem of aiItems) {
      if (aiItem.suggested_category) {
        map.set(aiItem.model_id, { suggested_category: aiItem.suggested_category, confidence: aiItem.confidence ?? 'low' });
        // Apply to current page immediately
        const row = paidItems.value.find(i => i.model_id === aiItem.model_id);
        if (row) {
          row.suggested_category = aiItem.suggested_category;
          row.confidence = aiItem.confidence as 'high' | 'medium' | 'low' | null;
          row.selected_category = aiItem.suggested_category;
        }
      }
    }
    pendingAiSuggestions.value = map;
  } catch (e) {
    console.error('AI categorization failed:', e);
  } finally {
    clearInterval(poll);
    paidCategorizing.value = false;
    paidProgress.value.active = false;
  }
}

async function applyPaidCategories() {
  const changed = paidItems.value.filter(
    i => paidSelectedIds.value.has(i.model_id) && i.selected_category.trim() && i.selected_category !== i.current_category
  );
  if (changed.length === 0) return;

  paidApplying.value = true;
  try {
    const res = await ingestionApi.applyPaidCategories(
      changed.map(i => ({ model_id: i.model_id, category: i.selected_category.trim() }))
    );
    const succeededIds = new Set(
      (res.data.results as Array<{ model_id: number; success: boolean }>).filter(r => r.success).map(r => r.model_id)
    );
    paidResults.value = { total: changed.length, succeeded: res.data.succeeded, failed: changed.length - res.data.succeeded };
    // Remove succeeded entries from the AI suggestions cache
    const map = new Map(pendingAiSuggestions.value);
    succeededIds.forEach(id => map.delete(id));
    pendingAiSuggestions.value = map;
    // Clear selection for succeeded items
    const s = new Set(paidSelectedIds.value);
    succeededIds.forEach(id => s.delete(id));
    paidSelectedIds.value = s;
    await store.loadCategories();
    // Reload current page from server
    await loadPaidItems(paidPage.value);
  } catch (e) {
    console.error('Failed to apply paid categories:', e);
  } finally {
    paidApplying.value = false;
  }
}

function togglePaidItem(modelId: number) {
  const s = new Set(paidSelectedIds.value);
  if (s.has(modelId)) s.delete(modelId);
  else s.add(modelId);
  paidSelectedIds.value = s;
}

function togglePaidSelectAll() {
  const s = new Set(paidSelectedIds.value);
  if (isPaidAllSelected.value) {
    paidDisplayItems.value.forEach(i => s.delete(i.model_id));
  } else {
    paidDisplayItems.value.forEach(i => s.add(i.model_id));
  }
  paidSelectedIds.value = s;
}

function applyPaidBatchCategory() {
  const cat = paidBatchCategory.value.trim();
  if (!cat || paidSelectedIds.value.size === 0) return;
  paidItems.value.forEach(item => {
    if (paidSelectedIds.value.has(item.model_id)) {
      item.selected_category = cat;
    }
  });
}

function getPaidCategoryOptions(item: PaidCategoryItem): string[] {
  const typed = item.selected_category.toLowerCase();
  const debugCats = item.debug_scores.map(d => d.category);
  const ordered: string[] = [];
  for (const cat of debugCats) {
    if (!ordered.includes(cat)) ordered.push(cat);
  }
  for (const cat of categories.value) {
    if (!ordered.includes(cat)) ordered.push(cat);
  }
  if (!ordered.includes('Uncategorized')) ordered.push('Uncategorized');
  if (!paidDropdownTyped.value || typed === '') return ordered;
  return ordered.filter(cat => cat.toLowerCase().includes(typed));
}

function getDebugScoreFromList(debugScores: ScoreDebugEntry[], cat: string): number | null {
  const entry = debugScores.find(d => d.category === cat);
  return entry?.score ?? null;
}

function onPaidSearchInput() {
  paidSearchFocused.value = true;
  if (paidSearchTimer) clearTimeout(paidSearchTimer);
  paidSearchTimer = setTimeout(() => { loadPaidItems(1); }, 300);
}

function onPaidSearchBlur() {
  setTimeout(() => { paidSearchFocused.value = false; }, 150);
}

function selectPaidDesigner(designer: string) {
  paidSearch.value = designer;
  paidSearchFocused.value = false;
  loadPaidItems(1);
}

function onPaidCategoryFocus(item: PaidCategoryItem) {
  paidActiveDropdown.value = item.model_id;
  paidDropdownTyped.value = false;
}

function onPaidCategoryInput(event: Event, item: PaidCategoryItem) {
  item.selected_category = (event.target as HTMLInputElement).value;
  paidDropdownTyped.value = true;
  if (!paidSelectedIds.value.has(item.model_id)) {
    const s = new Set(paidSelectedIds.value);
    s.add(item.model_id);
    paidSelectedIds.value = s;
  }
}

function onPaidCategoryBlur() {
  setTimeout(() => {
    paidActiveDropdown.value = null;
    paidDropdownTyped.value = false;
  }, 150);
}

function selectPaidCategory(item: PaidCategoryItem, cat: string) {
  item.selected_category = cat;
  paidActiveDropdown.value = null;
  paidDropdownTyped.value = false;
  if (!paidSelectedIds.value.has(item.model_id)) {
    const s = new Set(paidSelectedIds.value);
    s.add(item.model_id);
    paidSelectedIds.value = s;
  }
}

function getModelThumb(item: PaidCategoryItem): string | null {
  return item.primary_image ? `/api/models/file/serve?path=${encodeURIComponent(item.primary_image)}` : null;
}

// ── Main state ─────────────────────────────────────────────────────────────
const store = useAppStore();
const ingestionDir = ref('');
const hasApiKey = ref(false);
const batchCategory = ref('');
const editingPath = ref(false);
const editPathValue = ref('');
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
const importProgress = ref({
  active: false,
  totalItems: 0,
  processedItems: 0,
  currentItem: '',
  status: '',
  results: [] as Array<{ filepath: string; success: boolean; error?: string; model?: any }>,
  summary: { total: 0, succeeded: 0, failed: 0 }
});
const importProgressPercent = computed(() =>
  importProgress.value.totalItems === 0 ? 0
  : Math.round((importProgress.value.processedItems / importProgress.value.totalItems) * 100)
);
const lastResults = ref<ImportResults | null>(null);
const activeDebugPath = ref<string | null>(null);

function toggleDebug(item: IngestionItem) {
  activeDebugPath.value = activeDebugPath.value === item.filepath ? null : item.filepath;
}


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
  if (route.query.tab === 'paid') {
    activeTab.value = 'paid';
    await loadPaidItems();
  } else if (ingestionDir.value) {
    await scanFolder();
  }
});

async function loadConfig() {
  try {
    const response = await ingestionApi.getConfig();
    ingestionDir.value = response.data.directory || '';
    hasApiKey.value = response.data.hasApiKey || false;
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
      selectedCategory: item.suggestedCategory,
      debugScores: item.debugScores || [],
      suggestedTags: item.suggestedTags || [],
      selectedTags: [...(item.suggestedTags || [])]
    }));
    activeDebugPath.value = null;
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
        existing.debugScores = aiItem.debugScores || [];
        if (aiItem.suggestedTags) {
          existing.suggestedTags = aiItem.suggestedTags;
          existing.selectedTags = [...aiItem.suggestedTags];
        }
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

const activeDropdownPath = ref<string | null>(null);
const dropdownTyped = ref(false);

function getCategoryOptions(item: IngestionItem): string[] {
  const typed = item.selectedCategory.toLowerCase();
  const debugCats = item.debugScores.map(d => d.category);
  const allCats = [...categories.value];

  // Build ordered list: debug-scored first, then remaining, Uncategorized always present
  const ordered: string[] = [];
  for (const cat of debugCats) {
    if (!ordered.includes(cat)) ordered.push(cat);
  }
  for (const cat of allCats) {
    if (!ordered.includes(cat)) ordered.push(cat);
  }
  if (!ordered.includes('Uncategorized')) ordered.push('Uncategorized');

  // Filter by typed text only after user has started typing
  if (!dropdownTyped.value || typed === '') return ordered;
  return ordered.filter(cat => cat.toLowerCase().includes(typed));
}

function getDebugScore(item: IngestionItem, cat: string): number | null {
  const entry = item.debugScores.find(d => d.category === cat);
  return entry ? entry.score : null;
}

function onCategoryFocus(item: IngestionItem) {
  dropdownTyped.value = false;
  activeDropdownPath.value = item.filepath;
}

function onCategoryInput(item: IngestionItem, value: string) {
  item.selectedCategory = value;
  dropdownTyped.value = true;
  activeDropdownPath.value = item.filepath;
  if (value && !selectedIds.value.has(item.filepath)) {
    const newSet = new Set(selectedIds.value);
    newSet.add(item.filepath);
    selectedIds.value = newSet;
  }
}

function onCategoryBlur() {
  // Small delay so mousedown on option fires first
  setTimeout(() => {
    activeDropdownPath.value = null;
    dropdownTyped.value = false;
  }, 150);
}

function selectCategory(item: IngestionItem, cat: string) {
  item.selectedCategory = cat;
  activeDropdownPath.value = null;
  dropdownTyped.value = false;
  if (!selectedIds.value.has(item.filepath)) {
    const newSet = new Set(selectedIds.value);
    newSet.add(item.filepath);
    selectedIds.value = newSet;
  }
}

async function importSelected() {
  if (selectedIds.value.size === 0) return;

  importing.value = true;
  const selectedItems = items.value.filter(i => selectedIds.value.has(i.filepath));

  // Build filename lookup
  const filenameLookup = new Map<string, { filename: string; category: string }>();
  selectedItems.forEach(i => filenameLookup.set(i.filepath, { filename: i.filename, category: i.selectedCategory }));

  // Mark all selected items as importing
  selectedItems.forEach(i => importingPaths.value.add(i.filepath));

  importProgress.value = {
    active: true,
    totalItems: selectedItems.length,
    processedItems: 0,
    currentItem: '',
    status: `Starting import of ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}...`,
    results: [],
    summary: { total: selectedItems.length, succeeded: 0, failed: 0 }
  };

  try {
    const payload = selectedItems.map(i => ({
      filepath: i.filepath,
      category: i.selectedCategory,
      isFolder: i.isFolder,
      suggestedCategory: i.suggestedCategory,
      confidence: i.confidence,
      designer: i.designer,
      tags: i.selectedTags.length > 0 ? i.selectedTags : undefined
    }));

    // Kick off the import (returns 202 immediately)
    await ingestionApi.importItems(payload);

    // Poll until the background job completes
    await new Promise<void>((resolve) => {
      const poll = setInterval(async () => {
        try {
          const status = await ingestionApi.getImportStatus();
          importProgress.value = status.data;
          if (!status.data.active) {
            clearInterval(poll);
            resolve();
          }
        } catch { /* ignore transient poll errors */ }
      }, 1000);
    });

    const details: ImportDetail[] = importProgress.value.results.map((r: any) => {
      const info = filenameLookup.get(r.filepath);
      return {
        filename: info?.filename || path_basename(r.filepath),
        success: r.success,
        error: r.error,
        category: info?.category
      };
    });
    lastResults.value = { ...importProgress.value.summary, details };

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

function onImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.style.display = 'none';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
</script>

<style scoped>
/* ── Tab Bar ───────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.tab-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 10px;
  background: var(--accent-primary);
  color: var(--bg-deepest);
}

/* ── Paid Models Tab ─────────────────────────────────────────────────────── */
.paid-tab {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

/* Toolbar */
.paid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  position: sticky;
  top: 0;
  z-index: 20;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.paid-toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.paid-toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.paid-select-all-wrap {
  cursor: pointer;
  display: flex;
  align-items: center;
}

.paid-select-all-check {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.paid-selection-count {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.paid-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0.375rem 0.625rem;
  min-width: 220px;
  transition: border-color 0.15s ease;
}

.paid-search-wrap.focused {
  border-color: var(--accent-primary);
}

.paid-search-icon {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.paid-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none !important;
  box-shadow: none !important;
  color: var(--text-primary);
  font-size: 0.85rem;
  min-width: 0;
  -webkit-appearance: none;
}

.paid-search-input::placeholder {
  color: var(--text-tertiary);
}

.paid-search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  padding: 0;
  display: flex;
  align-items: center;
  transition: color var(--transition-base);
}

.paid-search-clear:hover { color: var(--text-primary); }
.paid-search-clear svg { width: 14px; height: 14px; }

.paid-search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  max-height: 320px;
  overflow-y: auto;
}

.paid-search-dropdown-label {
  padding: 0.375rem 0.625rem 0.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-tertiary);
}

.paid-search-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.625rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 0.82rem;
  transition: background var(--transition-base);
}

.paid-search-option:hover { background: var(--bg-hover); }

.paid-search-option-icon {
  width: 13px;
  height: 13px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.paid-batch-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.paid-batch-input {
  width: 160px;
  padding: 0.4rem 0.625rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
  transition: border-color var(--transition-base);
}
.paid-batch-input:focus { border-color: var(--accent-primary); }

.btn-ai-suggest {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.875rem;
  background: rgba(139, 92, 246, 0.12);
  color: rgb(167, 139, 250);
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}
.btn-ai-suggest svg { width: 15px; height: 15px; }
.btn-ai-suggest:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.22);
  border-color: rgba(139, 92, 246, 0.45);
}
.btn-ai-suggest:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-apply-paid {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}
.btn-apply-paid svg { width: 15px; height: 15px; }
.btn-apply-paid:hover:not(:disabled) { background: var(--accent-secondary); transform: translateY(-1px); }
.btn-apply-paid:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

/* Notice */
.paid-notice {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 1rem;
  background: rgba(251, 191, 36, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: var(--radius-md);
  color: var(--warning);
  font-size: 0.8rem;
}
.paid-notice svg { width: 15px; height: 15px; flex-shrink: 0; }

/* AI Progress */
.paid-ai-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.25rem;
}
.paid-ai-bar {
  flex: 1;
  height: 3px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
}
.paid-ai-fill {
  height: 100%;
  background: rgb(139, 92, 246);
  transition: width 0.4s ease;
  border-radius: 2px;
}
.paid-ai-label {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* Results banner */
.paid-results-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  animation: slideIn 0.3s ease-out;
}
.paid-results-banner svg { width: 18px; height: 18px; flex-shrink: 0; }
.paid-results-banner.success { background: var(--success-dim); border: 1px solid rgba(34,197,94,0.3); color: var(--success); }
.paid-results-banner.error { background: var(--danger-dim); border: 1px solid rgba(239,68,68,0.3); color: var(--danger); }
.paid-results-dismiss {
  margin-left: auto;
  padding: 0.25rem 0.625rem;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity var(--transition-base);
}
.paid-results-dismiss:hover { opacity: 1; }

/* Table */
.paid-table {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: visible;
}

.paid-table-header {
  display: grid;
  grid-template-columns: 32px 44px 1fr 200px 32px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-default);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

.paid-row {
  display: grid;
  grid-template-columns: 32px 44px 1fr 200px 32px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition-base);
}

.paid-row:last-child { border-bottom: none; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
.paid-row:hover { background: var(--bg-elevated); }
.paid-row.selected { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
.paid-row.changed { border-left: 2px solid var(--accent-primary); padding-left: calc(1rem - 2px); }

.ptcol-check {
  display: flex;
  align-items: center;
  justify-content: center;
}

.paid-row-check {
  width: 15px;
  height: 15px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.ptcol-thumb { }

.paid-thumb {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-elevated);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.paid-thumb img { width: 100%; height: 100%; object-fit: cover; }
.paid-thumb-placeholder { color: var(--text-tertiary); }
.paid-thumb-placeholder svg { width: 18px; height: 18px; }

.ptcol-name {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}
.paid-model-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.paid-designer {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ptcol-current {
  display: flex;
  align-items: center;
}
.paid-current-badge {
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.2rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.ptcol-assign {
  display: flex;
  align-items: center;
}
.paid-cat-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
}
.paid-cat-input {
  flex: 1;
  padding: 0.4rem 0.625rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
  min-width: 0;
}
.paid-cat-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-dim);
}
.paid-cat-input.changed {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-elevated));
}
.paid-cat-dropdown {
  position: absolute;
  top: calc(100% + 3px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.paid-cat-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.625rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 0.8rem;
  transition: background var(--transition-base);
  width: 100%;
}
.paid-cat-option:hover, .paid-cat-option.active { background: var(--bg-hover); }
.paid-cat-option-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paid-cat-score { font-size: 0.7rem; color: var(--text-tertiary); font-family: var(--font-mono); flex-shrink: 0; }
.paid-cat-empty { padding: 0.5rem 0.625rem; color: var(--text-tertiary); font-size: 0.78rem; font-style: italic; }

.ptcol-finder { display: flex; align-items: center; justify-content: center; }

.paid-finder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}
.paid-finder-btn svg { width: 14px; height: 14px; }
.paid-finder-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-default);
  background: var(--bg-hover);
}

/* Pagination */
.paid-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
}

.pgbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-base);
}
.pgbtn svg { width: 16px; height: 16px; }
.pgbtn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
.pgbtn:disabled { opacity: 0.35; cursor: not-allowed; }

.pginfo {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

/* legacy stubs kept for import tab */
.dropdown-wrap {
  position: relative;
  flex: 1;
}

.category-input.changed {
  border-color: var(--accent-primary);
}

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
  transition: width 0.4s ease;
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

.item-thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-elevated);
  flex-shrink: 0;
  position: relative;
}

.item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.thumb-spinner svg {
  width: 24px;
  height: 24px;
  color: var(--accent-primary);
  animation: spin 1s linear infinite;
}

.item-icon-mini {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-icon-mini svg.spinner {
  width: 24px;
  height: 24px;
  color: var(--accent-primary);
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

/* Score debug button */
.debug-btn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-base);
  padding: 0;
}
.debug-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.debug-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--bg-deepest);
}

/* Score debug panel */
.debug-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0.875rem 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
}
.debug-panel-title {
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.625rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.debug-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0;
}
.debug-cat {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-weight: 500;
}
.debug-source {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}
.debug-source[data-source="exact"] { background: rgba(34,197,94,0.15); color: var(--success); }
.debug-source[data-source="name"]  { background: rgba(59,130,246,0.15); color: #60a5fa; }
.debug-source[data-source="files"] { background: rgba(139,92,246,0.15); color: #a78bfa; }
.debug-source[data-source="hint"]  { background: rgba(251,146,60,0.15); color: #fb923c; }
.debug-source[data-source="tags"]  { background: rgba(20,184,166,0.15); color: #2dd4bf; }
.debug-source[data-source="text"]  { background: rgba(148,163,184,0.15); color: var(--text-secondary); }
.debug-bar-wrap {
  width: 80px;
  height: 5px;
  background: var(--bg-hover);
  border-radius: 3px;
  flex-shrink: 0;
  overflow: hidden;
}
.debug-bar {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
  min-width: 2px;
}
.debug-pct {
  width: 3rem;
  text-align: right;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  flex-shrink: 0;
}
.debug-empty {
  color: var(--text-tertiary);
  font-style: italic;
  font-size: 0.8rem;
}

/* Tags row on import items */
.item-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-top: 1px solid var(--border-subtle);
  font-size: 0.78rem;
}

.item-tags-label {
  color: var(--text-tertiary);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.ingestion-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.4rem;
  background: var(--accent-primary-dim);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  font-size: 0.75rem;
}

.ingestion-tag-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 0.9rem;
  line-height: 1;
  opacity: 0.6;
}

.ingestion-tag-remove:hover {
  opacity: 1;
}

.ingestion-tag-input {
  background: transparent;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  width: 80px;
}

.ingestion-tag-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

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

.category-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.category-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: background var(--transition-base);
  width: 100%;
}

.category-option:hover,
.category-option.current {
  background: var(--bg-hover);
}

.cat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-score {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.category-option-empty {
  padding: 0.5rem 0.75rem;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  font-style: italic;
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
