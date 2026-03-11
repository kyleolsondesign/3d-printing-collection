<template>
    <Teleport to="body">
        <div class="modal-overlay" @click.self="$emit('close')" @keydown.escape="$emit('close')">
            <div class="recategorize-modal" @click.stop>
                <!-- Header -->
                <div class="modal-header">
                    <div class="header-left">
                        <h2>Recategorize Models</h2>
                        <span class="count-badge">{{ props.modelIds.length }} selected</span>
                    </div>
                    <button class="close-btn" @click="$emit('close')" title="Close">
                        <AppIcon name="x" />
                    </button>
                </div>

                <!-- Loading -->
                <div v-if="loading" class="loading-state">
                    <div class="spinner"></div>
                    <span>Loading suggestions...</span>
                </div>

                <!-- Content -->
                <template v-else-if="!applyResults">
                    <!-- Apply-all shortcut -->
                    <div class="apply-all-row">
                        <span class="apply-all-label">Apply same category to all:</span>
                        <div class="category-select-wrapper">
                            <input
                                class="category-input"
                                type="text"
                                placeholder="Category name..."
                                :value="applyAllCategory"
                                @input="onApplyAllInput(($event.target as HTMLInputElement).value)"
                                @focus="showApplyAllDropdown = true; applyAllTyped = false"
                                @blur="onApplyAllBlur"
                                @keydown.escape="showApplyAllDropdown = false"
                            />
                            <div v-if="showApplyAllDropdown" class="category-dropdown">
                                <button
                                    v-for="cat in getApplyAllOptions()"
                                    :key="cat"
                                    class="category-option"
                                    @mousedown.prevent="selectApplyAll(cat)"
                                >
                                    <span class="cat-name">{{ cat }}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Table -->
                    <div class="rows-container">
                        <table class="rows-table">
                            <thead>
                                <tr>
                                    <th class="col-check">
                                        <input
                                            type="checkbox"
                                            :checked="allIncluded"
                                            :indeterminate="someIncluded && !allIncluded"
                                            @change="toggleAll"
                                        />
                                    </th>
                                    <th class="col-model">Model</th>
                                    <th class="col-current">Current</th>
                                    <th class="col-new">New Category</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="row in rows"
                                    :key="row.model_id"
                                    :class="{ 'row-excluded': !row.included, 'row-changed': row.included && row.chosen_category !== row.current_category }"
                                >
                                    <td class="col-check">
                                        <input type="checkbox" v-model="row.included" />
                                    </td>
                                    <td class="col-model">
                                        <div class="model-cell">
                                            <img
                                                v-if="row.primaryImage"
                                                :src="`/api/models/file/serve?path=${encodeURIComponent(row.primaryImage)}`"
                                                class="model-thumb"
                                                @error="row.primaryImage = null"
                                            />
                                            <div v-else class="model-thumb-placeholder">📦</div>
                                            <span class="model-name">{{ row.model_name }}</span>
                                        </div>
                                    </td>
                                    <td class="col-current">
                                        <span class="current-cat">{{ row.current_category }}</span>
                                    </td>
                                    <td class="col-new">
                                        <div class="new-cat-cell">
                                            <span
                                                class="confidence-dot"
                                                :class="row.confidence"
                                                :title="`${row.confidence} confidence`"
                                            ></span>
                                            <div class="category-select-wrapper">
                                                <input
                                                    class="category-input"
                                                    type="text"
                                                    :value="row.chosen_category"
                                                    @input="onRowCategoryInput(row, ($event.target as HTMLInputElement).value)"
                                                    @focus="onRowInputFocus(row, $event)"
                                                    @blur="onRowCategoryBlur"
                                                    @keydown.escape="activeDropdownRowId = null"
                                                    @keydown.enter="activeDropdownRowId = null"
                                                />
                                            </div>
                                            <button
                                                class="debug-btn"
                                                :class="{ active: row.showDebug }"
                                                @click="row.showDebug = !row.showDebug"
                                                title="Show score breakdown"
                                                v-if="row.debug_scores.length > 0"
                                            >?</button>
                                        </div>
                                        <div v-if="row.showDebug" class="debug-panel">
                                            <div class="debug-panel-title">Score breakdown</div>
                                            <div v-for="entry in row.debug_scores" :key="entry.category" class="debug-row">
                                                <span class="debug-cat">{{ entry.category }}</span>
                                                <div class="debug-bar-wrap">
                                                    <div class="debug-bar" :style="{ width: entry.score + '%' }"></div>
                                                </div>
                                                <span class="debug-pct">{{ entry.score }}%</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>

                <!-- Apply results -->
                <div v-else class="apply-results">
                    <div v-for="result in applyResults" :key="result.model_id"
                        :class="['result-row', result.success ? 'result-success' : 'result-error']"
                    >
                        <AppIcon :name="result.success ? 'check' : 'x'" />
                        <span class="result-name">{{ result.model_name }}</span>
                        <span v-if="!result.success" class="result-error-msg">{{ result.error }}</span>
                        <span v-else class="result-ok-msg">→ {{ result.new_category }}</span>
                    </div>
                </div>

                <!-- Footer -->
                <div class="modal-footer">
                    <div class="footer-left">
                        <button
                            v-if="!applyResults"
                            class="ai-btn"
                            :disabled="applying"
                            @click="loadSuggestions(true)"
                            title="Use AI to suggest categories"
                        >
                            <AppIcon name="brain" />
                            AI Suggest
                        </button>
                    </div>
                    <div class="footer-right">
                        <button class="btn-ghost" @click="$emit('close')" :disabled="applying">
                            {{ applyResults ? 'Close' : 'Cancel' }}
                        </button>
                        <button
                            v-if="!applyResults"
                            class="btn-primary"
                            :disabled="applying || getChangedCount() === 0"
                            @click="applyChanges"
                        >
                            <span v-if="applying"><div class="spinner spinner-sm"></div> Applying...</span>
                            <span v-else>Apply {{ getChangedCount() }} Change{{ getChangedCount() !== 1 ? 's' : '' }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Row category dropdown — teleported to body to escape scroll container clipping -->
        <Teleport to="body">
            <div
                v-if="activeRow && activeInputRect"
                class="category-dropdown-fixed"
                :style="{
                    top: (activeInputRect.bottom + 2) + 'px',
                    left: activeInputRect.left + 'px',
                    minWidth: Math.max(activeInputRect.width, 200) + 'px',
                }"
            >
                <button
                    v-for="cat in getCategoryOptions(activeRow)"
                    :key="cat"
                    class="category-option"
                    @mousedown.prevent="selectRowCategory(activeRow!, cat)"
                >
                    <span class="cat-name">{{ cat }}</span>
                    <span v-if="getDebugScore(activeRow, cat)" class="cat-score">{{ getDebugScore(activeRow, cat) }}%</span>
                </button>
            </div>
        </Teleport>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { modelsApi, type CategorySuggestion, type ScoreDebugEntry } from '../services/api';
