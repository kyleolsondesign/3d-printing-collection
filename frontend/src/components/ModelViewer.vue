<template>
  <div class="model-viewer" :class="{ 'model-viewer--fullscreen': isFullscreen }">
    <!-- Idle: show activate button -->
    <div v-if="viewerState === 'idle'" class="viewer-idle">
      <div v-if="previewableFile" class="idle-controls">
        <select
          v-if="props.modelFiles.length > 1"
          v-model="selectedFileId"
          class="file-select"
        >
          <option v-for="f in props.modelFiles" :key="f.id" :value="f.id">
            {{ f.filename }} ({{ f.file_type?.toUpperCase() }})
          </option>
        </select>
        <button class="btn-activate" @click="activate">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 1 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          Preview 3D Model
        </button>
      </div>
      <span v-else class="no-preview-note">No STL or 3MF file available for preview</span>
    </div>

    <!-- Loading -->
    <div v-else-if="viewerState === 'loading'" class="viewer-status">
      <div class="loading-spinner"></div>
      <span>Loading 3D model…</span>
    </div>

    <!-- Capturing -->
    <div v-else-if="viewerState === 'capturing'" class="viewer-status">
      <div class="loading-spinner"></div>
      <span>Capturing screenshot…</span>
    </div>

    <!-- Error -->
    <div v-else-if="viewerState === 'error'" class="viewer-error">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{{ errorMessage }}</span>
      <button class="btn-retry" @click="viewerState = 'idle'">Retry</button>
    </div>

    <!-- Canvas (v-show keeps it in DOM once created) -->
    <div v-show="viewerState === 'ready' || viewerState === 'capturing'" class="viewer-canvas-wrapper">
      <canvas ref="canvasRef"></canvas>
      <button v-if="isFullscreen" class="btn-fullscreen-close" @click="isFullscreen = false" title="Close (Esc)">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div v-if="props.mode !== 'headless'" class="viewer-toolbar">
        <select
          v-if="props.modelFiles.length > 1"
          v-model="selectedFileId"
          class="file-select file-select-inline"
          @change="reloadFile"
        >
          <option v-for="f in props.modelFiles" :key="f.id" :value="f.id">
            {{ f.filename }}
          </option>
        </select>
        <button class="btn-capture" @click="captureScreenshot" title="Save as thumbnail">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
          Capture
        </button>
        <button class="btn-reset" @click="resetCamera" title="Reset camera">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
        </button>
        <button class="btn-fullscreen" @click="toggleFullscreen" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'">
          <svg v-if="!isFullscreen" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
          </svg>
        </button>
        <span class="viewer-hint">Drag · Scroll to zoom</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { modelsApi } from '../services/api'

interface ModelFile {
  id: number
  model_id: number
  filename: string
  filepath: string
  file_size: number
  file_type: string
}

const props = withDefaults(defineProps<{
  modelFiles: ModelFile[]
  modelId: number
  mode?: 'interactive' | 'headless'
  initialFileId?: number
  autoActivate?: boolean
}>(), {
  mode: 'interactive',
  autoActivate: false
})

const emit = defineEmits<{
  (e: 'imageCaptured', dataUrl: string): void
  (e: 'error', message: string): void
}>()

type ViewerState = 'idle' | 'loading' | 'ready' | 'capturing' | 'error'
const viewerState = ref<ViewerState>('idle')
const errorMessage = ref('')
const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedFileId = ref<number | null>(props.initialFileId ?? null)
const isFullscreen = ref(false)

// Three.js instances (typed loosely to avoid import at module level)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let THREE: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let renderer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scene: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let camera: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let controls: any = null
let animationFrameId: number | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initialCameraPosition: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initialCameraTarget: any = null

const previewableFile = computed(() => {
  // Use selected file if set, otherwise prefer 3MF then STL
  if (selectedFileId.value !== null) {
    return props.modelFiles.find(f => f.id === selectedFileId.value) ?? null
  }
  const threemf = props.modelFiles.find(f => f.file_type?.toLowerCase() === '3mf')
  const stl = props.modelFiles.find(f => f.file_type?.toLowerCase() === 'stl')
  return threemf || stl || null
})

