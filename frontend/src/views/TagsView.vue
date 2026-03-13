<template>
  <div class="tags-view">
    <div class="view-header">
      <h1>Tags</h1>
    </div>

    <!-- Tab Bar -->
    <div class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'all' }]" @click="setTab('all')">All Tags</button>
      <button :class="['tab-btn', { active: activeTab === 'autofix' }]" @click="setTab('autofix')">Auto-Fix
        <span v-if="autoFixLoaded && autoFixGroups.length > 0" class="tab-badge">{{ autoFixGroups.length }}</span>
      </button>
      <button :class="['tab-btn', { active: activeTab === 'consolidate' }]" @click="setTab('consolidate')">Consolidate</button>
      <button :class="['tab-btn', { active: activeTab === 'autotag' }]" @click="setTab('autotag')">Auto-Tag</button>
    </div>

    <!-- ── All Tags Tab ── -->
    <div v-if="activeTab === 'all'" class="tab-content">
      <div class="toolbar">
        <input v-model="search" class="search-input" placeholder="Filter tags..." />
        <div class="toolbar-actions">
          <button class="action-btn secondary" @click="cleanupConfirm('unused')" :disabled="loading">Remove unused tags</button>
          <button class="action-btn secondary" @click="cleanupConfirm('low-pdf')" :disabled="loading">Remove low-use PDF tags</button>
        </div>
      </div>

      <div v-if="loading" class="empty-state">Loading...</div>

      <table v-else class="tags-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Count</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tag in filteredTags" :key="tag.id">
            <td>
              <button class="tag-link" @click="browseByTag(tag.name)">#{{ tag.name }}</button>
            </td>
            <td class="count-cell">{{ tag.model_count ?? 0 }}</td>
            <td><span class="source-badge" :data-source="tag.source">{{ tag.source ?? 'pdf' }}</span></td>
            <td class="actions-cell">
              <button class="icon-btn danger" @click="deleteTag(tag)" title="Delete tag">✕</button>
            </td>
          </tr>
          <tr v-if="filteredTags.length === 0">
            <td colspan="4" class="empty-row">No tags found</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Consolidate Tab ── -->
    <div v-if="activeTab === 'consolidate'" class="tab-content">
      <div class="toolbar">
        <label class="threshold-label">
          Similarity: <strong>{{ threshold }}%</strong>
          <input type="range" min="50" max="100" v-model.number="threshold" @change="loadSimilar" class="threshold-slider" />
        </label>
        <span class="pair-count">{{ visiblePairs.length }} pair{{ visiblePairs.length !== 1 ? 's' : '' }}</span>
        <div class="toolbar-actions">
          <button v-if="selectedMerges.size > 0" class="action-btn primary small" @click="applySelected" :disabled="applyingBatch">
            {{ applyingBatch ? 'Applying...' : `Apply ${selectedMerges.size} selected` }}
          </button>
          <button v-if="isStale" class="action-btn secondary small" @click="loadSimilar" :disabled="similarLoading">
            ↺ Refresh
          </button>
          <button v-if="dismissedCount > 0" class="action-btn secondary small" @click="restoreDismissed">
            Restore {{ dismissedCount }} skipped
          </button>
          <button v-if="hasApiKey" class="action-btn primary small" @click="runAiConsolidate" :disabled="aiConsolidateLoading || visiblePairs.length === 0">
            {{ aiConsolidateLoading ? 'Analyzing...' : '✦ AI Analysis' }}
          </button>
        </div>
      </div>

      <div v-if="similarLoading" class="empty-state">Finding similar tags...</div>
      <div v-else-if="visiblePairs.length === 0 && !similarLoading" class="empty-state">
        No similar tags found at this threshold{{ dismissedCount > 0 ? ' (some pairs were skipped)' : '' }}.
      </div>

      <div v-else class="similar-list">
        <div
          v-for="(pair, idx) in visiblePairs"
          :key="pair.tag1.id + '-' + pair.tag2.id"
          class="similar-pair"
          :class="{ 'ai-merge': getAiRec(pair)?.action !== 'separate' && getAiRec(pair), 'ai-separate': getAiRec(pair)?.action === 'separate' }"
        >
          <!-- AI recommendation badge -->
          <div v-if="getAiRec(pair)" class="ai-rec-banner" :data-action="getAiRec(pair)!.action">
            <span v-if="getAiRec(pair)!.action === 'separate'">✦ AI: Keep separate — {{ getAiRec(pair)!.reason }}</span>
            <span v-else>✦ AI: Recommend merging — {{ getAiRec(pair)!.reason }}</span>
          </div>

          <div class="pair-body">
            <!-- Tag 1 -->
            <div class="pair-tag-block">
              <span class="pair-tag-name">#{{ pair.tag1.name }}</span>
              <span class="pair-tag-meta">{{ pair.tag1.model_count ?? 0 }} models</span>
              <button class="pair-delete-btn" @click="deletePairTag(pair.tag1, pair)" title="Delete this tag">Delete</button>
            </div>

            <!-- Similarity + merge buttons -->
            <div class="pair-center">
              <span class="pair-sim">{{ pair.similarity }}%</span>
              <div class="pair-merge-btns">
                <button
                  class="merge-btn"
                  :class="{ recommended: getAiRec(pair)?.action === 'merge-keep-2' }"
                  :disabled="merging || applyingBatch"
                  @click="merge(pair.tag1, pair.tag2)"
                  :title="`Delete #${pair.tag1.name}, keep #${pair.tag2.name}`"
                >← keep #{{ pair.tag2.name }}</button>
                <button
                  class="merge-btn"
                  :class="{ recommended: getAiRec(pair)?.action === 'merge-keep-1' }"
                  :disabled="merging || applyingBatch"
                  @click="merge(pair.tag2, pair.tag1)"
                  :title="`Delete #${pair.tag2.name}, keep #${pair.tag1.name}`"
                >keep #{{ pair.tag1.name }} →</button>
              </div>
              <div class="pair-extra-btns">
                <button class="delete-both-btn" :disabled="merging || applyingBatch" @click="deleteBothPairTags(pair)" title="Delete both tags">Delete both</button>
                <div class="batch-queue-btns" :class="{ 'has-selection': selectedMerges.has(pairKey(pair)) }">
                  <button
                    class="queue-btn"
                    :class="{ active: selectedMerges.has(pairKey(pair)) && selectedMerges.get(pairKey(pair))?.sourceId === pair.tag1.id }"
                    @click="togglePairSelect(pair, pair.tag1.id, pair.tag2.id)"
                    :title="`Queue: delete #${pair.tag1.name}, keep #${pair.tag2.name}`"
                  >← batch</button>
                  <button
                    class="queue-btn"
                    :class="{ active: selectedMerges.has(pairKey(pair)) && selectedMerges.get(pairKey(pair))?.sourceId === pair.tag2.id }"
                    @click="togglePairSelect(pair, pair.tag2.id, pair.tag1.id)"
                    :title="`Queue: delete #${pair.tag2.name}, keep #${pair.tag1.name}`"
                  >batch →</button>
                </div>
              </div>
            </div>

            <!-- Tag 2 -->
            <div class="pair-tag-block right">
              <span class="pair-tag-name">#{{ pair.tag2.name }}</span>
              <span class="pair-tag-meta">{{ pair.tag2.model_count ?? 0 }} models</span>
              <button class="pair-delete-btn" @click="deletePairTag(pair.tag2, pair)" title="Delete this tag">Delete</button>
            </div>

            <!-- Dismiss -->
            <button class="dismiss-btn" @click="dismissPair(pair)" title="Skip this pair">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Auto-Tag Tab ── -->
    <div v-if="activeTab === 'autotag'" class="tab-content">
      <div class="autotag-form">
        <label class="form-row">
          <span>Only tag models with fewer than</span>
          <input type="number" v-model.number="minTagCount" min="0" max="20" class="num-input" />
          <span>tags</span>
        </label>
        <label v-if="hasApiKey" class="form-row checkbox-row">
          <input type="checkbox" v-model="useAi" />
          <span>Use AI (Claude) for better suggestions</span>
        </label>
        <div class="autotag-actions">
          <button class="action-btn secondary" @click="runAutotag(true)" :disabled="autotagLoading">Preview</button>
          <button class="action-btn primary" @click="runAutotag(false)" :disabled="autotagLoading || !previewDone">Apply</button>
        </div>
      </div>

      <div v-if="autotagLoading" class="empty-state">{{ useAi ? 'Running AI tagging (this may take a moment)...' : 'Analyzing models...' }}</div>

      <div v-else-if="autotagResults.length > 0" class="autotag-results">
        <div class="autotag-summary">
          {{ autotagStats.tagged }} of {{ autotagStats.processed }} models would receive tags
          <span v-if="!previewDone"> (applied)</span>
        </div>
        <table class="autotag-table">
          <thead>
            <tr><th>Model</th><th>Tags {{ previewDone ? 'to add' : 'added' }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in autotagResults.filter(r => r.tagsAdded.length > 0)" :key="r.modelId">
              <td class="model-name-cell">{{ r.modelName }}</td>
              <td>
                <span v-for="tag in r.tagsAdded" :key="tag" class="autotag-chip">#{{ tag }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="autotagRan" class="empty-state">No tag suggestions found for models with fewer than {{ minTagCount }} tags.</div>
    </div>

    <!-- ── Auto-Fix Tab ── -->
    <div v-if="activeTab === 'autofix'" class="tab-content">
      <!-- Toolbar -->
      <div class="toolbar autofix-toolbar">
        <div class="autofix-header-text">
          <span v-if="!autoFixLoaded">Automatically consolidate tags that differ only by separators, leading dashes, pluralization, or spelling.</span>
          <span v-else-if="autoFixGroups.length === 0" class="text-muted">No auto-fix suggestions remaining.</span>
          <span v-else class="text-muted">{{ autoFixGroups.length }} group{{ autoFixGroups.length !== 1 ? 's' : '' }} found — review and apply below.</span>
        </div>
        <div class="toolbar-actions">
          <template v-if="autoFixLoaded && autoFixVisible.length > 0">
            <span class="pair-count">{{ autoFixVisibleChecked.length }}/{{ autoFixVisible.length }} selected</span>
            <button class="action-btn secondary small" @click="selectAllAutoFix(true)">All</button>
            <button class="action-btn secondary small" @click="selectAllAutoFix(false)">None</button>
            <button class="action-btn primary small" @click="applyAutoFix" :disabled="autoFixApplying || autoFixVisibleChecked.length === 0">
              {{ autoFixApplying ? 'Applying...' : `Apply ${autoFixVisibleChecked.length}` }}
            </button>
          </template>
          <button class="action-btn secondary small" @click="loadAutoFix" :disabled="autoFixLoading">
            {{ autoFixLoading ? 'Loading...' : autoFixLoaded ? '↺ Reload' : 'Load suggestions' }}
          </button>
        </div>
      </div>

      <!-- Reason filter pills -->
      <div v-if="autoFixLoaded && autoFixGroups.length > 0" class="autofix-filters">
        <span class="filter-label">Filter:</span>
        <button
          v-for="reason in (['leading-dash', 'separator', 'plural', 'spelling'] as const)"
          :key="reason"
          class="reason-filter-btn"
          :class="{ active: autoFixReasonFilters.has(reason) }"
          @click="toggleAutoFixReason(reason)"
        >
          {{ reasonLabel(reason) }}
          <span class="filter-count">{{ autoFixReasonCounts[reason] }}</span>
        </button>
      </div>

      <div v-if="autoFixLoading" class="empty-state">Analyzing {{ autoFixGroups.length || '' }} tag groups...</div>
      <div v-else-if="!autoFixLoaded" class="empty-state autofix-intro">
        Click <strong>Load suggestions</strong> to find tags that can be automatically consolidated.
      </div>
      <div v-else-if="autoFixVisible.length === 0" class="empty-state">
        {{ autoFixGroups.length > 0 ? 'No groups match the active filters.' : 'No auto-fix suggestions — tags look clean!' }}
      </div>

      <table v-else class="autofix-table">
        <thead>
          <tr>
            <th class="af-cb-col">
              <input
                type="checkbox"
                :checked="autoFixVisibleChecked.length === autoFixVisible.length"
                @change="selectAllAutoFix(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th>Keep</th>
            <th>Remove</th>
            <th>Reason</th>
            <th class="af-models-col">Models</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="group in autoFixVisible"
            :key="group.winner.id"
            :class="{ 'af-unchecked': !autoFixIsChecked(group) }"
            @click.stop="toggleAutoFixGroup(group)"
            style="cursor: pointer;"
          >
            <td class="af-cb-col" @click.stop="toggleAutoFixGroup(group)">
              <input type="checkbox" :checked="autoFixIsChecked(group)" @change.stop="toggleAutoFixGroup(group)" />
            </td>
            <td class="af-winner-cell">
              <span class="af-tag-chip af-winner">#{{ group.winner.name }}</span>
              <span class="af-tag-count">{{ group.winner.model_count ?? 0 }} models</span>
            </td>
            <td class="af-losers-cell">
              <div class="af-losers-inner">
                <span v-for="loser in group.losers" :key="loser.id" class="af-tag-chip af-loser">
                  #{{ loser.name }}<span class="af-tag-count">{{ loser.model_count ?? 0 }} models</span>
                </span>
              </div>
            </td>
            <td class="af-reasons-cell">
              <div class="af-reasons-inner">
                <span v-for="r in group.reasons" :key="r" class="af-reason-badge" :data-reason="r">{{ reasonLabel(r) }}</span>
              </div>
            </td>
            <td class="af-models-col">{{ group.totalModels }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Confirm dialog -->
    <div v-if="confirmAction" class="confirm-overlay" @click.self="confirmAction = null">
      <div class="confirm-dialog">
        <p>{{ confirmMessage }}</p>
        <div class="confirm-actions">
          <button class="action-btn danger" @click="executeCleanup">Delete</button>
          <button class="action-btn secondary" @click="confirmAction = null">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { tagsApi, type Tag, type TagSimilarPair, type AutoConsolidateGroup, type AutoConsolidateReason } from '../services/api';

const router = useRouter();
const route = useRoute();

const VALID_TABS = ['all', 'consolidate', 'autotag', 'autofix'] as const;
type Tab = typeof VALID_TABS[number];

function tabFromQuery(): Tab {
  const t = route.query.tab as string;
  return (VALID_TABS.includes(t as Tab) ? t : 'all') as Tab;
}

const activeTab = ref<Tab>(tabFromQuery());
const tags = ref<Tag[]>([]);
const loading = ref(false);
const search = ref('');

const similarPairs = ref<TagSimilarPair[]>([]);
const similarLoading = ref(false);
const threshold = ref(80);
const merging = ref(false);
const isStale = ref(false);
const dismissedPairKeys = ref<Set<string>>(new Set());
const aiRecommendations = ref<Map<string, { action: string; reason: string }>>(new Map());
const aiConsolidateLoading = ref(false);
const selectedMerges = ref<Map<string, { sourceId: number; targetId: number }>>(new Map());
const applyingBatch = ref(false);

function pairKey(pair: TagSimilarPair) {
  return `${Math.min(pair.tag1.id, pair.tag2.id)}-${Math.max(pair.tag1.id, pair.tag2.id)}`;
}

const visiblePairs = computed(() =>
  similarPairs.value.filter(p => !dismissedPairKeys.value.has(pairKey(p)))
);

const dismissedCount = computed(() => similarPairs.value.length - visiblePairs.value.length);

function getAiRec(pair: TagSimilarPair) {
  return aiRecommendations.value.get(pairKey(pair)) ?? null;
}

function dismissPair(pair: TagSimilarPair) {
  dismissedPairKeys.value = new Set([...dismissedPairKeys.value, pairKey(pair)]);
}

function restoreDismissed() {
  dismissedPairKeys.value = new Set();
}

const minTagCount = ref(2);
const useAi = ref(false);
const autotagLoading = ref(false);
const autotagResults = ref<Array<{ modelId: number; modelName: string; tagsAdded: string[] }>>([]);
const autotagStats = ref({ processed: 0, tagged: 0 });
const previewDone = ref(false);
const autotagRan = ref(false);

const confirmAction = ref<null | 'unused' | 'low-pdf'>(null);
const confirmMessage = ref('');
const confirmCount = ref(0);

const hasApiKey = ref(false);

const filteredTags = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter(t =>
    t.name.includes(q) || (t.source ?? 'pdf').includes(q)
  );
});

