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
let drawControl = null // Define at top level
let undoLastAction = () => {} // Placeholder

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
  // Erwartet: [{id: 'uuid', color: '#hex'}, ...]
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


// Funktion: Färbt alle Polygone basierend auf den Props
function updateLayerStyles() {
  if (!editableLayers) return

  editableLayers.eachLayer(layer => {
    // Wir suchen den Style für diese Layer-ID
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

// Beobachte Änderungen an den Styles (live Update)
watch(() => props.polygonStyles, () => {
  updateLayerStyles()
}, { deep: true })

function updateAreaTooltip(layer) {
  const geoJson = layer.toGeoJSON()
  let content = ''
  
  if (geoJson.geometry.type === 'LineString') {
    let len = 0
    if (layer instanceof L.Polyline) {
       const latlngs = layer.getLatLngs()
       for (let i = 0; i < latlngs.length - 1; i++) {
         len += latlngs[i].distanceTo(latlngs[i + 1])
       }
    }
    content = `${(len / 1000).toFixed(3)} km`
    
  } else {
    const areaVal = Math.round(area(geoJson))
    content = `${areaVal} m²`
  }
  
  // Tooltip binden oder aktualisieren
  if (layer.getTooltip()) {
    layer.setTooltipContent(content)
  } else {
    layer.bindTooltip(content, {
      permanent: true,
      direction: 'center',
      className: 'area-tooltip'
    })
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

  // Default Layer hinzufügen
  satellite.addTo(map)

  // Layer Control hinzufügen
  const baseMaps = {
    "Satellit": satellite,
    "Straßenkarte": osm
  }
  
  L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map)

  // 3. Zeichen-Layer
  editableLayers = new L.FeatureGroup()
  map.addLayer(editableLayers)

  // Click Event für Selektion
  editableLayers.on('click', (e) => {
    const layer = e.layer
    if (layer.feature?.id) {
      emit('select', layer.feature.id)
      L.DomEvent.stopPropagation(e) // Verhindert Map-Click
    }
  })



  // 4. Controls
  drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polygon: props.drawOptions.polygon ? {
        allowIntersection: true,
        showArea: true,
        shapeOptions: { color: '#3498db' },
        snapDistance: 20, // Snapping distance in pixels
        guideLayers: [editableLayers] // Snap to these layers
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

  // 5. Event Listener
  
  // Assign to outer variable
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
      editableLayers.removeLayer(layerToRemove)
      emit('delete', lastLayerId)
    }
  }



  // ERSTELLT
  map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer
    // Wichtig: ID generieren und direkt am Layer speichern
    const id = crypto.randomUUID()
    
    // Feature-Objekt vorbereiten für Leaflet
    layer.feature = layer.feature || { type: 'Feature' }
    layer.feature.id = id
    layer.feature.properties = layer.feature.properties || {}

    // Tooltip hinzufügen
    updateAreaTooltip(layer)

    editableLayers.addLayer(layer)
    
    // Sicherstellen, dass die ID im GeoJSON landet
    const geoJSON = layer.toGeoJSON()
    geoJSON.id = id
    
    historyStack.value.push(id) // Add to history
    
    emit('update', geoJSON)
  })

  // BEARBEITET
  map.on(L.Draw.Event.EDITED, function (e) {
    e.layers.eachLayer(layer => {
      // Tooltip aktualisieren
      updateAreaTooltip(layer)

      const geoJSON = layer.toGeoJSON()
      // ID beibehalten
      if (layer.feature?.id) {
        geoJSON.id = layer.feature.id
      }
      emit('update', geoJSON)
    })
  })

  // GELÖSCHT
  map.on(L.Draw.Event.DELETED, function (e) {
    e.layers.eachLayer(layer => {
      if (layer.feature?.id) {
        emit('delete', layer.feature.id)
      }
    })
  })

  // --- DRAG & DROP IMPORT ---
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
            // Neue ID generieren, falls nicht vorhanden oder Konflikt vermeiden
            const id = crypto.randomUUID()
            
            layer.feature = layer.feature || { type: 'Feature' }
            layer.feature.id = id
            
            // Properties übernehmen (Name, Typ etc.)
            // Wir müssen sicherstellen, dass die Properties im Store landen
            // Das passiert über das 'update' Event, das das ganze GeoJSON sendet
            
            updateAreaTooltip(layer)
            editableLayers.addLayer(layer)
            
            // Emit update für Store
            const newGeoJSON = layer.toGeoJSON()
            newGeoJSON.id = id
            // Wichtig: Properties mitgeben, damit der Store sie übernehmen kann
            if (feature.properties) {
              newGeoJSON.properties = feature.properties
            }
            
            emit('update', newGeoJSON)
          }
        })
        
        // Zoom auf neue Layer
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

// Expose map instance to parent component
defineExpose({
  getMap: () => map,
  getEditableLayers: () => editableLayers,
  startDraw: (type) => {
    if (!map) return
    
    let drawer = null
    // drawControl.options structure is { draw: { ... }, edit: { ... } }
    // But Leaflet Draw constructor options might be slightly different depending on version.
    // Usually L.Control.Draw options are passed as { draw: { polyline: { ... } } }
    // So drawControl.options.draw should exist.
    
    const options = drawControl.options.draw || {}
    
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
    
    if (drawer) {
      drawer.enable()
    } else {
      console.warn(`Draw type ${type} not enabled or supported`)
    }
  },
  addGeoJSON: (geoJSON) => {
    if (!map || !editableLayers) return
    
    L.geoJSON(geoJSON, {
      onEachFeature: (feature, layer) => {
        // Use existing ID from feature if available (e.g. from store), otherwise generate new one
        const id = feature.id || crypto.randomUUID()
        layer.feature = layer.feature || { type: 'Feature' }
        layer.feature.id = id
        
        updateAreaTooltip(layer)
        editableLayers.addLayer(layer)
        
        // Emit update damit Parent (und Store) Bescheid wissen
        const newGeoJSON = layer.toGeoJSON()
        newGeoJSON.id = id
        emit('update', newGeoJSON)
      }
    })
    
    // Zoom auf neue Layer
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

:deep(.area-tooltip) {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #333;
  border-radius: 4px;
  padding: 2px 5px;
  font-weight: bold;
  font-size: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.undo-control {
  position: absolute;
  top: 70px; /* Below search bar */
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
</style>