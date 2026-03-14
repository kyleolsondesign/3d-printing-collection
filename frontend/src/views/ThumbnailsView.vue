<template>
  <div class="thumbnails-view">
    <div class="header">
      <div class="header-left">
        <button @click="router.push('/settings')" class="back-btn" title="Back to Settings">
          <AppIcon name="chevron-left" />
        </button>
        <h2>Generate Thumbnails</h2>
        <span class="count-badge" v-if="jobs.length > 0">{{ jobs.length }}</span>
      </div>
      <p class="subtitle">
        Render 3D previews for models without thumbnail images. STL and 3MF files only.
      </p>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading models without images…</span>
    </div>

    <div v-else-if="jobs.length === 0" class="empty-state">
      <div class="empty-icon">
        <AppIcon name="check-circle" stroke-width="1.5" />
      </div>
      <h3>All caught up!</h3>
      <p v-if="includeZipOnly">All models without thumbnails have been processed.</p>
      <template v-else>
        <p>All models with STL or 3MF files already have thumbnails.</p>
        <button class="btn-enable-zip" @click="includeZipOnly = true">
          Check zip-only models too
        </button>
      </template>
    </div>

    <template v-else>
      <!-- Sticky Toolbar -->
      <div class="toolbar">
        <div class="toolbar-left">
          <label class="select-all-wrap">
            <input
              type="checkbox"
              class="select-all-check"
              :checked="allSelected"
              :indeterminate="someSelected && !allSelected"
              @change="toggleSelectAll"
            />
          </label>
          <span class="selection-count">
            <template v-if="selectedIds.size > 0">{{ selectedIds.size }} selected</template>
            <template v-else>{{ jobs.length }} models</template>
          </span>
          <span class="stat-pill">{{ doneCount }} done</span>
          <span class="stat-pill warn" v-if="skippedCount > 0">{{ skippedCount }} skipped</span>
          <span class="stat-pill err" v-if="errorCount > 0">{{ errorCount }} failed</span>
        </div>
        <div class="toolbar-right">
          <label class="zip-toggle" :class="{ active: includeZipOnly }">
            <input
              type="checkbox"
              v-model="includeZipOnly"
              :disabled="isProcessing || isRescanning"
            />
            Include zip-only models
          </label>
          <button class="btn-refresh" :disabled="isProcessing || isRescanning" @click="loadJobs">
            <AppIcon name="refresh" />
            Refresh
          </button>
          <button
            v-if="includeZipOnly"
            class="btn-rescan"
            :disabled="isProcessing || isRescanning || selectedIds.size === 0"
            @click="rescanSelected"
          >
            <div v-if="isRescanning" class="btn-spinner"></div>
            {{ isRescanning ? 'Rescanning…' : `Rescan${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}` }}
          </button>
          <button
            class="btn-generate-bulk"
            :disabled="isProcessing || isRescanning || selectedIds.size === 0"
            @click="processSelected"
          >
            <div v-if="isProcessing" class="btn-spinner"></div>
            {{ isProcessing ? 'Processing…' : `Generate${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}` }}
          </button>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar-wrapper" v-if="isProcessing || doneCount > 0">
        <div class="progress-bar" :style="{ width: progressPct + '%' }"></div>
        <span class="progress-label">{{ progressPct }}%</span>
      </div>

      <!-- Table card -->
      <div class="job-table">
        <div class="job-table-header">
          <div class="col-check"></div>
          <div class="col-thumb"></div>
          <div class="col-name">Model</div>
          <div class="col-status">Status</div>
          <div class="col-action"></div>
        </div>

        <div
          v-for="job in jobs"
          :key="job.model.id"
          :class="['job-row', job.status, { selected: selectedIds.has(job.model.id) }]"
          @click="openModal(job.model.id)"
        >
          <div class="col-check" @click.stop>
            <input
              type="checkbox"
              class="row-check"
              :checked="selectedIds.has(job.model.id)"
              @change="toggleSelect(job.model.id)"
            />
          </div>
          <div class="col-thumb">
            <div class="job-thumb">
              <img
                v-if="job.model.primaryImage"
                :src="getImageUrl(job.model.primaryImage)"
                alt=""
              />
              <span v-else class="thumb-placeholder">
                <AppIcon name="package" stroke-width="1.5" />
              </span>
            </div>
          </div>
          <div class="col-name">
            <span class="job-name">{{ job.model.filename }}</span>
            <span class="job-meta">{{ job.model.category }} · {{ job.model.file_count }} file{{ job.model.file_count !== 1 ? 's' : '' }}</span>
          </div>
          <div class="col-status">
            <span :class="['status-badge', job.status]">
              <div v-if="['fetching-files','extracting','rendering','saving'].includes(job.status)" class="status-spinner"></div>
              {{ statusLabel(job.status) }}
            </span>
            <span v-if="job.error" class="error-detail">{{ job.error }}</span>
          </div>
          <div class="col-action" @click.stop>
            <button
              v-if="job.status === 'idle' || job.status === 'error'"
              :disabled="isProcessing"
              class="btn-row-generate"
              @click="processSingle(job)"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Hidden headless viewer for sequential processing -->
    <div class="headless-viewer-host" aria-hidden="true">
      <ModelViewer
        v-if="activeJob"
        :key="activeJob.model.id"
        :modelFiles="activeJob.files"
        :modelId="activeJob.model.id"
        mode="headless"
        @imageCaptured="onHeadlessCapture"
        @error="onHeadlessError"
      />
    </div>

    <ModelDetailsModal
      v-if="selectedModelId"
      :modelId="selectedModelId"
      @close="selectedModelId = null"
      @navigate="selectedModelId = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { modelsApi, type Model } from '../services/api'
