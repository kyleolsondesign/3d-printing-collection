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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ basicStats.totalModels.toLocaleString() }}
            </div>
            <div class="stat-label">Total Models</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon printed-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ basicStats.totalPrinted.toLocaleString() }}
            </div>
            <div class="stat-label">Printed</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon fav-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ basicStats.totalFavorites.toLocaleString() }}
            </div>
            <div class="stat-label">Favorites</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon queue-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ basicStats.totalQueued.toLocaleString() }}
            </div>
            <div class="stat-label">Queued</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon storage-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ formatFileSize(detailedStats?.totalFileSize || 0) }}
            </div>
            <div class="stat-label">Total Size</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon files-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ detailedStats?.avgFilesPerModel || 0 }}
            </div>
            <div class="stat-label">Avg Files/Model</div>
          </div>
        </div>
      </div>

      <!-- Print time + filament totals (if any data) -->
      <div
        v-if="
          (detailedStats?.totalPrintTimeHours || 0) > 0 ||
          (detailedStats?.totalFilamentGrams || 0) > 0
        "
        class="summary-cards"
      >
        <div class="stat-card wide">
          <div class="stat-icon time-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ formatHours(detailedStats?.totalPrintTimeHours || 0) }}
            </div>
            <div class="stat-label">Total Print Time</div>
          </div>
        </div>
        <div class="stat-card wide">
          <div class="stat-icon filament-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
              />
              <path d="M12 8v4l3 3" />
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">
              {{ formatGrams(detailedStats?.totalFilamentGrams || 0) }}
            </div>
            <div class="stat-label">Total Filament Used</div>
          </div>
        </div>
      </div>
      <!-- Import Quality Section -->
      <template v-if="importStats && importStats.totalImports > 0">
        <div class="section-header">
          <h3>Import Quality</h3>
          <span class="section-sub">
            How well the categorizer is performing over time
          </span>
        </div>

        <!-- Import summary cards -->
        <div class="summary-cards">
          <div class="stat-card">
            <div class="stat-icon import-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <path d="M7 10l5 5 5-5M12 15V3" />
              </svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                {{ importStats.totalImports.toLocaleString() }}
              </div>
              <div class="stat-label">Total Imported</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon accept-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ importStats.acceptanceRate }}%</div>
              <div class="stat-label">Acceptance Rate</div>
            </div>
          </div>
          <!-- Confidence breakdown mini stats -->
          <div
            v-for="conf in sortedConfidence"
            :key="conf.confidence"
            class="stat-card"
          >
            <div class="stat-icon" :class="conf.confidence + '-conf-icon'">
              <span class="confidence-badge" :class="conf.confidence">
                {{ conf.confidence.charAt(0) }}
              </span>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                {{ Math.round((conf.accepted / conf.total) * 100) }}%
              </div>
              <div class="stat-label">{{ conf.confidence }} confidence</div>
            </div>
          </div>
        </div>

        <div class="charts-grid">
          <!-- Acceptance rate over time line chart (daily) -->
          <div class="chart-card wide" v-if="importDayData.length > 0">
            <div class="chart-header">
              <h3 class="chart-title">Acceptance Rate Over Time</h3>
              <div class="range-selector">
                <button
                  class="range-btn"
                  :class="{ active: importRange === 30 }"
                  @click="importRange = 30"
                >
                  30d
                </button>
                <button
                  class="range-btn"
                  :class="{ active: importRange === 90 }"
                  @click="importRange = 90"
                >
                  90d
                </button>
                <button
                  class="range-btn"
                  :class="{ active: importRange === 0 }"
                  @click="importRange = 0"
                >
                  All
                </button>
              </div>
            </div>
            <div v-if="importDayData.length === 0" class="chart-empty">
              No imports in this period
            </div>
            <div v-else class="line-chart-wrapper">
              <svg class="line-chart-svg" :viewBox="`0 0 ${svgW} ${svgH}`">
                <!-- 100% guideline -->
                <line
                  :x1="padL"
                  :y1="importYPos(100)"
                  :x2="svgW - padR"
                  :y2="importYPos(100)"
                  stroke="var(--border-subtle)"
                  stroke-width="1"
                  stroke-dasharray="4 3"
                />
                <!-- Grid lines -->
                <line
                  v-for="tick in importYTicks"
                  :key="'ig' + tick"
                  :x1="padL"
                  :y1="importYPos(tick)"
                  :x2="svgW - padR"
                  :y2="importYPos(tick)"
                  stroke="var(--border-subtle)"
                  stroke-width="1"
                />
                <!-- Area fill -->
                <path :d="importAreaPath" fill="rgba(34,197,94,0.1)" />
                <!-- Acceptance rate line -->
                <polyline
                  v-if="importDayData.length > 1"
                  :points="importLinePoints"
                  fill="none"
                  stroke="var(--success)"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <!-- Hover groups + dots per data point -->
                <g
                  v-for="(d, i) in importDayData"
                  :key="'id-pt-' + i"
                  @mouseenter="showImportTip(i)"
                  @mouseleave="importTooltip = null"
                  style="cursor: crosshair"
                >
                  <rect
                    :x="importXPos(i) - 6"
                    :y="padT"
                    width="12"
                    :height="svgH - padT - padB"
                    fill="transparent"
                  />
                  <circle
                    :cx="importXPos(i)"
                    :cy="
                      importYPos(
                        d.total > 0
                          ? Math.round((d.accepted / d.total) * 100)
                          : 0
                      )
                    "
                    r="2.5"
                    fill="var(--success)"
                  />
                </g>
                <!-- X labels -->
                <text
                  v-for="item in importDayLabelItems"
                  :key="'ix' + item.i"
                  :x="importXPos(item.i)"
                  :y="svgH - 4"
                  text-anchor="middle"
                  class="axis-label"
                >
                  {{ item.label }}
                </text>
                <!-- Y labels -->
                <text
                  v-for="tick in importYTicks"
                  :key="'iy' + tick"
                  :x="padL - 4"
                  :y="importYPos(tick) + 4"
                  text-anchor="end"
                  class="axis-label"
                >
                  {{ tick }}%
                </text>
                <!-- Crosshair + Tooltip (last = renders on top) -->
                <line
                  v-if="importTooltip"
                  pointer-events="none"
                  :x1="importTooltip.px"
                  :y1="padT"
                  :x2="importTooltip.px"
                  :y2="svgH - padB"
                  stroke="var(--text-tertiary)"
                  stroke-width="0.5"
                  stroke-dasharray="2 2"
                />
                <g v-if="importTooltip" pointer-events="none">
                  <circle
                    :cx="importTooltip.px"
                    :cy="importTooltip.py"
                    r="5"
                    fill="none"
                    stroke="var(--success)"
                    stroke-width="1.5"
                    opacity="0.5"
                  />
                  <text
                    :x="tipLabelX(importTooltip)"
                    :y="tipLabelY(importTooltip)"
                    text-anchor="middle"
                    font-size="7.5"
                    font-weight="600"
                    font-family="inherit"
                    class="tip-label"
                    paint-order="stroke fill"
                    stroke="var(--bg-base)"
                    stroke-width="3"
                    stroke-linejoin="round"
                    fill="var(--text-primary)"
                  >
                    {{ importTooltip.label }}
                  </text>
                </g>
              </svg>
            </div>
          </div>

          <!-- Top corrected categories -->
          <div class="chart-card" v-if="importStats.topCorrected.length">
            <h3 class="chart-title">Most Corrected Suggestions</h3>
            <p class="chart-sub">Categories the AI suggested but you changed</p>
            <div class="bar-chart compact">
              <div
                v-for="item in importStats.topCorrected"
                :key="item.category"
                class="bar-row"
              >
                <div class="bar-label" :title="item.category">
                  {{ item.category }}
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill danger"
                    :style="{ width: barWidth(item.count, maxCorrectedCount) }"
                  ></div>
                </div>
                <div class="bar-value">{{ item.count }}</div>
              </div>
            </div>
          </div>

          <!-- Top chosen categories -->
          <div class="chart-card" v-if="importStats.topChosen.length">
            <h3 class="chart-title">Most Imported Into</h3>
            <p class="chart-sub">Categories you most often chose</p>
            <div class="bar-chart compact">
              <div
                v-for="item in importStats.topChosen"
                :key="item.category"
                class="bar-row"
              >
                <div class="bar-label" :title="item.category">
                  {{ item.category }}
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill accent"
                    :style="{ width: barWidth(item.count, maxChosenCount) }"
                  ></div>
                </div>
                <div class="bar-value">{{ item.count }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div class="section-header">
        <h3>Print Statistics</h3>
        <span class="section-sub">
          What is actually getting printed and how did it go?
        </span>
      </div>

      <div class="charts-grid">
        <!-- Print Rating Donut -->
        <div class="chart-card">
          <h3 class="chart-title">Print Ratings</h3>
          <div v-if="totalPrints === 0" class="chart-empty">No prints yet</div>
          <div v-else class="donut-wrapper">
            <svg class="donut-svg" viewBox="0 0 100 100">
              <!-- Background circle -->
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="var(--bg-surface)"
                stroke-width="14"
              />
              <!-- Good arc -->
              <circle
                cx="50"
                cy="50"
                r="38"
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
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="var(--danger)"
                stroke-width="14"
                stroke-dasharray="238.761"
                :stroke-dashoffset="donutOffset(badPrints, totalPrints)"
                stroke-linecap="round"
                :transform="`rotate(${-90 + goodDeg} 50 50)`"
              />
              <text
                x="50"
                y="46"
                text-anchor="middle"
                class="donut-center-label"
              >
                {{ totalPrints }}
              </text>
              <text x="50" y="58" text-anchor="middle" class="donut-center-sub">
                prints
              </text>
            </svg>
            <div class="donut-legend">
              <div class="legend-item">
                <span class="legend-dot good"></span>
                <span>Good</span>
                <strong>{{ goodPrints }}</strong>
                <span class="legend-pct">
                  {{ pct(goodPrints, totalPrints) }}
                </span>
              </div>
              <div class="legend-item">
                <span class="legend-dot bad"></span>
                <span>Bad</span>
                <strong>{{ badPrints }}</strong>
                <span class="legend-pct">
                  {{ pct(badPrints, totalPrints) }}
                </span>
              </div>
              <div v-if="unratedPrints > 0" class="legend-item">
                <span class="legend-dot unrated"></span>
                <span>Unrated</span>
                <strong>{{ unratedPrints }}</strong>
                <span class="legend-pct">
                  {{ pct(unratedPrints, totalPrints) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Printed Categories -->
        <div
          class="chart-card"
          v-if="detailedStats?.topPrintedCategories?.length"
        >
          <h3 class="chart-title">Most Printed Categories</h3>
          <div class="bar-chart compact">
            <div
              v-for="item in detailedStats.topPrintedCategories"
              :key="item.category"
              class="bar-row"
            >
              <div class="bar-label" :title="item.category">
                <router-link
                  v-if="item.category"
                  :to="{ name: 'browse', query: { category: item.category } }"
                  class="stat-link"
                >
                  {{ item.category }}
                </router-link>
                <span v-else>Uncategorized</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill accent"
                  :style="{
                    width: barWidth(item.print_count, maxPrintedCount),
                  }"
                ></div>
              </div>
              <div class="bar-value">{{ item.print_count }}</div>
            </div>
          </div>
        </div>

        <!-- Prints Over Time Line Chart -->
        <div class="chart-card wide">
          <div class="chart-header">
            <h3 class="chart-title">Prints Over Time</h3>
            <div
              class="range-selector"
              v-if="(detailedStats?.printsByMonth?.length || 0) > 0"
            >
              <button
                class="range-btn"
                :class="{ active: printRange === 30 }"
                @click="printRange = 30"
              >
                30d
              </button>
              <button
                class="range-btn"
                :class="{ active: printRange === 6 }"
                @click="printRange = 6"
              >
                6mo
              </button>
              <button
                class="range-btn"
                :class="{ active: printRange === 12 }"
                @click="printRange = 12"
              >
                1yr
              </button>
              <button
                class="range-btn"
                :class="{ active: printRange === 0 }"
                @click="printRange = 0"
              >
                All
              </button>
            </div>
          </div>
          <div v-if="!printData.length" class="chart-empty">
            No print history yet
          </div>
          <div v-else class="line-chart-wrapper">
            <svg class="line-chart-svg" :viewBox="`0 0 ${svgW} ${svgH}`">
              <!-- Grid lines -->
              <line
                v-for="tick in yTicks"
                :key="tick"
                :x1="padL"
                :y1="yPos(tick)"
                :x2="svgW - padR"
                :y2="yPos(tick)"
                stroke="var(--border-subtle)"
                stroke-width="1"
              />
              <!-- Area fill (good prints) -->
              <path :d="areaPath" fill="rgba(34,197,94,0.12)" />
              <!-- Line (total prints) -->
              <polyline
                :points="lineTotalPoints"
                fill="none"
                stroke="var(--accent-primary)"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <!-- Line (good prints) -->
              <polyline
                :points="lineGoodPoints"
                fill="none"
                stroke="var(--success)"
                stroke-width="1.5"
                stroke-dasharray="4 2"
                stroke-linejoin="round"
              />
              <!-- Hover groups + dots per data point -->
              <g
                v-for="(d, i) in printData"
                :key="`print-pt-${i}`"
                @mouseenter="showPrintTip(i)"
                @mouseleave="printTooltip = null"
                style="cursor: crosshair"
              >
                <rect
                  :x="xPos(i) - 6"
                  :y="padT"
                  width="12"
                  :height="svgH - padT - padB"
                  fill="transparent"
                />
                <circle
                  :cx="xPos(i)"
                  :cy="yPos(d.total)"
                  r="3"
                  fill="var(--accent-primary)"
                />
                <circle
                  :cx="xPos(i)"
                  :cy="yPos(d.good_count)"
                  r="2.5"
                  fill="var(--success)"
                />
              </g>
              <!-- X axis labels -->
              <text
                v-for="(item, i) in printXLabels"
                :key="i"
                :x="xPos(i)"
                :y="svgH - 4"
                text-anchor="middle"
                class="axis-label"
              >
                {{ item }}
              </text>
              <!-- Y axis labels -->
              <text
                v-for="tick in yTicks"
                :key="'y' + tick"
                :x="padL - 4"
                :y="yPos(tick) + 4"
                text-anchor="end"
                class="axis-label"
              >
                {{ tick }}
              </text>
              <!-- Crosshair + Tooltip (last = renders on top) -->
              <line
                v-if="printTooltip"
                pointer-events="none"
                :x1="printTooltip.px"
                :y1="padT"
                :x2="printTooltip.px"
                :y2="svgH - padB"
                stroke="var(--text-tertiary)"
                stroke-width="0.5"
                stroke-dasharray="2 2"
              />
              <g v-if="printTooltip" pointer-events="none">
                <circle
                  :cx="printTooltip.px"
                  :cy="printTooltip.py"
                  r="5"
                  fill="none"
                  stroke="var(--accent-primary)"
                  stroke-width="1.5"
                  opacity="0.5"
                />
                <text
                  :x="tipLabelX(printTooltip)"
                  :y="tipLabelY(printTooltip)"
                  text-anchor="middle"
                  font-size="7.5"
                  font-weight="600"
                  font-family="inherit"
                  class="tip-label"
                  paint-order="stroke fill"
                  stroke="var(--bg-base)"
                  stroke-width="3"
                  stroke-linejoin="round"
                  fill="var(--text-primary)"
                >
                  {{ printTooltip.label }}
                </text>
              </g>
            </svg>
            <div class="line-legend">
              <span class="line-legend-item">
                <span
                  class="line-swatch"
                  style="background: var(--accent-primary)"
                ></span>
                Total
              </span>
              <span class="line-legend-item">
                <span
                  class="line-swatch dashed"
                  style="background: var(--success)"
                ></span>
                Good
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="section-header">
        <h3>Model Statistics</h3>
        <span class="section-sub">
          What does our overall catalog look like?
        </span>
      </div>

      <div class="charts-grid">
        <!-- Models per Category Bar Chart -->
        <div class="chart-card wide">
          <h3 class="chart-title">Models by Category</h3>
          <div
            v-if="!detailedStats?.modelsByCategory?.length"
            class="chart-empty"
          >
            No data
          </div>
          <div v-else class="bar-chart">
            <div
              v-for="item in detailedStats.modelsByCategory"
              :key="item.category"
              class="bar-row"
            >
              <div class="bar-label" :title="item.category">
                <router-link
                  v-if="item.category"
                  :to="{ name: 'browse', query: { category: item.category } }"
                  class="stat-link"
                >
                  {{ item.category }}
                </router-link>
                <span v-else>Uncategorized</span>
              </div>
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

        <!-- Models Added Over Time Line Chart -->
        <div
          class="chart-card wide"
          v-if="detailedStats?.modelsAddedByMonth?.length"
        >
          <div class="chart-header">
            <h3 class="chart-title">Models Added Over Time</h3>
            <div
              class="range-selector"
              v-if="(detailedStats?.modelsAddedByMonth?.length || 0) > 0"
            >
              <button
                class="range-btn"
                :class="{ active: addedRange === 6 }"
                @click="addedRange = 6"
              >
                6mo
              </button>
              <button
                class="range-btn"
                :class="{ active: addedRange === 12 }"
                @click="addedRange = 12"
              >
                1yr
              </button>
              <button
                class="range-btn"
                :class="{ active: addedRange === 0 }"
                @click="addedRange = 0"
              >
                All
              </button>
            </div>
          </div>
          <div class="line-chart-wrapper">
            <svg class="line-chart-svg" :viewBox="`0 0 ${svgW} ${svgH}`">
              <line
                v-for="tick in addedYTicks"
                :key="tick"
                :x1="padL"
                :y1="addedYPos(tick)"
                :x2="svgW - padR"
                :y2="addedYPos(tick)"
                stroke="var(--border-subtle)"
                stroke-width="1"
              />
              <path :d="addedAreaPath" fill="rgba(34,211,238,0.1)" />
              <polyline
                :points="addedLinePoints"
                fill="none"
                stroke="var(--accent-primary)"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <!-- Hover groups + dots per data point -->
              <g
                v-for="(d, i) in addedData"
                :key="`added-pt-${i}`"
                @mouseenter="showAddedTip(i)"
                @mouseleave="addedTooltip = null"
                style="cursor: crosshair"
              >
                <rect
                  :x="addedXPos(i) - 6"
                  :y="padT"
                  width="12"
                  :height="svgH - padT - padB"
                  fill="transparent"
                />
                <circle
                  :cx="addedXPos(i)"
                  :cy="addedYPos(d.count)"
                  r="3"
                  fill="var(--accent-primary)"
                />
              </g>
              <text
                v-for="(item, i) in addedMonthLabels"
                :key="i"
                :x="addedXPos(i)"
                :y="svgH - 4"
                text-anchor="middle"
                class="axis-label"
              >
                {{ item }}
              </text>
              <text
                v-for="tick in addedYTicks"
                :key="'ay' + tick"
                :x="padL - 4"
                :y="addedYPos(tick) + 4"
                text-anchor="end"
                class="axis-label"
              >
                {{ tick }}
              </text>
              <!-- Crosshair + Tooltip (last = renders on top) -->
              <line
                v-if="addedTooltip"
                pointer-events="none"
                :x1="addedTooltip.px"
                :y1="padT"
                :x2="addedTooltip.px"
                :y2="svgH - padB"
                stroke="var(--text-tertiary)"
                stroke-width="0.5"
                stroke-dasharray="2 2"
              />
              <g v-if="addedTooltip" pointer-events="none">
                <circle
                  :cx="addedTooltip.px"
                  :cy="addedTooltip.py"
                  r="5"
                  fill="none"
                  stroke="var(--accent-primary)"
                  stroke-width="1.5"
                  opacity="0.5"
                />
                <text
                  :x="tipLabelX(addedTooltip)"
                  :y="tipLabelY(addedTooltip)"
                  text-anchor="middle"
                  font-size="7.5"
                  font-weight="600"
                  font-family="inherit"
                  class="tip-label"
                  paint-order="stroke fill"
                  stroke="var(--bg-base)"
                  stroke-width="3"
                  stroke-linejoin="round"
                  fill="var(--text-primary)"
                >
                  {{ addedTooltip.label }}
                </text>
              </g>
            </svg>
          </div>
        </div>

        <!-- File Type Breakdown -->
        <!-- <div class="chart-card" v-if="detailedStats?.fileTypes?.length">
          <h3 class="chart-title">File Types</h3>
          <div class="bar-chart compact">
            <div
              v-for="item in detailedStats.fileTypes"
              :key="item.file_type"
              class="bar-row"
            >
              <div class="bar-label">
                {{ (item.file_type || 'unknown').toUpperCase() }}
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill purple"
                  :style="{ width: barWidth(item.count, maxFileTypeCount) }"
                ></div>
              </div>
              <div class="bar-value">{{ item.count.toLocaleString() }}</div>
            </div>
          </div>
        </div> -->

        <!-- Tag Stats -->
        <div class="chart-card" v-if="detailedStats?.tagStats?.length">
          <h3 class="chart-title">Top Tags</h3>
          <div class="tag-stats">
            <div
              v-for="tag in detailedStats.tagStats"
              :key="tag.name"
              class="tag-stat-row"
            >
              <span class="tag-chip">{{ tag.name }}</span>
              <div class="bar-track small">
                <div
                  class="bar-fill accent"
                  :style="{ width: barWidth(tag.model_count, maxTagCount) }"
                ></div>
              </div>
              <span class="tag-count">{{ tag.model_count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Designer Statistics -->
      <template v-if="designerStats && designerStats.totalDesigners > 0">
        <div class="section-header">
          <h3>Designer Statistics</h3>
          <span class="section-sub">Who's making what you print</span>
        </div>

        <div class="summary-cards">
          <div class="stat-card">
            <div class="stat-icon designer-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                {{ designerStats.totalDesigners.toLocaleString() }}
              </div>
              <div class="stat-label">Designers</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon designer-linked-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
                />
                <path
                  d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
                />
              </svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                {{ designerStats.modelsWithDesigner.toLocaleString() }}
              </div>
              <div class="stat-label">Models Linked</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon designer-avg-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                {{
                  designerStats.totalDesigners > 0
                    ? Math.round(
                        (designerStats.modelsWithDesigner /
                          designerStats.totalDesigners) *
                          10
                      ) / 10
                    : 0
                }}
              </div>
              <div class="stat-label">Avg Models/Designer</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon designer-fav-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
                />
              </svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                {{ designerStats.favoritedDesigners.toLocaleString() }}
              </div>
              <div class="stat-label">Favorited</div>
            </div>
          </div>
        </div>

        <div class="charts-grid">
          <!-- Top designers by collection size -->
          <div
            class="chart-card wide"
            v-if="designerStats.topByModelCount.length"
          >
            <h3 class="chart-title">Top Designers by Collection Size</h3>
            <div class="bar-chart compact">
              <div
                v-for="item in designerStats.topByModelCount"
                :key="item.name"
                class="bar-row"
              >
                <div class="bar-label" :title="item.name">
                  <router-link :to="`/designers/${item.id}`" class="stat-link">
                    {{ item.name }}
                  </router-link>
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill purple"
                    :style="{
                      width: barWidth(item.model_count, maxDesignerModelCount),
                    }"
                  ></div>
                </div>
                <div class="bar-value">
                  {{ item.model_count.toLocaleString() }}
                </div>
              </div>
            </div>
          </div>

          <!-- Most printed designers -->
          <div class="chart-card" v-if="designerStats.topByPrintCount.length">
            <h3 class="chart-title">Most Printed Designers</h3>
            <div class="bar-chart compact">
              <div
                v-for="item in designerStats.topByPrintCount"
                :key="item.name"
                class="bar-row"
              >
                <div class="bar-label" :title="item.name">
                  <router-link :to="`/designers/${item.id}`" class="stat-link">
                    {{ item.name }}
                  </router-link>
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill accent"
                    :style="{
                      width: barWidth(item.print_count, maxDesignerPrintCount),
                    }"
                  ></div>
                </div>
                <div class="bar-value">{{ item.print_count }}</div>
              </div>
            </div>
          </div>

          <!-- Print quality by designer -->
          <div class="chart-card" v-if="designerStats.printQuality.length">
            <h3 class="chart-title">Print Quality by Designer</h3>
            <p class="chart-sub">
              % good prints, for designers with at least one print
            </p>
            <div class="bar-chart compact">
              <div
                v-for="item in designerStats.printQuality"
                :key="item.name"
                class="bar-row designer-quality-row"
              >
                <div class="bar-label" :title="item.name">
                  <router-link :to="`/designers/${item.id}`" class="stat-link">
                    {{ item.name }}
                  </router-link>
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill"
                    :class="qualityBarClass(designerGoodPct(item))"
                    :style="{ width: designerGoodPct(item) + '%' }"
                  ></div>
                </div>
                <div class="bar-value">{{ designerGoodPct(item) }}%</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { systemApi, ingestionApi } from '../services/api';

interface DetailedStats {
  modelsByCategory: Array<{ category: string; count: number }>;
  printsByMonth: Array<{
    month: string;
    total: number;
    good_count: number;
    bad_count: number;
  }>;
  printsByDay: Array<{
    day: string;
    total: number;
    good_count: number;
    bad_count: number;
  }>;
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

interface DesignerStats {
  totalDesigners: number;
  favoritedDesigners: number;
  modelsWithDesigner: number;
  topByModelCount: Array<{ id: number; name: string; model_count: number }>;
  topByPrintCount: Array<{ id: number; name: string; print_count: number }>;
  printQuality: Array<{
    id: number;
    name: string;
    good_count: number;
    bad_count: number;
    total_prints: number;
  }>;
}

interface ImportStats {
  totalImports: number;
  acceptanceRate: number;
  byDay: Array<{ day: string; total: number; accepted: number }>;
  topCorrected: Array<{ category: string; count: number }>;
  topChosen: Array<{ category: string; count: number }>;
  byConfidence: Array<{ confidence: string; total: number; accepted: number }>;
}

const loading = ref(true);
const basicStats = ref({
  totalModels: 0,
  totalFavorites: 0,
  totalPrinted: 0,
  totalQueued: 0,
  totalLooseFiles: 0,
});
const detailedStats = ref<DetailedStats | null>(null);
const importStats = ref<ImportStats | null>(null);
const designerStats = ref<DesignerStats | null>(null);

// SVG chart dimensions
const svgW = 560;
const svgH = 140;
const padL = 28;
const padR = 12;
const padT = 10;
const padB = 20;

onMounted(async () => {
  try {
    const [basicRes, detailRes, importRes, designerRes] = await Promise.all([
      systemApi.getStats(),
      systemApi.getDetailedStats(),
      ingestionApi.getImportStats(),
      systemApi.getDesignerStats(),
    ]);
    basicStats.value = basicRes.data;
    detailedStats.value = detailRes.data;
    importStats.value = importRes.data;
    designerStats.value = designerRes.data;
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
  Math.max(
    ...(detailedStats.value?.modelsByCategory.map((x) => x.count) || [1])
  )
);

// --- Print rating donut ---
const goodPrints = computed(() => detailedStats.value?.printRatings?.good || 0);
const badPrints = computed(() => detailedStats.value?.printRatings?.bad || 0);
const unratedPrints = computed(
  () => detailedStats.value?.printRatings?.unrated || 0
);
const totalPrints = computed(
  () => goodPrints.value + badPrints.value + unratedPrints.value
);

// r=38, circumference = 2*pi*38 ≈ 238.76
const CIRC = 238.761;

function donutOffset(count: number, total: number): number {
  if (!total) return CIRC;
  const filled = (count / total) * CIRC;
  return CIRC - filled;
}

const goodDeg = computed(
  () => (goodPrints.value / (totalPrints.value || 1)) * 360
);

// --- Prints over time line chart ---
const printRange = ref(30); // 30 = last 30 days; 6/12 = months; 0 = all
const printData = computed(() => {
  if (printRange.value === 30) {
    const all = detailedStats.value?.printsByDay || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return all
      .filter((d) => d.day >= cutoffStr)
      .map((d) => ({
        month: d.day,
        total: d.total,
        good_count: d.good_count,
        bad_count: d.bad_count,
      }));
  }
  const all = detailedStats.value?.printsByMonth || [];
  if (printRange.value === 0) return all;
  return all.slice(-printRange.value);
});

const maxPrintVal = computed(() =>
  Math.max(...printData.value.map((d) => d.total), 1)
);

function niceMax(val: number): number {
  if (val <= 5) return 5;
  const step = Math.ceil(val / 4);
  return step * 4;
}

const yMax = computed(() => niceMax(maxPrintVal.value));
const yTicks = computed(() => {
  const m = yMax.value;
  const step = m / 4;
  return [0, step, step * 2, step * 3, m].map((v) => Math.round(v));
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
  const pts = printData.value
    .map((d, i) => `${xPos(i)},${yPos(d.good_count)}`)
    .join(' L ');
  return `M ${xPos(0)},${base} L ${pts} L ${xPos(n - 1)},${base} Z`;
});

const printXLabels = computed(() => {
  const data = printData.value;
  const n = data.length;
  if (n === 0) return [];
  if (printRange.value === 30) {
    // Daily: show up to ~8 labels as "Mon D"
    const step = Math.max(1, Math.round(n / 8));
    return data.map((d, i) => {
      if (i % step !== 0 && i !== n - 1) return '';
      const date = new Date(d.month + 'T00:00:00');
      return (
        date.toLocaleString('default', { month: 'short' }) +
        ' ' +
        date.getDate()
      );
    });
  }
  // Monthly: show "MM" (e.g. "03")
  return data.map((d) => d.month.slice(5));
});

// --- Models added over time ---
const addedRange = ref(12); // months; 0 = all
const addedData = computed(() => {
  const all = detailedStats.value?.modelsAddedByMonth || [];
  if (addedRange.value === 0) return all;
  return all.slice(-addedRange.value);
});
const maxAddedVal = computed(() =>
  Math.max(...addedData.value.map((d) => d.count), 1)
);
const addedYMax = computed(() => niceMax(maxAddedVal.value));
const addedYTicks = computed(() => {
  const m = addedYMax.value;
  const step = m / 4;
  return [0, step, step * 2, step * 3, m].map((v) => Math.round(v));
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
  addedData.value
    .map((d, i) => `${addedXPos(i)},${addedYPos(d.count)}`)
    .join(' ')
);

const addedAreaPath = computed(() => {
  if (!addedData.value.length) return '';
  const n = addedData.value.length;
  const base = addedYPos(0);
  const pts = addedData.value
    .map((d, i) => `${addedXPos(i)},${addedYPos(d.count)}`)
    .join(' L ');
  return `M ${addedXPos(0)},${base} L ${pts} L ${addedXPos(n - 1)},${base} Z`;
});

const addedMonthLabels = computed(() =>
  addedData.value.map((d) => d.month.slice(5))
);

// --- Top printed categories ---
const maxPrintedCount = computed(() =>
  Math.max(
    ...(detailedStats.value?.topPrintedCategories.map((x) => x.print_count) || [
      1,
    ])
  )
);

// --- Tag stats ---
const maxTagCount = computed(() =>
  Math.max(...(detailedStats.value?.tagStats.map((x) => x.model_count) || [1]))
);

// --- Designer stats ---
const maxDesignerModelCount = computed(() =>
  Math.max(
    ...(designerStats.value?.topByModelCount.map((x) => x.model_count) || [1])
  )
);

const maxDesignerPrintCount = computed(() =>
  Math.max(
    ...(designerStats.value?.topByPrintCount.map((x) => x.print_count) || [1])
  )
);

function designerGoodPct(item: {
  good_count: number;
  total_prints: number;
}): number {
  if (!item.total_prints) return 0;
  return Math.round((item.good_count / item.total_prints) * 100);
}

function qualityBarClass(goodPct: number): string {
  if (goodPct >= 75) return 'accent';
  if (goodPct < 50) return 'danger';
  return '';
}

// --- Import quality ---
const sortedConfidence = computed(() => {
  const order = ['high', 'medium', 'low'];
  return [...(importStats.value?.byConfidence || [])].sort(
    (a, b) => order.indexOf(a.confidence) - order.indexOf(b.confidence)
  );
});

const maxCorrectedCount = computed(() =>
  Math.max(...(importStats.value?.topCorrected.map((x) => x.count) || [1]))
);

const maxChosenCount = computed(() =>
  Math.max(...(importStats.value?.topChosen.map((x) => x.count) || [1]))
);

// Import rate line chart — daily, Y axis is 0–100 (%)
const importRange = ref(30); // days; 0 = all

const importDayData = computed(() => {
  const all = (importStats.value?.byDay || []).filter((d) => d.total > 0);
  if (importRange.value === 0) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - importRange.value);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return all.filter((d) => d.day >= cutoffStr);
});

function importXPos(i: number): number {
  const n = importDayData.value.length;
  if (n <= 1) return padL + (svgW - padL - padR) / 2;
  return padL + (i / (n - 1)) * (svgW - padL - padR);
}

function importYPos(val: number): number {
  return padT + (svgH - padT - padB) * (1 - val / 100);
}

const importYTicks = [0, 25, 50, 75, 100];

const importLinePoints = computed(() =>
  importDayData.value
    .map((d, i) => {
      const rate = d.total > 0 ? Math.round((d.accepted / d.total) * 100) : 0;
      return `${importXPos(i)},${importYPos(rate)}`;
    })
    .join(' ')
);

const importAreaPath = computed(() => {
  if (!importDayData.value.length) return '';
  const n = importDayData.value.length;
  const base = importYPos(0);
  const pts = importDayData.value
    .map((d, i) => {
      const rate = d.total > 0 ? Math.round((d.accepted / d.total) * 100) : 0;
      return `${importXPos(i)},${importYPos(rate)}`;
    })
    .join(' L ');
  return `M ${importXPos(0)},${base} L ${pts} L ${importXPos(n - 1)},${base} Z`;
});

const importDayLabelItems = computed(() => {
  const data = importDayData.value;
  const n = data.length;
  if (n === 0) return [];
  const step = Math.max(1, Math.round(n / 8));
  const items: Array<{ i: number; label: string }> = [];
  for (let i = 0; i < n; i++) {
    if (i % step === 0 || i === n - 1) {
      const date = new Date(data[i].day + 'T00:00:00');
      const month = date.toLocaleString('default', { month: 'short' });
      items.push({ i, label: `${month} ${date.getDate()}` });
    }
  }
  return items;
});

// --- SVG chart tooltips ---
interface SvgTooltip {
  px: number;
  py: number;
  label: string;
}
const printTooltip = ref<SvgTooltip | null>(null);
const addedTooltip = ref<SvgTooltip | null>(null);
const importTooltip = ref<SvgTooltip | null>(null);

function tipLabelX(t: SvgTooltip): number {
  return Math.max(40, Math.min(svgW - 40, t.px));
}
function tipLabelY(t: SvgTooltip): number {
  return t.py < padT + 14 ? t.py + 18 : t.py - 12;
}

function showPrintTip(i: number) {
  const d = printData.value[i];
  printTooltip.value = {
    px: xPos(i),
    py: yPos(d.total),
    label: `${d.total} total · ${d.good_count} good`,
  };
}
function showAddedTip(i: number) {
  const d = addedData.value[i];
  addedTooltip.value = {
    px: addedXPos(i),
    py: addedYPos(d.count),
    label: `${d.count.toLocaleString()} added`,
  };
}
function showImportTip(i: number) {
  const d = importDayData.value[i];
  const rate = d.total > 0 ? Math.round((d.accepted / d.total) * 100) : 0;
  importTooltip.value = {
    px: importXPos(i),
    py: importYPos(rate),
    label: `${rate}% · ${d.accepted}/${d.total}`,
  };
}
</script>

<style scoped>
.stats-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  grid-template-columns: repeat(4, 1fr);
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

.models-icon {
  background: rgba(34, 211, 238, 0.12);
  color: var(--accent-primary);
}
.printed-icon {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success);
}
.fav-icon {
  background: rgba(251, 191, 36, 0.12);
  color: var(--warning);
}
.queue-icon {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
}
.storage-icon {
  background: rgba(249, 115, 22, 0.12);
  color: #fb923c;
}
.files-icon {
  background: rgba(236, 72, 153, 0.12);
  color: #f472b6;
}
.time-icon {
  background: rgba(34, 211, 238, 0.12);
  color: var(--accent-primary);
}
.filament-icon {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success);
}

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

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.chart-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.range-selector {
  display: flex;
  gap: 2px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  padding: 2px;
  flex-shrink: 0;
}

.range-btn {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border: none;
  border-radius: calc(var(--radius-sm) - 1px);
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition:
    background var(--transition-base),
    color var(--transition-base);
  line-height: 1.4;
}

.range-btn:hover {
  color: var(--text-secondary);
}

.range-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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

.stat-link {
  color: inherit;
  text-decoration: none;
}
.stat-link:hover {
  color: var(--accent-primary);
  text-decoration: underline;
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
  background: linear-gradient(
    90deg,
    rgba(34, 211, 238, 0.6),
    var(--accent-primary)
  );
  border-radius: 5px;
  transition: width 0.6s ease;
}

.bar-fill.accent {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.5), var(--success));
}

.bar-fill.purple {
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.5), #a78bfa);
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

.legend-dot.good {
  background: var(--success);
}
.legend-dot.bad {
  background: var(--danger);
}
.legend-dot.unrated {
  background: var(--text-muted, #666);
}

/* Line Chart */
.line-chart-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.line-chart-svg {
  width: 100%;
  aspect-ratio: 560 / 140;
  overflow: visible;
}

.axis-label {
  font-size: 8px;
  fill: var(--text-tertiary);
  font-family: inherit;
}

.tip-label {
  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 3px rgba(0, 0, 0, 0.9));
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
    var(--success) 0,
    var(--success) 4px,
    transparent 4px,
    transparent 6px
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

/* Import quality section */
.section-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-top: 0.5rem;
}

.section-header h3 {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
}

.section-sub {
  font-size: 0.875rem;
  color: var(--text-tertiary);
}

.chart-sub {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: -0.5rem;
}

.import-icon {
  background: rgba(34, 211, 238, 0.12);
  color: var(--accent-primary);
}
.accept-icon {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success);
}
.high-conf-icon {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success);
}
.medium-conf-icon {
  background: rgba(251, 191, 36, 0.12);
  color: var(--warning);
}
.low-conf-icon {
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-tertiary);
}

.confidence-badge {
  display: inline-block;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
}

.confidence-badge.high {
  color: var(--success);
}
.confidence-badge.medium {
  color: var(--warning);
}
.confidence-badge.low {
  background: var(--bg-elevated);
  color: var(--text-tertiary);
}

.bar-fill.danger {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.5), #ef4444);
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
  to {
    transform: rotate(360deg);
  }
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
