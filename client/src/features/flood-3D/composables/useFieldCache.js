// Gemeinsamer Felddaten-Cache für Grundriss- und Raum-Ansicht: Zeitpunkte,
// Szenengeometrie und Volumenpakete je Lauf, LRU-begrenzt.
import { fetchGeometry, fetchOberflaeche, fetchTimesteps, fetchVolume }
  from '../services/volume'
import { ALPHA_NASS, TIEFE_TROCKEN } from '../utils/anzeigeSchwellen'

const indexCache = new Map()
const geometryCache = new Map()
const volumeCache = new Map()
const VOLUME_LIMIT = 16

export async function getTimesteps(runId) {
  if (!indexCache.has(runId)) {
    indexCache.set(runId, fetchTimesteps(runId).catch((e) => {
      indexCache.delete(runId)
      throw e
    }))
  }
  return indexCache.get(runId)
}

export async function getGeometry(runId) {
  if (!geometryCache.has(runId)) {
    geometryCache.set(runId, fetchGeometry(runId).catch((e) => {
      geometryCache.delete(runId)
      throw e
    }))
  }
  return geometryCache.get(runId)
}

// Wasseroberflaeche aus dem Rechennetz (C3) je (Lauf, Zeit), LRU wie oben.
// Nur fuer Zeiten aus index.oberflaeche anfragen — der Server liefert
// sonst die naechstgelegene, und t = 0 hat keine.
const oberflaechenCache = new Map()

export function getOberflaeche(runId, time) {
  const key = `${runId}|${time}`
  if (!oberflaechenCache.has(key)) {
    oberflaechenCache.set(key, fetchOberflaeche(runId, time).catch((e) => {
      oberflaechenCache.delete(key)
      throw e
    }))
    if (oberflaechenCache.size > VOLUME_LIMIT) {
      oberflaechenCache.delete(oberflaechenCache.keys().next().value)
    }
  }
  return oberflaechenCache.get(key)
}

// Feld-selektiver Volumen-Cache, EINER fuer alle Ansichten. Vorher luden
// Grundriss und Raum-Tab denselben Zeitschritt in getrennte Caches — und
// beide holten immer ALLE Felder (p, p_rgh, k, ω, νt, T inklusive),
// obwohl der Grundriss nur alpha/U/bed_shear braucht. Jetzt gilt: ein
// Eintrag je (Lauf, Zeit), Felder werden bei Bedarf NACHGELADEN
// (?fields=…) und in den Eintrag gemerged — dieselbe Information, aber
// nur die Bytes, die die Ansicht wirklich zeigt.
//
// `felder = null` heisst weiterhin "alles" (Kompatibilitaet).
export function getVolume(runId, time, felder = null) {
  const key = `${runId}|${time}`
  let eintrag = volumeCache.get(key)
  if (!eintrag) {
    eintrag = { time, grid: null, fields: {},
      _geladen: new Set(), _ladend: new Map() }
    volumeCache.set(key, eintrag)
    if (volumeCache.size > VOLUME_LIMIT) {
      volumeCache.delete(volumeCache.keys().next().value)
    }
  } else {
    // LRU: zuletzt benutzte Eintraege ans Ende ruecken
    volumeCache.delete(key)
    volumeCache.set(key, eintrag)
  }

  const wunsch = felder ?? ['*']
  const offen = wunsch.filter((f) =>
    !eintrag._geladen.has(f) && !eintrag._geladen.has('*')
    && !eintrag._ladend.has(f))
  const laufend = wunsch.map((f) => eintrag._ladend.get(f)).filter(Boolean)

  if (offen.length) {
    const alle = offen.includes('*')
    const p = fetchVolume(runId, time, alle ? null : offen)
      .then((vol) => {
        eintrag.time = vol.time
        eintrag.grid = vol.grid
        Object.assign(eintrag.fields, vol.fields)
        // Auch angefragte, aber im Lauf nicht vorhandene Felder gelten
        // als geladen — sonst fragte jeder Aufruf sie erneut an. Die
        // Aufrufer pruefen ohnehin auf Existenz (vol.fields.bed_shear?).
        for (const f of offen) eintrag._geladen.add(f)
        for (const f of Object.keys(vol.fields)) eintrag._geladen.add(f)
      })
      .finally(() => {
        // Fehlgeschlagene Felder bleiben UNGELADEN — der naechste Aufruf
        // versucht es erneut, statt einen kaputten Eintrag festzuhalten
        for (const f of offen) eintrag._ladend.delete(f)
      })
    for (const f of offen) eintrag._ladend.set(f, p)
    laufend.push(p)
  }
  return Promise.all(laufend).then(() => eintrag)
}