import AppIcon from '../components/AppIcon.vue'
import ModelViewer from '../components/ModelViewer.vue'
import ModelDetailsModal from '../components/ModelDetailsModal.vue'

interface ModelFile {
  id: number
  model_id: number
  filename: string
  filepath: string
  file_size: number
  file_type: string
}

type JobStatus = 'idle' | 'fetching-files' | 'extracting' | 'rendering' | 'saving' | 'done' | 'error' | 'skipped'

interface ThumbnailJob {
  model: Model & { primaryImage?: string | null }
  files: ModelFile[]
  status: JobStatus
  error?: string
  tempFilePath?: string
}

const router = useRouter()
const loading = ref(false)
const isProcessing = ref(false)
const isRescanning = ref(false)
const jobs = ref<ThumbnailJob[]>([])
const activeJob = ref<ThumbnailJob | null>(null)
const selectedIds = ref<Set<number>>(new Set())
const selectedModelId = ref<number | null>(null)
const includeZipOnly = ref(false)
let pendingResolve: (() => void) | null = null
let pendingReject: ((e: unknown) => void) | null = null

const doneCount = computed(() => jobs.value.filter(j => j.status === 'done').length)
const skippedCount = computed(() => jobs.value.filter(j => j.status === 'skipped').length)
const errorCount = computed(() => jobs.value.filter(j => j.status === 'error').length)
const allSelected = computed(() => jobs.value.length > 0 && selectedIds.value.size === jobs.value.length)
const someSelected = computed(() => selectedIds.value.size > 0)
const progressPct = computed(() => {
  if (jobs.value.length === 0) return 0
  const finished = jobs.value.filter(j => ['done', 'skipped', 'error'].includes(j.status)).length
  return Math.round((finished / jobs.value.length) * 100)
})

function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'idle': return 'Pending'
    case 'fetching-files': return 'Loading…'
    case 'extracting': return 'Extracting…'
    case 'rendering': return 'Rendering…'
    case 'saving': return 'Saving…'
    case 'done': return 'Done'
    case 'error': return 'Failed'
    case 'skipped': return 'No 3D files'
    default: return status
  }
}

function getImageUrl(filepath: string): string {
  return modelsApi.getFileUrl(filepath)
}

