// Brücke zum quagg Local Companion (localhost:8642) für flood3D-Läufe auf
// der Nutzer-Maschine. Gleicher Dienst und gleiches Protokoll wie beim
// Flood2D-Solver (quagg_local_companion.py, ab v1.3 mit engine "openfoam"):
// der Fall kommt fertig gebaut vom Server (case.zip), der Companion fährt
// das OpenFOAM-Image, und die Artefakte gehen über /runs/{id}/import zurück.
import { flood3dApi } from './api'

export const COMPANION_BASE = 'http://127.0.0.1:8642'

// Erkennung: läuft ein Companion, kann er OpenFOAM? (v1.3+: engines-Liste)
export async function companionHealth() {
  try {
    const res = await fetch(`${COMPANION_BASE}/health`,
      { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    const h = await res.json()
    if (!(h.engines ?? []).includes('openfoam')) {
      return { ...h, foamSupported: false }
    }
    return { ...h, foamSupported: true }
  } catch {
    return null
  }
}

function bytesToBase64(bytes) {
  // chunked — String.fromCharCode(...100MB) sprengt den Callstack
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

// Kompletter lokaler Lauf: Bundle holen -> Companion rechnen lassen ->
// Artefakte zum Server importieren. onEvent bekommt jede NDJSON-Zeile des
// Runners (log/progress) für die Live-Anzeige.
export async function runLocally(caseId, onEvent) {
  onEvent({ event: 'log', text: 'Fall wird auf dem Server paketiert …' })
  const { runId, blob } = await flood3dApi.caseBundle(caseId)
  onEvent({ event: 'log', text: `Bundle geladen (${Math.round(blob.size / 1024)} kB), Lauf ${runId}` })

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const res = await fetch(`${COMPANION_BASE}/v2/flood3d/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: {
      engine: 'openfoam',
      files: { 'case.zip': { encoding: 'base64', data: bytesToBase64(bytes) } },
    } }),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? `Companion: HTTP ${res.status}`)
  const { id: jobId } = await res.json()

  // Ereignisse einsammeln, bis der Runner fertig oder gescheitert ist
  let artifactsUrl = null
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000))
    const sres = await fetch(`${COMPANION_BASE}/v2/flood3d/stream/${jobId}`)
    if (!sres.ok) throw new Error(`Companion-Stream: HTTP ${sres.status}`)
    const { status, stream } = await sres.json()
    for (const { output: ev } of stream ?? []) {
      onEvent(ev)
      if (ev.event === 'done') artifactsUrl = ev.artifactsUrl
      if (ev.event === 'error') throw new Error(ev.text)
    }
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'CANCELLED') {
      const st = await (await fetch(`${COMPANION_BASE}/v2/flood3d/status/${jobId}`)).json()
      throw new Error(st.error ?? `Lokaler Lauf: ${status}`)
    }
  }
  if (!artifactsUrl) throw new Error('Lauf beendet, aber keine Artefakte gemeldet')

  onEvent({ event: 'log', text: 'Lade Artefakte und übertrage sie zum Server …' })
  const art = await fetch(`${COMPANION_BASE}${artifactsUrl}`)
  if (!art.ok) throw new Error(`Artefakte nicht abrufbar: HTTP ${art.status}`)
  await flood3dApi.importRun(runId, await art.blob())
  onEvent({ event: 'log', text: `Lauf ${runId} übernommen — Ergebnis-Phase ist bereit.` })
  return runId
}