onMounted(() => {
  if (props.autoActivate && previewableFile.value && viewerState.value === 'idle') {
    activate()
  }
  document.addEventListener('keydown', onKeydown)
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
    e.stopPropagation()
  }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

// Auto-activate in headless mode when we have files
watch(() => props.modelFiles, (files) => {
  if (props.mode === 'headless' && files.length > 0 && viewerState.value === 'idle') {
    activate()
  }
}, { immediate: true })

async function activate() {
  if (!previewableFile.value) return
  // Sync dropdown to show whichever file is actually being loaded
  selectedFileId.value = previewableFile.value.id
  viewerState.value = 'loading'

  try {
    const [
      threeModule,
      { STLLoader },
      { ThreeMFLoader },
      { OrbitControls }
    ] = await Promise.all([
      import('three'),
      import('three/examples/jsm/loaders/STLLoader.js'),
      import('three/examples/jsm/loaders/3MFLoader.js'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ])

    THREE = threeModule

    await initScene(STLLoader, ThreeMFLoader, OrbitControls)
    viewerState.value = 'ready'

    if (props.mode === 'headless') {
      // Render a few frames to let the model stabilize, then auto-capture
      let frames = 0
      const autoCapture = () => {
        renderer.render(scene, camera)
        frames++
        if (frames < 10) {
          requestAnimationFrame(autoCapture)
        } else {
          captureScreenshot()
        }
      }
      requestAnimationFrame(autoCapture)
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load 3D preview'
    viewerState.value = 'error'
    emit('error', errorMessage.value)
  }
}

async function initScene(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  STLLoader: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ThreeMFLoader: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OrbitControls: any
) {
  const canvas = canvasRef.value!
  const container = canvas.parentElement!
  const size = props.mode === 'headless' ? 400 : (container.clientWidth || 400)

  // Renderer — alpha:true for transparent background capture
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true })
  renderer.setSize(size, size)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)  // fully transparent
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Camera — square aspect
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000)

  // Scene + lights
  scene = new THREE.Scene()
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambientLight)
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight1.position.set(1, 2, 3)
  scene.add(dirLight1)
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3)
  dirLight2.position.set(-2, -1, -2)
  scene.add(dirLight2)

  // Load model
  const file = previewableFile.value!
  const fileUrl = modelsApi.getFileUrl(file.filepath)
  const fileType = file.file_type?.toLowerCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loadedObject: any = null

  if (fileType === 'stl') {
    const loader = new STLLoader()
    const geometry: unknown = await new Promise((resolve, reject) => {
      loader.load(fileUrl, resolve, undefined, reject)
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geo = geometry as any
    const material = new THREE.MeshPhongMaterial({ color: 0x6ea8fe, specular: 0x333333, shininess: 30 })
    loadedObject = new THREE.Mesh(geo, material)
    scene.add(loadedObject)

  } else if (fileType === '3mf') {
    const loader = new ThreeMFLoader()
    const object: unknown = await new Promise((resolve, reject) => {
      loader.load(fileUrl, resolve, undefined, reject)
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadedObject = object as any

    // Fix up loaded meshes: smooth normals + enable vertex colors where present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadedObject.traverse((child: any) => {
      if (!child.isMesh) return
      // Compute smooth normals (loader leaves geometry without normals when flatShading)
      child.geometry.computeVertexNormals()
      const mats: any[] = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        // Enable vertex colors if the geometry carries color data
        if (child.geometry.attributes.color) mat.vertexColors = true
        // Switch to smooth shading for a cleaner look
        mat.flatShading = false
        mat.needsUpdate = true
      }
    })

    scene.add(loadedObject)
  }

  // Create OrbitControls before fitCameraToObject so target gets set correctly
  if (props.mode !== 'headless') {
    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // Responsive resize — square normally, fills viewport in fullscreen
    const ro = new ResizeObserver(() => {
      if (viewerState.value !== 'ready') return
      const w = container.clientWidth
      const h = isFullscreen.value ? container.clientHeight : w
      if (w > 0 && h > 0) {
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
    })
    ro.observe(container)
    ;(renderer as { _resizeObserver?: ResizeObserver })._resizeObserver = ro
  }

  // Correct Z-up (3D printing convention) → Y-up (Three.js convention)
  if (loadedObject) {
    loadedObject.rotation.x = -Math.PI / 2
    loadedObject.updateMatrixWorld(true)
  }

  // Fit camera to whatever was loaded — works regardless of model units or origin
  if (loadedObject) {
    fitCameraToObject(loadedObject)
  }

  // Start render loop
  startRenderLoop()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fitCameraToObject(object: any) {
  // Compute world-space bounding box of whatever was loaded
  const box = new THREE.Box3().setFromObject(object)
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)

  const radius = sphere.radius || 1
  const center = sphere.center

  // Adjust camera near/far to the model's scale
  camera.near = radius * 0.001
  camera.far = radius * 1000

  // Compute distance needed to frame the sphere in the vertical FOV
  const fovRad = (camera.fov * Math.PI) / 180
  const distance = (radius / Math.sin(fovRad / 2)) * 1.5  // 50% padding

  // Isometric-ish angle relative to sphere center
  const dir = new THREE.Vector3(1, 0.75, 1).normalize()
  camera.position.copy(center).addScaledVector(dir, distance)
  camera.lookAt(center)
  camera.updateProjectionMatrix()

  // Store for reset
  initialCameraPosition = camera.position.clone()
  initialCameraTarget = center.clone()

  // Set OrbitControls target to model center
  if (controls) {
    controls.target.copy(center)
    controls.minDistance = radius * 0.1
    controls.maxDistance = radius * 20
    controls.update()
  }
}

function startRenderLoop() {
  const tick = () => {
    if (controls) controls.update()
    renderer.render(scene, camera)
    animationFrameId = requestAnimationFrame(tick)
  }
  animationFrameId = requestAnimationFrame(tick)
}

function resetCamera() {
  if (!camera || !initialCameraPosition) return
  camera.position.copy(initialCameraPosition)
  const target = initialCameraTarget || new THREE.Vector3()
  camera.lookAt(target)
  if (controls) {
    controls.target.copy(target)
    controls.update()
  }
}

async function reloadFile() {
  // Tear down existing scene, then re-init with the new file selection
  if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null }
  if (controls) { controls.dispose(); controls = null }
  if (scene) {
    scene.traverse((obj: { isMesh?: boolean; geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> }) => {
      if (obj.isMesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
        else obj.material?.dispose()
      }
    })
    scene = null
  }
  // Keep renderer, canvas and THREE — just reload the model
  await activate()
}

