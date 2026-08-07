// Gemeinsamer Felddaten-Cache für Grundriss- und Raum-Ansicht: Zeitpunkte,
// Szenengeometrie und Volumenpakete je Lauf, LRU-begrenzt.
import { fetchGeometry, fetchTimesteps, fetchVolume } from '../services/volume'
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

export async function getVolume(runId, time) {
  const key = `${runId}|${time}`
  if (!volumeCache.has(key)) {
    volumeCache.set(key, fetchVolume(runId, time).catch((e) => {
      volumeCache.delete(key)
      throw e
    }))
    if (volumeCache.size > VOLUME_LIMIT) {
      volumeCache.delete(volumeCache.keys().next().value)
    }
  }
  return volumeCache.get(key)
}

// Abgeleitete Grundriss-Felder aus einem Volumenpaket, je Säule (i,j):
// Tiefe als Saeulenintegral Σ α·dz (volumenerhaltend — auch ein
// Millimeterfilm mit α < 0,5 in der Sohlzelle traegt bei), Wasserspiegel
// subzellig aus dem Phasenanteil rekonstruiert (vorher Oberkante der
// obersten Nasszelle: auf dz quantisiert und bis +1 Zelle ueberschaetzt),
// Oberflaechen- und tiefengemittelte Geschwindigkeit, Froude-Zahl.
export function planFields(vol, terrainZ) {
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
    hInt, uxM, uyM, umagM, froude }
}
