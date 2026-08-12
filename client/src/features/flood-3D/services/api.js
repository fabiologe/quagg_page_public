// flood3D-API-Client (Spez. Kap. 9). Prefix läuft in Dev über den
// vite-Proxy '/FastAPI' und in Prod über nginx — keine Extra-Konfiguration.
const BASE = '/FastAPI/flood3d'

// ── Kosten-Gate ─────────────────────────────────────────────────────────────
// flood-3D steht öffentlich im Netz; jeder Lauf kostet Server-Kerne oder (über
// RunPod) echtes Geld. Der Server sperrt deshalb Lauf, Netzvorschau und Bundle
// ohne Passwort (core/gate.py). Hier wird es EINMAL pro Browser-Sitzung
// erfragt und mitgeschickt — bewusst NICHT im Quelltext hinterlegt wie bei
// flood-2D, wo jeder Besucher es aus dem Bundle lesen kann. Der Client kennt
// das richtige Passwort nie; er reicht nur durch, was eingegeben wurde.
const PW_SCHLUESSEL = 'flood3d-launch-pw'
// Defensiv: in privaten Fenstern und bei gesperrtem Speicher wirft schon der
// Zugriff auf sessionStorage — das darf das Modul nicht am Laden hindern.
const sitzungsSpeicher = (() => {
  try { return globalThis.sessionStorage ?? null } catch { return null }
})()
let launchPasswort = (() => {
  try { return sitzungsSpeicher?.getItem(PW_SCHLUESSEL) || '' } catch { return '' }
})()

function gateKopf() {
  return launchPasswort ? { 'X-Launch-Password': launchPasswort } : {}
}

export function launchPasswortBekannt() {
  return Boolean(launchPasswort)
}

/**
 * Passwort einmal je Sitzung erfragen — zu einem VORHERSEHBAREN Zeitpunkt
 * (beim Öffnen eines Falls), statt den Bearbeiter mitten im Zeichnen von
 * einer automatischen Hintergrundanfrage überraschen zu lassen. Gibt
 * zurück, ob jetzt eins hinterlegt ist.
 */
export function launchPasswortSichern() {
  if (launchPasswort) return true
  return passwortErfragen(
    'flood-3D: Passwort eingeben.\n\n'
    + 'Bearbeiten und Rechnen sind geschützt — die Seite steht öffentlich '
    + 'im Netz und Läufe kosten Rechenzeit bzw. Cloud-Guthaben.\n'
    + 'Ansehen geht ohne Passwort.')
}

export function launchPasswortVergessen() {
  launchPasswort = ''
  try { sitzungsSpeicher?.removeItem(PW_SCHLUESSEL) } catch { /* egal */ }
}

function passwortErfragen(text) {
  const eingabe = globalThis.prompt(text)
  if (!eingabe || !eingabe.trim()) return false
  launchPasswort = eingabe.trim()
  try { sitzungsSpeicher?.setItem(PW_SCHLUESSEL, launchPasswort) } catch { /* egal */ }
  return true
}

// Vorab fragen: für die teuren Aktionen (Lauf, Netzvorschau, Bundle) — besser
// VOR einem minutenlangen Vorgang als danach.
async function mitGate(aufruf) {
  if (!launchPasswort
      && !passwortErfragen('Rechenlauf starten — Passwort eingeben.\n\n'
                           + 'Kostenschutz: Läufe binden Server-Kerne bzw. Cloud-Guthaben.')) {
    throw new Error('Abgebrochen — ohne Passwort wird nichts gestartet.')
  }
  try {
    return await aufruf()
  } catch (e) {
    if (e?.status === 403) launchPasswortVergessen()
    throw e
  }
}

// Nachträglich fragen: für alles andere Schreibende (Fall anlegen, speichern,
// Kur, Import …). Erst arbeiten lassen, und nur wenn der Server 403 sagt,
// einmal nachfragen und den Aufruf wiederholen. So kommt die Abfrage genau
// dann, wenn sie gebraucht wird — und ein Aufrufort, den ich übersehen habe,
// scheitert nicht stumm.
async function mitNachfrage(aufruf) {
  try {
    return await aufruf()
  } catch (e) {
    if (e?.status !== 403) throw e
    launchPasswortVergessen()
    if (!passwortErfragen('Änderung speichern — Passwort eingeben.\n\n'
                          + 'Schreibschutz: die Seite steht öffentlich im Netz.')) throw e
    return aufruf()
  }
}

