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

    <div v-else-if="jobs.length === 0" class="empty-state success">
      <div class="empty-icon">
        <AppIcon name="check-circle" />
      </div>
      <h3>All caught up!</h3>
      <p>All models with STL or 3MF files already have thumbnails.</p>
    </div>

    <template v-else>
      <!-- Controls -->
      <div class="controls-bar">
        <div class="stats-row">
          <span class="stat-pill">{{ doneCount }} / {{ jobs.length }} done</span>
          <span class="stat-pill skipped" v-if="skippedCount > 0">{{ skippedCount }} skipped (no STL/3MF)</span>
          <span class="stat-pill error" v-if="errorCount > 0">{{ errorCount }} failed</span>
        </div>
        <div class="actions-row">
          <button
            class="btn-primary"
            :disabled="isProcessing || allDone"
            @click="processAll"
          >
            <div v-if="isProcessing" class="btn-spinner"></div>
            <AppIcon v-else name="play" />
            {{ isProcessing ? 'Processing…' : allDone ? 'All Done' : 'Process All' }}
          </button>
          <button
            class="btn-secondary"
            :disabled="isProcessing"
            @click="loadJobs"
          >
            <AppIcon name="refresh" />
            Refresh
          </button>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar-wrapper" v-if="isProcessing || doneCount > 0">
        <div class="progress-bar" :style="{ width: progressPct + '%' }"></div>
        <span class="progress-label">{{ progressPct }}%</span>
      </div>

      <!-- Job list -->
      <div class="job-list">
        <div
          v-for="job in jobs"
          :key="job.model.id"
          :class="['job-row', job.status]"
        >
          <div class="job-thumb">
            <img
              v-if="job.model.primaryImage"
              :src="getImageUrl(job.model.primaryImage)"
              alt=""
            />
            <div v-else class="thumb-placeholder">
              <AppIcon name="package" />
            </div>
          </div>
          <div class="job-info">
            <div class="job-name">{{ job.model.filename }}</div>
            <div class="job-meta">{{ job.model.category }} · {{ job.model.file_count }} file{{ job.model.file_count !== 1 ? 's' : '' }}</div>
          </div>
          <div class="job-status">
            <span :class="['status-badge', job.status]">
              <div v-if="['fetching-files','rendering','saving'].includes(job.status)" class="status-spinner"></div>
              <span>{{ statusLabel(job.status) }}</span>
            </span>
            <span v-if="job.error" class="error-detail">{{ job.error }}</span>
          </div>
          <div class="job-actions">
            <button
              v-if="job.status === 'idle' || job.status === 'error'"
              :disabled="isProcessing"
              class="btn-generate"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { modelsApi, type Model } from '../services/api'
import AppIcon from '../components/AppIcon.vue'
import ModelViewer from '../components/ModelViewer.vue'

interface ModelFile {
  id: number
  model_id: number
  filename: string
  filepath: string
  file_size: number
  file_type: string
}

type JobStatus = 'idle' | 'fetching-files' | 'rendering' | 'saving' | 'done' | 'error' | 'skipped'

interface ThumbnailJob {
  model: Model & { primaryImage?: string | null }
  files: ModelFile[]
  status: JobStatus
  error?: string
}

const router = useRouter()
const loading = ref(false)
const isProcessing = ref(false)
const jobs = ref<ThumbnailJob[]>([])
const activeJob = ref<ThumbnailJob | null>(null)
let pendingResolve: (() => void) | null = null
let pendingReject: ((e: unknown) => void) | null = null

const doneCount = computed(() => jobs.value.filter(j => j.status === 'done').length)
const skippedCount = computed(() => jobs.value.filter(j => j.status === 'skipped').length)
const errorCount = computed(() => jobs.value.filter(j => j.status === 'error').length)
const allDone = computed(() =>
  jobs.value.length > 0 &&
  jobs.value.every(j => ['done', 'skipped', 'error'].includes(j.status))
)
const progressPct = computed(() => {
  if (jobs.value.length === 0) return 0
  const finished = jobs.value.filter(j => ['done', 'skipped', 'error'].includes(j.status)).length
  return Math.round((finished / jobs.value.length) * 100)
})

