/**
 * GeoJSON-Importer für Gerinne-Querschnitte
 *
 * Unterstützte Formate:
 *
 * 1. Einfaches LineString (→ Geländeprofil):
 *    { "type": "LineString", "coordinates": [[x, z], ...] }
 *    oder mit geographischen Koordinaten: [[lon, lat, z], ...]
 *
 * 2. Feature mit "layer"-Eigenschaft:
 *    { "type": "Feature", "properties": { "layer": "terrain" | "buk" | "bok", "kst": 40 },
 *      "geometry": { "type": "LineString", ... } }
 *
 * 3. FeatureCollection mit mehreren Layern:
 *    { "type": "FeatureCollection", "features": [...Features...] }
 *
 * Geographische Koordinaten (lon/lat) werden automatisch erkannt und
 * in kumulative Abstände (m) entlang des Querschnitts umgerechnet.
 */

const GEO_THRESHOLD_LAT = 90
const GEO_THRESHOLD_LON = 180

/** Prüft ob Koordinaten geographisch (Länge/Breite in Grad) sind */
function isGeographic(coords) {
  if (!coords || coords.length === 0) return false
  const [x, y] = coords[0]
  return Math.abs(x) <= GEO_THRESHOLD_LON && Math.abs(y) <= GEO_THRESHOLD_LAT
}

/** Haversine-Distanz zwischen zwei Geo-Punkten in Metern */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Wandelt LineString-Koordinaten in [{x, z}]-Profil-Punkte um */
function coordsToProfile(coords) {
  if (!coords || coords.length < 2) return []

  if (isGeographic(coords)) {
    // Geographisch: x = kumulativer Abstand (m), z = 3. Koordinate (Höhe)
    let cumDist = 0
    const pts = []
    for (let i = 0; i < coords.length; i++) {
      const [lon, lat, z = 0] = coords[i]
      if (i > 0) {
        const [plon, plat] = coords[i - 1]
        cumDist += haversine(plat, plon, lat, lon)
      }
      pts.push({ x: Math.round(cumDist * 100) / 100, z: Math.round(z * 1000) / 1000 })
    }
    return pts
  } else {
    // Lokal: erste Koordinate = x (Breite), zweite = z (Höhe)
    return coords.map(([x, z]) => ({
      x: Math.round(x * 1000) / 1000,
      z: Math.round(z * 1000) / 1000
    }))
  }
}

/** Extrahiert Profil-Punkte aus einer GeoJSON-Geometrie */
function geomToProfile(geom) {
  if (!geom) return []
  if (geom.type === 'LineString') return coordsToProfile(geom.coordinates)
  if (geom.type === 'MultiPoint') return coordsToProfile(geom.coordinates)
  if (geom.type === 'Point') return [{ x: geom.coordinates[0], z: geom.coordinates[1] ?? 0 }]
  return []
}

/**
 * Liest einen GeoJSON-String oder ein geparses Objekt und gibt
 * Profilpunkte für Gelände, BUK und BOK sowie kSt-Zonen zurück.
 *
 * @returns {{ terrain: Array, buk: Array, bok: Array, kstZones: Array, errors: string[] }}
 */
export function parseGeoJSON(input) {
  const result = {
    terrain: null,
    buk: null,
    bok: null,
    kstZones: null,
    errors: []
  }

  let geojson
  try {
    geojson = typeof input === 'string' ? JSON.parse(input) : input
  } catch {
    result.errors.push('Ungültiges JSON-Format.')
    return result
  }

  if (!geojson || !geojson.type) {
    result.errors.push('Kein gültiges GeoJSON-Objekt.')
    return result
  }

  const assignLayer = (layer, pts, kst) => {
    if (!pts || pts.length === 0) return
    const sorted = [...pts].sort((a, b) => a.x - b.x)
    if (layer === 'terrain' || layer === 'channel') result.terrain = sorted
    else if (layer === 'buk' || layer === 'bridge_bottom') result.buk = sorted
    else if (layer === 'bok' || layer === 'bridge_top') result.bok = sorted
    else if (!result.terrain) result.terrain = sorted  // fallback: erster Layer = Gelände
  }

  switch (geojson.type) {
    case 'LineString':
    case 'MultiPoint': {
      // Einfaches Profil ohne Layer-Info → Gelände
      const pts = geomToProfile(geojson)
      if (pts.length >= 2) result.terrain = pts
      else result.errors.push('LineString enthält zu wenige Punkte (min. 2).')
      break
    }

    case 'Feature': {
      const props = geojson.properties || {}
      const layer = (props.layer || props.type || 'terrain').toLowerCase()
      const pts = geomToProfile(geojson.geometry)
      if (pts.length >= 2) {
        assignLayer(layer, pts, props.kst)
      } else {
        result.errors.push(`Feature "${layer}": zu wenige Punkte.`)
      }
      break
    }

    case 'FeatureCollection': {
      const features = geojson.features || []
      if (features.length === 0) {
        result.errors.push('FeatureCollection ist leer.')
        break
      }
      const kstZonesFromFeatures = []
      for (const feat of features) {
        const props = feat.properties || {}
        const layer = (props.layer || props.type || '').toLowerCase()
        const pts = geomToProfile(feat.geometry)
        if (pts.length < 2) {
          if (pts.length > 0) result.errors.push(`Feature mit layer="${layer}" hat nur ${pts.length} Punkt(e) – übersprungen.`)
          continue
        }
        assignLayer(layer, pts, props.kst)

        // kSt-Zonen aus Features mit kst-Eigenschaft und bekannten x-Grenzen
        if (props.kst && props.xLeft != null && props.xRight != null) {
          kstZonesFromFeatures.push({
            id: `imported-${kstZonesFromFeatures.length}`,
            xLeft: props.xLeft,
            xRight: props.xRight,
            kst: props.kst,
            color: '#6366f1',
            label: props.label || `kSt=${props.kst}`
          })
        }
      }
      if (kstZonesFromFeatures.length > 0) result.kstZones = kstZonesFromFeatures
      break
    }

    default:
      result.errors.push(`Unbekannter GeoJSON-Typ: ${geojson.type}`)
  }

  // Validierungen
  if (result.terrain && result.terrain.length < 2) {
    result.errors.push('Geländeprofil muss mind. 2 Punkte haben.')
    result.terrain = null
  }

  return result
}

/** Liest eine Datei und gibt den Text zurück */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.readAsText(file)
  })
}
