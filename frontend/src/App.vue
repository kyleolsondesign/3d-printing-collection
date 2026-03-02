<template>
  <div class="app" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <!-- Sidebar -->
    <aside class="sidebar">
      <!-- Brand Header -->
      <div class="sidebar-header">
        <router-link to="/" class="brand-link">
          <div class="brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-name">3D Collection</span>
            <span class="brand-sub">Model Manager</span>
          </div>
        </router-link>
        <button class="collapse-btn" @click="toggleSidebar" :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <!-- Library Section -->
        <div class="nav-group">
          <span class="nav-group-label">Library</span>
          <router-link to="/" :class="{ active: $route.name === 'browse' }" data-label="Browse" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </span>
            <span class="nav-text">Browse</span>
          </router-link>
          <router-link to="/recent" :class="{ active: $route.name === 'recent' }" data-label="Recent" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </span>
            <span class="nav-text">Recent</span>
          </router-link>
          <router-link to="/favorites" :class="{ active: $route.name === 'favorites' }" data-label="Favorites" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </span>
            <span class="nav-text">Favorites</span>
          </router-link>
        </div>

        <!-- Print Section -->
        <div class="nav-group">
          <span class="nav-group-label">Print</span>
          <router-link to="/queue" :class="{ active: $route.name === 'queue' }" data-label="Queue" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
            </span>
            <span class="nav-text">Queue</span>
          </router-link>
          <router-link to="/printed" :class="{ active: $route.name === 'printed' }" data-label="Printed" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
            </span>
            <span class="nav-text">Printed</span>
          </router-link>
        </div>

        <!-- Manage Section -->
        <div class="nav-group">
          <span class="nav-group-label">Manage</span>
          <router-link to="/loose-files" :class="{ active: $route.name === 'loose-files' }" data-label="Loose Files" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                <path d="M13 2v7h7"/>
              </svg>
            </span>
            <span class="nav-text">Loose Files</span>
            <span v-if="looseFilesCount > 0" class="nav-badge">{{ looseFilesCount }}</span>
          </router-link>
          <router-link to="/designers" :class="{ active: $route.name === 'designers' }" data-label="Designers" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </span>
            <span class="nav-text">Designers</span>
          </router-link>
        </div>

        <!-- Push System to bottom -->
        <div class="nav-spacer"></div>

        <!-- System Section -->
        <div class="nav-group">
          <span class="nav-group-label">System</span>
          <router-link to="/stats" :class="{ active: $route.name === 'stats' }" data-label="Stats" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 20V10M12 20V4M6 20v-6"/>
              </svg>
            </span>
            <span class="nav-text">Stats</span>
          </router-link>
          <router-link to="/settings" :class="{ active: $route.name === 'settings' }" data-label="Settings" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </span>
            <span class="nav-text">Settings</span>
          </router-link>
        </div>
      </nav>
    </aside>

    <!-- Main Workspace -->
    <div class="workspace">
      <!-- Slim Topbar with Search -->
      <header class="topbar">
        <h2 class="page-title">{{ pageTitle }}</h2>
        <div class="topbar-right">
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
          <router-link to="/ingestion" :class="['import-btn', { active: $route.name === 'ingestion' }]" title="Import models">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <path d="M7 10l5 5 5-5"/>
              <path d="M12 15V3"/>
            </svg>
            <span>Import</span>
          </router-link>
        </div>
      </header>

      <!-- Page Content -->
      <main class="main-content">
        <router-view />
      </main>
    </div>
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

// Persist sidebar state across sessions
const savedCollapsed = localStorage.getItem('sidebar-collapsed');
const sidebarCollapsed = ref(savedCollapsed === 'true');

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed.value));
}

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
    if (route.name === 'settings') {
      router.push({ path: '/', query: { q: searchInput.value.trim() } });
      return;
    }
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
    recent: 'Search recent...',
    favorites: 'Search favorites...',
    queue: 'Search queue...',
    printed: 'Search printed...',
    'loose-files': 'Search loose files...',
    ingestion: 'Search imports...',
    designers: 'Search designers...',
    stats: 'Statistics',
  };
  return placeholders[route.name as string] || 'Search models...';
});

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    browse: 'Browse',
    recent: 'Recent',
    favorites: 'Favorites',
    queue: 'Queue',
    printed: 'Printed',
    'loose-files': 'Loose Files',
    designers: 'Designers',
    stats: 'Statistics',
    ingestion: 'Import',
    settings: 'Settings',
  };
  return titles[route.name as string] || 'Browse';
});
</script>

<style scoped>
/* ─── Layout ──────────────────────────────────────────────── */

.app {
  display: flex;
  min-height: 100vh;
  background: var(--bg-deepest);
}