async function getJson(path, params = null) {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`${BASE}${path}${qs}`)
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
    const err = new Error(`flood3d ${path}: ${detail}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Jede schreibende Anfrage laeuft durch mitNachfrage: erst versuchen, bei 403
// einmal fragen und wiederholen. Damit ist KEIN Aufrufort auf mein Gedaechtnis
// angewiesen — auch die, die ich hier nicht einzeln angefasst habe.
async function sendJson(path, method, body, extraKopf = null) {
  const einmal = () => sendJsonEinmal(path, method, body, extraKopf)
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) ? einmal() : mitNachfrage(einmal)
}

async function sendJsonEinmal(path, method, body, extraKopf = null) {
  // Kopfzeile IMMER mitschicken: das Gate haengt serverseitig am Router, also
  // an jeder schreibenden Anfrage — nicht nur an den drei teuren.
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...gateKopf(), ...(extraKopf || {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch { /* leer */ }
    const err = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const flood3dApi = {
  // Fälle (PreViewer, Stufe 4)
  listCases: () => getJson('/cases'),
  createCase: (id, title) => sendJson('/cases', 'POST', { id, title }),
  getCase: (caseId) => getJson(`/cases/${caseId}`),
  saveCase: (caseId, spec) => sendJson(`/cases/${caseId}`, 'PUT', spec),
  caseSchema: (caseId) => getJson(`/cases/${caseId}/schema`),
  caseRasters: (caseId) => getJson(`/cases/${caseId}/rasters`),
  caseRotate: (caseId, deg) =>
    sendJson(`/cases/${caseId}/rotate`, 'POST', { deg }),
  caseAnschluss: (caseId) => sendJson(`/cases/${caseId}/anschluss`, 'POST', {}),
  caseKur: (caseId, aktion, args) =>
    sendJson(`/cases/${caseId}/kur`, 'POST', { aktion, args }),
  caseKantenVerknuepfen: (caseId) =>
    sendJson(`/cases/${caseId}/kanten-verknuepfen`, 'POST', {}),
  rezeptKatalog: () => getJson('/rezepte'),
  caseRezept: (caseId, rezept, args) =>
    sendJson(`/cases/${caseId}/rezept`, 'POST', { rezept, args }),
  meshPreviewState: (caseId) => getJson(`/cases/${caseId}/mesh-preview`),
  caseGeometry: (caseId) => getJson(`/cases/${caseId}/geometry`),
  importAnalyze: async (caseId, file) => {
    const res = await fetch(
      `${BASE}/cases/${caseId}/import?filename=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
      throw new Error(detail)
    }
    return res.json()
  },
  importApply: (caseId, importId, payload) =>
    sendJson(`/cases/${caseId}/import/${importId}/apply`, 'POST', payload),
  listImports: (caseId) => getJson(`/cases/${caseId}/imports`),
  importMeshUrl: (caseId, importId, candId) =>
    `${BASE}/cases/${caseId}/import/${importId}/${candId}.stl`,
  sculpt: (caseId, patches) =>
    sendJson(`/cases/${caseId}/sculpt`, 'POST', { patches }),
  importReapply: (caseId, importId, rollen = null) =>
    sendJson(`/cases/${caseId}/import/${importId}/reapply`, 'POST',
      rollen ? { rollen } : {}),
  caseProfile: (caseId, polyline, samples = 200) =>
    sendJson(`/cases/${caseId}/profile`, 'POST', { polyline, samples }),
  casePreview: (caseId, spec) => sendJson(`/cases/${caseId}/preview`, 'POST', spec),
  meshPreview: (caseId, opts = {}) =>
    mitGate(() => sendJson(`/cases/${caseId}/mesh-preview`, 'POST', opts)),
  caseMeshSurface: (caseId) => getJson(`/cases/${caseId}/mesh-surface`),
  // ort: 'server' (Serverkerne) oder 'runpod' (Cloud) — der lokale Lauf
  // geht nicht hierüber, der holt sich ein Bundle
  startRun: (caseId, ort = 'server') =>
    mitGate(() => sendJson('/runs', 'POST', { case_id: caseId, ort })),
  caseBundle: (caseId) => mitGate(async () => {
    const res = await fetch(`${BASE}/cases/${caseId}/bundle`,
      { method: 'POST', headers: gateKopf() })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
      const err = new Error(detail)
      err.status = res.status
      throw err
    }
    return { runId: res.headers.get('X-F3D-Run-Id'), blob: await res.blob() }
  }),
  // Grosse Ergebnisse stückweise übertragen — ein 400-MB-Body scheitert
  // an jeder Proxy-Grenze (nginx: 200 MB).
  importRunChunked: async (runId, blob, onProgress = null) => {
    const CHUNK = 24 * 1024 * 1024
    const teile = Math.max(1, Math.ceil(blob.size / CHUNK))
    for (let i = 0; i < teile; i++) {
      const stueck = blob.slice(i * CHUNK, (i + 1) * CHUNK)
      const last = i === teile - 1
      const res = await fetch(
        `${BASE}/runs/${runId}/import-chunk?index=${i}&last=${last}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
          body: stueck })
      if (!res.ok) {
        let detail = res.statusText
        try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
        throw new Error(`Teil ${i + 1}/${teile}: ${detail}`)
      }
      if (onProgress) onProgress((i + 1) / teile)
      if (last) return res.json()
    }
    return null
  },
  runLog: (runId, tail = 80) => getJson(`/runs/${runId}/log`, { tail }),

  // Läufe (PostViewer)
  listRuns: () => getJson('/runs'),
  verifikation: () => getJson('/verifikation'),
  deleteRun: (runId) => sendJson(`/runs/${runId}`, 'DELETE'),
  // Auslagern/Zurückholen: Läufe sind der Plattenfresser; das Schwere liegt
  // danach auf der StorageBox, Manifest und Bewertung bleiben lokal.
  // Beides hinter dem Kosten-Gate (Bandbreite, fremde Zugriffe).
  archiviereRun: (runId) =>
    mitGate(() => sendJson(`/runs/${runId}/archivieren`, 'POST', {})),
  holeRunZurueck: (runId) =>
    mitGate(() => sendJson(`/runs/${runId}/wiederherstellen`, 'POST', {})),
  archivStand: (alterTage = 14) => getJson('/archiv', { alter_tage: alterTage }),
  abortRun: (runId) => sendJson(`/runs/${runId}/abort`, 'POST', {}),
  runDetail: (runId) => getJson(`/runs/${runId}`),
  result: (runId) => getJson(`/runs/${runId}/result`),
  extremes: (runId) => getJson(`/runs/${runId}/extremes`),
  balance: (runId) => getJson(`/runs/${runId}/balance`),
  series: (runId, quantity, component = '') =>
    getJson(`/runs/${runId}/series`, { quantity, component }),
  figureUrl: (runId, filename) => `${BASE}/runs/${runId}/figures/${filename}`,
}
