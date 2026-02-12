<template>
  <div class="map-wrapper">
    <div id="map" class="map-container"></div>
    
    <!-- Search Overlay -->
    <div class="search-overlay">
      <input 
        v-model="searchQuery" 
        @keyup.enter="searchAddress"
        placeholder="Adresse suchen..." 
        class="search-input"
        :disabled="isSearching"
      />
      <button @click="searchAddress" class="search-btn" :disabled="isSearching">
        <span v-if="!isSearching">🔍</span>
        <span v-else>...</span>
      </button>
    </div>

    <!-- Undo Control -->
    <div class="undo-control">
      <button @click="undoLastAction" class="undo-btn" title="Letzte Fläche löschen">
        ↩️ Rückgängig
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch, ref } from 'vue'
import L from 'leaflet'
import area from '@turf/area'
// import centerOfMass from '@turf/center-of-mass' // Configured out
import axios from 'axios'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import 'leaflet-geometryutil'
import 'leaflet-snap'

// ... imports for icons ...
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

// Search State
const searchQuery = ref('')
const isSearching = ref(false)
const historyStack = ref([]) // Reactive history
let map = null
let editableLayers = null
let labelLayerGroup = null // Group for labels and leader lines
let drawControl = null
let undoLastAction = () => {} 

async function searchAddress() {
  if (!searchQuery.value || !map) return
  
  isSearching.value = true
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: searchQuery.value,
        format: 'json',
        limit: 1
      }
    })
    
    if (response.data && response.data.length > 0) {
      const result = response.data[0]
      const lat = parseFloat(result.lat)
      const lon = parseFloat(result.lon)
      
      map.flyTo([lat, lon], 18)
    } else {
      alert('Adresse nicht gefunden')
    }
  } catch (e) {
    console.error('Search failed:', e)
    alert('Fehler bei der Suche')
  } finally {
    isSearching.value = false
  }
}

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl
})

const props = defineProps({
  center: { type: Array, default: () => [49.44, 7.75] },
  zoom: { type: Number, default: 18 },
  polygonStyles: { type: Array, default: () => [] },
  drawOptions: { 
    type: Object, 
    default: () => ({
      polygon: true,
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false
    })
  }
})

const emit = defineEmits(['update', 'delete', 'select'])


function updateLayerStyles() {
  if (!editableLayers) return

  editableLayers.eachLayer(layer => {
    const layerId = layer.feature?.id
    if (!layerId) return

    const style = props.polygonStyles.find(s => s.id === layerId)
    
    if (style && style.color) {
      layer.setStyle({
        color: style.color,
        fillColor: style.color,
        fillOpacity: 0.5,
        weight: 2
      })
    }
  })
}

watch(() => props.polygonStyles, () => {
  updateLayerStyles()
}, { deep: true })

// --- LABEL SYSTEM ---

/**
 * Updates or creates the label system (Marker + Leader Line) for a specific layer.
 */
function updateLabelSystem(layer) {
  if (!labelLayerGroup || !map) return
  
  // Cleanup old tooltips if they exist (legacy support)
  layer.unbindTooltip()

  const geoJson = layer.toGeoJSON()
  let content = ''
  let centerLatLng = null

  // 1. Calculate Content and Center
  if (geoJson.geometry.type === 'LineString') {
    // For polylines, we use simple length and center of bounds
    let len = 0
    if (layer instanceof L.Polyline) {
       const latlngs = layer.getLatLngs()
       for (let i = 0; i < latlngs.length - 1; i++) {
         len += latlngs[i].distanceTo(latlngs[i + 1])
       }
    }
    content = `${(len / 1000).toFixed(3)} km`
    centerLatLng = layer.getBounds().getCenter()
    
  } else {
    // For polygons, calculate Area and Center
    const areaVal = Math.round(area(geoJson))
    content = `${areaVal} m²`
    
    // Fallback to Leaflet centroid
    if (typeof layer.getCenter === 'function') {
      centerLatLng = layer.getCenter()
    } else {
      centerLatLng = layer.getBounds().getCenter()
    }
  }

  // 2. Initialize Label Context if missing
  // We attach the label elements to the layer object for lifecycle management
  if (!layer._labelContext) {
    layer._labelContext = {
      marker: null,
      line: null
    }
  }

  const ctx = layer._labelContext

  // 3. Determine Label Position (User defined or Default)
  let labelPos = centerLatLng
  if (layer.feature?.properties?.labelPos) {
    // If user previously dragged it, use that position
    labelPos = L.latLng(layer.feature.properties.labelPos)
  }

  // 4. Create or Update Marker
  const icon = L.divIcon({
    className: 'custom-area-label',
    html: `<span>${content}</span>`,
    iconSize: null, // Auto size via CSS
    iconAnchor: [20, 10] // Offset to center the 'tag' feeling roughly
  })

  if (!ctx.marker) {
    ctx.marker = L.marker(labelPos, {
      draggable: true,
      icon: icon,
      zIndexOffset: 1000 // Ensure labels are on top
    })

    // Drag Logic
    ctx.marker.on('drag', (e) => {
      const newPos = e.target.getLatLng()
      // Update line immediately while dragging
      if (ctx.line) {
        ctx.line.setLatLngs([centerLatLng, newPos])
      }
    })

    ctx.marker.on('dragend', (e) => {
       const newPos = e.target.getLatLng()
       // Save new position to properties
       layer.feature = layer.feature || { type: 'Feature', properties: {} }
       layer.feature.properties = layer.feature.properties || {}
       layer.feature.properties.labelPos = { lat: newPos.lat, lng: newPos.lng }
       
       // Emit update to save persistence
       const updatedGeoJSON = layer.toGeoJSON()
       updatedGeoJSON.id = layer.feature.id
       updatedGeoJSON.properties = layer.feature.properties
       emit('update', updatedGeoJSON)
    })
    
    labelLayerGroup.addLayer(ctx.marker)
  } else {
    ctx.marker.setIcon(icon)
    
    // Only move marker if it doesn't have a saved custom position OR if this is a fresh init
    if (!layer.feature?.properties?.labelPos) {
        ctx.marker.setLatLng(centerLatLng)
    }
  }

  // 5. Create or Update Leader Line
  if (!ctx.line) {
    ctx.line = L.polyline([centerLatLng, ctx.marker.getLatLng()], {
      color: '#666',
      weight: 1,
      dashArray: '4, 4',
      interactive: false // Line should not block clicks
    })
    labelLayerGroup.addLayer(ctx.line)
  } else {
    ctx.line.setLatLngs([centerLatLng, ctx.marker.getLatLng()])
  }
}