// Planraster, die der Server aus den ECHTEN Rechenzellen schreibt (Fahrplan
// C2, core/planfelder.py): Tiefe Σ α·V / A (volumentreu), Wasserspiegel,
// tiefengemittelte und Oberflaechengeschwindigkeit, Froude. Ansichten
// fordern sie immer mit an — ein Lauf ohne sie (vor C2) liefert sie
// einfach nicht, und planFields rechnet dann wie bisher aus dem Voxel-Raster.
export const PLAN_FELDER = ['plan_h', 'plan_wsp', 'plan_ux', 'plan_uy',
  'plan_uox', 'plan_uoy', 'plan_uo', 'plan_fr']

function hatPlanraster(vol) {
  return PLAN_FELDER.every((k) => k in vol.fields)
}

// Serverraster in der Form von planFields — dieselben Schluessel, damit
// kein Verbraucher unterscheiden muss, woher die Werte kommen.
function planAusServer(vol) {
  const [nx, ny] = vol.grid.dims
  const { origin, spacing } = vol.grid
  const f = vol.fields
  const depth = f.plan_h.data
  const uxM = f.plan_ux.data
  const uyM = f.plan_uy.data
  const umagM = new Float32Array(nx * ny)
  for (let c = 0; c < nx * ny; c++) umagM[c] = Math.hypot(uxM[c], uyM[c])
  const tau = f.bed_shear ? f.bed_shear.data : null
  return { nx, ny, origin, spacing, surface: f.plan_wsp.data, depth,
    ux: f.plan_uox.data, uy: f.plan_uoy.data, umag: f.plan_uo.data, tau,
    hInt: depth, uxM, uyM, umagM, froude: f.plan_fr.data, quelle: 'zellen' }
}

