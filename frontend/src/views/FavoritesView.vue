<template>
  <div class="favorites-view">
    <h2>Favorite Models</h2>
    <p class="subtitle">Your favorited 3D models</p>

    <div v-if="loading" class="loading">Loading favorites...</div>
    <div v-else-if="favorites.length === 0" class="empty">
      <p>No favorites yet. Add some models to your favorites from the Browse page!</p>
    </div>
    <div v-else class="models-list">
      <div v-for="fav in favorites" :key="fav.id" class="model-item">
        <div class="model-content">
          <h3>{{ fav.filename }}</h3>
          <p class="model-path">{{ fav.category }} • {{ fav.file_type }}</p>
          <p v-if="fav.notes" class="notes">{{ fav.notes }}</p>
        </div>
        <div class="actions">
          <button @click="removeFavorite(fav.id)" class="btn-danger">Remove</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { favoritesApi } from '../services/api';

const favorites = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  await loadFavorites();
});

async function loadFavorites() {
  try {
    const response = await favoritesApi.getAll();
    favorites.value = response.data.favorites;
  } catch (error) {
    console.error('Failed to load favorites:', error);
  } finally {
    loading.value = false;
  }
}

async function removeFavorite(id: number) {
  try {
    await favoritesApi.delete(id);
    favorites.value = favorites.value.filter(f => f.id !== id);
  } catch (error) {
    console.error('Failed to remove favorite:', error);
  }
}
</script>

<style scoped>
.favorites-view {
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

.models-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.model-item {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.model-content h3 {
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