import { useAppStore } from '../store';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ modelIds: number[] }>();
const emit = defineEmits<{ close: []; applied: [] }>();

const store = useAppStore();

interface RecategorizationRow {
    model_id: number;
    model_name: string;
    primaryImage: string | null;
    current_category: string;
    chosen_category: string;
    suggested_category: string;
    confidence: 'high' | 'medium' | 'low';
    debug_scores: ScoreDebugEntry[];
    included: boolean;
    showDebug: boolean;
}

interface ApplyResult {
    model_id: number;
    model_name: string;
    success: boolean;
    error?: string;
    new_category?: string;
}

const loading = ref(false);
const applying = ref(false);
const rows = ref<RecategorizationRow[]>([]);
const applyResults = ref<ApplyResult[] | null>(null);

const applyAllCategory = ref('');
const showApplyAllDropdown = ref(false);
const applyAllTyped = ref(false);
const activeDropdownRowId = ref<number | null>(null);
const activeInputRect = ref<DOMRect | null>(null);
const rowDropdownTyped = ref(false);

const activeRow = computed(() => rows.value.find(r => r.model_id === activeDropdownRowId.value) ?? null);

const categories = computed(() => store.categories.map(c => c.category));

const allIncluded = computed(() => rows.value.length > 0 && rows.value.every(r => r.included));
const someIncluded = computed(() => rows.value.some(r => r.included));

function getChangedCount() {
    return rows.value.filter(r => r.included && r.chosen_category !== r.current_category).length;
}

function toggleAll(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    rows.value.forEach(r => { r.included = checked; });
}