async function loadTags() {
  loading.value = true;
  try {
    const res = await tagsApi.getAll();
    tags.value = res.data;
  } finally {
    loading.value = false;
  }
}

async function loadSimilar() {
  similarLoading.value = true;
  // Full reload resets stale state and session state
  aiRecommendations.value = new Map();
  dismissedPairKeys.value = new Set();
  selectedMerges.value = new Map();
  isStale.value = false;
  try {
    const res = await tagsApi.getSimilar(threshold.value);
    similarPairs.value = res.data;
  } finally {
    similarLoading.value = false;
  }
}

function removePairTagLocally(sourceId: number, targetId: number, addedCount: number) {
  // Remove all pairs containing source (it's deleted)
  // Update target model_count in remaining pairs
  similarPairs.value = similarPairs.value
    .filter(p => p.tag1.id !== sourceId && p.tag2.id !== sourceId)
    .map(p => {
      if (p.tag1.id === targetId) return { ...p, tag1: { ...p.tag1, model_count: (p.tag1.model_count ?? 0) + addedCount } };
      if (p.tag2.id === targetId) return { ...p, tag2: { ...p.tag2, model_count: (p.tag2.model_count ?? 0) + addedCount } };
      return p;
    });
  isStale.value = true;
}

async function runAiConsolidate() {
  if (visiblePairs.value.length === 0) return;
  aiConsolidateLoading.value = true;
  try {
    const res = await tagsApi.aiConsolidate(visiblePairs.value);
    const recs = res.data.recommendations as Array<{ action: string; reason: string }>;
    const newMap = new Map(aiRecommendations.value);
    visiblePairs.value.forEach((pair, i) => {
      if (recs[i]) newMap.set(pairKey(pair), recs[i]);
    });
    aiRecommendations.value = newMap;
  } finally {
    aiConsolidateLoading.value = false;
  }
}