function removeLabelSystem(layer) {
  if (layer._labelContext) {
    if (layer._labelContext.marker) {
      labelLayerGroup.removeLayer(layer._labelContext.marker)
    }
    if (layer._labelContext.line) {
      labelLayerGroup.removeLayer(layer._labelContext.line)
    }
    layer._labelContext = null
  }
}

onMounted(() => {
  // 1. Karte starten
  map = L.map('map', {
    preferCanvas: true // Important for html2canvas export
  }).setView(props.center, props.zoom)

  // 2. Layer definieren
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  })

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  })

  satellite.addTo(map)

  const baseMaps = {
    "Satellit": satellite,
    "Straßenkarte": osm
  }
  
  L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map)

  // 3. Zeichen-Layer
  editableLayers = new L.FeatureGroup()
  map.addLayer(editableLayers)
  
  // Layer für Labels und Linien
  labelLayerGroup = new L.LayerGroup()
  map.addLayer(labelLayerGroup)

  editableLayers.on('click', (e) => {
    const layer = e.layer
    if (layer.feature?.id) {
      emit('select', layer.feature.id)
      L.DomEvent.stopPropagation(e)
    }
  })

  // 4. Controls
  drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polygon: props.drawOptions.polygon ? {
        allowIntersection: true,
        showArea: false, // Turn off default area tooltip
        shapeOptions: { color: '#3498db' },
        snapDistance: 20,
        guideLayers: [editableLayers]
      } : false,
      polyline: props.drawOptions.polyline ? {
        shapeOptions: { color: '#f1c40f', weight: 4 },
        metric: true
      } : false,
      marker: props.drawOptions.marker,
      circlemarker: props.drawOptions.circlemarker,
      circle: props.drawOptions.circle,
      rectangle: props.drawOptions.rectangle
    },
    edit: {
      featureGroup: editableLayers,
      remove: true,
      snapOptions: {
        guideLayers: [editableLayers],
        snapDistance: 20,
        allowIntersection: true
      }
    }
  })
  map.addControl(drawControl)

  undoLastAction = () => {
    if (historyStack.value.length === 0) return
    
    const lastLayerId = historyStack.value.pop()
    let layerToRemove = null
    
    editableLayers.eachLayer(layer => {
      if (layer.feature?.id === lastLayerId) {
        layerToRemove = layer
      }
    })
    
    if (layerToRemove) {
      removeLabelSystem(layerToRemove) // Cleanup label
      editableLayers.removeLayer(layerToRemove)
      emit('delete', lastLayerId)
    }
  }

  // EVENT: CREATED
  map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer
    const id = crypto.randomUUID()
    
    layer.feature = layer.feature || { type: 'Feature' }
    layer.feature.id = id
    layer.feature.properties = layer.feature.properties || {}

    editableLayers.addLayer(layer)
    updateLabelSystem(layer) // Create Label
    
    const geoJSON = layer.toGeoJSON()
    geoJSON.id = id
    
    historyStack.value.push(id)
    emit('update', geoJSON)
  })

  // EVENT: EDITED
  map.on(L.Draw.Event.EDITED, function (e) {
    e.layers.eachLayer(layer => {
      updateLabelSystem(layer) // Update Area/Positions
      
      const geoJSON = layer.toGeoJSON()
      if (layer.feature?.id) {
        geoJSON.id = layer.feature.id
      }
      
      if (layer.feature?.properties) {
          geoJSON.properties = layer.feature.properties
      }
      
      emit('update', geoJSON)
    })
  })

  // EVENT: DELETED
  map.on(L.Draw.Event.DELETED, function (e) {
    e.layers.eachLayer(layer => {
      removeLabelSystem(layer) // Remove Label
      if (layer.feature?.id) {
        emit('delete', layer.feature.id)
      }
    })
  })

  // DRAG & DROP
  const mapDiv = document.getElementById('map')
  
  mapDiv.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    mapDiv.style.border = '3px dashed #3498db'
  })

  mapDiv.addEventListener('dragleave', (e) => {
    e.preventDefault()
    e.stopPropagation()
    mapDiv.style.border = 'none'
  })

  mapDiv.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    mapDiv.style.border = 'none'

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const file = files[0]
    if (!file.name.endsWith('.json') && !file.name.endsWith('.geojson')) {
      alert('Bitte nur .json oder .geojson Dateien verwenden.')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const geoJSON = JSON.parse(event.target.result)
        
        L.geoJSON(geoJSON, {
          onEachFeature: (feature, layer) => {
            const id = crypto.randomUUID()
            layer.feature = layer.feature || { type: 'Feature' }
            layer.feature.id = id
            
            // Restore properties (including stored labelPos)
            if (feature.properties) {
                layer.feature.properties = feature.properties
            }
            
            editableLayers.addLayer(layer)
            updateLabelSystem(layer) // Create with potential restored position
            
            const newGeoJSON = layer.toGeoJSON()
            newGeoJSON.id = id
            if (feature.properties) {
              newGeoJSON.properties = feature.properties
            }
            emit('update', newGeoJSON)
          }
        })
        
        const bounds = editableLayers.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds)
        }
        
      } catch (err) {
        console.error('Import Error:', err)
        alert('Fehler beim Lesen der Datei. Ungültiges GeoJSON?')
      }
    }
    reader.readAsText(file)
  })
})