function captureScreenshot() {
  if (viewerState.value === 'error') return
  viewerState.value = 'capturing'
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // Render at 2048×2048 into an offscreen canvas for high-res capture
  const HI_RES = 2048
  const hiCanvas = document.createElement('canvas')
  hiCanvas.width = HI_RES
  hiCanvas.height = HI_RES

  const hiRenderer = new THREE.WebGLRenderer({ canvas: hiCanvas, antialias: true, preserveDrawingBuffer: true, alpha: true })
  hiRenderer.setSize(HI_RES, HI_RES)
  hiRenderer.setPixelRatio(1)
  hiRenderer.setClearColor(0x000000, 0)
  hiRenderer.outputColorSpace = THREE.SRGBColorSpace

  // Temporarily adjust camera aspect for the square hi-res render
  const prevAspect = camera.aspect
  camera.aspect = 1
  camera.updateProjectionMatrix()

  hiRenderer.render(scene, camera)
  const dataUrl = hiCanvas.toDataURL('image/png')

  // Restore camera aspect
  camera.aspect = prevAspect
  camera.updateProjectionMatrix()

  hiRenderer.dispose()

  emit('imageCaptured', dataUrl)
  startRenderLoop()
  viewerState.value = 'ready'
}

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
  if (controls) controls.dispose()
  if (renderer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro = (renderer as any)._resizeObserver as ResizeObserver | undefined
    if (ro) ro.disconnect()
    renderer.forceContextLoss()
    renderer.dispose()
  }
  if (scene) {
    scene.traverse((obj: { isMesh?: boolean; geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> }) => {
      if (obj.isMesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose())
        } else {
          obj.material?.dispose()
        }
      }
    })
  }
})
</script>

<style scoped>
.model-viewer {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-deep);
}

.viewer-idle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  padding: 12px;
}

.idle-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.file-select {
  width: 100%;
  max-width: 320px;
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.file-select:focus { outline: none; border-color: rgba(110, 168, 254, 0.5); }

.file-select-inline {
  width: auto;
  max-width: 160px;
  font-size: 11px;
  padding: 3px 6px;
  pointer-events: all;
}

.btn-activate {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(110, 168, 254, 0.15);
  color: #6ea8fe;
  border: 1px solid rgba(110, 168, 254, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-activate:hover {
  background: rgba(110, 168, 254, 0.25);
}

.no-preview-note {
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.viewer-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 80px;
  color: #888;
  font-size: 13px;
}

.viewer-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 80px;
  color: #f87171;
  font-size: 13px;
  padding: 12px;
}

.btn-retry {
  padding: 4px 10px;
  font-size: 12px;
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 4px;
  cursor: pointer;
}
.btn-retry:hover { background: rgba(248, 113, 113, 0.25); }

.viewer-canvas-wrapper {
  position: relative;
  width: 100%;
}

.viewer-canvas-wrapper canvas {
  display: block;
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 1 / 1;
}

.viewer-toolbar {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.btn-capture,
.btn-reset {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  pointer-events: all;
  transition: background 0.15s;
  backdrop-filter: blur(4px);
}
.btn-capture:hover,
.btn-reset:hover,
.btn-fullscreen:hover {
  background: rgba(0, 0, 0, 0.8);
}

.btn-fullscreen {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 5px;
  cursor: pointer;
  pointer-events: all;
  transition: background 0.15s;
  backdrop-filter: blur(4px);
}

.viewer-hint {
  margin-left: auto;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(110, 168, 254, 0.2);
  border-top-color: #6ea8fe;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Fullscreen (lightbox-style) */
.model-viewer--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.95);
  border-radius: 0;
  display: flex;
  flex-direction: column;
}

.model-viewer--fullscreen .viewer-canvas-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.model-viewer--fullscreen .viewer-canvas-wrapper canvas {
  flex: 1;
  width: 100% !important;
  height: 100% !important;
  aspect-ratio: auto;
}

.model-viewer--fullscreen .viewer-idle,
.model-viewer--fullscreen .viewer-status,
.model-viewer--fullscreen .viewer-error {
  flex: 1;
}

.btn-fullscreen-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 1;
}

.btn-fullscreen-close:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
