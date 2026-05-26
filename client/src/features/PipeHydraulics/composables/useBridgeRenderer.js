/**
 * SVG-Polygon-Aufbau für die Profildarstellung.
 * Getrennt von der Hydraulikberechnung (useBridgeHydraulics.js),
 * da es sich um View-Logik handelt: Weltkoordinaten → Vertices für SVG-Pfade.
 *
 * Exportierte Funktionen:
 *   buildZ1Vertices    — kontinuierliche Vertexliste für Zone 1 (vereinfachtes Polygon)
 *   buildZ1SegmentData — diskrete, typ-klassifizierte Segmente für Zone 1 (farbkodiert)
 *   buildZ2Vertices    — Vertexliste für die Überströmungszone (Zone 2)
 *
 * Abhängigkeiten: interpZ, interpBridgeZ, bokRefZ aus useBridgeHydraulics
 * Koordinatentransformation (Welt → SVG) liegt in useProfileInteraction: wx(x), wy(z)
 */
import { useBridgeHydraulics } from './useBridgeHydraulics.js'

export function useBridgeRenderer() {
  const { interpZ, interpBridgeZ, bokRefZ } = useBridgeHydraulics()

  function mergedKeyX(terrain, buk, bok) {
    const xs = new Set(terrain.map(p => p.x))
    if (buk && buk.length >= 2) buk.forEach(p => xs.add(p.x))
    if (bok && bok.length >= 2) bok.forEach(p => xs.add(p.x))
    return [...xs].sort((a, b) => a - b)
  }

  /**
   * Zone-1-Vertices: kontinuierliche Boden/Deckel-Kantenliste für das gesamte benetzte
   * Zone-1-Profil als ein einziges geschlossenes Polygon (keine Typ-Unterscheidung).
   * Wird für einfache Flächenvisualisierungen verwendet; für farbkodierte Segmente
   * → buildZ1SegmentData verwenden.
   */
  function buildZ1Vertices(terrain, buk, bok, wsp) {
    if (!terrain || terrain.length < 2) return []
    const xs = mergedKeyX(terrain, buk, bok)

    function ceilAt(x) {
      const bukz      = interpBridgeZ(buk, x)
      const bokInside = interpBridgeZ(bok, x)
      const bRef      = bokRefZ(bok, x)
      return bukz < Infinity      ? Math.min(wsp, bukz)
           : bokInside < Infinity ? interpZ(terrain, x)
           : Math.min(wsp, bRef)
    }

    const segs = []
    let prevX = null, prevH = null

    for (const x of xs) {
      const gz    = interpZ(terrain, x)
      const ceilZ = ceilAt(x)
      const h     = ceilZ - gz

      if (prevX !== null && prevH !== null) {
        const wasWet = prevH > 1e-6
        const isWet  = h     > 1e-6
        if (wasWet !== isWet && prevH !== h) {
          const t = prevH / (prevH - h)
          if (t > 1e-9 && t < 1 - 1e-9) {
            const xc  = prevX + t * (x - prevX)
            const gzc = interpZ(terrain, xc)
            segs.push({ x: xc, zBot: gzc, zTop: gzc })
          }
        }
      }

      if (h > 1e-6) segs.push({ x, zBot: gz, zTop: ceilZ })
      prevX = x; prevH = h
    }
    return segs
  }

  /**
   * Zerlegt Zone 1 in diskrete, typ-klassifizierte Fließsegmente.
   * Jedes Segment entspricht einem zusammenhängenden benetzten Bereich gleicher Zonenart.
   * Das Ergebnis treibt die farbkodierte SVG-Darstellung im Profileditor an.
   *
   * ── Algorithmus (4 Phasen) ────────────────────────────────────────────────────────
   *
   * Phase 1 — X-Knoten scannen (für jeden Knoten aus Gelände + BUK + BOK):
   *   bukz  = BUK-Höhe an x  (Infinity wenn x außerhalb BUK-Fußabdruck)
   *   bokIn = BOK-Höhe an x  (Infinity wenn x außerhalb BOK-Fußabdruck)
   *   zone:
   *     BUK vorhanden → 'bridge'     → ceil = min(WSP, BUK)
   *     BOK vorhanden → 'masked'     → kein Fluss (Brückenkörper zwischen BUK und BOK)
   *     sonst         → 'floodplain' → ceil = min(WSP, BOK-Referenz-extrudiert)
   *   isWet = (ceil − Gelände) > 1e-6  &&  zone ≠ 'masked'
   *
   * Phase 2 — Segmentierung:
   *   Aufeinanderfolgende isWet-Knoten gleicher zone bilden ein Segment.
   *   Bei zone-Wechsel oder dry-Knoten → Segment schließen, neues starten.
   *
   * Phase 3 — Geometrie je Segment (Trapezregel):
   *   A    = Σ 0.5 · (h_i + h_{i+1}) · dx
   *   P    = Σ √(dx² + (zBot_{i+1} − zBot_i)²)               [Sohlkante]
   *         + Σ √(dx² + (zTop_{i+1} − zTop_i)²)  [BUK-Deckel, nur 'bridge']
   *   maxH = max aller Streifenhöhen
   *
   * Phase 4 — Typ-Klassifikation (nur 'bridge'-Segmente):
   *   TOL  = max(0.001,  BUK-Spanne · 0.015)   [1.5 % numerische Toleranz]
   *   tL   = seg.xLeft  ≤ BUK_x_links  + TOL   → grenzt an linke BUK-Kante
   *   tR   = seg.xRight ≥ BUK_x_rechts − TOL   → grenzt an rechte BUK-Kante
   *   tL && tR → 'main'    Hauptöffnung (durchgängig, hydraulisch korrekt)
   *   tL || tR → 'side'    Seitenöffnung (einseitig angebunden)
   *   else     → 'island'  Inselpolygon (Geometriefehler → Validierungswarnung)
   *   'floodplain'-Segmente behalten ihren Typ direkt.
   *
   * ── Farbcodierung in BridgeProfileEditor.vue (SEG_STYLES) ────────────────────────
   *   'main'       #3b82f6 blau,       opacity 0.38 — hydraulisch wirksame Hauptöffnung
   *   'side'       #60a5fa hellblau,   opacity 0.32 — Randsegment, eine BUK-Seite
   *   'island'     #f59e0b amber,      opacity 0.52 — Warnung: Fläche ohne BUK-Anbindung
   *   'floodplain' #93c5fd sehr hell,  opacity 0.24 — Manning-Vorland
   *
   * ── SVG-Pfad-Pipeline ─────────────────────────────────────────────────────────────
   *   useProfileInteraction: z1Segments = buildZ1SegmentData(terrain, buk, bok, wsp)
   *   BridgeProfileEditor:   z1SegmentPaths (computed):
   *     bottom-edge: M x0,zBot0  L x1,zBot1 … (vorwärts)
   *     top-edge:    L x_n,zTop_n L …         (rückwärts)
   *     Z  → geschlossenes Polygon
   */
  function buildZ1SegmentData(terrain, buk, bok, wsp) {
    if (!terrain || terrain.length < 2) return []

    const hasBuk = buk && buk.length >= 2
    const hasBok = bok && bok.length >= 2

    const xs = mergedKeyX(terrain, buk, bok)
    const bukXLeft  = hasBuk ? buk[0].x : null
    const bukXRight = hasBuk ? buk[buk.length - 1].x : null
    const bukSpan   = hasBuk ? (bukXRight - bukXLeft) : 0
    const TOL       = Math.max(0.001, bukSpan * 0.015)

    const segments = []
    let current = null

    for (let i = 0; i < xs.length; i++) {
      const x     = xs[i]
      const gz    = interpZ(terrain, x)
      const bukz  = interpBridgeZ(buk, x)
      const bokIn = interpBridgeZ(bok, x)
      const bRef  = bokRefZ(bok, x)

      const inBuk = hasBuk && bukz < Infinity
      const inBok = hasBok && bokIn < Infinity

      let ceilZ, zone
      if (inBuk) {
        ceilZ = Math.min(wsp, bukz); zone = 'bridge'
      } else if (inBok) {
        ceilZ = gz; zone = 'masked'   // Brückenkörper → kein Zone-1-Fluss
      } else {
        ceilZ = Math.min(wsp, bRef); zone = 'floodplain'
      }

      const h     = Math.max(0, ceilZ - gz)
      const isWet = h > 1e-6 && zone !== 'masked'

      if (isWet) {
        if (!current || current.zone !== zone) {
          if (current) segments.push(current)
          current = { zone, isClosed: zone === 'bridge', vertices: [] }
        }
        current.vertices.push({ x, zBot: gz, zTop: ceilZ, h })
      } else {
        if (current) { segments.push(current); current = null }
      }
    }
    if (current) segments.push(current)

    for (const seg of segments) {
      const verts  = seg.vertices
      seg.xLeft  = verts.length > 0 ? verts[0].x : 0
      seg.xRight = verts.length > 0 ? verts[verts.length - 1].x : 0
      seg.A = 0; seg.P = 0; seg.maxH = 0

      for (let i = 0; i < verts.length - 1; i++) {
        const v1 = verts[i], v2 = verts[i + 1]
        const dx = v2.x - v1.x
        if (dx > 1e-9) {
          seg.A    += 0.5 * (v1.h + v2.h) * dx
          seg.maxH  = Math.max(seg.maxH, v1.h, v2.h)
          seg.P    += Math.sqrt(dx * dx + (v2.zBot - v1.zBot) ** 2)
          if (seg.isClosed) seg.P += Math.sqrt(dx * dx + (v2.zTop - v1.zTop) ** 2)
        }
      }

      if (seg.zone === 'bridge') {
        const tL = bukXLeft  !== null && seg.xLeft  <= bukXLeft  + TOL
        const tR = bukXRight !== null && seg.xRight >= bukXRight - TOL
        seg.type = tL && tR ? 'main' : tL || tR ? 'side' : 'island'
      } else {
        seg.type = 'floodplain'
      }
    }

    return segments
  }

  /**
   * Zone-2-Vertices: Boden- und Deckelkante der Überströmungszone (oberhalb BOK-Referenz).
   * Gerinnesohle = max(Gelände, BOK-Referenz) — berücksichtigt aufgesatteltes Brückendeck.
   */
  function buildZ2Vertices(terrain, bok, wsp) {
    if (!terrain || terrain.length < 2 || !bok || bok.length < 2) return []
    const xs = mergedKeyX(terrain, null, bok)

    const segs = []
    let prevX = null, prevH = null, prevInBok = false

    for (const x of xs) {
      const bRef = bokRefZ(bok, x)
      if (bRef >= Infinity) { prevX = x; prevH = null; prevInBok = false; continue }
      const groundZ = interpZ(terrain, x)
      const floorZ  = Math.max(groundZ, bRef)
      const h       = wsp - floorZ

      if (prevX !== null && prevH !== null && prevInBok) {
        const wasWet = prevH > 1e-6
        const isWet  = h    > 1e-6
        if (wasWet !== isWet && prevH !== h) {
          const t = prevH / (prevH - h)
          if (t > 1e-9 && t < 1 - 1e-9) {
            const xc    = prevX + t * (x - prevX)
            const gzc   = interpZ(terrain, xc)
            const bRefC = bokRefZ(bok, xc)
            segs.push({ x: xc, zBot: Math.max(gzc, bRefC), zTop: Math.max(gzc, bRefC) })
          }
        }
      }

      if (h > 1e-6) segs.push({ x, zBot: floorZ, zTop: wsp })
      prevX = x; prevH = h; prevInBok = true
    }
    return segs
  }

  return { buildZ1Vertices, buildZ1SegmentData, buildZ2Vertices }
}
