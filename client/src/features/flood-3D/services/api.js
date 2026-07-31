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
  caseTerrain: (caseId) => getJson(`/cases/${caseId}/terrain`),
  caseSolids: (caseId) => getJson(`/cases/${caseId}/solids`),
  caseValidate: (caseId) => getJson(`/cases/${caseId}/validate`),
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
  caseProfile: (caseId, polyline, samples = 200) =>
    sendJson(`/cases/${caseId}/profile`, 'POST', { polyline, samples }),
  casePreview: (caseId, spec) => sendJson(`/cases/${caseId}/preview`, 'POST', spec),
  meshPreview: (caseId) => sendJson(`/cases/${caseId}/mesh-preview`, 'POST', {}),
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
  importRun: async (runId, blob) => {
    const res = await fetch(`${BASE}/runs/${runId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: blob,
    })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* leer */ }
      throw new Error(detail)
    }
    return res.json()
  },
  runLog: (runId, tail = 80) => getJson(`/runs/${runId}/log`, { tail }),

  // Läufe (PostViewer)
  listRuns: () => getJson('/runs'),
  deleteRun: (runId) => sendJson(`/runs/${runId}`, 'DELETE'),
  runDetail: (runId) => getJson(`/runs/${runId}`),
  result: (runId) => getJson(`/runs/${runId}/result`),
  extremes: (runId) => getJson(`/runs/${runId}/extremes`),
  balance: (runId) => getJson(`/runs/${runId}/balance`),
  inventory: (runId) => getJson(`/runs/${runId}/inventory`),
  series: (runId, quantity, component = '', locationId = null) => {
    const params = { quantity, component }
    if (locationId != null) params.location_id = locationId
    return getJson(`/runs/${runId}/series`, params)
  },
  figureUrl: (runId, filename) => `${BASE}/runs/${runId}/figures/${filename}`,
}
