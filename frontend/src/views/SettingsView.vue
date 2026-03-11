<template>
  <div class="settings-view">
    <div class="header">
      <h2>Settings</h2>
      <p class="subtitle">Configure your 3D printing collection manager</p>
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <AppIcon name="folder" />
        </div>
        <div>
          <h3>Model Directory</h3>
          <p class="section-description">Set the directory where your 3D model files are stored</p>
        </div>
      </div>
      <div class="input-group">
        <input
          v-model="modelDirectory"
          type="text"
          placeholder="/path/to/your/models"
          class="text-input"
        />
      </div>

      <div class="scan-mode-section">
        <label class="scan-mode-label">Scan Mode</label>
        <div class="scan-mode-options">
          <label class="radio-option" :class="{ selected: scanMode === 'full_sync' }">
            <input type="radio" v-model="scanMode" value="full_sync" />
            <div class="radio-content">
              <span class="radio-title">Sync (Recommended)</span>
              <span class="radio-desc">Updates existing, adds new, soft-deletes removed. Preserves favorites & history.</span>
            </div>
          </label>
          <label class="radio-option" :class="{ selected: scanMode === 'add_only' }">
            <input type="radio" v-model="scanMode" value="add_only" />
            <div class="radio-content">
              <span class="radio-title">Add Only</span>
              <span class="radio-desc">Only adds new models. Never modifies or deletes existing records.</span>
            </div>
          </label>
          <label class="radio-option" :class="{ selected: scanMode === 'full', disabled: scanScope === 'paid' }">
            <input type="radio" v-model="scanMode" value="full" :disabled="scanScope === 'paid'" />
            <div class="radio-content">
              <span class="radio-title">Full Rebuild</span>
              <span class="radio-desc">Clears all model data and rescans from scratch. Preserves favorites & history.</span>
            </div>
          </label>
        </div>
      </div>

      <div class="scan-mode-section">
        <label class="scan-mode-label">Scan Scope</label>
        <div class="scan-mode-options">
          <label class="radio-option" :class="{ selected: scanScope === 'all' }">
            <input type="radio" v-model="scanScope" value="all" />
            <div class="radio-content">
              <span class="radio-title">All Folders</span>
              <span class="radio-desc">Scan the entire model directory.</span>
            </div>
          </label>
          <label class="radio-option" :class="{ selected: scanScope === 'paid' }">
            <input type="radio" v-model="scanScope" value="paid" @change="scanMode === 'full' && (scanMode = 'full_sync')" />
            <div class="radio-content">
              <span class="radio-title">Paid Only</span>
              <span class="radio-desc">Only scan the Paid folder. Faster when indexing new paid models.</span>
            </div>
          </label>
        </div>
      </div>

      <div class="scan-actions">
        <button @click="saveAndScan" class="btn-primary" :disabled="scanning || scanStatus.scanning">
          <AppIcon v-if="scanning || scanStatus.scanning" name="spinner" class="spin" />
          <AppIcon v-else name="refresh" />
          {{ scanning || scanStatus.scanning ? 'Scan in Progress...' : 'Start Scan' }}
        </button>
      </div>
      <p v-if="lastScan" class="last-scan">
        <AppIcon name="clock" />
        Last scanned: {{ formatDate(lastScan) }}
      </p>
    </div>

    <div v-if="scanStatus.scanning" class="scan-progress">
      <div class="progress-header">
        <div class="progress-icon">
          <AppIcon name="spinner" class="spin" />
        </div>
        <div>
          <h4>{{ scanStatus.stepDescription || 'Scan in Progress' }}</h4>
          <p>{{ scanProgressPercent }}% complete<span v-if="elapsedTime" class="elapsed-time"> &middot; {{ elapsedTime }}</span></p>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: scanProgressPercent + '%' }"></div>
      </div>
      <div class="progress-stats">
        <div class="stat">
          <span class="stat-value">{{ scanStatus.processedFiles.toLocaleString() }}</span>
          <span class="stat-label">/ {{ scanStatus.totalFiles.toLocaleString() }} files</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ scanStatus.modelsFound.toLocaleString() }}</span>
          <span class="stat-label">added</span>
        </div>
        <div v-if="scanStatus.modelsUpdated > 0" class="stat">
          <span class="stat-value">{{ scanStatus.modelsUpdated.toLocaleString() }}</span>
          <span class="stat-label">updated</span>
        </div>
        <div v-if="scanStatus.modelsRemoved > 0" class="stat warning">
          <span class="stat-value">{{ scanStatus.modelsRemoved.toLocaleString() }}</span>
          <span class="stat-label">removed</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ scanStatus.modelFilesFound.toLocaleString() }}</span>
          <span class="stat-label">model files</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ scanStatus.assetsFound.toLocaleString() }}</span>
          <span class="stat-label">assets</span>
        </div>
        <div v-if="scanStatus.looseFilesFound > 0" class="stat warning">
          <span class="stat-value">{{ scanStatus.looseFilesFound.toLocaleString() }}</span>
          <span class="stat-label">loose files</span>
        </div>
      </div>
    </div>

    <div v-if="message" :class="['message', messageType]">
      <AppIcon v-if="messageType === 'success'" name="check-circle" />
      <AppIcon v-else name="circle-x" />
      {{ message }}
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <AppIcon name="eye" />
        </div>
        <div>
          <h3>File Watcher</h3>
          <p class="section-description">Automatically scan for changes when files are added, moved, or deleted</p>
        </div>
      </div>
      <div class="watcher-row">
        <div class="watcher-info">
          <div class="watcher-status-badge">
            <span class="status-dot" :class="watcherStatus.active ? 'active' : 'inactive'"></span>
            <span class="status-text">{{ watcherStatus.active ? 'Active' : 'Inactive' }}</span>
            <span v-if="watcherStatus.pendingChanges > 0" class="pending-badge">{{ watcherStatus.pendingChanges }} pending</span>
          </div>
          <p v-if="watcherStatus.lastTriggered" class="last-triggered">Last triggered: {{ formatDate(watcherStatus.lastTriggered) }}</p>
          <p v-else class="last-triggered muted">Never triggered</p>
        </div>
        <button
          @click="toggleWatcher"
          :disabled="watcherToggling || scanStatus.scanning"
          class="btn-secondary watcher-toggle"
          :class="{ 'watcher-active': watcherStatus.enabled }"
        >
          <AppIcon v-if="watcherToggling" name="spinner" class="spin" />
          {{ watcherToggling ? 'Updating...' : watcherStatus.enabled ? 'Disable Watcher' : 'Enable Watcher' }}
        </button>
      </div>
      <p class="watcher-note">
        When enabled, detects file system changes and auto-triggers scans after a 20-second debounce.
        Additions trigger an "Add Only" scan; deletions trigger a "Sync" scan. Paused while a manual scan is in progress.
      </p>
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <AppIcon name="users" />
        </div>
        <div>
          <h3>Designer Sync</h3>
          <p class="section-description">Detect designers from Paid folder structure and PDF metadata. Runs automatically during scans.</p>
        </div>
      </div>
      <div class="designer-sync-row">
        <button
          @click="syncDesigners"
          :disabled="designerSyncing || scanStatus.scanning"
          class="btn-secondary"
        >
          <AppIcon name="refresh" :class="{ spin: designerSyncing }" />
          {{ designerSyncing ? 'Syncing...' : 'Sync Designers' }}
        </button>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <AppIcon name="wrench" />
        </div>
        <div>
          <h3>Maintenance</h3>
          <p class="section-description">Tools for managing your collection</p>
        </div>
      </div>
      <div class="maintenance-actions">
        <div class="maintenance-item">
          <div class="maintenance-info">
            <span class="maintenance-title">
              Loose Files
              <span v-if="stats.totalLooseFiles > 0" class="loose-count-badge">{{ stats.totalLooseFiles }}</span>
            </span>
            <span class="maintenance-desc">Review and organize files that aren't inside a model folder.</span>
          </div>
          <button @click="router.push('/loose-files')" class="btn-secondary">
            <AppIcon name="chevron-right" />
            View
          </button>
        </div>
        <div class="maintenance-item">
          <div class="maintenance-info">
            <span class="maintenance-title">Deduplicate Images</span>
            <span class="maintenance-desc">Find and hide visually identical images within each model, keeping the highest quality version.</span>
          </div>
          <button @click="deduplicateImages" class="btn-secondary" :disabled="deduplicating || scanStatus.scanning">
            <AppIcon v-if="deduplicating" name="spinner" class="spin" />
            <AppIcon v-else name="camera" />
            {{ deduplicating ? 'Deduplicating...' : 'Run Deduplication' }}
          </button>
        </div>
        <div class="maintenance-item">
          <div class="maintenance-info">
            <span class="maintenance-title">Audit Nested Models</span>
            <span class="maintenance-desc">Find models erroneously indexed as separate entries when they are actually subfolders of another model.</span>
          </div>
          <button @click="runNestedAudit" class="btn-secondary" :disabled="auditLoading || scanStatus.scanning">
            <AppIcon v-if="auditLoading" name="spinner" class="spin" />
            <AppIcon v-else name="search" />
            {{ auditLoading ? 'Auditing...' : 'Run Audit' }}
          </button>
        </div>
      </div>

      <div v-if="auditItems !== null" class="audit-results">
        <div v-if="auditItems.length === 0" class="audit-empty">
          No nested models found — collection looks clean.
        </div>
        <template v-else>
          <div class="audit-header">
            <span class="audit-count">{{ auditItems.length }} nested model{{ auditItems.length === 1 ? '' : 's' }} found</span>
            <button @click="deleteAllNested" class="btn-danger" :disabled="auditDeleting">
              <AppIcon v-if="auditDeleting" name="spinner" class="spin" />
              <AppIcon v-else name="trash" />
              Soft-Delete All
            </button>
          </div>
          <div class="audit-list">
            <div v-for="item in auditItems" :key="item.child_id" class="audit-row">
              <div class="audit-row-info">
                <div class="audit-nested">
                  <span class="audit-label">Nested:</span>
                  <span class="audit-name">{{ item.child_filename }}</span>
                  <span class="audit-cat">{{ item.child_category }}</span>
                </div>
                <div class="audit-parent-info">
                  <span class="audit-label">Inside:</span>
                  <span class="audit-name">{{ item.parent_filename }}</span>
                  <span class="audit-cat">{{ item.parent_category }}</span>
                </div>
              </div>
              <button @click="deleteNestedItem(item)" class="btn-icon-danger" title="Soft-delete this model">
                <AppIcon name="trash" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <AppIcon name="clipboard" />
        </div>
        <div>
          <h3>Database Statistics</h3>
          <p class="section-description">Overview of your collection</p>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon models">
            <AppIcon name="package" stroke-width="1.5" />
          </div>
          <div class="stat-value">{{ stats.totalModels.toLocaleString() }}</div>
          <div class="stat-label">Total Models</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon favorites">
            <AppIcon name="star" stroke-width="1.5" />
          </div>
          <div class="stat-value">{{ stats.totalFavorites.toLocaleString() }}</div>
          <div class="stat-label">Favorites</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon printed">
            <AppIcon name="check-circle" stroke-width="1.5" />
          </div>
          <div class="stat-value">{{ stats.totalPrinted.toLocaleString() }}</div>
          <div class="stat-label">Printed</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon queued">
            <AppIcon name="list" stroke-width="1.5" />
          </div>
          <div class="stat-value">{{ stats.totalQueued.toLocaleString() }}</div>
          <div class="stat-label">Queued</div>
        </div>
        <div :class="['stat-card', { warning: stats.totalLooseFiles > 0 }]">
          <div class="stat-icon loose">
            <AppIcon name="file" stroke-width="1.5" />
          </div>
          <div class="stat-value">{{ stats.totalLooseFiles.toLocaleString() }}</div>
          <div class="stat-label">Loose Files</div>
        </div>
        <div v-if="stats.deletedModels > 0" class="stat-card muted">
          <div class="stat-icon deleted">
            <AppIcon name="trash" stroke-width="1.5" />
          </div>
          <div class="stat-value">{{ stats.deletedModels.toLocaleString() }}</div>
          <div class="stat-label">Deleted</div>
        </div>
      </div>

      <!-- Tools -->
      <div class="tools-section">
        <button class="tool-card" @click="router.push('/settings/thumbnails')">
          <div class="tool-icon">
            <AppIcon name="image" stroke-width="1.5" />
          </div>
          <div class="tool-info">
            <div class="tool-name">Generate Thumbnails</div>
            <div class="tool-desc">Render 3D previews for models without images</div>
          </div>
          <AppIcon name="chevron-right" class="tool-arrow" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { systemApi, modelsApi, designersApi, type ScanMode, type WatcherStatus } from '../services/api';