async function deleteTag(tag: Tag) {
  if (!confirm(`Delete tag "#${tag.name}"? This will remove it from all models.`)) return;
  await tagsApi.delete(tag.id);
  tags.value = tags.value.filter(t => t.id !== tag.id);
}

async function deletePairTag(tag: Tag, pair: TagSimilarPair) {
  await tagsApi.delete(tag.id);
  // Remove all pairs involving this tag
  similarPairs.value = similarPairs.value.filter(
    p => p.tag1.id !== tag.id && p.tag2.id !== tag.id
  );
  tags.value = tags.value.filter(t => t.id !== tag.id);
}

function browseByTag(name: string) {
  router.push({ path: '/', query: { tags: name } });
}

async function merge(source: Tag, target: Tag) {
  merging.value = true;
  try {
    await tagsApi.merge([source.id], target.id);
    removePairTagLocally(source.id, target.id, source.model_count ?? 0);
    // Also remove from selectedMerges if it was selected
    const minId = Math.min(source.id, target.id);
    const maxId = Math.max(source.id, target.id);
    selectedMerges.value.delete(`${minId}-${maxId}`);
  } finally {
    merging.value = false;
  }
}

async function deleteBothPairTags(pair: TagSimilarPair) {
  merging.value = true;
  try {
    await Promise.all([tagsApi.delete(pair.tag1.id), tagsApi.delete(pair.tag2.id)]);
    // Remove all pairs involving either tag
    similarPairs.value = similarPairs.value.filter(
      p => p.tag1.id !== pair.tag1.id && p.tag2.id !== pair.tag1.id &&
           p.tag1.id !== pair.tag2.id && p.tag2.id !== pair.tag2.id
    );
    tags.value = tags.value.filter(t => t.id !== pair.tag1.id && t.id !== pair.tag2.id);
    isStale.value = true;
  } finally {
    merging.value = false;
  }
}