// Abgeleitete Grundriss-Felder aus einem Volumenpaket, je Säule (i,j):
// Tiefe als Saeulenintegral Σ α·dz (volumenerhaltend — auch ein
// Millimeterfilm mit α < 0,5 in der Sohlzelle traegt bei), Wasserspiegel
// subzellig aus dem Phasenanteil rekonstruiert (vorher Oberkante der
// obersten Nasszelle: auf dz quantisiert und bis +1 Zelle ueberschaetzt),
// Oberflaechen- und tiefengemittelte Geschwindigkeit, Froude-Zahl.
// Traegt das Paket die Serverraster, gelten DIE (eine Definition je Groesse);
// die Rechnung darunter bleibt fuer Laeufe vor C2 (`quelle: 'raster'`).
export function planFields(vol, terrainZ) {
  if (hatPlanraster(vol)) return planAusServer(vol)
  const [nx, ny, nz] = vol.grid.dims
  const { origin, spacing } = vol.grid
  const alpha = vol.fields.alpha.data
  const U = vol.fields.U?.data
  const n = alpha.length
  const surface = new Float32Array(nx * ny).fill(NaN)
  const depth = new Float32Array(nx * ny)
  const ux = new Float32Array(nx * ny)
  const uy = new Float32Array(nx * ny)
  const umag = new Float32Array(nx * ny)
  const hInt = new Float32Array(nx * ny)      // Wassertiefe aus dem Phasenanteil
  const uxM = new Float32Array(nx * ny)
  const uyM = new Float32Array(nx * ny)
  const umagM = new Float32Array(nx * ny)
  const froude = new Float32Array(nx * ny)
  const dz = spacing[2]
  const hMin = Math.max(2 * dz, 0.02)     // Mindesttiefe für eine Froude-Zahl

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const col = j * nx + i
      const ground = terrainZ ? terrainZ[col] : origin[2]

      // Ein Durchlauf von unten nach oben: Saeulenintegral, oberste
      // Nasszelle (fuer Wasserspiegel und Oberflaechengeschwindigkeit)
      // und oberste ueberhaupt benetzte Zelle (Fallback fuer Filme).
      let h = 0
      let sx = 0
      let sy = 0
      let kTop = -1        // oberste Zelle mit α >= ALPHA_NASS
      let kFilm = -1       // oberste Zelle mit α > 0
      for (let k = 0; k < nz; k++) {
        const idx = (k * ny + j) * nx + i
        const a = Math.min(Math.max(alpha[idx], 0), 1)
        if (a <= 0) continue
        h += a * dz
        kFilm = k
        if (a >= ALPHA_NASS) kTop = k
        if (U) {
          sx += a * dz * U[idx]
          sy += a * dz * U[n + idx]
        }
      }
      hInt[col] = h
      depth[col] = h

      if (h > TIEFE_TROCKEN) {
        if (kTop >= 0) {
          // Spiegel subzellig: Unterkante der obersten Nasszelle plus deren
          // Fuellgrad plus der Teilfuellung der Zelle darueber. Fuer eine
          // scharfe Grenzflaeche ist das exakt, sonst eine stetige Naeherung.
          const aTop = Math.min(Math.max(alpha[(kTop * ny + j) * nx + i], 0), 1)
          const aOver = kTop + 1 < nz
            ? Math.min(Math.max(alpha[((kTop + 1) * ny + j) * nx + i], 0), 1) : 0
          surface[col] = origin[2] + kTop * dz + (aTop + aOver) * dz
        } else {
          // Duenner Film ohne Nasszelle: das Wasser liegt auf dem Gelaende.
          surface[col] = ground + h
        }
        // Oberflaechengeschwindigkeit aus der obersten (Nass-)Zelle; bei
        // Filmen aus der obersten benetzten Zelle.
        const kU = kTop >= 0 ? kTop : kFilm
        if (U && kU >= 0) {
          const idx = (kU * ny + j) * nx + i
          ux[col] = U[idx]
          uy[col] = U[n + idx]
          umag[col] = Math.hypot(U[idx], U[n + idx], U[2 * n + idx])
        }
      }

      // Tiefengemittelte Groessen und Froude-Zahl — fuer den Wasserbau
      // zaehlt der Mittelwert ueber die Tiefe, nur damit ist Fr definiert.
      if (h > 1e-6) {
        uxM[col] = sx / h
        uyM[col] = sy / h
        umagM[col] = Math.hypot(uxM[col], uyM[col])
        // Fr = v / sqrt(g h); Fr > 1 heisst schiessend.
        // Am Benetzungsrand geht h gegen null und Fr gegen unendlich —
        // solche Zellen bleiben ausgespart, sonst sprengt ein einzelner
        // Millimeterfilm die Farbskala (gemessen: Fr = 2782).
        froude[col] = h >= hMin ? umagM[col] / Math.sqrt(9.81 * h) : NaN
      } else {
        froude[col] = NaN
      }
    }
  }
  const tau = vol.fields.bed_shear ? vol.fields.bed_shear.data : null
  return { nx, ny, origin, spacing, surface, depth, ux, uy, umag, tau,
    hInt, uxM, uyM, umagM, froude, quelle: 'raster' }
}

// Memoisierte Variante: planFields lief vorher bei JEDEM update() neu,
// obwohl das Volumen laengst aus dem Cache kam — beim Zeit-Scrubbing
// mit Hin und Zurueck ist das reine Doppelarbeit. Schluessel ist der
// Cache-Eintrag selbst (WeakMap: verschwindet er aus dem LRU, raeumt
// der GC die Ableitungen mit); dazu Terrain-Identitaet und die Frage,
// welche der benutzten Feldgruppen inzwischen nachgeladen sind.
const planCache = new WeakMap()

export function planFieldsCached(vol, terrainZ) {
  const stand = `${'alpha' in vol.fields}|${'U' in vol.fields}|${'bed_shear' in vol.fields}`
    + `|${hatPlanraster(vol)}`
  const c = planCache.get(vol)
  if (c && c.terrainZ === terrainZ && c.stand === stand) return c.result
  const result = planFields(vol, terrainZ)
  planCache.set(vol, { terrainZ, stand, result })
  return result
}
