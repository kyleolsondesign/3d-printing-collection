<template>
  <div class="printed-view">
    <div class="header">
      <div class="header-left">
        <h2>Printed</h2>
        <span class="count-badge" v-if="printed.length > 0">{{ printed.length }}</span>
      </div>
      <p class="subtitle">Your printing history and quality ratings</p>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <span>Loading print history...</span>
    </div>

    <div v-else-if="printed.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
      </div>
      <h3>No prints recorded</h3>
      <p>Your print history will appear here once you start tracking prints.</p>
    </div>

    <div v-else class="printed-list">
      <div
        v-for="(item, index) in printed"
        :key="item.id"
        class="printed-card"
        :style="{ animationDelay: `${index * 50}ms` }"
      >
        <div class="printed-status" :class="item.rating || 'neutral'">
          <svg v-if="item.rating === 'good'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
          </svg>
          <svg v-else-if="item.rating === 'bad'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12h8"/>
          </svg>
        </div>
        <div class="printed-content">
          <h3>{{ item.filename }}</h3>
          <div class="printed-meta">
            <span class="category-tag">{{ item.category }}</span>
            <span class="file-type">{{ item.file_type }}</span>
            <span class="print-date">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              {{ formatDate(item.printed_at) }}
            </span>
          </div>
          <div v-if="item.rating" class="rating-badge" :class="item.rating">
            {{ item.rating === 'good' ? 'Good print' : 'Bad print' }}
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
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
</script>

<style scoped>
.printed-view {
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

.printed-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.printed-card {
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

.printed-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-elevated);
}

.printed-status {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.printed-status svg {
  width: 20px;
  height: 20px;
}

.printed-status.good {
  background: var(--success-dim);
  color: var(--success);
}

.printed-status.bad {
  background: var(--danger-dim);
  color: var(--danger);
}

.printed-status.neutral {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.printed-content {
  flex: 1;
  min-width: 0;
}

.printed-content h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.printed-meta {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
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

.print-date {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.print-date svg {
  width: 14px;
  height: 14px;
}

.rating-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.rating-badge.good {
  background: var(--success-dim);
  color: var(--success);
}

.rating-badge.bad {
  background: var(--danger-dim);
  color: var(--danger);
}

.notes {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-subtle);
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
