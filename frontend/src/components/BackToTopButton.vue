<template>
  <Transition name="back-to-top">
    <button
      v-if="visible"
      class="back-to-top"
      @click="scrollToTop"
      title="Back to top"
      aria-label="Scroll back to top"
    >
      <AppIcon name="chevron-up" stroke-width="2.5" />
    </button>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import AppIcon from './AppIcon.vue';

const SHOW_THRESHOLD = 400;

const visible = ref(false);

function onScroll() {
  visible.value = window.scrollY > SHOW_THRESHOLD;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<style scoped>
.back-to-top {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 200;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  transition:
    color var(--transition-base),
    border-color var(--transition-base),
    background var(--transition-base),
    box-shadow var(--transition-base);
}

.back-to-top:hover {
  color: var(--accent-primary);
  border-color: rgba(34, 211, 238, 0.4);
  background: var(--accent-primary-dim);
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.15);
}

.back-to-top svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

/* Transition */
.back-to-top-enter-active,
.back-to-top-leave-active {
  transition:
    opacity var(--transition-slow),
    transform var(--transition-slow);
}

.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
