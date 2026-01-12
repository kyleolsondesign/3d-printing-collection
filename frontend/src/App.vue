<template>
  <div class="app">
    <nav class="navbar">
      <div class="navbar-brand">
        <h1>3D Printing Collection</h1>
      </div>
      <div class="navbar-links">
        <router-link to="/" :class="{ active: $route.name === 'browse' }">
          Browse
        </router-link>
        <router-link to="/favorites" :class="{ active: $route.name === 'favorites' }">
          Favorites
          <span v-if="store.stats.favorites > 0" class="badge">{{ store.stats.favorites }}</span>
        </router-link>
        <router-link to="/queue" :class="{ active: $route.name === 'queue' }">
          Print Queue
          <span v-if="store.stats.queued > 0" class="badge">{{ store.stats.queued }}</span>
        </router-link>
        <router-link to="/printed" :class="{ active: $route.name === 'printed' }">
          Printed
        </router-link>
        <router-link to="/loose-files" :class="{ active: $route.name === 'loose-files' }">
          Loose Files
          <span v-if="looseFilesCount > 0" class="badge badge-warning">{{ looseFilesCount }}</span>
        </router-link>
        <router-link to="/settings" :class="{ active: $route.name === 'settings' }">
          Settings
        </router-link>
      </div>
    </nav>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAppStore } from './store';
import { systemApi } from './services/api';

const store = useAppStore();
const looseFilesCount = ref(0);

onMounted(async () => {
  await store.loadConfig();
  await store.loadCategories();
  await loadLooseFilesCount();
});

async function loadLooseFilesCount() {
  try {
    const response = await systemApi.getStats();
    looseFilesCount.value = response.data.totalLooseFiles || 0;
  } catch (error) {
    console.error('Failed to load loose files count:', error);
  }
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.navbar {
  background: #fff;
  border-bottom: 1px solid #ddd;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.navbar-brand h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
}

.navbar-links {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.navbar-links a {
  text-decoration: none;
  color: #666;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  transition: all 0.2s;
  position: relative;
}

.navbar-links a:hover {
  color: #0066cc;
  background: #f0f7ff;
}

.navbar-links a.active {
  color: #0066cc;
  background: #e6f2ff;
}

.badge {
  background: #0066cc;
  color: white;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  margin-left: 0.5rem;
}

.badge-warning {
  background: #f59e0b;
}

.main-content {
  flex: 1;
  padding: 2rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}
</style>
