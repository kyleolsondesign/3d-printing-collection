<template>
  <div class="app">
    <nav class="navbar">
      <router-link to="/" class="navbar-brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="brand-text">
          <h1>3D Collection</h1>
          <span class="brand-tagline">Model Manager</span>
        </div>
      </router-link>
      <div class="navbar-links">
        <router-link to="/" :class="{ active: $route.name === 'browse' }">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </span>
          <span class="nav-label">Browse</span>
        </router-link>
        <router-link to="/favorites" :class="{ active: $route.name === 'favorites' }">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </span>
          <span class="nav-label">Favorites</span>
        </router-link>
        <router-link to="/queue" :class="{ active: $route.name === 'queue' }">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
          </span>
          <span class="nav-label">Queue</span>
        </router-link>
        <router-link to="/printed" :class="{ active: $route.name === 'printed' }">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </span>
          <span class="nav-label">Printed</span>
        </router-link>
        <router-link to="/loose-files" :class="{ active: $route.name === 'loose-files' }">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <path d="M13 2v7h7"/>
            </svg>
          </span>
          <span class="nav-label">Loose</span>
          <span v-if="looseFilesCount > 0" class="badge badge-warning">{{ looseFilesCount }}</span>
        </router-link>
        <router-link to="/settings" :class="{ active: $route.name === 'settings' }">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </span>
          <span class="nav-label">Settings</span>
        </router-link>
      </div>

      <!-- Global Search -->
      <div class="navbar-search">
        <div class="search-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="searchInput"
            @keyup.enter="handleSearch"
            type="text"
            :placeholder="searchPlaceholder"
            class="search-input"
          />
          <button v-if="searchInput" @click="clearSearch" class="search-clear">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from './store';
import { systemApi } from './services/api';

const store = useAppStore();
const router = useRouter();
const route = useRoute();
const looseFilesCount = ref(0);
const searchInput = ref('');

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

function handleSearch() {
  if (searchInput.value.trim()) {
    store.setGlobalSearch(searchInput.value.trim());
  }
}

function clearSearch() {
  searchInput.value = '';
  store.clearGlobalSearch();
}

// Sync search input with store (for when navigating back)
watch(() => store.globalSearchQuery, (newVal) => {
  searchInput.value = newVal;
}, { immediate: true });

const searchPlaceholder = computed(() => {
  const placeholders: Record<string, string> = {
    browse: 'Search models...',
    favorites: 'Search favorites...',
    queue: 'Search queue...',
    printed: 'Search printed...',
    'loose-files': 'Search loose files...',
  };
  return placeholders[route.name as string] || 'Search models...';
});
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-deepest);
}

.navbar {
  background: var(--bg-deep);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: rgba(16, 17, 19, 0.85);
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  text-decoration: none;
  transition: opacity var(--transition-base);
}

.navbar-brand:hover {
  opacity: 0.85;
}

.navbar-brand:hover .brand-icon {
  border-color: var(--accent-primary);
}

.brand-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  border: 1px solid rgba(34, 211, 238, 0.2);
}

.brand-icon svg {
  width: 22px;
  height: 22px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.brand-text h1 {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.brand-tagline {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 500;
}

.navbar-links {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  margin-left: 2rem;
}

.navbar-links a {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.5rem 0.875rem;
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
  position: relative;
  border: 1px solid transparent;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.nav-icon svg {
  width: 18px;
  height: 18px;
}

.navbar-links a:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--border-subtle);
}

.navbar-links a.active {
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
  border-color: rgba(34, 211, 238, 0.2);
}

.navbar-links a.active .nav-icon {
  color: var(--accent-primary);
}

.badge {
  background: var(--accent-primary);
  color: var(--bg-deepest);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.badge-warning {
  background: var(--warning);
}

/* Global Search */
.navbar-search {
  margin-left: auto;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 240px;
  padding: 0.5rem 2rem 0.5rem 2.25rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: all var(--transition-base);
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  background: var(--bg-deep);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.search-clear {
  position: absolute;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.search-clear svg {
  width: 14px;
  height: 14px;
}

.main-content {
  flex: 1;
  padding: 2rem;
  max-width: 1600px;
  width: 100%;
  margin: 0 auto;
}

/* Responsive */
@media (max-width: 900px) {
  .navbar {
    padding: 0 1rem;
  }

  .nav-label {
    display: none;
  }

  .navbar-links a {
    padding: 0.625rem;
  }

  .brand-tagline {
    display: none;
  }

  .search-input {
    width: 160px;
  }
}

@media (max-width: 600px) {
  .navbar-search {
    display: none;
  }
}
</style>
