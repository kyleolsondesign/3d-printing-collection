<template>
  <div class="printed-view">
    <h2>Printed Models</h2>
    <p class="subtitle">Track your printing history and quality ratings</p>

    <div v-if="loading" class="loading">Loading printed models...</div>
    <div v-else-if="printed.length === 0" class="empty">
      <p>No printed models tracked yet.</p>
    </div>
    <div v-else class="printed-list">
      <div v-for="item in printed" :key="item.id" class="printed-item">
        <div class="printed-content">
          <h3>{{ item.filename }}</h3>
          <p class="model-path">{{ item.category }} • {{ item.file_type }}</p>
          <div class="printed-meta">
            <span class="print-date">Printed: {{ formatDate(item.printed_at) }}</span>
            <span v-if="item.rating" :class="['rating', `rating-${item.rating}`]">
              {{ item.rating === 'good' ? '👍 Good' : '👎 Bad' }}
            </span>
          </div>
          <p v-if="item.notes" class="notes">{{ item.notes }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { printedApi } from '../services/api';

const printed = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  await loadPrinted();
});

async function loadPrinted() {
  try {
    const response = await printedApi.getAll();
    printed.value = response.data.printed;
  } catch (error) {
    console.error('Failed to load printed models:', error);
  } finally {
    loading.value = false;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}
</script>

<style scoped>
.printed-view {
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

.printed-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.printed-item {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.printed-content h3 {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}

.model-path {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.printed-meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.print-date {
  color: #666;
}

.rating {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-weight: 500;
}

.rating-good {
  background: #d1fae5;
  color: #065f46;
}

.rating-bad {
  background: #fee2e2;
  color: #991b1b;
}

.notes {
  font-size: 0.9rem;
  color: #333;
  font-style: italic;
  margin-top: 0.5rem;
}

.loading, .empty {
  text-align: center;
  padding: 3rem;
  color: #666;
}
</style>
