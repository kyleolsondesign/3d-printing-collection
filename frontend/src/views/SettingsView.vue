<template>
  <div class="settings-view">
    <div class="header">
      <h2>Settings</h2>
      <p class="subtitle">Configure your 3D printing collection manager</p>
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
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
          <label class="radio-option" :class="{ selected: scanMode === 'full' }">
            <input type="radio" v-model="scanMode" value="full" />
            <div class="radio-content">
              <span class="radio-title">Full Rebuild</span>
              <span class="radio-desc">Clears all model data and rescans from scratch. Preserves favorites & history.</span>
            </div>
          </label>
        </div>
      </div>

      <div class="scan-actions">
        <button @click="saveAndScan" class="btn-primary" :disabled="scanning || scanStatus.scanning">
          <svg v-if="scanning || scanStatus.scanning" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          {{ scanning || scanStatus.scanning ? 'Scan in Progress...' : 'Start Scan' }}
        </button>
      </div>
      <p v-if="lastScan" class="last-scan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        Last scanned: {{ formatDate(lastScan) }}
      </p>
    </div>

    <div v-if="scanStatus.scanning" class="scan-progress">
      <div class="progress-header">
        <div class="progress-icon">
          <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
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
      <svg v-if="messageType === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12l2 2 4-4"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M15 9l-6 6M9 9l6 6"/>
      </svg>
      {{ message }}
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <div>
          <h3>Maintenance</h3>
          <p class="section-description">Tools for managing your collection</p>
        </div>
      </div>
      <div class="maintenance-actions">
        <div class="maintenance-item">
          <div class="maintenance-info">
            <span class="maintenance-title">Deduplicate Images</span>
            <span class="maintenance-desc">Find and hide visually identical images within each model, keeping the highest quality version.</span>
          </div>
          <button @click="deduplicateImages" class="btn-secondary" :disabled="deduplicating || scanStatus.scanning">
            <svg v-if="deduplicating" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7" opacity="0.4"/>
              <rect x="14" y="14" width="7" height="7" opacity="0.4"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            {{ deduplicating ? 'Deduplicating...' : 'Run Deduplication' }}
          </button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-header">
        <div class="section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
        </div>
        <div>
          <h3>Database Statistics</h3>
          <p class="section-description">Overview of your collection</p>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon models">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            </svg>
          </div>
          <div class="stat-value">{{ stats.totalModels.toLocaleString() }}</div>
          <div class="stat-label">Total Models</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div class="stat-value">{{ stats.totalFavorites.toLocaleString() }}</div>
          <div class="stat-label">Favorites</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon printed">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div class="stat-value">{{ stats.totalPrinted.toLocaleString() }}</div>
          <div class="stat-label">Printed</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon queued">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
          </div>
          <div class="stat-value">{{ stats.totalQueued.toLocaleString() }}</div>
          <div class="stat-label">Queued</div>
        </div>
        <div :class="['stat-card', { warning: stats.totalLooseFiles > 0 }]">
          <div class="stat-icon loose">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <path d="M13 2v7h7"/>
            </svg>
          </div>
          <div class="stat-value">{{ stats.totalLooseFiles.toLocaleString() }}</div>
          <div class="stat-label">Loose Files</div>
        </div>
        <div v-if="stats.deletedModels > 0" class="stat-card muted">
          <div class="stat-icon deleted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </div>
          <div class="stat-value">{{ stats.deletedModels.toLocaleString() }}</div>
          <div class="stat-label">Deleted</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { systemApi, type ScanMode } from '../services/api';

const modelDirectory = ref('/Users/kyle/Library/Mobile Documents/com~apple~CloudDocs/Documents/3D Printing');
const scanMode = ref<ScanMode>('full_sync');
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
});

onUnmounted(() => {
  stopTimer();
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
    await systemApi.scan(modelDirectory.value, scanMode.value);
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
</style>