/* ─── Sidebar ─────────────────────────────────────────────── */

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 220px;
  background: var(--bg-deep);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app.sidebar-collapsed .sidebar {
  width: 56px;
  overflow: visible;
}

/* ─── Sidebar Header ──────────────────────────────────────── */

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  height: 56px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  gap: 0.5rem;
  min-width: 0;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.brand-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  border: 1px solid rgba(34, 211, 238, 0.2);
  transition: border-color var(--transition-base);
}

.brand-link:hover .brand-icon {
  border-color: var(--accent-primary);
}

.brand-icon svg {
  width: 18px;
  height: 18px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-width: 140px;
  transition: max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease;
  opacity: 1;
}

.app.sidebar-collapsed .brand-text {
  max-width: 0;
  opacity: 0;
}

.brand-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.brand-sub {
  font-size: 0.6rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 500;
  white-space: nowrap;
}

.collapse-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-base);
  padding: 0;
}

.collapse-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-color: var(--border-subtle);
}

.collapse-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app.sidebar-collapsed .collapse-icon {
  transform: rotate(180deg);
}

/* ─── Sidebar Navigation ──────────────────────────────────── */

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.sidebar-nav::-webkit-scrollbar {
  display: none;
}

.app.sidebar-collapsed .sidebar-nav {
  overflow: visible;
}

.app.sidebar-collapsed .nav-group {
  overflow: visible;
}

.nav-group {
  padding: 0 0.5rem;
}

/* Divider between groups when collapsed */
.app.sidebar-collapsed .nav-group + .nav-group {
  border-top: 1px solid var(--border-subtle);
  margin-top: 0.25rem;
  padding-top: 0.375rem;
}

.nav-group-label {
  display: block;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0.875rem 0.5rem 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  max-height: 2.5rem;
  opacity: 1;
  transition: max-height 0.2s ease,
              opacity 0.15s ease,
              padding 0.2s ease;
}

.app.sidebar-collapsed .nav-group-label {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  text-decoration: none;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.5rem 0.5rem;
  border-radius: var(--radius-md);
  transition: color var(--transition-base),
              background var(--transition-base),
              border-color var(--transition-base);
  position: relative;
  border: 1px solid transparent;
  white-space: nowrap;
  overflow: hidden;
  min-height: 36px;
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--border-subtle);
}

.nav-item.active {
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
  border-color: rgba(34, 211, 238, 0.2);
}

.nav-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon svg {
  width: 18px;
  height: 18px;
}

.nav-text {
  flex: 1;
  overflow: hidden;
  max-width: 160px;
  opacity: 1;
  transition: max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.15s ease;
}

.app.sidebar-collapsed .nav-text {
  max-width: 0;
  opacity: 0;
}

.nav-badge {
  background: var(--warning);
  color: var(--bg-deepest);
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
  line-height: 1.4;
  transition: opacity 0.15s ease,
              transform 0.15s ease;
}

/* Shrink badge to dot when collapsed */
.app.sidebar-collapsed .nav-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  min-width: 0;
  padding: 0;
  font-size: 0;
  border-radius: 50%;
}

/* ─── Tooltip when collapsed ──────────────────────────────── */

.app.sidebar-collapsed .nav-item {
  overflow: visible;
}

.app.sidebar-collapsed .nav-item::after {
  content: attr(data-label);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-elevated);
  color: var(--text-primary);
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  z-index: 300;
}

.app.sidebar-collapsed .nav-item:hover::after {
  opacity: 1;
}

/* ─── Spacer ──────────────────────────────────────────────── */

.nav-spacer {
  flex: 1;
  min-height: 0.5rem;
}

/* ─── Workspace ───────────────────────────────────────────── */

.workspace {
  margin-left: 220px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
  transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app.sidebar-collapsed .workspace {
  margin-left: 56px;
}

/* ─── Topbar ──────────────────────────────────────────────── */

.topbar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.75rem;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(16, 17, 19, 0.8);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 50;
  flex-shrink: 0;
}

.page-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ─── Topbar right group ──────────────────────────────────── */

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.import-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.import-btn svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.import-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

.import-btn.active {
  border-color: rgba(34, 211, 238, 0.2);
  color: var(--accent-primary);
  background: var(--accent-primary-dim);
}

/* ─── Search ──────────────────────────────────────────────── */

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  width: 15px;
  height: 15px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 260px;
  padding: 0.4375rem 2rem 0.4375rem 2.125rem;
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
  width: 300px;
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
  width: 13px;
  height: 13px;
}

/* ─── Main Content ────────────────────────────────────────── */

.main-content {
  flex: 1;
  padding: 1.75rem 2rem;
}
</style>
