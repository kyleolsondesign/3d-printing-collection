<template>
  <div class="stats-view">
    <div class="header">
      <h2>Statistics</h2>
      <span class="subtitle">Collection insights</span>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading statistics...</span>
    </div>

    <template v-else>
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="stat-card">
          <div class="stat-icon models-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ basicStats.totalModels.toLocaleString() }}</div>
            <div class="stat-label">Total Models</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon printed-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ basicStats.totalPrinted.toLocaleString() }}</div>
            <div class="stat-label">Printed</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon fav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ basicStats.totalFavorites.toLocaleString() }}</div>
            <div class="stat-label">Favorites</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon queue-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ basicStats.totalQueued.toLocaleString() }}</div>
            <div class="stat-label">Queued</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon storage-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatFileSize(detailedStats?.totalFileSize || 0) }}</div>
            <div class="stat-label">Total Size</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon files-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ detailedStats?.avgFilesPerModel || 0 }}</div>
            <div class="stat-label">Avg Files/Model</div>
          </div>
        </div>
      </div>

      <!-- Print time + filament totals (if any data) -->
      <div v-if="(detailedStats?.totalPrintTimeHours || 0) > 0 || (detailedStats?.totalFilamentGrams || 0) > 0" class="summary-cards">
        <div class="stat-card wide">
          <div class="stat-icon time-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatHours(detailedStats?.totalPrintTimeHours || 0) }}</div>
            <div class="stat-label">Total Print Time</div>
          </div>
        </div>
        <div class="stat-card wide">
          <div class="stat-icon filament-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatGrams(detailedStats?.totalFilamentGrams || 0) }}</div>
            <div class="stat-label">Total Filament Used</div>
          </div>
        </div>
      </div>

      <div class="charts-grid">
        <!-- Models per Category Bar Chart -->
        <div class="chart-card wide">
          <h3 class="chart-title">Models by Category</h3>
          <div v-if="!detailedStats?.modelsByCategory?.length" class="chart-empty">No data</div>
          <div v-else class="bar-chart">
            <div
              v-for="item in detailedStats.modelsByCategory"
              :key="item.category"
              class="bar-row"
            >
              <div class="bar-label" :title="item.category">{{ item.category || 'Uncategorized' }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ width: barWidth(item.count, maxCategoryCount) }"
                ></div>
              </div>
              <div class="bar-value">{{ item.count.toLocaleString() }}</div>
            </div>
          </div>
        </div>

        <!-- Print Rating Donut -->
        <div class="chart-card">
          <h3 class="chart-title">Print Ratings</h3>
          <div v-if="totalPrints === 0" class="chart-empty">No prints yet</div>
          <div v-else class="donut-wrapper">
            <svg class="donut-svg" viewBox="0 0 100 100">
              <!-- Background circle -->
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-surface)" stroke-width="14"/>
              <!-- Good arc -->
              <circle
                cx="50" cy="50" r="38"
                fill="none"
                stroke="var(--success)"
                stroke-width="14"
                stroke-dasharray="238.761"
                :stroke-dashoffset="donutOffset(goodPrints, totalPrints)"
                stroke-linecap="round"
                transform="rotate(-90 50 50)"
              />
              <!-- Bad arc (offset by good) -->
              <circle
                v-if="badPrints > 0"
                cx="50" cy="50" r="38"
                fill="none"
                stroke="var(--danger)"
                stroke-width="14"
                stroke-dasharray="238.761"
                :stroke-dashoffset="donutOffset(badPrints, totalPrints)"
                stroke-linecap="round"
                :transform="`rotate(${-90 + goodDeg} 50 50)`"
              />
              <text x="50" y="46" text-anchor="middle" class="donut-center-label">{{ totalPrints }}</text>
              <text x="50" y="58" text-anchor="middle" class="donut-center-sub">prints</text>
            </svg>
            <div class="donut-legend">
              <div class="legend-item">
                <span class="legend-dot good"></span>
                <span>Good</span>
                <strong>{{ goodPrints }}</strong>
                <span class="legend-pct">{{ pct(goodPrints, totalPrints) }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bad"></span>
                <span>Bad</span>
                <strong>{{ badPrints }}</strong>
                <span class="legend-pct">{{ pct(badPrints, totalPrints) }}</span>
              </div>
              <div v-if="unratedPrints > 0" class="legend-item">
                <span class="legend-dot unrated"></span>
                <span>Unrated</span>
                <strong>{{ unratedPrints }}</strong>
                <span class="legend-pct">{{ pct(unratedPrints, totalPrints) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Prints Over Time Line Chart -->
        <div class="chart-card wide">
          <h3 class="chart-title">Prints Over Time</h3>
          <div v-if="!detailedStats?.printsByMonth?.length" class="chart-empty">No print history yet</div>
          <div v-else class="line-chart-wrapper">
            <svg class="line-chart-svg" :viewBox="`0 0 ${svgW} ${svgH}`" preserveAspectRatio="none">
              <!-- Grid lines -->
              <line v-for="tick in yTicks" :key="tick"
                :x1="padL" :y1="yPos(tick)" :x2="svgW - padR" :y2="yPos(tick)"
                stroke="var(--border-subtle)" stroke-width="1"
              />
              <!-- Area fill (good prints) -->
              <path :d="areaPath" fill="rgba(34,197,94,0.12)" />
              <!-- Line (total prints) -->
              <polyline :points="lineTotalPoints" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linejoin="round"/>
              <!-- Line (good prints) -->
              <polyline :points="lineGoodPoints" fill="none" stroke="var(--success)" stroke-width="1.5" stroke-dasharray="4 2" stroke-linejoin="round"/>
              <!-- X axis labels -->
              <text
                v-for="(item, i) in printMonthLabels"
                :key="i"
                :x="xPos(i)"
                :y="svgH - 4"
                text-anchor="middle"
                class="axis-label"
              >{{ item }}</text>
              <!-- Y axis labels -->
              <text v-for="tick in yTicks" :key="'y' + tick"
                :x="padL - 4" :y="yPos(tick) + 4"
                text-anchor="end"
                class="axis-label"
              >{{ tick }}</text>
            </svg>
            <div class="line-legend">
              <span class="line-legend-item">
                <span class="line-swatch" style="background: var(--accent-primary)"></span> Total
              </span>
              <span class="line-legend-item">
                <span class="line-swatch dashed" style="background: var(--success)"></span> Good
              </span>
            </div>
          </div>
        </div>

        <!-- Models Added Over Time Line Chart -->
        <div class="chart-card wide" v-if="detailedStats?.modelsAddedByMonth?.length">
          <h3 class="chart-title">Models Added Over Time</h3>
          <div class="line-chart-wrapper">
            <svg class="line-chart-svg" :viewBox="`0 0 ${svgW} ${svgH}`" preserveAspectRatio="none">
              <line v-for="tick in addedYTicks" :key="tick"
                :x1="padL" :y1="addedYPos(tick)" :x2="svgW - padR" :y2="addedYPos(tick)"
                stroke="var(--border-subtle)" stroke-width="1"
              />
              <path :d="addedAreaPath" fill="rgba(34,211,238,0.1)" />
              <polyline :points="addedLinePoints" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linejoin="round"/>
              <text
                v-for="(item, i) in addedMonthLabels"
                :key="i"
                :x="addedXPos(i)"
                :y="svgH - 4"
                text-anchor="middle"
                class="axis-label"
              >{{ item }}</text>
              <text v-for="tick in addedYTicks" :key="'ay' + tick"
                :x="padL - 4" :y="addedYPos(tick) + 4"
                text-anchor="end"
                class="axis-label"
              >{{ tick }}</text>
            </svg>
          </div>
        </div>

        <!-- Top Printed Categories -->
        <div class="chart-card" v-if="detailedStats?.topPrintedCategories?.length">
          <h3 class="chart-title">Most Printed Categories</h3>
          <div class="bar-chart compact">
            <div
              v-for="item in detailedStats.topPrintedCategories"
              :key="item.category"
              class="bar-row"
            >
              <div class="bar-label" :title="item.category">{{ item.category }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill accent"
                  :style="{ width: barWidth(item.print_count, maxPrintedCount) }"
                ></div>
              </div>
              <div class="bar-value">{{ item.print_count }}</div>
            </div>
          </div>
        </div>

        <!-- File Type Breakdown -->
        <div class="chart-card" v-if="detailedStats?.fileTypes?.length">
          <h3 class="chart-title">File Types</h3>
          <div class="bar-chart compact">
            <div
              v-for="item in detailedStats.fileTypes"
              :key="item.file_type"
              class="bar-row"
            >
              <div class="bar-label">{{ (item.file_type || 'unknown').toUpperCase() }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill purple"
                  :style="{ width: barWidth(item.count, maxFileTypeCount) }"
                ></div>
              </div>
              <div class="bar-value">{{ item.count.toLocaleString() }}</div>
            </div>
          </div>
        </div>

        <!-- Tag Stats -->
        <div class="chart-card" v-if="detailedStats?.tagStats?.length">
          <h3 class="chart-title">Top Tags</h3>
          <div class="tag-stats">
            <div v-for="tag in detailedStats.tagStats" :key="tag.name" class="tag-stat-row">
              <span class="tag-chip">{{ tag.name }}</span>
              <div class="bar-track small">
                <div class="bar-fill accent" :style="{ width: barWidth(tag.model_count, maxTagCount) }"></div>
              </div>
              <span class="tag-count">{{ tag.model_count }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { systemApi } from '../services/api';

interface DetailedStats {
  modelsByCategory: Array<{ category: string; count: number }>;
  printsByMonth: Array<{ month: string; total: number; good_count: number; bad_count: number }>;
  printRatings: { good: number; bad: number; unrated: number };
  topPrintedCategories: Array<{ category: string; print_count: number }>;
  avgFilesPerModel: number;
  totalFileSize: number;
  totalPrintTimeHours: number;
  totalFilamentGrams: number;
  modelsAddedByMonth: Array<{ month: string; count: number }>;
  tagStats: Array<{ name: string; model_count: number }>;
  fileTypes: Array<{ file_type: string; count: number }>;
}

const loading = ref(true);
const basicStats = ref({ totalModels: 0, totalFavorites: 0, totalPrinted: 0, totalQueued: 0, totalLooseFiles: 0 });
const detailedStats = ref<DetailedStats | null>(null);

// SVG chart dimensions
const svgW = 560;
const svgH = 140;
const padL = 28;
const padR = 12;
const padT = 10;
const padB = 20;

onMounted(async () => {
  try {
    const [basicRes, detailRes] = await Promise.all([
      systemApi.getStats(),
      systemApi.getDetailedStats()
    ]);
    basicStats.value = basicRes.data;
    detailedStats.value = detailRes.data;
  } catch (error) {
    console.error('Failed to load stats:', error);
  } finally {
    loading.value = false;
  }
});

// --- Helper formatters ---
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

function formatHours(hours: number): string {
  if (!hours) return '0 h';
  if (hours < 1) return Math.round(hours * 60) + ' min';
  return hours.toFixed(1) + ' h';
}

function formatGrams(grams: number): string {
  if (!grams) return '0 g';
  if (grams >= 1000) return (grams / 1000).toFixed(2) + ' kg';
  return Math.round(grams) + ' g';
}

function barWidth(value: number, max: number): string {
  if (!max) return '0%';
  return Math.max(2, Math.round((value / max) * 100)) + '%';
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return Math.round((part / total) * 100) + '%';
}

// --- Category bar chart ---
const maxCategoryCount = computed(() =>
  Math.max(...(detailedStats.value?.modelsByCategory.map(x => x.count) || [1]))
);

// --- Print rating donut ---
const goodPrints = computed(() => detailedStats.value?.printRatings?.good || 0);
const badPrints = computed(() => detailedStats.value?.printRatings?.bad || 0);
const unratedPrints = computed(() => detailedStats.value?.printRatings?.unrated || 0);
const totalPrints = computed(() => goodPrints.value + badPrints.value + unratedPrints.value);

// r=38, circumference = 2*pi*38 ≈ 238.76
const CIRC = 238.761;

function donutOffset(count: number, total: number): number {
  if (!total) return CIRC;
  const filled = (count / total) * CIRC;
  return CIRC - filled;
}

const goodDeg = computed(() => (goodPrints.value / (totalPrints.value || 1)) * 360);

// --- Prints over time line chart ---
const printData = computed(() => detailedStats.value?.printsByMonth || []);

const maxPrintVal = computed(() => Math.max(...printData.value.map(d => d.total), 1));

function niceMax(val: number): number {
  if (val <= 5) return 5;
  const step = Math.ceil(val / 4);
  return step * 4;
}

const yMax = computed(() => niceMax(maxPrintVal.value));
const yTicks = computed(() => {
  const m = yMax.value;
  const step = m / 4;
  return [0, step, step * 2, step * 3, m].map(v => Math.round(v));
});

function yPos(val: number): number {
  return padT + (svgH - padT - padB) * (1 - val / yMax.value);
}

function xPos(i: number): number {
  const n = printData.value.length;
  if (n <= 1) return padL + (svgW - padL - padR) / 2;
  return padL + (i / (n - 1)) * (svgW - padL - padR);
}

const lineTotalPoints = computed(() =>
  printData.value.map((d, i) => `${xPos(i)},${yPos(d.total)}`).join(' ')
);

const lineGoodPoints = computed(() =>
  printData.value.map((d, i) => `${xPos(i)},${yPos(d.good_count)}`).join(' ')
);

const areaPath = computed(() => {
  if (!printData.value.length) return '';
  const n = printData.value.length;
  const base = yPos(0);
  const pts = printData.value.map((d, i) => `${xPos(i)},${yPos(d.good_count)}`).join(' L ');
  return `M ${xPos(0)},${base} L ${pts} L ${xPos(n - 1)},${base} Z`;
});

const printMonthLabels = computed(() =>
  printData.value.map(d => d.month.slice(5)) // "MM" from "YYYY-MM"
);

// --- Models added over time ---
const addedData = computed(() => detailedStats.value?.modelsAddedByMonth || []);
const maxAddedVal = computed(() => Math.max(...addedData.value.map(d => d.count), 1));
const addedYMax = computed(() => niceMax(maxAddedVal.value));
const addedYTicks = computed(() => {
  const m = addedYMax.value;
  const step = m / 4;
  return [0, step, step * 2, step * 3, m].map(v => Math.round(v));
});

function addedYPos(val: number): number {
  return padT + (svgH - padT - padB) * (1 - val / addedYMax.value);
}

function addedXPos(i: number): number {
  const n = addedData.value.length;
  if (n <= 1) return padL + (svgW - padL - padR) / 2;
  return padL + (i / (n - 1)) * (svgW - padL - padR);
}

const addedLinePoints = computed(() =>
  addedData.value.map((d, i) => `${addedXPos(i)},${addedYPos(d.count)}`).join(' ')
);

const addedAreaPath = computed(() => {
  if (!addedData.value.length) return '';
  const n = addedData.value.length;
  const base = addedYPos(0);
  const pts = addedData.value.map((d, i) => `${addedXPos(i)},${addedYPos(d.count)}`).join(' L ');
  return `M ${addedXPos(0)},${base} L ${pts} L ${addedXPos(n - 1)},${base} Z`;
});

const addedMonthLabels = computed(() => addedData.value.map(d => d.month.slice(5)));

// --- Top printed categories ---
const maxPrintedCount = computed(() =>
  Math.max(...(detailedStats.value?.topPrintedCategories.map(x => x.print_count) || [1]))
);

// --- File types ---
const maxFileTypeCount = computed(() =>
  Math.max(...(detailedStats.value?.fileTypes.map(x => x.count) || [1]))
);

// --- Tag stats ---
const maxTagCount = computed(() =>
  Math.max(...(detailedStats.value?.tagStats.map(x => x.model_count) || [1]))
);
</script>

<style scoped>
.stats-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-tertiary);
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1rem;
  transition: border-color var(--transition-base);
}

.stat-card:hover {
  border-color: var(--border-default);
}

.stat-card.wide {
  grid-column: span 2;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon svg {
  width: 22px;
  height: 22px;
}

.models-icon { background: rgba(34,211,238,0.12); color: var(--accent-primary); }
.printed-icon { background: rgba(34,197,94,0.12); color: var(--success); }
.fav-icon { background: rgba(251,191,36,0.12); color: var(--warning); }
.queue-icon { background: rgba(139,92,246,0.12); color: #a78bfa; }
.storage-icon { background: rgba(249,115,22,0.12); color: #fb923c; }
.files-icon { background: rgba(236,72,153,0.12); color: #f472b6; }
.time-icon { background: rgba(34,211,238,0.12); color: var(--accent-primary); }
.filament-icon { background: rgba(34,197,94,0.12); color: var(--success); }

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  white-space: nowrap;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-weight: 500;
  white-space: nowrap;
}

/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.chart-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.chart-card.wide {
  grid-column: span 2;
}

.chart-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-empty {
  color: var(--text-tertiary);
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
}

/* Horizontal Bar Chart */
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bar-chart.compact {
  gap: 0.375rem;
}

.bar-row {
  display: grid;
  grid-template-columns: 130px 1fr 48px;
  align-items: center;
  gap: 0.75rem;
}

.bar-chart.compact .bar-row {
  grid-template-columns: 100px 1fr 36px;
  gap: 0.5rem;
}

.bar-label {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.bar-track {
  height: 10px;
  background: var(--bg-elevated);
  border-radius: 5px;
  overflow: hidden;
}

.bar-chart.compact .bar-track {
  height: 8px;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(34,211,238,0.6), var(--accent-primary));
  border-radius: 5px;
  transition: width 0.6s ease;
}

.bar-fill.accent {
  background: linear-gradient(90deg, rgba(34,197,94,0.5), var(--success));
}

.bar-fill.purple {
  background: linear-gradient(90deg, rgba(139,92,246,0.5), #a78bfa);
}

.bar-value {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Donut Chart */
.donut-wrapper {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.donut-svg {
  width: 130px;
  height: 130px;
  flex-shrink: 0;
}

.donut-center-label {
  font-size: 16px;
  font-weight: 700;
  fill: var(--text-primary);
  font-family: inherit;
}

.donut-center-sub {
  font-size: 9px;
  fill: var(--text-tertiary);
  font-family: inherit;
}

.donut-legend {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.legend-item strong {
  color: var(--text-primary);
  font-weight: 600;
}

.legend-pct {
  color: var(--text-tertiary);
  font-size: 0.75rem;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-dot.good { background: var(--success); }
.legend-dot.bad { background: var(--danger); }
.legend-dot.unrated { background: var(--text-muted, #666); }

/* Line Chart */
.line-chart-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.line-chart-svg {
  width: 100%;
  height: 140px;
  overflow: visible;
}

.axis-label {
  font-size: 8px;
  fill: var(--text-tertiary);
  font-family: inherit;
}

.line-legend {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.line-legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.line-swatch {
  display: inline-block;
  width: 20px;
  height: 2px;
  border-radius: 1px;
}

.line-swatch.dashed {
  background: repeating-linear-gradient(
    90deg,
    var(--success) 0, var(--success) 4px,
    transparent 4px, transparent 6px
  );
}

/* Tag stats */
.tag-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tag-stat-row {
  display: grid;
  grid-template-columns: 100px 1fr 32px;
  align-items: center;
  gap: 0.5rem;
}

.tag-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-track.small {
  height: 6px;
}

.tag-count {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  text-align: right;
}

/* Loading */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem;
  color: var(--text-tertiary);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 900px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
  .chart-card.wide {
    grid-column: span 1;
  }
  .stat-card.wide {
    grid-column: span 1;
  }
}

@media (max-width: 600px) {
  .summary-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
