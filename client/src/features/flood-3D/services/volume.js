// Parser für das F3DV-Binärformat (backend core/fields.py):
//   b"F3DV" | uint32 Headerlänge | Header-JSON | Rohdaten (LE float32)
// plus Abruf von Zeitpunktliste und Szenengeometrie.

import { BASE, fehlerAus } from './api.js'

export async function fetchTimesteps(runId) {
  const res = await fetch(`${BASE}/runs/${runId}/timesteps`)
  if (!res.ok) throw await fehlerAus(res, `timesteps ${runId}: `)
  return res.json()
}

export function b64ToBuffer(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// Gepackte Bits (numpy.packbits: höchstwertiges Bit zuerst) als Uint8Array
// aus 0/1 — die Maske „gemessen" des Geländes reist so acht Knoten je Byte
export function b64ToBits(b64, n) {
  const bytes = new Uint8Array(b64ToBuffer(b64))
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1
  return out
}

export async function fetchGeometry(runId) {
  const res = await fetch(`${BASE}/runs/${runId}/geometry`)
  if (!res.ok) throw await fehlerAus(res, `geometry ${runId}: `)
  const data = await res.json()
  return {
    grid: data.grid,
    // null, wenn der Nachlauf die Geländeschicht nicht erzeugen konnte —
    // Bauwerke und Netzoberfläche gibt es trotzdem
    terrain: data.terrain ? {
      dims: data.terrain.dims,              // [ny, nx]
      z: new Float32Array(b64ToBuffer(data.terrain.z_b64)),
    } : null,
    // Der Erdkörper, der WIRKLICH an den Solver ging (inkl. Bohrungen) —
    // null bei Läufen ohne Erdkörper: dann gilt das Höhenfeld oben
    terrainSolid: data.terrain_solid ? b64ToBuffer(data.terrain_solid) : null,
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
  if (!res.ok) throw await fehlerAus(res, `volume ${runId}: `)
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

// Wasseroberfläche aus dem Rechennetz (Fahrplan C3, backend core/oberflaeche.py):
//   b"F3DS" | uint32 Headerlänge | Header-JSON | Punkte (f32 ×3)
//   | Dreiecke (u32 ×3) | Knotenfelder (f32)
export function parseOberflaeche(buf) {
  const view = new DataView(buf)
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4))
  if (magic !== 'F3DS') throw new Error('Ungültiges Oberflächenpaket')
  const headerLen = view.getUint32(4, true)
  const kopf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headerLen)))
  let pos = 8 + headerLen
  const punkte = new Float32Array(buf, pos, kopf.punkte * 3)
  pos += kopf.punkte * 12
  const dreiecke = new Uint32Array(buf, pos, kopf.dreiecke * 3)
  pos += kopf.dreiecke * 12
  const felder = {}
  for (const f of kopf.felder) {
    felder[f.name] = new Float32Array(buf, pos, kopf.punkte * f.components)
    pos += kopf.punkte * f.components * 4
  }
  return { time: kopf.time, punkte, dreiecke, felder }
}

// null, wenn der Lauf keine hat (vor C3 gerechnet) — dann Marching Cubes
export async function fetchOberflaeche(runId, time) {
  const res = await fetch(`${BASE}/runs/${runId}/oberflaeche?time=${time}`)
  if (res.status === 404) return null
  if (!res.ok) throw await fehlerAus(res, `oberflaeche ${runId}: `)
  return parseOberflaeche(await res.arrayBuffer())
}
