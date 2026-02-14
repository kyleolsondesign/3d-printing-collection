import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ModelDetailsModal from '../components/ModelDetailsModal.vue';
import * as api from '../services/api';

vi.mock('../services/api');

const mockModelDetails = {
    id: 1,
    filename: 'Test Model',
    filepath: '/test/models/a',
    category: 'Toys',
    is_paid: 0,
    is_original: 0,
    file_count: 2,
    date_added: '2024-01-01',
    date_created: '2024-01-01',
    created_at: '2024-01-01',
    isFavorite: false,
    isQueued: false,
    printHistory: [],
    assets: [
        { id: 1, model_id: 1, filepath: '/test/models/a/image1.jpg', asset_type: 'image', is_primary: 1 },
        { id: 2, model_id: 1, filepath: '/test/models/a/image2.jpg', asset_type: 'image', is_primary: 0 }
    ],
    zipFiles: []
};

const mockFiles = [
    { id: 1, model_id: 1, filename: 'model.stl', filepath: '/test/models/a/model.stl', file_size: 50000, file_type: 'stl' }
];

function setupMocks(overrides: Partial<typeof mockModelDetails> = {}) {
    vi.mocked(api.modelsApi.getById).mockResolvedValue({
        data: { ...mockModelDetails, ...overrides }
    } as any);
    vi.mocked(api.modelsApi.getFiles).mockResolvedValue({
        data: { files: mockFiles }
    } as any);
    vi.mocked(api.modelsApi.getFileUrl).mockImplementation(
        (filepath: string) => `/api/models/file/serve?path=${filepath}`
    );
}

function mountModal(props = { modelId: 1 }) {
    return mount(ModelDetailsModal, {
        props,
        global: {
            plugins: [createPinia()],
            stubs: {
                Teleport: true
            }
        }
    });
}

describe('ModelDetailsModal', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        setupMocks();
    });

    it('loads and displays model details on mount', async () => {
        const wrapper = mountModal();
        await flushPromises();

        expect(api.modelsApi.getById).toHaveBeenCalledWith(1);
        expect(api.modelsApi.getFiles).toHaveBeenCalledWith(1);
        expect(wrapper.text()).toContain('Test Model');
        expect(wrapper.text()).toContain('Toys');
    });

    it('displays multiple image thumbnails', async () => {
        const wrapper = mountModal();
        await flushPromises();

        const thumbnails = wrapper.findAll('.thumbnail');
        expect(thumbnails).toHaveLength(2);
    });

    it('shows hide button on non-primary thumbnails', async () => {
        const wrapper = mountModal();
        await flushPromises();

        const hideButtons = wrapper.findAll('.hide-asset-btn');
        // Only non-primary images get hide button
        expect(hideButtons).toHaveLength(1);
    });

    it('calls hideAsset API when hide button clicked', async () => {
        vi.mocked(api.modelsApi.hideAsset).mockResolvedValue({ data: { success: true } } as any);
        const wrapper = mountModal();
        await flushPromises();

        const hideBtn = wrapper.find('.hide-asset-btn');
        await hideBtn.trigger('click');
        await flushPromises();

        expect(api.modelsApi.hideAsset).toHaveBeenCalledWith(1, 2, true);
    });

    it('shows edit name button on hover area', async () => {
        const wrapper = mountModal();
        await flushPromises();

        const editBtn = wrapper.find('.edit-name-btn');
        expect(editBtn.exists()).toBe(true);
    });

    it('enters edit mode when pencil clicked', async () => {
        const wrapper = mountModal();
        await flushPromises();

        await wrapper.find('.edit-name-btn').trigger('click');
        const input = wrapper.find('.name-input');
        expect(input.exists()).toBe(true);
        expect((input.element as HTMLInputElement).value).toBe('Test Model');
    });

    it('saves name on Enter key', async () => {
        vi.mocked(api.modelsApi.updateMetadata).mockResolvedValue({ data: { success: true } } as any);
        const wrapper = mountModal();
        await flushPromises();

        await wrapper.find('.edit-name-btn').trigger('click');
        const input = wrapper.find('.name-input');
        await input.setValue('New Name');
        await input.trigger('keydown.enter');
        await flushPromises();

        expect(api.modelsApi.updateMetadata).toHaveBeenCalledWith(1, 'New Name');
    });

    it('cancels edit on Escape key', async () => {
        const wrapper = mountModal();
        await flushPromises();

        await wrapper.find('.edit-name-btn').trigger('click');
        expect(wrapper.find('.name-input').exists()).toBe(true);

        await wrapper.find('.name-input').trigger('keydown.escape');
        expect(wrapper.find('.name-input').exists()).toBe(false);
        expect(wrapper.find('.model-name-section h2').text()).toBe('Test Model');
    });

    it('shows makes section when model is printed', async () => {
        setupMocks({
            printHistory: [{ id: 1, model_id: 1, printed_at: '2024-01-01', rating: 'good', notes: null }]
        } as any);
        vi.mocked(api.printedApi.getImages).mockResolvedValue({ data: { images: [] } } as any);

        const wrapper = mountModal();
        await flushPromises();

        expect(wrapper.find('.makes-section').exists()).toBe(true);
        expect(wrapper.find('.upload-make-btn').exists()).toBe(true);
    });

    it('does not show makes section for unprinted model', async () => {
        const wrapper = mountModal();
        await flushPromises();

        expect(wrapper.find('.makes-section').exists()).toBe(false);
    });

    it('emits close on escape key', async () => {
        const wrapper = mountModal();
        await flushPromises();

        // Simulate keydown event on document
        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(event);

        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('toggles favorite when button clicked', async () => {
        vi.mocked(api.favoritesApi.toggle).mockResolvedValue({ data: { favorited: true } } as any);
        const wrapper = mountModal();
        await flushPromises();

        const favBtn = wrapper.findAll('.action-btn').find(b => b.text().includes('Favorites'));
        expect(favBtn).toBeDefined();
        await favBtn!.trigger('click');
        await flushPromises();

        expect(api.favoritesApi.toggle).toHaveBeenCalledWith(1);
    });

    it('toggles queue when button clicked', async () => {
        vi.mocked(api.queueApi.toggle).mockResolvedValue({ data: { queued: true } } as any);
        const wrapper = mountModal();
        await flushPromises();

        const queueBtn = wrapper.findAll('.action-btn').find(b => b.text().includes('Queue'));
        expect(queueBtn).toBeDefined();
        await queueBtn!.trigger('click');
        await flushPromises();

        expect(api.queueApi.toggle).toHaveBeenCalledWith(1);
    });

    it('marks model as printed (good) when button clicked', async () => {
        vi.mocked(api.printedApi.toggle).mockResolvedValue({ data: { printed: true } } as any);
        const wrapper = mountModal();
        await flushPromises();

        const goodBtn = wrapper.findAll('.action-btn').find(b => b.text().includes('Mark Good'));
        expect(goodBtn).toBeDefined();
        await goodBtn!.trigger('click');
        await flushPromises();

        expect(api.printedApi.toggle).toHaveBeenCalledWith(1, 'good');
    });

    it('displays model files with file type badges', async () => {
        const wrapper = mountModal();
        await flushPromises();

        const fileItems = wrapper.findAll('.file-item');
        expect(fileItems).toHaveLength(1);
        expect(wrapper.find('.file-type-badge').text()).toBe('stl');
    });
});
