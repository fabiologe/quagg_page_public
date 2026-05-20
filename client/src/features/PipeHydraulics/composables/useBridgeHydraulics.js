/**
 * Hydraulikmodul für irreguläre Gerinne- und Brückenquerschnitte
 *
 * Methode: Composite Manning-Strickler (Einstein-Verfahren)
 *   Für jeden kSt-Bereich werden A und P separat berechnet:
 *   Q = Σ kStᵢ · Aᵢ · Rᵢ^(2/3) · I^(1/2)
 *
 * Brückenstruktur:
 *   bukProfile: Punkte der Brückenunterkante (BUK) → Deckel Zone 1
 *   bokProfile: Punkte der Brückenoberkante (BOK) → Boden Zone 2
 *
 *   Zone 1: Gerinnebereich unterhalb BUK (bei WSP ≥ BUK → Druckabfluss,
 *            BUK-Linie wird zu benetztem Umfang addiert)
 *   Zone 2: Überflussbereich oberhalb BOK (wenn WSP > BOK)
 */
export function useBridgeHydraulics() {

  // ─── Hilfsfunktionen ────────────────────────────────────────────────────

  /** Lineare Interpolation der z-Koordinate entlang eines Profils bei x */
  function interpZ(profile, x) {
    if (!profile || profile.length === 0) return 0
    if (profile.length === 1) return profile[0].z
    if (x <= profile[0].x) return profile[0].z
    if (x >= profile[profile.length - 1].x) return profile[profile.length - 1].z
    for (let i = 0; i < profile.length - 1; i++) {
      if (x >= profile[i].x && x <= profile[i + 1].x) {
        const t = (x - profile[i].x) / (profile[i + 1].x - profile[i].x)
        return profile[i].z + t * (profile[i + 1].z - profile[i].z)
      }
    }
    return profile[profile.length - 1].z
  }

  /**
   * Brückenprofil-Interpolation:
   * Gibt Infinity zurück, wenn x außerhalb des Brücken-Fußabdrucks liegt.
   * (d.h. keine Brücke an dieser Stelle)
   */
  function interpBridgeZ(profile, x) {
    if (!profile || profile.length < 2) return Infinity
    if (x < profile[0].x || x > profile[profile.length - 1].x) return Infinity
    return interpZ(profile, x)
  }

  /**
   * BOK-Referenzhöhe für den gesamten Querschnitt:
   * Innerhalb des BOK-Fußabdrucks: interpolierter BOK-Wert.
   * Außerhalb: konstante Fortführung mit dem jeweiligen Endpunkt-z.
   * Teilt den Querschnitt in Zone 1 (darunter) und Zone 2 (darüber).
   * Gibt Infinity zurück wenn kein BOK-Profil definiert.
   */
  function bokRefZ(bokProfile, x) {
    if (!bokProfile || bokProfile.length < 2) return Infinity
    if (x <= bokProfile[0].x) return bokProfile[0].z
    if (x >= bokProfile[bokProfile.length - 1].x) return bokProfile[bokProfile.length - 1].z
    return interpZ(bokProfile, x)
  }

  /** kSt-Wert für Querschnittsposition x aus der Zonendefinition */
  function getKstAtX(kstZones, x) {
    if (!kstZones || kstZones.length === 0) return 30
    let kst = kstZones[0].kst
    for (const z of kstZones) {
      const xL = z.xLeft == null ? -Infinity : z.xLeft
      const xR = z.xRight == null ? Infinity : z.xRight
      if (x >= xL && x <= xR) kst = z.kst
    }
    return kst
  }

  /** Sammelt alle maßgebenden x-Koordinaten (Profil-, BUK-, BOK-, Zonengrenzen) */
  function allKeyX(crossSection, bukProfile, bokProfile, kstZones) {
    const xs = new Set()
    const xMin = crossSection[0].x, xMax = crossSection[crossSection.length - 1].x
    crossSection.forEach(p => xs.add(p.x))
    if (bukProfile) bukProfile.forEach(p => { if (p.x > xMin && p.x < xMax) xs.add(p.x) })
    if (bokProfile) bokProfile.forEach(p => { if (p.x > xMin && p.x < xMax) xs.add(p.x) })
    if (kstZones) kstZones.forEach(z => {
      if (z.xLeft > xMin && z.xLeft < xMax) xs.add(z.xLeft)
      if (z.xRight > xMin && z.xRight < xMax) xs.add(z.xRight)
    })
    // Edge of BUK/BOK profiles (Brückenränder als Sprungpunkte)
    if (bukProfile && bukProfile.length >= 2) {
      xs.add(bukProfile[0].x); xs.add(bukProfile[bukProfile.length - 1].x)
    }
    if (bokProfile && bokProfile.length >= 2) {
      xs.add(bokProfile[0].x); xs.add(bokProfile[bokProfile.length - 1].x)
    }
    return [...xs].sort((a, b) => a - b)
  }

  // ─── Hauptberechnung ────────────────────────────────────────────────────

  function calculateAtWSP({ crossSectionPoints, bukProfile, bokProfile, kstZones, slope, wsp }) {
    if (!crossSectionPoints || crossSectionPoints.length < 2 || wsp <= 0) {
      return emptyResult(wsp)
    }

    const xValues = allKeyX(crossSectionPoints, bukProfile, bokProfile, kstZones)

    // Aggregation nach kSt-Zonen
    const zoneMap = {}  // key: kst-Wert als String
    let totalA1 = 0, totalP1 = 0
    let totalA2 = 0, totalP2 = 0
    let isSubmerged = false
    let hasOverflow = false
    const hasBridge = !!(bukProfile && bukProfile.length >= 2)

    for (let i = 0; i < xValues.length - 1; i++) {
      const x1 = xValues[i], x2 = xValues[i + 1]
      const dx = x2 - x1
      if (dx <= 1e-9) continue

      const xm = (x1 + x2) / 2

      // Geländehöhe (Ground)
      const g1 = interpZ(crossSectionPoints, x1)
      const g2 = interpZ(crossSectionPoints, x2)

      // BUK-Höhe (Brückenunterkante) – Infinity außerhalb Brücke
      const buk1 = interpBridgeZ(bukProfile, x1)
      const buk2 = interpBridgeZ(bukProfile, x2)

      // BOK innerhalb Fußabdruck; bokRef = konstante Fortführung auch außerhalb
      const bok1 = interpBridgeZ(bokProfile, x1)
      const bok2 = interpBridgeZ(bokProfile, x2)
      const bRef1 = bokRefZ(bokProfile, x1)   // Infinity wenn kein BOK definiert
      const bRef2 = bokRefZ(bokProfile, x2)

      const kst = getKstAtX(kstZones, xm)
      const key = String(kst)

      // ── Zone 1: Gerinne unterhalb des BOK-Referenzniveaus ───────────────
      // • Innerhalb BUK (Brückenöffnung): Deckel = min(WSP, BUK)
      // • Innerhalb BOK aber außerhalb BUK (Widerlager): kein Durchfluss
      // • Außerhalb BOK: Deckel = min(WSP, bokRef) — Zone 2 beginnt ab bokRef
      const c1_1 = buk1 < Infinity ? Math.min(wsp, buk1)
                 : bok1 < Infinity ? g1                   // Widerlager: kein Durchfluss
                 : Math.min(wsp, bRef1)                   // offenes Gerinne bis BOK-Ref
      const c1_2 = buk2 < Infinity ? Math.min(wsp, buk2)
                 : bok2 < Infinity ? g2
                 : Math.min(wsp, bRef2)
      const h1_1 = Math.max(0, c1_1 - g1)
      const h1_2 = Math.max(0, c1_2 - g2)

      let stripA1 = 0, stripP1 = 0
      if (h1_1 > 1e-9 || h1_2 > 1e-9) {
        stripA1 = 0.5 * (h1_1 + h1_2) * dx
        stripP1 = Math.sqrt(dx * dx + (g2 - g1) ** 2)
        // BUK als benetzter Umfang bei Druckabfluss
        if ((wsp >= buk1 || wsp >= buk2) && buk1 < Infinity && buk2 < Infinity) {
          isSubmerged = true
          stripP1 += Math.sqrt(dx * dx + (buk2 - buk1) ** 2)
        }
      }

      // ── Zone 2: Gesamter Querschnitt oberhalb des BOK-Referenzniveaus ───
      // Erstreckt sich über den gesamten Querschnitt — nicht nur über BOK-Fußabdruck.
      // Boden = max(Gelände, bokRef); dadurch entsteht ein zusammenhängender Abflussbereich.
      let stripA2 = 0, stripP2 = 0
      if (bRef1 < Infinity || bRef2 < Infinity) {
        const floor2_1 = bRef1 < Infinity ? Math.max(g1, bRef1) : wsp + 1
        const floor2_2 = bRef2 < Infinity ? Math.max(g2, bRef2) : wsp + 1
        const h2_1 = Math.max(0, wsp - floor2_1)
        const h2_2 = Math.max(0, wsp - floor2_2)
        if (h2_1 > 1e-9 || h2_2 > 1e-9) {
          hasOverflow = true
          stripA2 = 0.5 * (h2_1 + h2_2) * dx
          // Benetzter Umfang folgt dem physischen Boden von Zone 2 (BOK-Deck oder Gelände)
          stripP2 = Math.sqrt(dx * dx + (floor2_2 - floor2_1) ** 2)
        }
      }

      // Aggregieren
      if (!zoneMap[key]) zoneMap[key] = { kst, A1: 0, P1: 0, A2: 0, P2: 0 }
      zoneMap[key].A1 += stripA1
      zoneMap[key].P1 += stripP1
      zoneMap[key].A2 += stripA2
      zoneMap[key].P2 += stripP2

      totalA1 += stripA1; totalP1 += stripP1
      totalA2 += stripA2; totalP2 += stripP2
    }

    // Manning-Strickler pro kSt-Zone
    const I05 = Math.sqrt(Math.max(slope, 0))
    const zoneResults = []
    let Q1_total = 0, Q2_total = 0

    for (const z of Object.values(zoneMap)) {
      const R1 = z.A1 > 0 && z.P1 > 0 ? z.A1 / z.P1 : 0
      const v1 = R1 > 0 ? z.kst * Math.pow(R1, 2 / 3) * I05 : 0
      const Q1 = v1 * z.A1

      const R2 = z.A2 > 0 && z.P2 > 0 ? z.A2 / z.P2 : 0
      const v2 = R2 > 0 ? z.kst * Math.pow(R2, 2 / 3) * I05 : 0
      const Q2 = v2 * z.A2

      Q1_total += Q1; Q2_total += Q2
      zoneResults.push({ kst: z.kst, A1: z.A1, P1: z.P1, R1, v1, Q1, A2: z.A2, P2: z.P2, R2, v2, Q2 })
    }

    // Mittlere Hydraulik (für Gesamtdarstellung)
    const R1_mean = totalA1 > 0 && totalP1 > 0 ? totalA1 / totalP1 : 0
    const v1_mean = Q1_total > 0 && totalA1 > 0 ? Q1_total / totalA1 : 0
    const R2_mean = totalA2 > 0 && totalP2 > 0 ? totalA2 / totalP2 : 0
    const v2_mean = Q2_total > 0 && totalA2 > 0 ? Q2_total / totalA2 : 0

    return {
      wsp,
      Q1_total, Q2_total, Q_total: Q1_total + Q2_total,
      A1_total: totalA1, P1_total: totalP1, R1_mean, v1_mean,
      A2_total: totalA2, P2_total: totalP2, R2_mean, v2_mean,
      zoneResults,
      hasBridge, isSubmerged, hasOverflow
    }
  }

  function emptyResult(wsp) {
    return {
      wsp,
      Q1_total: 0, Q2_total: 0, Q_total: 0,
      A1_total: 0, P1_total: 0, R1_mean: 0, v1_mean: 0,
      A2_total: 0, P2_total: 0, R2_mean: 0, v2_mean: 0,
      zoneResults: [],
      hasBridge: false, isSubmerged: false, hasOverflow: false
    }
  }

  function generateRatingCurve(params, wspMin, wspMax, steps = 30) {
    const rows = []
    const step = (wspMax - wspMin) / steps
    for (let i = 0; i <= steps; i++) {
      const wsp = +((wspMin + i * step).toFixed(3))
      rows.push(calculateAtWSP({ ...params, wsp }))
    }
    return rows
  }

  // ─── Polygon-Aufbau für visuelle Darstellung (mit exakten Kreuzpunkten) ──

  /**
   * Alle maßgebenden x-Koordinaten aus Terrain + BUK + BOK für Pfadaufbau.
   * Identisch mit allKeyX, aber ohne kSt-Zonen (rein geometrisch).
   */
  function mergedKeyX(terrain, buk, bok) {
    const xs = new Set(terrain.map(p => p.x))
    if (buk && buk.length >= 2) buk.forEach(p => xs.add(p.x))
    if (bok && bok.length >= 2) bok.forEach(p => xs.add(p.x))
    return [...xs].sort((a, b) => a - b)
  }

  /**
   * Berechnet Zone-1-Polygon-Vertices mit exakten Randkreuzpunkten.
   *
   * Zwischen zwei aufeinanderfolgenden Schlüssel-x-Werten sind Gelände,
   * BUK und BOK alle stückweise linear → Kreuzungspunkt (h = 0) liegt bei
   * t = h1 / (h1 - h2) und kann exakt interpoliert werden.
   *
   * Gibt Array von {x, zBot, zTop} zurück (nur wo Wasser vorhanden,
   * plus degenerierten Randpunkt am Übergang, damit das Polygon korrekt
   * geschlossen wird ohne Dreiecks-Artefakt).
   */
  function buildZ1Vertices(terrain, buk, bok, wsp) {
    if (!terrain || terrain.length < 2) return []
    const xs = mergedKeyX(terrain, buk, bok)

    function ceilAt(x) {
      const bukz     = interpBridgeZ(buk, x)
      const bokInside = interpBridgeZ(bok, x)
      const bRef      = bokRefZ(bok, x)
      return bukz < Infinity     ? Math.min(wsp, bukz)
           : bokInside < Infinity ? interpZ(terrain, x)  // Widerlager
           : Math.min(wsp, bRef)
    }

    const segs = []
    let prevX = null, prevH = null

    for (const x of xs) {
      const gz    = interpZ(terrain, x)
      const ceilZ = ceilAt(x)
      const h     = ceilZ - gz

      // Kreuzpunkt einfügen wenn Vorzeichen wechselt (Wasser ↔ kein Wasser)
      if (prevX !== null && prevH !== null) {
        const wasWet = prevH > 1e-6
        const isWet  = h     > 1e-6
        if (wasWet !== isWet && prevH !== h) {
          const t = prevH / (prevH - h)
          if (t > 1e-9 && t < 1 - 1e-9) {
            const xc  = prevX + t * (x - prevX)
            const gzc = interpZ(terrain, xc)
            segs.push({ x: xc, zBot: gzc, zTop: gzc })  // Randpunkt (Höhe = 0)
          }
        }
      }

      if (h > 1e-6) segs.push({ x, zBot: gz, zTop: ceilZ })
      prevX = x; prevH = h
    }
    return segs
  }

  /**
   * Berechnet Zone-2-Polygon-Vertices (Überflutungsbereich oberhalb BOK-Referenz)
   * mit exakten Randkreuzpunkten.
   */
  function buildZ2Vertices(terrain, bok, wsp) {
    if (!terrain || terrain.length < 2 || !bok || bok.length < 2) return []
    const xs = mergedKeyX(terrain, null, bok)

    const segs = []
    let prevX = null, prevH = null, prevInBok = false

    for (const x of xs) {
      const bRef = bokRefZ(bok, x)
      if (bRef >= Infinity) {
        // BOK-Referenzlinie endet hier → Status zurücksetzen
        prevX = x; prevH = null; prevInBok = false
        continue
      }
      const groundZ = interpZ(terrain, x)
      const floorZ  = Math.max(groundZ, bRef)
      const h       = wsp - floorZ

      if (prevX !== null && prevH !== null && prevInBok) {
        const wasWet = prevH > 1e-6
        const isWet  = h    > 1e-6
        if (wasWet !== isWet && prevH !== h) {
          const t = prevH / (prevH - h)
          if (t > 1e-9 && t < 1 - 1e-9) {
            const xc      = prevX + t * (x - prevX)
            const gzc     = interpZ(terrain, xc)
            const bRefC   = bokRefZ(bok, xc)
            const floorC  = Math.max(gzc, bRefC)
            segs.push({ x: xc, zBot: floorC, zTop: floorC })  // Randpunkt
          }
        }
      }

      if (h > 1e-6) segs.push({ x, zBot: floorZ, zTop: wsp })
      prevX = x; prevH = h; prevInBok = true
    }
    return segs
  }

  // ─── Freies Profil (Querschnittsfläche und Umfang bei Wasserstand level) ─

  function customProfileGeom(points, level) {
    if (!points || points.length < 2) return { A: 0, P: 0 }
    let A = 0, P = 0
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i + 1]
      const d1 = level - p1.z, d2 = level - p2.z
      const dx = p2.x - p1.x
      const segLen = Math.sqrt(dx * dx + (p2.z - p1.z) ** 2)
      if (d1 <= 0 && d2 <= 0) continue
      if (d1 >= 0 && d2 >= 0) {
        A += 0.5 * (d1 + d2) * Math.abs(dx)
        P += segLen
      } else {
        const t = d1 / (d1 - d2)
        const xi = p1.x + t * dx
        if (d1 > 0) { A += 0.5 * d1 * Math.abs(xi - p1.x); P += t * segLen }
        else { A += 0.5 * d2 * Math.abs(p2.x - xi); P += (1 - t) * segLen }
      }
    }
    return { A: Math.max(0, A), P: Math.max(0, P) }
  }

  return {
    calculateAtWSP, generateRatingCurve, customProfileGeom,
    interpZ, interpBridgeZ, bokRefZ,
    buildZ1Vertices, buildZ2Vertices,
  }
}