function togglePairSelect(pair: TagSimilarPair, sourceId: number, targetId: number) {
  const key = pairKey(pair);
  const existing = selectedMerges.value.get(key);
  if (existing && existing.sourceId === sourceId) {
    // Same direction clicked again — deselect
    selectedMerges.value.delete(key);
  } else {
    // New selection or direction change
    selectedMerges.value.set(key, { sourceId, targetId });
  }
  selectedMerges.value = new Map(selectedMerges.value);
}

async function applySelected() {
  if (selectedMerges.value.size === 0) return;
  applyingBatch.value = true;
  try {
    const merges = Array.from(selectedMerges.value.values());
    await tagsApi.mergeBatch(merges);
    // Remove all pairs for merged source tags
    const removedSourceIds = new Set(merges.map(m => m.sourceId));
    similarPairs.value = similarPairs.value.filter(
      p => !removedSourceIds.has(p.tag1.id) && !removedSourceIds.has(p.tag2.id)
    );
    selectedMerges.value = new Map();
    // Full reload to get accurate model counts after batch
    await loadSimilar();
  } finally {
    applyingBatch.value = false;
  }
}

async function cleanupConfirm(type: 'unused' | 'low-pdf') {
  const opts = type === 'unused'
    ? { maxCount: 0 }
    : { maxCount: 1, source: ['pdf'] };
  const res = await tagsApi.cleanup({ ...opts, dryRun: true });
  confirmCount.value = res.data.wouldDelete;
  confirmMessage.value = type === 'unused'
    ? `Delete ${confirmCount.value} unused tags (0 models)?`
    : `Delete ${confirmCount.value} PDF tags used by 1 or fewer models?`;
  confirmAction.value = type;
}

