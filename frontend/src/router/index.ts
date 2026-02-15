import { createRouter, createWebHistory } from 'vue-router';
import BrowseView from '../views/BrowseView.vue';
import FavoritesView from '../views/FavoritesView.vue';
import PrintedView from '../views/PrintedView.vue';
import QueueView from '../views/QueueView.vue';
import LooseFilesView from '../views/LooseFilesView.vue';
import IngestionView from '../views/IngestionView.vue';
import SettingsView from '../views/SettingsView.vue';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'browse',
            component: BrowseView
        },
        {
            path: '/favorites',
            name: 'favorites',
            component: FavoritesView
        },
        {
            path: '/printed',
            name: 'printed',
            component: PrintedView
        },
        {
            path: '/queue',
            name: 'queue',
            component: QueueView
        },
        {
            path: '/loose-files',
            name: 'loose-files',
            component: LooseFilesView
        },
        {
            path: '/ingestion',
            name: 'ingestion',
            component: IngestionView
        },
        {
            path: '/settings',
            name: 'settings',
            component: SettingsView
        }
    ]
});

export default router;
