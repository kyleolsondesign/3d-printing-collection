<template>
  <div class="view-controls">
    <div class="controls-left">
      <!-- Sort controls -->
      <div v-if="sortOptions.length > 0" class="sort-controls">
        <select :value="sortField" @change="emit('update:sortField', ($event.target as HTMLSelectElement).value)" class="sort-select">
          <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button
          v-if="showSortOrder && sortField !== 'random'"
          @click="emit('update:sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')"
          class="sort-order-btn"
          :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'"
        >
          <AppIcon :name="sortOrder === 'desc' ? 'sort-desc' : 'sort-asc'" />
        </button>
      </div>

      <!-- Filter toggles -->
      <div v-if="filters.length > 0" class="filter-toggles">
        <button
          v-for="filter in filters"
          :key="filter.key"
          @click="onFilterClick(filter.key)"
          :class="['filter-toggle-btn', { active: filterStates[filter.key] === 'only', 'filter-hide': filterStates[filter.key] === 'hide' }]"
          :title="filterTitle(filter)"
        >
          <AppIcon v-if="filter.icon === 'favorite'" name="heart" />
          <AppIcon v-else-if="filter.icon === 'queue'" name="bookmark" />
          <AppIcon v-else-if="filter.icon === 'printed'" name="check-circle" />
          <span>{{ filterLabel(filter.key, filter.label) }}</span>
        </button>
      </div>
    </div>

    <!-- View mode toggle -->
    <div v-if="showViewToggle" class="view-toggle">
      <button
        @click="emit('update:viewMode', 'grid')"
        :class="['view-btn', { active: viewMode === 'grid' }]"
        title="Grid view"
      >
        <AppIcon name="grid" />
      </button>
      <button
        @click="emit('update:viewMode', 'table')"
        :class="['view-btn', { active: viewMode === 'table' }]"
        title="Table view"
      >
        <AppIcon name="list" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue';

export interface FilterOption {
  key: string;
  label: string;
  icon: 'favorite' | 'queue' | 'printed';
}

export interface SortOption {
  value: string;
  label: string;
}

type FilterState = '' | 'only' | 'hide';

const props = withDefaults(defineProps<{
  sortOptions?: SortOption[];
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  viewMode?: 'grid' | 'table';
  filters?: FilterOption[];
  filterStates?: Record<string, FilterState>;
  showViewToggle?: boolean;
  showSortOrder?: boolean;
}>(), {
  sortOptions: () => [],
  sortField: '',
  sortOrder: 'desc',
  viewMode: 'grid',
  filters: () => [],
  filterStates: () => ({}),
  showViewToggle: true,
  showSortOrder: true,
});

const emit = defineEmits<{
  'update:sortField': [value: string];
  'update:sortOrder': [value: 'asc' | 'desc'];
  'update:viewMode': [value: 'grid' | 'table'];
  'update:filterStates': [value: Record<string, FilterState>];
}>();

function cycleFilter(current: FilterState): FilterState {
  if (current === '') return 'only';
  if (current === 'only') return 'hide';
  return '';
}

function filterLabel(key: string, name: string): string {
  const state = props.filterStates[key] ?? '';
  if (state === 'only') return `Only ${name}`;
  if (state === 'hide') return `Hide ${name}`;
  return name;
}

function filterTitle(filter: FilterOption): string {
  const state = props.filterStates[filter.key] ?? '';
  if (state === 'only') return `Only ${filter.label} (click to hide)`;
  if (state === 'hide') return `Hiding ${filter.label} (click to clear)`;
  return `Click to show only ${filter.label}`;
}

function onFilterClick(key: string) {
  const current: FilterState = (props.filterStates[key] as FilterState) ?? '';
  const updated = { ...props.filterStates, [key]: cycleFilter(current) };
  emit('update:filterStates', updated);
}
</script>

<style scoped>
.view-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.filter-toggles {
  display: flex;
  gap: 0.375rem;
}

.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.filter-toggle-btn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.filter-toggle-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-secondary);
}

.filter-toggle-btn.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.filter-toggle-btn.filter-hide {
  background: rgba(248, 113, 113, 0.1);
  border-color: var(--danger);
  color: var(--danger);
}

.sort-controls {
  display: flex;
  gap: 0.25rem;
}

.sort-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}

.sort-select:hover {
  border-color: var(--border-strong);
}

.sort-order-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.sort-order-btn svg {
  width: 16px;
  height: 16px;
}

.sort-order-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.view-toggle {
  display: flex;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-elevated);
}

.view-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-right: 1px solid var(--border-default);
  cursor: pointer;
  transition: all var(--transition-base);
}

.view-btn:last-child {
  border-right: none;
}

.view-btn svg {
  width: 16px;
  height: 16px;
}

.view-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.view-btn.active {
  background: var(--accent-primary);
  color: var(--bg-deepest);
}
</style>