import AppIcon from '../components/AppIcon.vue';

const router = useRouter();
const modelDirectory = ref('/Users/kyle/Library/Mobile Documents/com~apple~CloudDocs/Documents/3D Printing');
const scanMode = ref<ScanMode>('full_sync');
const scanScope = ref<'all' | 'paid'>('all');
const scanning = ref(false);
const deduplicating = ref(false);
const lastScan = ref<string | null>(null);
const message = ref('');
const messageType = ref<'success' | 'error'>('success');
const scanStatus = ref({
  scanning: false,
  totalFiles: 0,
  processedFiles: 0,
  modelsFound: 0,
  modelsUpdated: 0,
  modelsRemoved: 0,
  modelFilesFound: 0,
  assetsFound: 0,
  looseFilesFound: 0,
  currentStep: 'idle' as string,
  stepDescription: '',
  overallProgress: 0,
  modelsToExtract: 0,
  modelsExtracted: 0,
  scanStartedAt: null as string | null,
  scanCompletedAt: null as string | null,
  scanMode: null as string | null
});
const watcherStatus = ref<WatcherStatus>({ enabled: false, active: false, lastTriggered: null, pendingChanges: 0 });
const watcherToggling = ref(false);
const designerSyncing = ref(false);
let designerSyncPollTimer: ReturnType<typeof setInterval> | null = null;