onUnmounted(() => {
  if (map) map.remove()
})

defineExpose({
  getMap: () => map,
  getEditableLayers: () => editableLayers,
  startDraw: (type) => {
    if (!map) return
    const options = drawControl.options.draw || {}
    let drawer = null
    switch (type) {
      case 'polygon':
        if (options.polygon) drawer = new L.Draw.Polygon(map, options.polygon)
        break
      case 'polyline':
        if (options.polyline) drawer = new L.Draw.Polyline(map, options.polyline)
        break
      case 'rectangle':
        if (options.rectangle) drawer = new L.Draw.Rectangle(map, options.rectangle)
        break
      case 'circle':
        if (options.circle) drawer = new L.Draw.Circle(map, options.circle)
        break
      case 'marker':
        if (options.marker) drawer = new L.Draw.Marker(map, options.marker)
        break
      case 'circlemarker':
        if (options.circlemarker) drawer = new L.Draw.CircleMarker(map, options.circlemarker)
        break
    }
    if (drawer) drawer.enable()
  },
  addGeoJSON: (geoJSON) => {
    if (!map || !editableLayers) return
    L.geoJSON(geoJSON, {
      onEachFeature: (feature, layer) => {
        const id = feature.id || crypto.randomUUID()
        layer.feature = layer.feature || { type: 'Feature' }
        layer.feature.id = id
        
        // Restore properties
        if (feature.properties) {
            layer.feature.properties = feature.properties
        }
        
        editableLayers.addLayer(layer)
        updateLabelSystem(layer) // Init Label
        
        const newGeoJSON = layer.toGeoJSON()
        newGeoJSON.id = id
        emit('update', newGeoJSON)
      }
    })
    const bounds = editableLayers.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds)
    }
  }
})
</script>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
  z-index: 1;
}

.search-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  background: white;
  padding: 5px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.search-input {
  border: none;
  padding: 8px 12px;
  font-size: 14px;
  width: 250px;
  outline: none;
}

.search-btn {
  background: #f8f9fa;
  border: none;
  padding: 0 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.search-btn:hover {
  background: #e9ecef;
}

.undo-control {
  position: absolute;
  top: 70px;
  right: 20px;
  z-index: 1000;
}

.undo-btn {
  background: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
}

.undo-btn:hover {
  background: #f8f9fa;
}

/* Custom Label Styling */
:deep(.custom-area-label) {
  background: transparent;
  border: none;
}

:deep(.custom-area-label span) {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #3498db;
  border-radius: 4px;
  padding: 4px 8px;
  font-weight: 600;
  font-size: 12px;
  color: #2c3e50;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  white-space: nowrap;
  pointer-events: auto; /* Enable clicks/drags */
  cursor: grab;
}

:deep(.custom-area-label span:active) {
  cursor: grabbing;
  background: #3498db;
  color: white;
}
</style>