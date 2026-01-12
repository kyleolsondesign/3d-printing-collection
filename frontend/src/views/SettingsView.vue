<template>
  <div class="settings-view">
    <h2>Settings</h2>
    <p class="subtitle">Configure your 3D printing collection manager</p>

    <div class="settings-section">
      <h3>Model Directory</h3>
      <p class="section-description">
        Set the directory where your 3D model files are stored
      </p>
      <div class="input-group">
        <input
          v-model="modelDirectory"
          type="text"
          placeholder="/path/to/your/models"
          class="text-input"
        />
        <button @click="saveAndScan" class="btn-primary" :disabled="scanning">
          {{ scanning ? 'Scanning...' : 'Save & Scan' }}
        </button>
      </div>
      <p v-if="lastScan" class="last-scan">
        Last scanned: {{ formatDate(lastScan) }}
      </p>
    </div>

    <div v-if="scanStatus.scanning" class="scan-progress">
      <h4>Scan in Progress</h4>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: scanProgressPercent + '%' }"
        ></div>
      </div>
      <div class="progress-info">
        <p><strong>{{ scanStatus.processedFiles.toLocaleString() }}</strong> / {{ scanStatus.totalFiles.toLocaleString() }} files processed ({{ scanProgressPercent }}%)</p>
        <p><strong>{{ scanStatus.modelsFound.toLocaleString() }}</strong> models found</p>
        <p><strong>{{ scanStatus.assetsFound.toLocaleString() }}</strong> assets found</p>
      </div>
    </div>

    <div v-if="message" :class="['message', messageType]">
      {{ message }}
    </div>

    <div class="settings-section">
      <h3>Database Statistics</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalModels }}</div>
          <div class="stat-label">Total Models</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalFavorites }}</div>
          <div class="stat-label">Favorites</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalPrinted }}</div>
          <div class="stat-label">Printed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalQueued }}</div>
          <div class="stat-label">Queued</div>
        </div>
        <div class="stat-card" :class="{ 'stat-warning': stats.totalLooseFiles > 0 }">
          <div class="stat-value">{{ stats.totalLooseFiles }}</div>
          <div class="stat-label">Loose Files</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { systemApi } from '../services/api';

const modelDirectory = ref('/Users/kyle/Library/Mobile Documents/com~apple~CloudDocs/Documents/3D Printing');
const scanning = ref(false);
const lastScan = ref<string | null>(null);
const message = ref('');
const messageType = ref<'success' | 'error'>('success');
const scanStatus = ref({
  scanning: false,
  totalFiles: 0,
  processedFiles: 0,
  modelsFound: 0,
  assetsFound: 0
});
const stats = ref({
  totalModels: 0,
  totalFavorites: 0,
  totalPrinted: 0,
  totalQueued: 0,
  totalLooseFiles: 0
});

const scanProgressPercent = computed(() => {
  if (scanStatus.value.totalFiles === 0) return 0;
  return Math.round((scanStatus.value.processedFiles / scanStatus.value.totalFiles) * 100);
});

onMounted(async () => {
  await loadConfig();
  await loadStats();
  await checkScanStatus();
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
      // Poll more frequently during active scan
      setTimeout(checkScanStatus, 500);
    } else if (wasScanning && !scanStatus.value.scanning) {
      // Scan just completed, reload stats
      await loadStats();
      showMessage('Scan completed successfully!', 'success');
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

  scanning.value = true;
  message.value = '';

  try {
    await systemApi.scan(modelDirectory.value);
    showMessage('Scan started successfully!', 'success');
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
  max-width: 800px;
}

h2 {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  margin-bottom: 2rem;
}

.settings-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.settings-section h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.section-description {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

.text-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #0052a3;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.last-scan {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #666;
}

.scan-progress {
  background: #f0f7ff;
  border: 1px solid #0066cc;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.scan-progress h4 {
  margin-bottom: 1rem;
  color: #0066cc;
}

.progress-bar {
  width: 100%;
  height: 24px;
  background: #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0066cc, #0052a3);
  transition: width 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
}

.progress-info p {
  margin: 0.5rem 0;
}

.progress-info strong {
  color: #0066cc;
}

.message {
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 2rem;
}

.message.success {
  background: #d1fae5;
  color: #065f46;
}

.message.error {
  background: #fee2e2;
  color: #991b1b;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.stat-card {
  text-align: center;
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #0066cc;
  margin-bottom: 0.5rem;
}

.stat-label {
  color: #666;
  font-size: 0.9rem;
}

.stat-warning {
  background: #fef3c7;
  border: 1px solid #f59e0b;
}

.stat-warning .stat-value {
  color: #b45309;
}
</style>
