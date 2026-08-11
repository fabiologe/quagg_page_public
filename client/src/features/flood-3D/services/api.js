// flood3D-API-Client (Spez. Kap. 9). Prefix läuft in Dev über den
// vite-Proxy '/FastAPI' und in Prod über nginx — keine Extra-Konfiguration.
const BASE = '/FastAPI/flood3d'

async function getJson(path, params = null) {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`${BASE}${path}${qs}`)
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
    throw new Error(`flood3d ${path}: ${detail}`)
  }
  return res.json()
}

async function sendJson(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch { /* leer */ }
    throw new Error(detail)
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
    sendJson(`/cases/${caseId}/mesh-preview`, 'POST', opts),
  caseMeshSurface: (caseId) => getJson(`/cases/${caseId}/mesh-surface`),
  startRun: (caseId) => sendJson('/runs', 'POST', { case_id: caseId }),
  caseBundle: async (caseId) => {
    const res = await fetch(`${BASE}/cases/${caseId}/bundle`, { method: 'POST' })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
      throw new Error(detail)
    }
    return { runId: res.headers.get('X-F3D-Run-Id'), blob: await res.blob() }
  },
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
  abortRun: (runId) => sendJson(`/runs/${runId}/abort`, 'POST', {}),
  runDetail: (runId) => getJson(`/runs/${runId}`),
  result: (runId) => getJson(`/runs/${runId}/result`),
  extremes: (runId) => getJson(`/runs/${runId}/extremes`),
  balance: (runId) => getJson(`/runs/${runId}/balance`),
  series: (runId, quantity, component = '') =>
    getJson(`/runs/${runId}/series`, { quantity, component }),
  figureUrl: (runId, filename) => `${BASE}/runs/${runId}/figures/${filename}`,
}