const stats = ref({
  totalModels: 0,
  deletedModels: 0,
  totalFavorites: 0,
  totalPrinted: 0,
  totalQueued: 0,
  totalLooseFiles: 0
});

const now = ref(Date.now());
let timerInterval: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  if (!timerInterval) {
    timerInterval = setInterval(() => { now.value = Date.now(); }, 1000);
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

const scanProgressPercent = computed(() => {
  return scanStatus.value.overallProgress || 0;
});

const elapsedTime = computed(() => {
  if (!scanStatus.value.scanStartedAt) return '';
  const startMs = new Date(scanStatus.value.scanStartedAt).getTime();
  const elapsedMs = now.value - startMs;
  if (elapsedMs < 0) return '0s';
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
});

onMounted(async () => {
  await loadConfig();
  await loadStats();
  await checkScanStatus();
  await loadWatcherStatus();
});

onUnmounted(() => {
  stopTimer();
  if (designerSyncPollTimer) { clearInterval(designerSyncPollTimer); designerSyncPollTimer = null; }
});

async function loadConfig() {
  try {
    const response = await systemApi.getConfig();
    if (response.data.model_directory) {
      modelDirectory.value = response.data.model_directory;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

async function loadStats() {
  try {
    const response = await systemApi.getStats();
    stats.value = response.data;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function checkScanStatus() {
  try {
    const response = await systemApi.getScanStatus();
    const wasScanning = scanStatus.value.scanning;
    scanStatus.value = response.data;

    if (scanStatus.value.scanning) {
      startTimer();
      setTimeout(checkScanStatus, 10000);
    } else if (wasScanning && !scanStatus.value.scanning) {
      stopTimer();
      await loadStats();
      const modeLabels: Record<string, string> = {
        full: 'Full rebuild',
        full_sync: 'Sync',
        add_only: 'Add-only'
      };
      const modeLabel = modeLabels[scanStatus.value.scanMode || ''] || 'Scan';
      let completionMsg = `${modeLabel} scan completed`;
      if (scanStatus.value.scanStartedAt && scanStatus.value.scanCompletedAt) {
        const durationMs = new Date(scanStatus.value.scanCompletedAt).getTime() - new Date(scanStatus.value.scanStartedAt).getTime();
        const totalSeconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        completionMsg += minutes > 0 ? ` in ${minutes}m ${seconds.toString().padStart(2, '0')}s` : ` in ${seconds}s`;
      }
      showMessage(completionMsg, 'success');
    }
  } catch (error) {
    console.error('Failed to check scan status:', error);
  }
}

async function saveAndScan() {
  if (!modelDirectory.value) {
    showMessage('Please enter a model directory path', 'error');
    return;
  }

  if (scanStatus.value.scanning) {
    showMessage('A scan is already in progress', 'error');
    return;
  }

  scanning.value = true;
  message.value = '';

  try {
    await systemApi.scan(modelDirectory.value, scanMode.value, scanScope.value);
    showMessage(`Scan started (${scanMode.value} mode)`, 'success');
    lastScan.value = new Date().toISOString();

    scanStatus.value.scanning = true;
    setTimeout(checkScanStatus, 1000);
    setTimeout(loadStats, 2000);
  } catch (error) {
    showMessage('Failed to start scan', 'error');
  } finally {
    scanning.value = false;
  }
}

async function loadWatcherStatus() {
  try {
    const response = await systemApi.getWatcherStatus();
    watcherStatus.value = response.data;
  } catch (error) {
    console.error('Failed to load watcher status:', error);
  }
}

async function toggleWatcher() {
  if (watcherToggling.value) return;
  watcherToggling.value = true;
  try {
    const newEnabled = !watcherStatus.value.enabled;
    await systemApi.toggleWatcher(newEnabled);
    await loadWatcherStatus();
    showMessage(newEnabled ? 'File watcher enabled' : 'File watcher disabled', 'success');
  } catch (error) {
    showMessage('Failed to toggle file watcher', 'error');
  } finally {
    watcherToggling.value = false;
  }
}

async function syncDesigners() {
  designerSyncing.value = true;
  try {
    await designersApi.sync();
    designerSyncPollTimer = setInterval(async () => {
      try {
        const res = await designersApi.syncStatus();
        if (!res.data.active) {
          if (designerSyncPollTimer) { clearInterval(designerSyncPollTimer); designerSyncPollTimer = null; }
          designerSyncing.value = false;
          showMessage(`Designer sync: ${res.data.created} new, ${res.data.linked} linked`, 'success');
        }
      } catch {
        if (designerSyncPollTimer) { clearInterval(designerSyncPollTimer); designerSyncPollTimer = null; }
        designerSyncing.value = false;
      }
    }, 2000);
  } catch (error) {
    showMessage('Failed to sync designers', 'error');
    designerSyncing.value = false;
  }
}

type NestedModelItem = { child_id: number; child_filename: string; child_filepath: string; child_category: string; parent_id: number; parent_filename: string; parent_filepath: string; parent_category: string };
const auditLoading = ref(false);
const auditItems = ref<NestedModelItem[] | null>(null);
const auditDeleting = ref(false);

async function runNestedAudit() {
  auditLoading.value = true;
  auditItems.value = null;
  try {
    const response = await systemApi.auditNestedModels();
    auditItems.value = response.data.items;
  } catch (error) {
    showMessage('Failed to run audit', 'error');
  } finally {
    auditLoading.value = false;
  }
}

async function deleteAllNested() {
  if (!auditItems.value || auditItems.value.length === 0) return;
  auditDeleting.value = true;
  try {
    const ids = auditItems.value.map(i => i.child_id);
    await modelsApi.bulkDelete(ids);
    showMessage(`Soft-deleted ${ids.length} nested model${ids.length === 1 ? '' : 's'}`, 'success');
    auditItems.value = [];
    await loadStats();
  } catch (error) {
    showMessage('Failed to delete nested models', 'error');
  } finally {
    auditDeleting.value = false;
  }
}

async function deleteNestedItem(item: NestedModelItem) {
  try {
    await modelsApi.bulkDelete([item.child_id]);
    auditItems.value = auditItems.value?.filter(i => i.child_id !== item.child_id) ?? [];
    await loadStats();
  } catch (error) {
    showMessage('Failed to delete model', 'error');
  }
}

async function deduplicateImages() {
  if (deduplicating.value) return;
  deduplicating.value = true;
  try {
    const response = await systemApi.deduplicateImages();
    const { modelsProcessed, duplicatesHidden } = response.data;
    if (duplicatesHidden > 0) {
      showMessage(`Found and hidden ${duplicatesHidden} duplicate images across ${modelsProcessed} models`, 'success');
    } else {
      showMessage('No duplicate images found', 'success');
    }
  } catch (error) {
    showMessage('Failed to run deduplication', 'error');
  } finally {
    deduplicating.value = false;
  }
}

function showMessage(msg: string, type: 'success' | 'error') {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}
</script>

<style scoped>
.settings-view {
  max-width: 900px;
  animation: fadeIn 0.4s ease-out;
}

.header {
  margin-bottom: 2rem;
}

h2 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.settings-section {
  background: var(--bg-surface);
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.section-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  flex-shrink: 0;
}

.section-icon svg {
  width: 22px;
  height: 22px;
}

.section-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.section-description {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

.text-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.text-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
  outline: none;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.btn-primary svg {
  width: 18px;
  height: 18px;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.last-scan {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-tertiary);
}

.last-scan svg {
  width: 14px;
  height: 14px;
}

.scan-progress {
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  margin-bottom: 1.5rem;
}

.progress-header {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.progress-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
}

.progress-icon svg {
  width: 20px;
  height: 20px;
}

.progress-header h4 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.125rem;
}

.progress-header p {
  font-size: 0.85rem;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}

.elapsed-time {
  color: var(--text-secondary);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-elevated);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  transition: width 0.3s ease;
  border-radius: 4px;
}

.progress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.progress-stats .stat {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
}

.progress-stats .stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}

.progress-stats .stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.progress-stats .stat.warning .stat-value {
  color: var(--warning);
}

.message {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-md);
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  font-weight: 500;
}

.message svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.message.success {
  background: var(--success-dim);
  border: 1px solid var(--success);
  color: var(--success);
}

.message.error {
  background: var(--danger-dim);
  border: 1px solid var(--danger);
  color: var(--danger);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.stat-card {
  text-align: center;
  padding: 1.25rem;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  transition: all var(--transition-base);
}

.stat-card:hover {
  border-color: var(--border-strong);
}

.stat-card.warning {
  border-color: var(--warning);
  background: var(--warning-dim);
}

.stat-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  margin: 0 auto 0.75rem;
}

.stat-icon svg {
  width: 20px;
  height: 20px;
}

.stat-icon.models {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
}

.stat-icon.favorites {
  background: var(--warning-dim);
  color: var(--warning);
}

.stat-icon.printed {
  background: var(--success-dim);
  color: var(--success);
}

.stat-icon.queued {
  background: var(--info-dim);
  color: var(--info);
}

.stat-icon.loose {
  background: var(--warning-dim);
  color: var(--warning);
}

.stat-card .stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
}

.stat-card.warning .stat-value {
  color: var(--warning);
}

.stat-card .stat-label {
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
}

.stat-card.muted {
  opacity: 0.7;
}

.stat-icon.deleted {
  background: var(--bg-surface);
  color: var(--text-tertiary);
}

.scan-mode-section {
  margin-top: 1.25rem;
}

.scan-mode-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.scan-mode-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
}

.radio-option:hover {
  border-color: var(--border-default);
}

.radio-option.selected {
  border-color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.radio-option.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.radio-option input[type="radio"] {
  margin-top: 0.125rem;
  accent-color: var(--accent-primary);
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.radio-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.radio-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.scan-actions {
  margin-top: 1.25rem;
  display: flex;
  justify-content: flex-end;
}

.maintenance-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.maintenance-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.maintenance-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.maintenance-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loose-count-badge {
  background: var(--warning);
  color: var(--bg-deepest);
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  line-height: 1.4;
}

.maintenance-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.btn-secondary svg {
  width: 16px;
  height: 16px;
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.watcher-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.watcher-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.watcher-status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active {
  background: var(--success, #22c55e);
  box-shadow: 0 0 6px var(--success, #22c55e);
}

.status-dot.inactive {
  background: var(--text-tertiary);
}

.status-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.pending-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent);
  color: var(--warning, #f59e0b);
  border-radius: 9999px;
  font-weight: 600;
}

.last-triggered {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.last-triggered.muted {
  color: var(--text-tertiary);
}

.watcher-toggle.watcher-active {
  border-color: var(--success, #22c55e);
  color: var(--success, #22c55e);
}

.watcher-note {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.designer-sync-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.audit-results {
  margin-top: 1rem;
  border-top: 1px solid var(--border-subtle);
  padding-top: 1rem;
}

.audit-empty {
  font-size: 0.875rem;
  color: var(--success);
  padding: 0.5rem 0;
}

.audit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.audit-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--warning);
}

.btn-danger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: var(--danger-dim, rgba(239, 68, 68, 0.1));
  color: var(--danger, #ef4444);
  border: 1px solid var(--danger, #ef4444);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.btn-danger svg {
  width: 14px;
  height: 14px;
}

.btn-danger:hover:not(:disabled) {
  background: var(--danger, #ef4444);
  color: #fff;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.audit-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.audit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0.75rem;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.audit-row-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.audit-nested,
.audit-parent-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  min-width: 0;
}

.audit-label {
  color: var(--text-tertiary);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.audit-name {
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-cat {
  color: var(--text-tertiary);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.btn-icon-danger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: transparent;
  color: var(--text-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  flex-shrink: 0;
}

.btn-icon-danger svg {
  width: 14px;
  height: 14px;
}

.btn-icon-danger:hover {
  background: var(--danger-dim, rgba(239, 68, 68, 0.1));
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
}

.tools-section {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tool-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
  color: var(--text-primary);
}
.tool-card:hover {
  background: var(--bg-tertiary);
  border-color: rgba(110, 168, 254, 0.3);
}

.tool-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(110, 168, 254, 0.12);
  color: #6ea8fe;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tool-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 1px;
}

.tool-arrow {
  color: var(--text-secondary);
  flex-shrink: 0;
}
</style>
