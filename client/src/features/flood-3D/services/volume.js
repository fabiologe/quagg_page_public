// Parser für das F3DV-Binärformat (backend core/fields.py):
//   b"F3DV" | uint32 Headerlänge | Header-JSON | Rohdaten (LE float32)
// plus Abruf von Zeitpunktliste und Szenengeometrie.
import { flood3dApi } from './api'

const BASE = '/FastAPI/flood3d'

export async function fetchTimesteps(runId) {
  const res = await fetch(`${BASE}/runs/${runId}/timesteps`)
  if (!res.ok) throw new Error(`timesteps ${runId}: ${res.statusText}`)
  return res.json()
}

export function b64ToBuffer(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export async function fetchGeometry(runId) {
  const res = await fetch(`${BASE}/runs/${runId}/geometry`)
  if (!res.ok) throw new Error(`geometry ${runId}: ${res.statusText}`)
  const data = await res.json()
  return {
    grid: data.grid,
    // null, wenn der Nachlauf die Geländeschicht nicht erzeugen konnte —
    // Bauwerke und Netzoberfläche gibt es trotzdem
    terrain: data.terrain ? {
      dims: data.terrain.dims,              // [ny, nx]
      z: new Float32Array(b64ToBuffer(data.terrain.z_b64)),
    } : null,
    // Eingabe-Geometrie (Bauwerks-STLs des Falls) und die tatsächlich
    // vernetzte Solver-Oberfläche je Patch (Zellfacetten!)
    solids: (data.solids ?? []).map((s) => ({
      patch: s.patch, stl: b64ToBuffer(s.stl_b64) })),
    meshPatches: (data.mesh_patches ?? []).map((s) => ({
      patch: s.patch, stl: b64ToBuffer(s.stl_b64) })),
  }
}

export async function fetchVolume(runId, time, fields = null) {
  const params = new URLSearchParams({ time: String(time) })
  if (fields) params.set('fields', fields.join(','))
  const res = await fetch(`${BASE}/runs/${runId}/volume?${params}`)
  if (!res.ok) throw new Error(`volume ${runId}: ${res.statusText}`)
  const buf = await res.arrayBuffer()
  const view = new DataView(buf)
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4))
  if (magic !== 'F3DV') throw new Error('Ungültiges Felddatenpaket')
  const headerLen = view.getUint32(4, true)
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 8, headerLen)))
  const dataStart = 8 + headerLen
  const out = { time: header.time, grid: header.grid, fields: {} }
  for (const f of header.fields) {
    out.fields[f.name] = {
      components: f.components,
      dims: f.dims,
      data: new Float32Array(buf, dataStart + f.offset, f.length_bytes / 4),
    }
  }
  return out
}

export { flood3dApi }