async function executeCleanup() {
  if (!confirmAction.value) return;
  const opts = confirmAction.value === 'unused'
    ? { maxCount: 0 }
    : { maxCount: 1, source: ['pdf'] };
  await tagsApi.cleanup(opts);
  confirmAction.value = null;
  await loadTags();
}

async function runAutotag(dryRun: boolean) {
  autotagLoading.value = true;
  autotagRan.value = false;
  autotagResults.value = [];
  try {
    const res = await tagsApi.autotag({ minTagCount: minTagCount.value, useAi: useAi.value, dryRun });
    autotagResults.value = res.data.results;
    autotagStats.value = { processed: res.data.processed, tagged: res.data.tagged };
    previewDone.value = dryRun;
    autotagRan.value = true;
    if (!dryRun) await loadTags();
  } finally {
    autotagLoading.value = false;
  }
}

async function checkApiKey() {
  try {
    const { systemApi } = await import('../services/api');
    const res = await systemApi.getConfig();
    hasApiKey.value = !!res.data.anthropic_api_key;
  } catch { /* ignore */ }
}

function setTab(tab: Tab) {
  router.replace({ query: { ...route.query, tab: tab === 'all' ? undefined : tab } });
}

// Sync activeTab when URL changes (e.g. back/forward navigation)
watch(() => route.query.tab, () => {
  const t = tabFromQuery();
  if (t !== activeTab.value) {
    activeTab.value = t;
    if (t === 'consolidate') loadSimilar();
    if (t === 'autofix' && !autoFixLoaded.value) loadAutoFix();
  }
});

