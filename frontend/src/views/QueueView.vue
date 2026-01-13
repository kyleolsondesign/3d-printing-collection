<template>
  <div class="queue-view">
    <div class="header">
      <div class="header-left">
        <h2>Print Queue</h2>
        <span class="count-badge" v-if="queue.length > 0">{{ queue.length }}</span>
      </div>
      <p class="subtitle">Models waiting to be printed</p>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading queue...</span>
    </div>

    <div v-else-if="queue.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
        </svg>
      </div>
      <h3>Queue is empty</h3>
      <p>Add models to your print queue from the Browse page.</p>
    </div>

    <div v-else class="queue-list">
      <div
        v-for="(item, index) in queue"
        :key="item.id"
        class="queue-card"
        :style="{ animationDelay: `${index * 50}ms` }"
      >
        <div class="queue-number">{{ index + 1 }}</div>
        <div class="drag-handle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6h.01M8 12h.01M8 18h.01M12 6h.01M12 12h.01M12 18h.01"/>
          </svg>
        </div>
        <div class="queue-content">
          <h3>{{ item.filename }}</h3>
          <div class="queue-meta">
            <span class="category-tag">{{ item.category }}</span>
            <span class="file-type">{{ item.file_type }}</span>
          </div>
          <p v-if="item.notes" class="notes">{{ item.notes }}</p>
        </div>
        <div class="actions">
          <button @click="removeFromQueue(item.id)" class="btn-remove" title="Remove from queue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { queueApi } from '../services/api';

const queue = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  await loadQueue();
});

async function loadQueue() {
  try {
    const response = await queueApi.getAll();
    queue.value = response.data.queue;
  } catch (error) {
    console.error('Failed to load queue:', error);
  } finally {
    loading.value = false;
  }
}

async function removeFromQueue(id: number) {
  try {
    await queueApi.delete(id);
    queue.value = queue.value.filter(q => q.id !== id);
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  }
}
</script>

<style scoped>
.queue-view {
  max-width: 900px;
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
  background: var(--accent-primary);
  color: var(--bg-deepest);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  font-family: var(--font-mono);
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.queue-card {
  background: var(--bg-surface);
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  transition: all var(--transition-base);
  animation: fadeIn 0.4s ease-out backwards;
}

.queue-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-elevated);
}

.queue-number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 700;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.drag-handle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: grab;
  flex-shrink: 0;
}

.drag-handle svg {
  width: 16px;
  height: 16px;
}

.drag-handle:hover {
  color: var(--text-secondary);
}

.queue-content {
  flex: 1;
  min-width: 0;
}

.queue-content h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.queue-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.category-tag {
  padding: 0.25rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.file-type {
  padding: 0.25rem 0.5rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  text-transform: uppercase;
}

.notes {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-subtle);
}

.actions {
  flex-shrink: 0;
}

.btn-remove {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  transition: all var(--transition-base);
}

.btn-remove svg {
  width: 16px;
  height: 16px;
}

.btn-remove:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-dim);
}

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

@keyframes spin {
  to { transform: rotate(360deg); }
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
</style>