async function loadSuggestions(useAi = false) {
    loading.value = true;
    try {
        const res = await modelsApi.suggestCategories(props.modelIds, useAi);
        const suggestions: CategorySuggestion[] = res.data.suggestions;

        // Build a map of primaryImage by model_id from the store
        const imageMap = new Map(store.models.map(m => [m.id, m.primaryImage ?? null]));

        rows.value = suggestions.map(s => ({
            model_id: s.model_id,
            model_name: s.model_name,
            primaryImage: imageMap.get(s.model_id) ?? null,
            current_category: s.current_category,
            chosen_category: s.suggested_category,
            suggested_category: s.suggested_category,
            confidence: s.confidence,
            debug_scores: s.debug_scores,
            included: true,
            showDebug: false,
        }));
    } catch (e) {
        console.error('Failed to load suggestions:', e);
    } finally {
        loading.value = false;
    }
}

function getDebugScore(row: RecategorizationRow, cat: string): number | null {
    const entry = row.debug_scores.find(e => e.category === cat);
    return entry ? entry.score : null;
}

function getCategoryOptions(row: RecategorizationRow): string[] {
    const typed = rowDropdownTyped && activeDropdownRowId.value === row.model_id ? row.chosen_category.toLowerCase() : '';
    const scored = row.debug_scores.map(e => e.category);
    const remaining = categories.value.filter(c => !scored.includes(c));
    const allOptions = [...scored, ...remaining];
    if (!allOptions.includes('Uncategorized')) allOptions.push('Uncategorized');
    if (!typed) return allOptions;
    return allOptions.filter(c => c.toLowerCase().includes(typed));
}

function getApplyAllOptions(): string[] {
    const cats = categories.value.filter(c => c !== 'Uncategorized');
    const all = [...cats, 'Uncategorized'];
    if (!applyAllTyped.value || !applyAllCategory.value.trim()) return all;
    return all.filter(c => c.toLowerCase().includes(applyAllCategory.value.toLowerCase()));
}

function onRowCategoryInput(row: RecategorizationRow, value: string) {
    row.chosen_category = value;
    rowDropdownTyped.value = true;
    activeDropdownRowId.value = row.model_id;
}

function onRowInputFocus(row: RecategorizationRow, event: FocusEvent) {
    activeDropdownRowId.value = row.model_id;
    rowDropdownTyped.value = false;
    activeInputRect.value = (event.target as HTMLElement).getBoundingClientRect();
}

function onRowCategoryBlur() {
    setTimeout(() => { activeDropdownRowId.value = null; activeInputRect.value = null; }, 150);
}

function selectRowCategory(row: RecategorizationRow, cat: string) {
    row.chosen_category = cat;
    activeDropdownRowId.value = null;
}

function onApplyAllInput(value: string) {
    applyAllCategory.value = value;
    applyAllTyped.value = true;
    showApplyAllDropdown.value = true;
}

function onApplyAllBlur() {
    setTimeout(() => { showApplyAllDropdown.value = false; }, 150);
}

function selectApplyAll(cat: string) {
    applyAllCategory.value = cat;
    showApplyAllDropdown.value = false;
    rows.value.forEach(r => { r.chosen_category = cat; });
}


async function applyChanges() {
    const toMove = rows.value.filter(r => r.included && r.chosen_category.trim() && r.chosen_category !== r.current_category);
    if (toMove.length === 0) return;

    applying.value = true;

    // Group by target category
    const byCategory = new Map<string, RecategorizationRow[]>();
    for (const row of toMove) {
        const cat = row.chosen_category.trim();
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(row);
    }

    const results: ApplyResult[] = [];

    for (const [cat, categoryRows] of byCategory) {
        try {
            const ids = categoryRows.map(r => r.model_id);
            const res = await modelsApi.bulkReassignCategory(ids, cat);
            const apiResults = res.data.results as Array<{ id: number; success: boolean; error?: string }>;
            for (const apiResult of apiResults) {
                const row = categoryRows.find(r => r.model_id === apiResult.id);
                results.push({
                    model_id: apiResult.id,
                    model_name: row?.model_name ?? `Model ${apiResult.id}`,
                    success: apiResult.success,
                    error: apiResult.error,
                    new_category: apiResult.success ? cat : undefined,
                });
            }
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            for (const row of categoryRows) {
                results.push({ model_id: row.model_id, model_name: row.model_name, success: false, error: errMsg });
            }
        }
    }

    applying.value = false;
    applyResults.value = results;

    if (results.some(r => r.success)) {
        emit('applied');
    }
}

onMounted(() => {
    loadSuggestions(false);
});
</script>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
}