onMounted(() => {
  loadTags();
  checkApiKey();
  if (activeTab.value === 'consolidate') loadSimilar();
  if (activeTab.value === 'autofix') loadAutoFix();
});

// ── Auto-Fix state ────────────────────────────────────────────────────────────

const autoFixGroups = ref<AutoConsolidateGroup[]>([]);
const autoFixLoading = ref(false);
const autoFixLoaded = ref(false);
const autoFixApplying = ref(false);
const autoFixReasonFilters = ref<Set<AutoConsolidateReason>>(
  new Set(['leading-dash', 'separator', 'plural', 'spelling'])
);
// Map from group index → true/false (undefined = checked by default)
const autoFixChecked = ref<Map<number, boolean>>(new Map());

const autoFixReasonCounts = computed(() => {
  const counts: Record<AutoConsolidateReason, number> = {
    'leading-dash': 0, 'separator': 0, 'plural': 0, 'spelling': 0,
  };
  for (const g of autoFixGroups.value) {
    for (const r of g.reasons) counts[r]++;
  }
  return counts;
});

const autoFixVisible = computed(() =>
  autoFixGroups.value.filter(g =>
    g.reasons.some(r => autoFixReasonFilters.value.has(r))
  )
);

const autoFixVisibleChecked = computed(() =>
  autoFixVisible.value.filter(g => {
    const idx = autoFixGroups.value.indexOf(g);
    return autoFixChecked.value.get(idx) !== false;
  })
);

function autoFixIsChecked(group: AutoConsolidateGroup): boolean {
  return autoFixChecked.value.get(autoFixGroups.value.indexOf(group)) !== false;
}

function toggleAutoFixGroup(group: AutoConsolidateGroup) {
  const idx = autoFixGroups.value.indexOf(group);
  const map = new Map(autoFixChecked.value);
  map.set(idx, !autoFixIsChecked(group));
  autoFixChecked.value = map;
}

function selectAllAutoFix(checked: boolean) {
  const map = new Map<number, boolean>();
  autoFixGroups.value.forEach((_, i) => map.set(i, checked));
  autoFixChecked.value = map;
}

function toggleAutoFixReason(reason: AutoConsolidateReason) {
  const next = new Set(autoFixReasonFilters.value);
  if (next.has(reason)) next.delete(reason); else next.add(reason);
  autoFixReasonFilters.value = next;
}

function reasonLabel(r: AutoConsolidateReason): string {
  return ({ 'leading-dash': 'Leading dash', separator: 'Separator', plural: 'Plural', spelling: 'Spelling' })[r];
}

