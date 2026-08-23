/**
 * Welt ↔ Papier (Sprint P, AP-2).
 *
 * Der wichtigste Test dieser Datei ist die NORD-INVARIANTE. Die Draufsicht-
 * Kamera steht mit `up = (0,0,-1)` über dem Modell, wachsendes Welt-Z läuft
 * damit auf dem Papier nach unten. Der Kommentar in `IfcCamera.js` behauptete
 * jahrelang das Gegenteil („top view: Z points north on paper"), und genau
 * daran scheitert jeder, der die Abbildung nachbaut: Der Plan kommt
 * seitenverkehrt heraus und niemand merkt es, solange das Modell ungefähr
 * symmetrisch ist. Ein Kommentar hat das nicht verhindert — ein Test tut es.
 */

import { describe, expect, it, vi } from 'vitest'
import { makePaperTransform, makeWorldTransform } from '../services/IfcVectorPlotter'

const M = 10, DW = 100, DH = 100

/** Plot-Frustum in der Form von IfcCamera.getLastPlotFrustum(). */
function frustum(over = {}) {
  return {
    left: -50, right: 50, top: 50, bottom: -50,
    position: [0, 100, 0], target: [0, 0, 0], up: [0, 0, -1],
    viewDir: 'top', scaleRatio: 100, drawWidthMm: DW, drawHeightMm: DH,
    ...over,
  }
}

describe('makePaperTransform', () => {
  it('bildet die Blattmitte auf die Frustum-Mitte ab', () => {
    const p = makePaperTransform(frustum(), M, DW, DH)
    expect(p.toX(0)).toBe(M + DW / 2)
    expect(p.toY(0)).toBe(M + DH / 2)
  })

  it('NORD-INVARIANTE: wachsendes Welt-Z läuft auf dem Papier nach unten', () => {
    const p = makePaperTransform(frustum(), M, DW, DH)
    expect(p.toY(10)).toBeGreaterThan(p.toY(0))
    // Papier-Oben ist damit Welt-−Z — dieselbe Konvention wie im DXF (N = −z).
    expect(p.toY(-50)).toBe(M)              // Blattoberkante
    expect(p.toY(50)).toBe(M + DH)          // Blattunterkante
  })

  it('Welt-X läuft nach rechts', () => {
    const p = makePaperTransform(frustum(), M, DW, DH)
    expect(p.toX(-50)).toBe(M)
    expect(p.toX(50)).toBe(M + DW)
  })

  it('folgt der Kameraposition', () => {
    const p = makePaperTransform(frustum({ position: [200, 100, -80] }), M, DW, DH)
    expect(p.toX(200)).toBe(M + DW / 2)
    expect(p.toY(-80)).toBe(M + DH / 2)
  })

  it('nimmt sowohl ein Frustum-POJO als auch eine THREE-artige Kamera', () => {
    const alsObjekt = makePaperTransform(
      { left: -50, right: 50, top: 50, bottom: -50, position: { x: 0, y: 100, z: 0 }, zoom: 1 },
      M, DW, DH,
    )
    const alsFrustum = makePaperTransform(frustum(), M, DW, DH)
    expect(alsObjekt.toX(12.5)).toBe(alsFrustum.toX(12.5))
    expect(alsObjekt.toY(12.5)).toBe(alsFrustum.toY(12.5))
  })

  it('berücksichtigt den Kamera-Zoom', () => {
    const p = makePaperTransform(frustum({ zoom: 2 }), M, DW, DH)
    // Doppelter Zoom = halber Ausschnitt: 25 m füllen jetzt das halbe Blatt
    expect(p.toX(25)).toBe(M + DW)
  })

  it('meldet die Weltgrenzen des Blatts (für UTM-Kreuze)', () => {
    const { _bounds } = makePaperTransform(frustum(), M, DW, DH)
    expect(_bounds).toMatchObject({ wXmin: -50, wXmax: 50, wZmin: -50, wZmax: 50 })
  })

  it('verweigert Blickrichtungen ohne Papier-Abbildung, statt falsch zu zeichnen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const viewDir of ['front', 'side']) {
      expect(makePaperTransform(frustum({ viewDir }), M, DW, DH)).toBeNull()
      expect(makeWorldTransform(frustum({ viewDir }), M, DW, DH)).toBeNull()
    }
    expect(warn).toHaveBeenCalledTimes(4)
    warn.mockRestore()
  })
})

describe('makeWorldTransform', () => {
  it('ist die exakte Umkehrung — Rundlauf über den ganzen Ausschnitt', () => {
    const p = makePaperTransform(frustum({ position: [17, 100, -3] }), M, DW, DH)
    const w = makeWorldTransform(frustum({ position: [17, 100, -3] }), M, DW, DH)
    for (const v of [-40, -12.5, 0, 7.25, 33]) {
      expect(w.zuX(p.toX(v))).toBeCloseTo(v, 9)
      expect(w.zuZ(p.toY(v))).toBeCloseTo(v, 9)
    }
  })

  it('rechnet einen Klick auf die Blattmitte auf die Modellmitte zurück', () => {
    const w = makeWorldTransform(frustum({ position: [200, 100, -80] }), M, DW, DH)
    expect(w.zuX(M + DW / 2)).toBeCloseTo(200, 9)
    expect(w.zuZ(M + DH / 2)).toBeCloseTo(-80, 9)
  })
})
