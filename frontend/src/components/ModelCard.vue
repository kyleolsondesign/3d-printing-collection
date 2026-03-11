<template>
  <div
    :class="['model-card', { selected: isSelected }]"
    :style="animationDelay !== undefined ? { animationDelay: `${animationDelay}ms` } : {}"
    @click="onCardClick"
  >
    <!-- Selection checkbox -->
    <div v-if="selectionMode" class="selection-checkbox" @click.stop="emit('select')">
      <AppIcon :name="isSelected ? 'checkbox-checked' : 'checkbox'" />
    </div>

    <!-- Optional badge overlay (e.g. print rating, printing indicator) -->
    <slot name="badge" />

    <!-- Image area -->
    <div class="model-image" @click.stop="selectionMode ? emit('select') : emit('open')">
      <img
        v-if="model.primaryImage"
        :src="getFileUrl(model.primaryImage)"
        :alt="model.filename"
        @error="onImageError"
        loading="lazy"
      />
      <div v-else class="no-image">
        <AppIcon name="package" />
      </div>
      <a class="image-overlay" :href="modelHref" @click="onOverlayClick">
        <span class="open-hint" @click="onHintClick">View details</span>
      </a>
    </div>

    <!-- Info area -->
    <div class="model-info">
      <h3 :title="model.filename" @click="emit('open')">{{ model.filename }}</h3>
      <div class="model-meta">
        <slot name="meta-badges" />
        <span class="category-tag">{{ model.category }}</span>
        <span v-if="model.file_count > 1" class="file-count">{{ model.file_count }} files</span>
      </div>
      <div class="model-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { modelsApi } from '../services/api';
import AppIcon from './AppIcon.vue';

interface ModelLike {
  id: number;
  filename: string;
  category: string;
  file_count: number;
  primaryImage?: string | null;
  filepath?: string;
}

const props = withDefaults(defineProps<{
  model: ModelLike;
  selectionMode?: boolean;
  isSelected?: boolean;
  animationDelay?: number;
  modelHref?: string;
}>(), {
  selectionMode: false,
  isSelected: false,
  modelHref: '#',
});

const emit = defineEmits<{
  open: [];
  select: [];
}>();

function onCardClick() {
  if (props.selectionMode) {
    emit('select');
  }
}

function onOverlayClick(event: MouseEvent) {
  // Let Cmd/Ctrl+Click open in new tab natively
  if (event.metaKey || event.ctrlKey) {
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation(); // prevent .model-image from also firing
  if (props.selectionMode) {
    emit('select');
  } else {
    emit('open');
  }
}

function onHintClick(event: MouseEvent) {
  // Let Cmd/Ctrl+Click bubble to the parent <a> for native new-tab behavior
  if (event.metaKey || event.ctrlKey) return;
  event.stopPropagation();
  event.preventDefault();
  emit('open');
}

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
}

function getFileUrl(path: string) {
  return modelsApi.getFileUrl(path);
}
</script>

<style scoped>
.model-card {
  position: relative;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  transition: all var(--transition-base);
  animation: fadeIn 0.4s ease-out backwards;
}

.model-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.model-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-dim);
}

/* Selection checkbox */
.selection-checkbox {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 10;
  width: 24px;
  height: 24px;
  cursor: pointer;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
}

.selection-checkbox svg {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
}

.selection-checkbox:hover svg {
  color: var(--accent-primary);
}

/* Image */
.model-image {
  width: 100%;
  aspect-ratio: 4/3;
  background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-deep) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.model-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-slow);
}

.model-card:hover .model-image img {
  transform: scale(1.05);
}

.no-image {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.no-image svg {
  width: 48px;
  height: 48px;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.model-image:hover .image-overlay {
  opacity: 1;
}

.open-hint {
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  border-radius: var(--radius-md);
}

/* Info */
.model-info {
  padding: 1rem;
}

.model-info h3 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  cursor: pointer;
}

.model-info h3:hover {
  color: var(--accent-primary);
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
}

.category-tag {
  padding: 0.25rem 0.5rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.file-count {
  padding: 0.25rem 0.5rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.model-actions {
  display: flex;
  gap: 0.5rem;
}

/* Action button styles accessible via :slotted */
:slotted(.action-btn) {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  transition: all var(--transition-base);
  cursor: pointer;
}

:slotted(.action-btn svg) {
  width: 18px;
  height: 18px;
}

:slotted(.action-btn:hover) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

:slotted(.action-btn.active) {
  background: var(--accent-primary);
  color: var(--bg-deepest);
  border-color: var(--accent-primary);
}

:slotted(.action-btn.printed-good) {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
  color: #22c55e;
}

:slotted(.action-btn.printed-bad) {
  background: rgba(248, 113, 113, 0.15);
  border-color: var(--danger);
  color: var(--danger);
}

:slotted(.action-btn.printing-active) {
  background: rgba(251, 146, 60, 0.15);
  border-color: #fb923c;
  color: #fb923c;
}
</style>