async function loadAutoFix() {
  autoFixLoading.value = true;
  try {
    const res = await tagsApi.getAutoConsolidateSuggestions();
    autoFixGroups.value = res.data.groups;
    autoFixChecked.value = new Map(); // all default to checked
    autoFixLoaded.value = true;
  } finally {
    autoFixLoading.value = false;
  }
}

async function applyAutoFix() {
  const toMerge = autoFixVisibleChecked.value;
  if (toMerge.length === 0) return;
  const merges: Array<{ sourceId: number; targetId: number }> = [];
  for (const group of toMerge) {
    for (const loser of group.losers) {
      merges.push({ sourceId: loser.id, targetId: group.winner.id });
    }
  }
  autoFixApplying.value = true;
  try {
    await tagsApi.mergeBatch(merges);
    // Remove applied groups from state
    const appliedWinnerIds = new Set(toMerge.map(g => g.winner.id));
    autoFixGroups.value = autoFixGroups.value.filter(g => !appliedWinnerIds.has(g.winner.id));
    autoFixChecked.value = new Map();
    isStale.value = true; // mark consolidate tab as stale
  } finally {
    autoFixApplying.value = false;
  }
}
</script>

<style scoped>
.tags-view {
  padding: 1.5rem;
  max-width: 900px;
}

.view-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

/* Tab bar */
.tab-bar {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0;
}

.tab-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.9rem;
  margin-bottom: -1px;
  transition: all var(--transition-base);
}

.tab-btn.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.tab-btn:hover:not(.active) {
  color: var(--text-primary);
}