async function loadJobs() {
  loading.value = true
  try {
    const params = includeZipOnly.value
      ? { noImage: true, limit: 500 }
      : { noImage: true, hasPreviewFiles: true, limit: 500 }
    const resp = await modelsApi.getAll(params)
    const models = resp.data.models as Array<Model & { primaryImage?: string | null }>
    jobs.value = models.map(m => ({
      model: m,
      files: [],
      status: 'idle',
    }))
  } catch (err) {
    console.error('Failed to load models without images:', err)
  } finally {
    loading.value = false
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(jobs.value.map(j => j.model.id))
  }
}

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function openModal(id: number) {
  selectedModelId.value = id
}

async function processSelected() {
  isProcessing.value = true
  const toProcess = jobs.value.filter(j => selectedIds.value.has(j.model.id) && !['done', 'skipped'].includes(j.status))
  for (const job of toProcess) {
    try {
      await processJob(job)
    } catch {
      // continue to next job even if one fails
    }
  }
  isProcessing.value = false
}

async function rescanSelected() {
  if (selectedIds.value.size === 0) return
  isRescanning.value = true
  try {
    await modelsApi.bulkRescan(Array.from(selectedIds.value))
    await loadJobs()
    selectedIds.value = new Set()
  } catch (err) {
    console.error('Rescan failed:', err)
  } finally {
    isRescanning.value = false
  }
}

async function processSingle(job: ThumbnailJob) {
  isProcessing.value = true
  try {
    await processJob(job)
  } catch {
    // error already recorded in job
  } finally {
    isProcessing.value = false
  }
}

async function processJob(job: ThumbnailJob) {
  if (job.files.length === 0) {
    job.status = 'fetching-files'
    try {
      const filesResp = await modelsApi.getFiles(job.model.id)
      job.files = filesResp.data.files
    } catch (err) {
      job.status = 'error'
      job.error = 'Failed to load files'
      return
    }
  }

  const previewable = job.files.filter(f =>
    ['stl', '3mf'].includes(f.file_type?.toLowerCase() ?? '')
  )

  if (previewable.length === 0) {
    if (!includeZipOnly.value) {
      job.status = 'skipped'
      return
    }
    // Try to extract a temp STL/3MF from the model's zip archives
    job.status = 'extracting'
    try {
      const extractResp = await modelsApi.extractTempModel(job.model.id)
      const tempFile: ModelFile = extractResp.data.tempFile
      job.tempFilePath = tempFile.filepath
      job.files = [tempFile]
    } catch (err) {
      job.status = 'error'
      job.error = 'No previewable file in archives'
      return
    }
  }

  job.status = 'rendering'
  activeJob.value = job

  await new Promise<void>((resolve, reject) => {
    pendingResolve = resolve
    pendingReject = reject
  })
}

async function onHeadlessCapture(dataUrl: string) {
  const job = activeJob.value
  if (!job) return
  job.status = 'saving'
  try {
    await modelsApi.savePreviewImage(job.model.id, dataUrl)
    job.status = 'done'
  } catch (err) {
    job.status = 'error'
    job.error = 'Failed to save image'
    pendingReject?.(err)
    pendingReject = null
    pendingResolve = null
    activeJob.value = null
    cleanupTempFile(job)
    return
  }
  const resolve = pendingResolve
  pendingResolve = null
  pendingReject = null
  activeJob.value = null
  cleanupTempFile(job)
  resolve?.()
}

function onHeadlessError(message: string) {
  const job = activeJob.value
  if (!job) return
  job.status = 'error'
  job.error = message
  const reject = pendingReject
  pendingReject = null
  pendingResolve = null
  activeJob.value = null
  cleanupTempFile(job)
  reject?.(new Error(message))
}

function cleanupTempFile(job: ThumbnailJob) {
  if (job.tempFilePath) {
    modelsApi.cleanupTempModel(job.tempFilePath).catch(() => {/* ignore */})
    job.tempFilePath = undefined
    // Reset files so the job doesn't re-use the (now deleted) temp path on retry
    job.files = []
  }
}

watch(includeZipOnly, () => {
  if (!isProcessing.value) loadJobs()
})

onMounted(loadJobs)
</script>

<style scoped>
.thumbnails-view {
  padding: 1.5rem;
  max-width: 900px;
  margin: 0 auto;
}