.recategorize-modal {
    background: var(--bg-surface);
    border-radius: 12px;
    width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.2s ease;
    overflow: hidden;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

/* Header */
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
    background: var(--bg-surface);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
}

.count-badge {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
}

.close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
}

.close-btn:hover { color: var(--text-primary); background: var(--bg-elevated); }

/* Loading */
.loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px;
    color: var(--text-secondary);
    flex: 1;
}

.spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}

.spinner-sm {
    width: 14px;
    height: 14px;
    display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Apply-all row */
.apply-all-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
}

.apply-all-label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    white-space: nowrap;
}


/* Table */
.rows-container {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    background: var(--bg-surface);
}

.rows-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    background: var(--bg-surface);
}

.rows-table thead {
    position: sticky;
    top: 0;
    background: var(--bg-elevated);
    z-index: 1;
}

.rows-table th {
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-default);
}

.rows-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-default);
    vertical-align: middle;
}

.col-check { width: 40px; }
.col-model { width: 50%; }
.col-current { width: 18%; min-width: 120px; }
.col-new { width: 32%; min-width: 200px; }

.row-excluded td { opacity: 0.4; }
.row-changed td { background: rgba(var(--accent-rgb, 99, 102, 241), 0.04); }

.model-cell {
    display: flex;
    align-items: center;
    gap: 10px;
}

.model-thumb {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
}

.model-thumb-placeholder {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    background: var(--bg-elevated);
    border-radius: 4px;
    flex-shrink: 0;
}

.model-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
}

.current-cat {
    color: var(--text-secondary);
    font-size: 0.8rem;
}

/* New category cell */
.new-cat-cell {
    display: flex;
    align-items: center;
    gap: 6px;
}

/* Confidence dots */
.confidence-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.confidence-dot.high { background: var(--success, #22c55e); }
.confidence-dot.medium { background: var(--warning, #f59e0b); }
.confidence-dot.low { background: var(--text-tertiary, #94a3b8); }

/* Smart dropdown */
.category-select-wrapper {
    position: relative;
    flex: 1;
}

.category-input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-primary);
    font-size: 0.85rem;
}

.category-input:focus { outline: none; border-color: var(--accent-primary); }

.category-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    z-index: 100;
    max-height: 180px;
    overflow-y: auto;
}

.category-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 6px 10px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 0.85rem;
    color: var(--text-primary);
}

.category-option:hover { background: var(--bg-hover); }
.cat-name { flex: 1; white-space: nowrap; }
.cat-score { color: var(--text-tertiary); font-size: 0.75rem; flex-shrink: 0; }

/* Debug button */
.debug-btn {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--border-default);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
}

.debug-btn:hover, .debug-btn.active { background: var(--bg-hover); color: var(--accent-primary); border-color: var(--accent-primary); }

/* Debug panel */
.debug-panel {
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    font-size: 0.75rem;
}

.debug-panel-title { color: var(--text-secondary); margin-bottom: 6px; font-weight: 500; }

.debug-row {
    display: grid;
    grid-template-columns: 140px 1fr 36px;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
}

.debug-cat { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }

.debug-bar-wrap { background: var(--border-default); border-radius: 2px; height: 4px; overflow: hidden; }
.debug-bar { height: 100%; background: var(--accent-primary); border-radius: 2px; }
.debug-pct { text-align: right; color: var(--text-secondary); }

/* Apply results */
.apply-results {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-surface);
}

.result-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.875rem;
}

.result-success { background: rgba(34, 197, 94, 0.1); }
.result-error { background: rgba(239, 68, 68, 0.1); }
.result-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-ok-msg { color: var(--text-secondary); font-size: 0.8rem; }
.result-error-msg { color: #ef4444; font-size: 0.8rem; }

/* Footer */
.modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-top: 1px solid var(--border-default);
    flex-shrink: 0;
    background: var(--bg-surface);
}

.footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
}

.ai-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
}

.ai-btn :deep(svg) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
}

.ai-btn:hover:not(:disabled) { background: var(--bg-hover); }
.ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-ghost {
    padding: 7px 16px;
    background: none;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
}

.btn-ghost:hover:not(:disabled) { background: var(--bg-elevated); }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    background: var(--accent-primary);
    border: none;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
}

.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

<style>
/* Teleported row dropdown — not scoped so it renders correctly at body level */
.category-dropdown-fixed {
    position: fixed;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    z-index: 9999;
    max-height: 180px;
    overflow-y: auto;
}
</style>