.tab-content {
  min-height: 200px;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-input, .num-input {
  padding: 0.375rem 0.625rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.search-input { width: 220px; }
.num-input { width: 60px; text-align: center; }

.toolbar-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

/* Tags table */
.tags-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.tags-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-weight: 500;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tags-table td {
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.tags-table tr:hover td {
  background: var(--bg-hover);
}

.tag-link {
  background: none;
  border: none;
  color: var(--accent-primary);
  cursor: pointer;
  padding: 0;
  font-size: inherit;
}

.tag-link:hover { text-decoration: underline; }

.count-cell { color: var(--text-secondary); text-align: right; width: 60px; }
.actions-cell { width: 40px; text-align: center; }

.source-badge {
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.source-badge[data-source="user"] { background: rgba(34,211,238,0.15); color: var(--accent-primary); }
.source-badge[data-source="autotag"] { background: rgba(168,85,247,0.15); color: #a855f7; }
.source-badge, .source-badge[data-source="pdf"] { background: var(--bg-hover); color: var(--text-tertiary); }

.empty-row { color: var(--text-tertiary); text-align: center; padding: 2rem; }
.empty-state { color: var(--text-tertiary); padding: 3rem; text-align: center; font-size: 0.9rem; }

/* Buttons */
.action-btn {
  padding: 0.375rem 0.875rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-base);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.action-btn.primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--bg-deepest);
  font-weight: 600;
}

.action-btn.secondary { color: var(--text-secondary); }
.action-btn.danger { border-color: var(--error); color: var(--error); }
.action-btn.small { padding: 0.25rem 0.625rem; font-size: 0.75rem; }

.action-btn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
.action-btn.primary:hover:not(:disabled) { opacity: 0.9; color: var(--bg-deepest); }

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  transition: color var(--transition-base);
}

.icon-btn.danger:hover { color: var(--error); }

/* Consolidate tab */
.threshold-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.threshold-slider { width: 140px; cursor: pointer; }

.pair-count { color: var(--text-tertiary); font-size: 0.8rem; }
.pair-count-sm { color: var(--text-tertiary); font-size: 0.75rem; }

.similar-list { display: flex; flex-direction: column; gap: 0.5rem; }

.similar-pair {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition-base);
}

.similar-pair.ai-merge { border-color: rgba(168,85,247,0.4); }
.similar-pair.ai-separate { border-color: var(--border-subtle); opacity: 0.65; }

.ai-rec-banner {
  padding: 0.3rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.ai-rec-banner[data-action="separate"] {
  background: rgba(100,100,100,0.08);
  color: var(--text-tertiary);
}

.ai-rec-banner[data-action="merge-keep-1"],
.ai-rec-banner[data-action="merge-keep-2"] {
  background: rgba(168,85,247,0.08);
  color: #a855f7;
}

.pair-body {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
}

.pair-tag-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.pair-tag-block.right { text-align: right; align-items: flex-end; }

.pair-tag-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pair-tag-meta {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.pair-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.pair-sim {
  padding: 0.1rem 0.4rem;
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 600;
}

.pair-merge-btns {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.merge-btn {
  padding: 0.25rem 0.625rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.merge-btn:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.merge-btn.recommended {
  border-color: #a855f7;
  color: #a855f7;
  background: rgba(168,85,247,0.1);
}

.merge-btn.recommended:hover:not(:disabled) {
  background: rgba(168,85,247,0.2);
}

.merge-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.dismiss-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0.2rem 0.3rem;
  font-size: 0.75rem;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  transition: color var(--transition-base);
}

.dismiss-btn:hover { color: var(--text-secondary); }

.pair-delete-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  font-size: 0.7rem;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color var(--transition-base);
  width: fit-content;
}

.pair-delete-btn:hover { color: var(--error); }

/* Auto-Tag tab */
.autotag-form {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.checkbox-row input[type="checkbox"] { cursor: pointer; }

.autotag-actions { display: flex; gap: 0.75rem; margin-top: 1rem; }

.autotag-summary {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.autotag-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.autotag-table th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.autotag-table td {
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--border-subtle);
}

.model-name-cell {
  color: var(--text-primary);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.autotag-chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  margin: 0 0.2rem 0.1rem 0;
  background: rgba(168,85,247,0.15);
  color: #a855f7;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
}

/* ── Auto-Fix tab ── */
.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 4px;
  margin-left: 5px;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-radius: 9px;
  font-size: 0.65rem;
  font-weight: 700;
  vertical-align: middle;
}

.autofix-toolbar { gap: 0.75rem; flex-wrap: wrap; }
.autofix-header-text { font-size: 0.875rem; color: var(--text-secondary); flex: 1; }
.text-muted { color: var(--text-tertiary); }

.autofix-filters {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.filter-label { font-size: 0.8rem; color: var(--text-tertiary); margin-right: 0.1rem; }

.reason-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-tertiary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all var(--transition-base);
}

.reason-filter-btn.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.filter-count { opacity: 0.7; }

.autofix-intro strong { color: var(--text-primary); }

/* Auto-fix table */
.autofix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.autofix-table th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
}

.autofix-table td {
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.autofix-table tr.af-unchecked td { opacity: 0.4; }
.autofix-table tbody tr:hover td { background: var(--bg-hover); }

.af-cb-col { width: 32px; text-align: center; }
.af-models-col { width: 55px; text-align: right; color: var(--text-secondary); font-size: 0.8rem; }

.af-winner-cell { white-space: nowrap; }
.af-losers-cell { }
.af-losers-inner { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }

.af-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 500;
}

.af-winner { background: var(--accent-primary-dim); color: var(--accent-primary); }
.af-loser { background: var(--bg-hover); color: var(--text-secondary); text-decoration: line-through; text-decoration-color: rgba(255,255,255,0.2); }

.af-tag-count { font-size: 0.68rem; opacity: 0.55; font-weight: normal; margin-left: 1px; }

.af-reasons-cell { }
.af-reasons-inner { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }

.af-reason-badge {
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.af-reason-badge[data-reason="leading-dash"] { background: rgba(239,68,68,0.15); color: #ef4444; }
.af-reason-badge[data-reason="separator"]    { background: rgba(251,146,60,0.15); color: #fb923c; }
.af-reason-badge[data-reason="plural"]       { background: rgba(168,85,247,0.15); color: #a855f7; }
.af-reason-badge[data-reason="spelling"]     { background: rgba(34,211,238,0.15); color: var(--accent-primary); }

/* Confirm dialog */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-dialog {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
}

.confirm-dialog p {
  margin: 0 0 1.25rem;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.confirm-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }

/* Delete both + batch queue buttons */
.pair-extra-btns {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.15rem;
}

.delete-both-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  font-size: 0.7rem;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color var(--transition-base);
}

.delete-both-btn:hover:not(:disabled) { color: var(--error); }
.delete-both-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.batch-queue-btns {
  display: flex;
  gap: 0.2rem;
}

.queue-btn {
  padding: 0.15rem 0.4rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.65rem;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.queue-btn:hover { color: var(--text-secondary); border-color: var(--border-default); }

.queue-btn.active {
  background: rgba(168,85,247,0.15);
  border-color: rgba(168,85,247,0.5);
  color: #a855f7;
}
</style>