function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'idle': return 'Pending'
    case 'fetching-files': return 'Loading files…'
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
    const resp = await modelsApi.getAll({ noImage: true, limit: 500 })
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

async function processAll() {
  isProcessing.value = true
  for (const job of jobs.value) {
    if (['done', 'skipped'].includes(job.status)) continue
    try {
      await processJob(job)
    } catch {
      // continue to next job even if one fails
    }
  }
  isProcessing.value = false
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
  // Fetch model files if not yet loaded
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
    job.status = 'skipped'
    return
  }

  job.status = 'rendering'
  activeJob.value = job

  // Wait for headless viewer to emit imageCaptured or error
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
    return
  }
  activeJob.value = null
  pendingResolve?.()
  pendingResolve = null
  pendingReject = null
}

function onHeadlessError(message: string) {
  const job = activeJob.value
  if (!job) return
  job.status = 'error'
  job.error = message
  activeJob.value = null
  pendingReject?.(new Error(message))
  pendingReject = null
  pendingResolve = null
}

onMounted(loadJobs)
</script>

<style scoped>
.thumbnails-view {
  padding: 1.5rem;
  max-width: 900px;
  margin: 0 auto;
}

.header {
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
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
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}
.back-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }

.count-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(110, 168, 254, 0.15);
  color: #6ea8fe;
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

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
  color: var(--text-secondary);
}
.empty-state.success { color: #4ade80; }
.empty-icon { font-size: 2.5rem; margin-bottom: 1rem; }
.empty-state h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary); }
.empty-state p { font-size: 0.875rem; }

.controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.stats-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat-pill {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.stat-pill.skipped { color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.08); }
.stat-pill.error { color: #f87171; border-color: rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.08); }

.actions-row {
  display: flex;
  gap: 0.5rem;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #6ea8fe;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: #5a95f0; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.btn-secondary:hover:not(:disabled) { background: var(--bg-tertiary); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.progress-bar-wrapper {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  margin-bottom: 1.25rem;
  position: relative;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: #6ea8fe;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.progress-label {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 11px;
  color: var(--text-secondary);
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.job-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  transition: border-color 0.15s;
}
.job-row.done { border-color: rgba(74, 222, 128, 0.25); background: rgba(74, 222, 128, 0.04); }
.job-row.error { border-color: rgba(248, 113, 113, 0.25); background: rgba(248, 113, 113, 0.04); }
.job-row.skipped { opacity: 0.6; }

.job-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.job-thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-placeholder { color: var(--text-secondary); opacity: 0.5; }

.job-info {
  flex: 1;
  min-width: 0;
}
.job-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.job-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.job-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}
.status-badge.done { background: rgba(74, 222, 128, 0.12); color: #4ade80; }
.status-badge.error { background: rgba(248, 113, 113, 0.12); color: #f87171; }
.status-badge.skipped { background: var(--bg-tertiary); color: var(--text-secondary); }
.status-badge.fetching-files,
.status-badge.rendering,
.status-badge.saving { background: rgba(110, 168, 254, 0.12); color: #6ea8fe; }

.error-detail {
  font-size: 0.7rem;
  color: #f87171;
  max-width: 150px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-actions {
  flex-shrink: 0;
}
.btn-generate {
  padding: 5px 12px;
  font-size: 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-generate:hover:not(:disabled) { background: rgba(110, 168, 254, 0.15); color: #6ea8fe; border-color: rgba(110, 168, 254, 0.3); }
.btn-generate:disabled { opacity: 0.4; cursor: not-allowed; }

/* Off-screen headless renderer */
.headless-viewer-host {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 400px;
  height: 400px;
  overflow: hidden;
  pointer-events: none;
}

.loading-spinner,
.btn-spinner,
.status-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(110, 168, 254, 0.2);
  border-top-color: #6ea8fe;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
