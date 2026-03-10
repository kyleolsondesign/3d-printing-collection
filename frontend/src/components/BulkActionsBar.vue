<template>
  <div class="bulk-actions-bar">
    <div class="bulk-left">
      <span class="selected-count">{{ selectedCount }} selected</span>
      <button @click="allSelected ? emit('deselectAll') : emit('selectAll')" class="select-all-btn">
        {{ allSelected ? 'Deselect All' : 'Select All' }}
      </button>
    </div>
    <div class="bulk-actions" :class="{ disabled: loading || selectedCount === 0 }">
      <slot name="actions" />
      <div v-if="loading" class="bulk-loading">
        <div class="loading-spinner small"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  selectedCount: number;
  totalCount: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  selectAll: [];
  deselectAll: [];
}>();

const allSelected = computed(() => props.totalCount > 0 && props.selectedCount === props.totalCount);
</script>

<style scoped>
.bulk-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1.25rem;
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-lg);
  gap: 1rem;
}

.bulk-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.selected-count {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}

.select-all-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.select-all-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.bulk-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bulk-actions.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.bulk-loading {
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-spinner.small {
  width: 20px;
  height: 20px;
  border-width: 2px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<!-- Styles for bulk buttons used in slot content, accessible globally via :slotted -->
<style>
.bulk-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.bulk-btn svg {
  width: 16px;
  height: 16px;
}

.bulk-btn:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.bulk-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bulk-btn.delete-btn:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
}
</style>
