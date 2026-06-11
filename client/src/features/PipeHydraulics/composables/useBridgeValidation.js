/**
 * Geometrie- und Plausibilitätsprüfung für Brückenhydraulik-Eingaben.
 *
 * Fehler   → Berechnung definitiv falsch / physikalisch unmöglich
 * Warnungen → verdächtig, aber ggf. bewusst so gewählt
 *
 * Kreuzpunkte: Alle Profile sind nach x sortiert. Kreuzungen entstehen
 * wenn z-Werte zweier Profile die Reihenfolge wechseln (BUK > BOK o.ä.).
 * Erkannt durch Abtastung aller Schlüssel-x-Werte beider Profile.
 */
import { computed } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { useBridgeHydraulics } from './useBridgeHydraulics.js'
import { useBridgeRenderer } from './useBridgeRenderer.js'

export function useBridgeValidation() {
  const store = useBridgeStore()
  const { interpZ } = useBridgeHydraulics()
  const { buildZ1SegmentData } = useBridgeRenderer()

  // ─── Hilfsfunktionen ──────────────────────────────────────────────────────

  /** Alle x-Werte beider Profile im Überschneidungsbereich zusammenführen */
  function overlapX(prof1, prof2) {
    const xMin = Math.max(prof1[0].x, prof2[0].x)
    const xMax = Math.min(prof1[prof1.length - 1].x, prof2[prof2.length - 1].x)
    if (xMin >= xMax - 1e-9) return []
    const xs = new Set([xMin, xMax])
    for (const p of prof1) if (p.x > xMin && p.x < xMax) xs.add(p.x)
    for (const p of prof2) if (p.x > xMin && p.x < xMax) xs.add(p.x)
    return [...xs].sort((a, b) => a - b)
  }

  /** Gibt Punkte zurück, an denen prof1(x) > prof2(x) im gemeinsamen Bereich */
  function crossingsAbove(prof1, prof2) {
    const pts = []
    for (const x of overlapX(prof1, prof2)) {
      const z1 = interpZ(prof1, x)
      const z2 = interpZ(prof2, x)
      if (z1 > z2 + 1e-6) pts.push({ x, zViolator: z1, zLimit: z2, delta: z1 - z2 })
    }
    return pts
  }

  /** Gibt Punkte zurück, an denen prof1(x) < prof2(x) im Footprint von prof1 */
  function crossingsBelow(prof1, prof2) {
    const xMin = prof1[0].x
    const xMax = prof1[prof1.length - 1].x
    const xs = new Set([xMin, xMax])
    for (const p of prof1) xs.add(p.x)
    for (const p of prof2) if (p.x > xMin && p.x < xMax) xs.add(p.x)
    const pts = []
    for (const x of [...xs].sort((a, b) => a - b)) {
      const z1 = interpZ(prof1, x)
      const z2 = interpZ(prof2, x)
      if (z1 < z2 - 1e-6) pts.push({ x, zViolator: z1, zLimit: z2, delta: z2 - z1 })
    }
    return pts
  }

  function fmtX(pts) {
    return pts.map(p => `x = ${p.x.toFixed(2)} m`).join(', ')
  }

  // ─── Fehler (Berechnung falsch) ───────────────────────────────────────────
  const errors = computed(() => {
    const e = []
    const terrain = store.terrainPoints
    const buk = store.bukProfile
    const bok = store.bokProfile
    const hasBuk = buk.length >= 2
    const hasBok = bok.length >= 2

    // 1. Geländeprofil
    if (terrain.length < 2) {
      e.push({
        code: 'NO_TERRAIN',
        layer: 'terrain',
        title: 'Kein Geländeprofil',
        detail: 'Mindestens 2 Geländepunkte erforderlich.',
        xMarkers: [],
      })
      return e  // keine weiteren Checks möglich
    }

    // 2. Sohlgefälle
    if (store.slope <= 0) {
      e.push({
        code: 'NO_SLOPE',
        layer: null,
        title: 'Sohlgefälle I = 0',
        detail: 'Kein Gefälle → Q = 0 unabhängig vom Querschnitt.',
        xMarkers: [],
      })
    }

    // 3a. Alle kSt-Zonen als Totwasser markiert → kein durchströmter Querschnitt
    if (store.kstZones.length > 0 && store.kstZones.every(z => z.inactive)) {
      e.push({
        code: 'ALL_ZONES_INACTIVE',
        layer: 'kst',
        title: 'Alle kSt-Zonen sind Totwasser',
        detail: 'Jede Zone ist als Ineffective Flow Area markiert → Q = 0. Mindestens eine Zone muss aktiv sein.',
        xMarkers: [],
      })
    }

    // 3. kSt-Bereich
    for (const z of store.kstZones) {
      if (z.kst < 1 || z.kst > 120) {
        e.push({
          code: 'KST_RANGE',
          layer: 'kst',
          title: `kSt = ${z.kst} außerhalb 1–120`,
          detail: `Zone „${z.label}": kSt = ${z.kst} m¹³/s liegt außerhalb des physikalisch sinnvollen Bereichs.`,
          xMarkers: [],
        })
      }
    }

    // 4. WSP unter Gelände
    const zMin = Math.min(...terrain.map(p => p.z))
    if (store.wsp <= zMin) {
      e.push({
        code: 'WSP_BELOW_TERRAIN',
        layer: null,
        title: 'WSP unter Geländetiefpunkt',
        detail: `WSP = ${store.wsp.toFixed(2)} m ≤ Geländetief = ${zMin.toFixed(2)} m → kein benetzter Querschnitt.`,
        xMarkers: [],
      })
    }

    if (hasBuk && hasBok) {
      // 5. BOK-Footprint kleiner als BUK-Footprint
      if (bok[0].x > buk[0].x + 1e-6 || bok[bok.length - 1].x < buk[buk.length - 1].x - 1e-6) {
        e.push({
          code: 'BOK_FOOTPRINT',
          layer: 'bok',
          title: 'BOK-Footprint enthält BUK nicht vollständig',
          detail: `BUK: ${buk[0].x.toFixed(2)}–${buk[buk.length-1].x.toFixed(2)} m, BOK: ${bok[0].x.toFixed(2)}–${bok[bok.length-1].x.toFixed(2)} m. Brückendeckel schmäler als Öffnung → physikalisch unmöglich.`,
          xMarkers: [],
        })
      }

      // 6. BUK > BOK: Kreuzpunkte (Brückengeometrie invertiert)
      const bukAboveBok = crossingsAbove(buk, bok)
      if (bukAboveBok.length > 0) {
        e.push({
          code: 'BUK_ABOVE_BOK',
          layer: 'buk',
          title: 'BUK liegt über BOK (Kreuzpunkt)',
          detail: `Brückenunterkante über Brückenoberkante bei ${fmtX(bukAboveBok)}. Max. Δz = ${Math.max(...bukAboveBok.map(p=>p.delta)).toFixed(3)} m. Das erzeugt ein invertiertes Polygon → Flächenberechnung liefert falsche Vorzeichen.`,
          xMarkers: bukAboveBok.map(p => ({ x: p.x, zBuk: p.zViolator, zBok: p.zLimit })),
        })
      }
    }

    return e
  })

  // ─── Warnungen (verdächtig) ───────────────────────────────────────────────
  const warnings = computed(() => {
    const w = []
    const terrain = store.terrainPoints
    const buk = store.bukProfile
    const bok = store.bokProfile
    const hasBuk = buk.length >= 2
    const hasBok = bok.length >= 2
    if (terrain.length < 2) return w

    // Sehr kleines Gefälle
    if (store.slope > 0 && store.slope < 0.000001) {
      w.push({
        code: 'SLOPE_VERY_LOW',
        layer: null,
        title: `Gefälle sehr klein (${(store.slope * 1000).toFixed(6)} ‰)`,
        detail: 'I < 0,001 ‰ führt zu sehr kleinen Geschwindigkeiten und Q ≈ 0.',
        xMarkers: [],
      })
    }

    // WSP knapp über Geländetiefpunkt
    const zMin = Math.min(...terrain.map(p => p.z))
    const freibord = store.wsp - zMin
    if (freibord > 0 && freibord < 0.05) {
      w.push({
        code: 'WSP_BARELY_WET',
        layer: null,
        title: `WSP nur ${(freibord * 100).toFixed(1)} cm über Tiefstem Punkt`,
        detail: 'Benetzter Querschnitt vernachlässigbar klein → Ergebnis unsicher.',
        xMarkers: [],
      })
    }

    if (hasBuk && hasBok) {
      // BUK = BOK (keine Konstruktionshöhe)
      const equalPts = overlapX(buk, bok).filter(x => {
        return Math.abs(interpZ(buk, x) - interpZ(bok, x)) < 0.01
      })
      if (equalPts.length > 0) {
        w.push({
          code: 'BUK_EQUALS_BOK',
          layer: 'buk',
          title: 'BUK ≈ BOK: keine Konstruktionshöhe',
          detail: `Abstand BUK–BOK < 1 cm bei ${equalPts.map(x=>`x = ${x.toFixed(2)} m`).join(', ')}. Brückenquerschnitt hat keine nennenswerte Dicke.`,
          xMarkers: equalPts.map(x => ({ x, zBuk: interpZ(buk, x), zBok: interpZ(bok, x) })),
        })
      }
    }

    // BUK sehr nahe am Gelände (< 10 cm Freibord)
    if (hasBuk) {
      const close = buk.filter(p => {
        const gz = interpZ(terrain, p.x)
        return p.z >= gz && p.z - gz < 0.10
      })
      if (close.length > 0) {
        w.push({
          code: 'BUK_NEAR_TERRAIN',
          layer: 'buk',
          title: 'BUK nahe am Gelände (< 10 cm)',
          detail: `Minimaler Abstand BUK–Gelände bei ${close.map(p=>`x = ${p.x.toFixed(2)} m`).join(', ')}. Möglicherweise fehlendes Freispiegelabfluss-Profil.`,
          xMarkers: close.map(p => ({ x: p.x, z: p.z })),
        })
      }
    }

    // BUK unter Gelände: kein hydraulischer Fehler, Streifen tragen einfach 0 Fläche bei
    // (typisch an Widerlagern / Böschungen — Berechnung mit Math.max(0,...) korrekt)
    if (hasBuk) {
      const bukBelowTerr = crossingsBelow(buk, terrain)
      if (bukBelowTerr.length > 0) {
        w.push({
          code: 'BUK_BELOW_TERRAIN',
          layer: 'buk',
          title: 'BUK unter Gelände (Hinweis)',
          detail: `BUK liegt bei ${fmtX(bukBelowTerr)} unterhalb des Geländes (max. ${Math.max(...bukBelowTerr.map(p=>p.delta)).toFixed(3)} m). Betroffene Streifen tragen 0 zur Öffnungsfläche bei — kein hydraulischer Fehler. Typisch an Widerlagern/Böschungen.`,
          xMarkers: bukBelowTerr.map(p => ({ x: p.x, zBuk: p.zViolator, zTerrain: p.zLimit })),
        })
      }
    }

    // BOK unter Gelände: kein hydraulischer Fehler (Zone 2 hat dort keine Fläche)
    if (hasBok) {
      const bokBelowTerr = crossingsBelow(bok, terrain)
      if (bokBelowTerr.length > 0) {
        w.push({
          code: 'BOK_BELOW_TERRAIN',
          layer: 'bok',
          title: 'BOK unter Gelände (Hinweis)',
          detail: `BOK liegt bei ${fmtX(bokBelowTerr)} unterhalb des Geländes (max. ${Math.max(...bokBelowTerr.map(p=>p.delta)).toFixed(3)} m). Zone 2 hat dort keine wirksame Fläche — kein hydraulischer Fehler.`,
          xMarkers: bokBelowTerr.map(p => ({ x: p.x, zBok: p.zViolator, zTerrain: p.zLimit })),
        })
      }
    }

    // WSP knapp unter BUK: Druckabfluss droht
    if (hasBuk) {
      const freibordBuk = buk.map(p => ({
        x: p.x,
        freibord: interpZ(buk, p.x) - store.wsp
      })).filter(p => p.freibord > 0 && p.freibord < 0.20)
      if (freibordBuk.length > 0) {
        w.push({
          code: 'WSP_NEAR_BUK',
          layer: null,
          title: 'WSP nahe BUK: Druckabfluss droht',
          detail: `Freibord < 20 cm bei ${freibordBuk.map(p=>`x = ${p.x.toFixed(2)} m (${(p.freibord*100).toFixed(0)} cm)`).join(', ')}.`,
          xMarkers: [],
        })
      }
    }

    // Inselpolygone: Flächen im BUK-Fußabdruck ohne Verbindung zur Einlauf-/Auslaufkante
    if (hasBuk) {
      const maxBukZ = Math.max(...buk.map(p => p.z))
      const segs = buildZ1SegmentData(terrain, buk, null, maxBukZ + 1)
      const islands = segs.filter(s => s.type === 'island')
      if (islands.length > 0) {
        w.push({
          code: 'ISLAND_POLYGON',
          layer: 'buk',
          title: `${islands.length} Inselpolygon(e) im Brückenquerschnitt`,
          detail: 'Flächen ohne Verbindung zur Einlauf-/Auslaufkante werden fälschlicherweise zur Orifice-Öffnungsfläche A gerechnet. Geländeprofil im Brückenbereich prüfen.',
          xMarkers: [],
        })
      }
    }

    return w
  })

  const isValid    = computed(() => errors.value.length === 0)
  const hasWarning = computed(() => warnings.value.length > 0)

  // Alle x-Marker aller Fehler gesammelt (für SVG-Overlay)
  const allErrorMarkers = computed(() =>
    errors.value.flatMap(e => e.xMarkers.map(m => ({ ...m, code: e.code })))
  )
  const allWarningMarkers = computed(() =>
    warnings.value.flatMap(w => w.xMarkers.map(m => ({ ...m, code: w.code })))
  )

  return {
    errors, warnings,
    isValid, hasWarning,
    allErrorMarkers, allWarningMarkers,
  }
}
