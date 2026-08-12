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
// Angefangene, nicht beendete OpenFOAM-Läufe auf dieser Maschine —
// Grundlage für "nach Absturz fortsetzen".
export async function unterbrocheneLaeufe() {
  try {
    const res = await fetch(`${COMPANION_BASE}/runs`,
      { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return []
    const { runs } = await res.json()
    return (runs ?? []).filter((r) => r.engine === 'openfoam'
      && r.status !== 'COMPLETED')
  } catch {
    return []
  }
}

export async function pauseLocalRun(jobId) {
  const res = await fetch(`${COMPANION_BASE}/v2/flood3d/pause/${jobId}`,
    { method: 'POST' })
  if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
  return res.json()
}

export async function runLocally(caseId, onEvent, resumeJob = null) {
  let runId = resumeJob?.runId ?? null
  let files = {}
  if (resumeJob) {
    onEvent({ event: 'log',
      text: `Lauf ${runId} wird fortgesetzt — Netz und bereits gerechnete `
          + 'Zeitschritte bleiben erhalten.' })
  } else {
    onEvent({ event: 'log', text: 'Fall wird auf dem Server paketiert …' })
    const bundle = await flood3dApi.caseBundle(caseId)
    runId = bundle.runId
    onEvent({ event: 'log', text: `Bundle geladen (${Math.round(bundle.blob.size / 1024)} kB), Lauf ${runId}` })
    const bytes = new Uint8Array(await bundle.blob.arrayBuffer())
    files = { 'case.zip': { encoding: 'base64', data: bytesToBase64(bytes) } }
  }

  const res = await fetch(`${COMPANION_BASE}/v2/flood3d/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: {
      engine: 'openfoam',
      resume_job: resumeJob?.jobId ?? undefined,
      files,
    } }),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? `Companion: HTTP ${res.status}`)
  const { id: jobId } = await res.json()
  onEvent({ event: 'job', jobId })

  // Ereignisse einsammeln, bis der Runner fertig oder gescheitert ist
  let artifactsUrl = null
  let wackler = 0
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000))
    // Hintergrund-Tabs drosseln Timer und lassen fetches scheitern — das
    // darf den Lauf nicht kippen: der Companion rechnet unabhaengig weiter,
    // und den Import uebernimmt notfalls der Server-Waechter (S3).
    let sres
    try {
      sres = await fetch(`${COMPANION_BASE}/v2/flood3d/stream/${jobId}`)
    } catch {
      if (++wackler > 150) throw new Error('Companion nicht mehr erreichbar')
      continue
    }
    if (!sres.ok) {
      if (++wackler > 150) throw new Error(`Companion-Stream: HTTP ${sres.status}`)
      continue
    }
    wackler = 0
    const { status, stream } = await sres.json()
    for (const { output: ev } of stream ?? []) {
      onEvent(ev)
      // Speicherpunkt: der Laeufer hat einen Teilstand nach S3 geladen —
      // der Server soll ihn einspielen (Ergebnis-3D zeigt ihn dann sofort).
      // Beiwerk: ein Fehler hier darf den Lauf nicht stoeren.
      if (ev.event === 'checkpoint' && runId) {
        flood3dApi.teilstandAbholen(runId, ev).catch(() => {})
      }
      if (ev.event === 'done') {
        artifactsUrl = ev.artifactsUrl
        // Bei Wiederaufnahme kennt der Browser die Server-Laufnummer nicht —
        // der Runner meldet sie mit (sie steht im Fall unter run_id.txt).
        if (ev.run_id) runId = ev.run_id
      }
      if (ev.event === 'error') throw new Error(ev.text)
    }
    if (status === 'COMPLETED') break
    if (status === 'FAILED' || status === 'CANCELLED') {
      const st = await (await fetch(`${COMPANION_BASE}/v2/flood3d/status/${jobId}`)).json()
      throw new Error(st.error ?? `Lokaler Lauf: ${status}`)
    }
  }
  if (!artifactsUrl) throw new Error('Lauf beendet, aber keine Artefakte gemeldet')
  if (!runId) throw new Error('Lauf beendet, aber ohne Laufnummer — Import nicht möglich')

  onEvent({ event: 'log', text: 'Lade Artefakte und übertrage sie zum Server …' })
  const art = await fetch(`${COMPANION_BASE}${artifactsUrl}`)
  if (!art.ok) throw new Error(`Artefakte nicht abrufbar: HTTP ${art.status}`)
  const paket = await art.blob()
  onEvent({ event: 'log',
    text: `Artefakte: ${(paket.size / 1e6).toFixed(0)} MB werden übertragen …` })
  await flood3dApi.importRunChunked(runId, paket, (f) => {
    if (f < 1) onEvent({ event: 'progress', phase: 'upload', fraction: f })
  })
  onEvent({ event: 'log', text: `Lauf ${runId} übernommen — Ergebnis-Phase ist bereit.` })
  return runId
}