/* ── Header ── */
.header {
  margin-bottom: 1.25rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.375rem;
}

.header-left h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}
.back-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

.count-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
  color: var(--accent-primary);
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

/* ── States ── */
.loading-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3rem;
  justify-content: center;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--success);
}
.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}
.empty-icon svg { width: 48px; height: 48px; }

.btn-enable-zip {
  margin-top: 1rem;
  padding: 0.5rem 1.25rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-enable-zip:hover { background: var(--bg-hover); }
.empty-state h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}
.empty-state p { font-size: 0.875rem; color: var(--text-secondary); }

/* ── Sticky Toolbar ── */
.toolbar {
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
  margin-bottom: 0.75rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.select-all-wrap {
  cursor: pointer;
  display: flex;
  align-items: center;
}

.select-all-check {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.selection-count {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.stat-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--bg-elevated);
  color: var(--text-tertiary);
  border: 1px solid var(--border-subtle);
}
.stat-pill.warn { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); background: color-mix(in srgb, var(--warning) 8%, transparent); }
.stat-pill.err { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); background: color-mix(in srgb, var(--danger) 8%, transparent); }

.zip-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.zip-toggle input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}
.zip-toggle.active {
  color: var(--accent-primary);
}
.zip-toggle input:disabled { cursor: not-allowed; }

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.45rem 0.875rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-refresh:hover:not(:disabled) { background: var(--bg-hover); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-refresh svg { width: 14px; height: 14px; }

.btn-rescan {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.45rem 1rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-rescan:hover:not(:disabled) { background: var(--bg-hover); }
.btn-rescan:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-generate-bulk {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.45rem 1rem;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-generate-bulk:hover:not(:disabled) { background: var(--accent-secondary); transform: translateY(-1px); }
.btn-generate-bulk:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

/* ── Progress bar ── */
.progress-bar-wrapper {
  height: 3px;
  background: var(--border-subtle);
  border-radius: 2px;
  margin-bottom: 0.875rem;
  position: relative;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.progress-label {
  position: absolute;
  right: 0;
  top: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ── Table card ── */
.job-table {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.job-table-header {
  display: grid;
  grid-template-columns: 36px 48px 1fr 120px 88px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-default);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

.job-row {
  display: grid;
  grid-template-columns: 36px 48px 1fr 120px 88px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition-base);
}
.job-row:last-child { border-bottom: none; }
.job-row:hover { background: var(--bg-elevated); }
.job-row.selected { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
.job-row.done { border-left: 2px solid color-mix(in srgb, var(--success) 60%, transparent); padding-left: calc(1rem - 2px); }
.job-row.error { border-left: 2px solid color-mix(in srgb, var(--danger) 60%, transparent); padding-left: calc(1rem - 2px); }
.job-row.skipped { opacity: 0.55; }

/* Grid columns */
.col-check {
  display: flex;
  align-items: center;
  justify-content: center;
}
.row-check {
  width: 15px;
  height: 15px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.col-thumb { }
.job-thumb {
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
.job-thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-placeholder { color: var(--text-tertiary); }
.thumb-placeholder svg { width: 18px; height: 18px; }

.col-name {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.job-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-meta {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.col-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  background: var(--bg-elevated);
  color: var(--text-tertiary);
  white-space: nowrap;
}
.status-badge.done { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
.status-badge.error { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.status-badge.skipped { background: var(--bg-elevated); color: var(--text-tertiary); }
.status-badge.fetching-files,
.status-badge.extracting,
.status-badge.rendering,
.status-badge.saving { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); }

.error-detail {
  font-size: 0.68rem;
  color: var(--danger);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-action {
  display: flex;
  justify-content: flex-end;
}

.btn-row-generate {
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-row-generate:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 35%, transparent);
}
.btn-row-generate:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Off-screen headless renderer ── */
.headless-viewer-host {
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 400px;
  height: 400px;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
}

/* ── Spinners ── */
.loading-spinner,
.btn-spinner,
.status-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid color-mix(in srgb, var(--accent-primary) 25%, transparent);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.loading-spinner {
  width: 20px;
  height: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
