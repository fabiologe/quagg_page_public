// @vitest-environment jsdom
//
// BCF-3.0-Roundtrip: Export → Import muss Titel, Status, Zuständigkeit,
// Fälligkeit, Kommentare und Kamera verlustfrei erhalten (Stufe-D-Abnahme,
// vorgezogen in „Kommentieren").

import { describe, expect, it } from 'vitest'
import { exportBcf, importBcf } from '../services/BcfService'

// jsdom-Blob hat kein arrayBuffer() — über FileReader lesen
function toArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
}

const ISSUE = {
  id: 'a1',
  idx: 1,
  text: 'Durchbruch fehlt in Wand Achse 3\nBitte mit TGA abstimmen.',
  position: [1, 2, 3],
  color: '#e91e63',
  status: 'in-progress',
  assignee: 'planer@extern.de',
  dueDate: '2026-09-01',
  author: 'Fabio',
  createdAt: Date.parse('2026-08-04T10:00:00Z'),
  comments: [
    { author: 'Fabio', text: 'Bitte prüfen.', createdAt: Date.parse('2026-08-04T11:00:00Z') },
    { author: 'TGA', text: 'DN200 reicht.', createdAt: Date.parse('2026-08-04T12:00:00Z') },
  ],
  viewpoint: {
    camera: { position: [10, 5, 20], target: [0, 0, 0], up: [0, 1, 0] },
    visibleCategories: ['IFCWALL'],
    section: null,
  },
}

describe('BCF 3.0 Roundtrip', () => {
  it('erhält Topic-Felder, Kommentare und Kamera', async () => {
    const blob = await exportBcf([ISSUE], { projectName: 'Test', author: 'Fabio' })
    const issues = await importBcf(await toArrayBuffer(blob))

    expect(issues).toHaveLength(1)
    const back = issues[0]
    expect(back.text).toBe(ISSUE.text)
    expect(back.status).toBe('in-progress')
    expect(back.assignee).toBe('planer@extern.de')
    expect(back.dueDate).toBe('2026-09-01')
    expect(back.author).toBe('Fabio')
    expect(back.comments).toHaveLength(2)
    expect(back.comments[1]).toMatchObject({ author: 'TGA', text: 'DN200 reicht.' })

    // Kamera: Position exakt, Blickrichtung erhalten (Target wird auf der
    // Sichtachse synthetisiert — Richtung muss stimmen, nicht der Abstand)
    const cam = back.viewpoint.camera
    expect(cam.position[0]).toBeCloseTo(10, 4)
    expect(cam.position[1]).toBeCloseTo(5, 4)
    expect(cam.position[2]).toBeCloseTo(20, 4)
    const dirOrig = [-10, -5, -20].map(v => v / Math.hypot(10, 5, 20))
    const dirBack = [
      cam.target[0] - cam.position[0],
      cam.target[1] - cam.position[1],
      cam.target[2] - cam.position[2],
    ]
    const len = Math.hypot(...dirBack)
    dirBack.forEach((v, i) => expect(v / len).toBeCloseTo(dirOrig[i], 4))
  })

  it('behält die Topic-Guid beim Re-Export (Merge-Anker für Roundtrips)', async () => {
    const blob1 = await exportBcf([ISSUE], {})
    const [imported] = await importBcf(await toArrayBuffer(blob1))
    expect(imported.bcfGuid).toBeTruthy()

    // Re-Export des importierten Issues → gleiche Guid im Archiv
    const blob2 = await exportBcf([imported], {})
    const [reimported] = await importBcf(await toArrayBuffer(blob2))
    expect(reimported.bcfGuid).toBe(imported.bcfGuid)
  })

  it('escapet XML-Sonderzeichen verlustfrei', async () => {
    const issue = { ...ISSUE, text: 'Träger <HEB 300> & Auflager "prüfen"', comments: [] }
    const blob = await exportBcf([issue], {})
    const [back] = await importBcf(await toArrayBuffer(blob))
    expect(back.text).toBe('Träger <HEB 300> & Auflager "prüfen"')
  })

  it('Issues ohne Viewpoint exportieren ohne .bcfv und importieren mit Ursprungs-Pin', async () => {
    const issue = { ...ISSUE, viewpoint: null, comments: [] }
    const blob = await exportBcf([issue], {})
    const [back] = await importBcf(await toArrayBuffer(blob))
    expect(back.viewpoint).toBeNull()
    expect(back.position).toEqual([0, 0, 0])
  })
})
