// Gemeinsamer Felddaten-Cache für Grundriss- und Raum-Ansicht: Zeitpunkte,
// Szenengeometrie und Volumenpakete je Lauf, LRU-begrenzt.
import { fetchGeometry, fetchTimesteps, fetchVolume } from '../services/volume'

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

// Abgeleitete Grundriss-Felder aus einem Volumenpaket: je Säule (i,j)
// Wasserspiegel (oberste Nasszelle), Tiefe, oberflächennahe Geschwindigkeit.
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

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const col = j * nx + i
      for (let k = nz - 1; k >= 0; k--) {
        const idx = (k * ny + j) * nx + i
        if (alpha[idx] >= 0.5) {
          surface[col] = origin[2] + (k + 1) * spacing[2]
          const ground = terrainZ ? terrainZ[col] : origin[2]
          depth[col] = Math.max(surface[col] - ground, 0)
          if (U) {
            ux[col] = U[idx]
            uy[col] = U[n + idx]
            umag[col] = Math.hypot(U[idx], U[n + idx], U[2 * n + idx])
          }
          break
        }
      }
    }
  }
  const tau = vol.fields.bed_shear ? vol.fields.bed_shear.data : null
  return { nx, ny, origin, spacing, surface, depth, ux, uy, umag, tau }
}
