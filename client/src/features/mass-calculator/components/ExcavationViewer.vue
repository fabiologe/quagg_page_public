<template>
  <div class="excavation-viewer" ref="container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'

const props = defineProps({
  dimensions: {
    type: Object,
    required: true
  }
})

const container = ref(null)
let scene, camera, renderer, controls, pitMesh, carMesh

const init = () => {
  if (!container.value) return

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf8f9fa)

  // Camera
  camera = new THREE.PerspectiveCamera(45, container.value.clientWidth / container.value.clientHeight, 0.1, 1000)
  camera.position.set(20, 20, 20)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.shadowMap.enabled = true
  container.value.appendChild(renderer.domElement)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(10, 20, 10)
  dirLight.castShadow = true
  scene.add(dirLight)

  // Grid Helper
  const gridHelper = new THREE.GridHelper(50, 50, 0xdddddd, 0xeeeeee)
  scene.add(gridHelper)

  // Load Car Model (OBJ)
  const loader = new OBJLoader()
  loader.load(
    '/models/BMW850.obj',
    (object) => {
      // Apply material
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x3498db, 
        roughness: 0.5, 
        metalness: 0.7 
      })
      
      object.traverse((child) => {
        if (child.isMesh) {
          child.material = material
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      // Scale and Position
      // Assuming the model might need scaling. Let's start with 1 and adjust if needed.
      // Often raw OBJs are in different units.
      // A BMW 850 is approx 4.7m long.
      // We can compute bounding box to normalize scale.
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const targetSize = 4.7
      const scale = targetSize / maxDim
      
      object.scale.set(scale, scale, scale)
      
      // Align car parallel to the edge (facing Z)
      object.rotation.y = 0 
      
      scene.add(object)
      carMesh = object
      updateCarPosition()
    },
    (xhr) => {
      // console.log((xhr.loaded / xhr.total * 100) + '% loaded')
    },
    (error) => {
      console.error('An error happened loading the model', error)
    }
  )

  updateGeometry()
  animate()
}

const updateCarPosition = () => {
  if (!carMesh || !props.dimensions) return
  
  const { l1 } = props.dimensions
  
  // Calculate bounding box to get width
  const box = new THREE.Box3().setFromObject(carMesh)
  const size = box.getSize(new THREE.Vector3())
  
  // Position: Half of pit length + 2m gap + Half of car width
  const xPos = (l1 / 2) + 2.0 + (size.x / 2)
  
  carMesh.position.set(xPos, 0, 0)
}

const updateGeometry = () => {
  if (!props.dimensions) return
  
  const { l1, b1, l2, b2, h } = props.dimensions

  // Validate dimensions to prevent NaN errors
  if (![l1, b1, l2, b2, h].every(v => Number.isFinite(v) && v >= 0)) {
    console.warn('Invalid dimensions for 3D Viewer:', props.dimensions)
    return
  }
  
  // Remove old mesh and edges
  if (pitMesh) {
    scene.remove(pitMesh)
    pitMesh.geometry.dispose()
    pitMesh.material.dispose()
    pitMesh = null
  }
  
  // Remove old edges if they exist
  const oldEdges = scene.getObjectByName('pitEdges')
  if (oldEdges) {
    scene.remove(oldEdges)
    oldEdges.geometry.dispose()
    oldEdges.material.dispose()
  }



  // Create Truncated Pyramid Geometry
  const vertices = [
    // Top (Ground)
    -l1/2, 0, -b1/2, // 0
     l1/2, 0, -b1/2, // 1
     l1/2, 0,  b1/2, // 2
    -l1/2, 0,  b1/2, // 3
    // Bottom (Pit)
    -l2/2, -h, -b2/2, // 4
     l2/2, -h, -b2/2, // 5
     l2/2, -h,  b2/2, // 6
    -l2/2, -h,  b2/2  // 7
  ]

  // Indices for faces
  const indices = [
    // Bottom
    4, 5, 6, 4, 6, 7,
    // Top
    3, 2, 1, 3, 1, 0,
    // Front
    0, 1, 5, 0, 5, 4,
    // Right
    1, 2, 6, 1, 6, 5,
    // Back
    2, 3, 7, 2, 7, 6,
    // Left
    3, 0, 4, 3, 4, 7
  ]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Earthy brown
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide
  })

  pitMesh = new THREE.Mesh(geometry, material)
  pitMesh.castShadow = true
  pitMesh.receiveShadow = true
  scene.add(pitMesh)
  
  // Add Edges
  const edgesGeometry = new THREE.EdgesGeometry(geometry)
  const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x3e2723, linewidth: 2 })
  const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial)
  edges.name = 'pitEdges'
  scene.add(edges)
  
  updateCarPosition()
}

const animate = () => {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

watch(() => props.dimensions, () => {
  updateGeometry()
}, { deep: true })

onMounted(() => {
  init()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (renderer) {
    renderer.dispose()
  }
})

const handleResize = () => {
  if (!container.value || !camera || !renderer) return
  camera.aspect = container.value.clientWidth / container.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
}
</script>

<style scoped>
.excavation-viewer {
  width: 100%;
  height: 400px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.05);
}
</style>
