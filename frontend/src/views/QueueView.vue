<template>
  <div class="queue-view">
    <h2>Print Queue</h2>
    <p class="subtitle">Manage your upcoming print jobs</p>

    <div v-if="loading" class="loading">Loading queue...</div>
    <div v-else-if="queue.length === 0" class="empty">
      <p>Your print queue is empty. Add models from the Browse page!</p>
    </div>
    <div v-else class="queue-list">
      <div v-for="item in queue" :key="item.id" class="queue-item">
        <div class="drag-handle">⋮⋮</div>
        <div class="queue-content">
          <h3>{{ item.filename }}</h3>
          <p class="model-path">{{ item.category }} • {{ item.file_type }}</p>
          <p v-if="item.notes" class="notes">{{ item.notes }}</p>
        </div>
        <div class="actions">
          <button @click="removeFromQueue(item.id)" class="btn-danger">Remove</button>
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

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.queue-item {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 1rem;
  align-items: center;
}

.drag-handle {
  color: #ccc;
  cursor: grab;
  font-size: 1.2rem;
}

.queue-content {
  flex: 1;
}

.queue-content h3 {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}

.model-path {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.notes {
  font-size: 0.9rem;
  color: #333;
  font-style: italic;
}

.btn-danger {
  padding: 0.5rem 1rem;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #b91c1c;
}

.loading, .empty {
  text-align: center;
  padding: 3rem;
  color: #666;
}
</style>
