/**
 * Hydraulikmodul für irreguläre Gerinne- und Brückenquerschnitte
 *
 * Hydraulische Zustände:
 *   Zustand 0/1: Freispiegel — Manning-Strickler (Composite Einstein-Verfahren)
 *                Q = Σ kStᵢ · Aᵢ · Rᵢ^(2/3) · I^(1/2)
 *   Zustand 2:   Druckabfluss — Orifice-Formel
 *                Q₁ = μ · A_öffnung · √(2g · Δh),  Δh = WSP − z_centroid
 *                z_centroid = Σ((g+BUK)/2 · h · dx) / A_bridge  (Flächenschwerpunkt)
 *   Zustand 3:   Druckabfluss + Überströmung
 *                Q₁ wie Zustand 2
 *                Q₂ = (2/3) · μ_D · √(2g) · ∫ h_ü(x)^1.5 dx  (Poleni, streifenweise)
 *
 * Zone 1: Durchströmung (unterhalb BUK / BOK-Referenzniveau)
 * Zone 2: Überströmung (oberhalb BOK-Referenzniveau)
 *
 * bukProfile: Brückenunterkante (BUK) — Deckel der Brückenöffnung
 * bokProfile: Brückenoberkante (BOK) — Boden der Überströmungszone
 */
export function useBridgeHydraulics() {

  // ─── Hilfsfunktionen ────────────────────────────────────────────────────

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

  function interpBridgeZ(profile, x) {
    if (!profile || profile.length < 2) return Infinity
    if (x < profile[0].x || x > profile[profile.length - 1].x) return Infinity
    return interpZ(profile, x)
  }

  function bokRefZ(bokProfile, x) {
    if (!bokProfile || bokProfile.length < 2) return Infinity
    if (x <= bokProfile[0].x) return bokProfile[0].z
    if (x >= bokProfile[bokProfile.length - 1].x) return bokProfile[bokProfile.length - 1].z
    return interpZ(bokProfile, x)
  }

  function getKstAtX(kstZones, x) {
    if (!kstZones || kstZones.length === 0) return 30
    let kst = kstZones[0].kst
    for (const z of kstZones) {
      const xL = z.xLeft  == null ? -Infinity : z.xLeft
      const xR = z.xRight == null ?  Infinity : z.xRight
      if (x >= xL && x <= xR) kst = z.kst
    }
    return kst
  }

  function allKeyX(crossSection, bukProfile, bokProfile, kstZones) {
    const xs = new Set()
    const xMin = crossSection[0].x, xMax = crossSection[crossSection.length - 1].x
    crossSection.forEach(p => xs.add(p.x))
    if (bukProfile) bukProfile.forEach(p => { if (p.x > xMin && p.x < xMax) xs.add(p.x) })
    if (bokProfile) bokProfile.forEach(p => { if (p.x > xMin && p.x < xMax) xs.add(p.x) })
    if (kstZones) kstZones.forEach(z => {
      if (z.xLeft  > xMin && z.xLeft  < xMax) xs.add(z.xLeft)
      if (z.xRight > xMin && z.xRight < xMax) xs.add(z.xRight)
    })
    if (bukProfile && bukProfile.length >= 2) {
      xs.add(bukProfile[0].x); xs.add(bukProfile[bukProfile.length - 1].x)
    }
    if (bokProfile && bokProfile.length >= 2) {
      xs.add(bokProfile[0].x); xs.add(bokProfile[bokProfile.length - 1].x)
    }
    return [...xs].sort((a, b) => a - b)
  }

  // ─── Hauptberechnung ────────────────────────────────────────────────────

  function calculateAtWSP({ crossSectionPoints, bukProfile, bokProfile, kstZones, slope, wsp, mu = 0.80, muDeck = 0.45, zeta = 0, nPiers = 0, bPier = 0, flowMode = 'auto', wspUW }) {
    if (!crossSectionPoints || crossSectionPoints.length < 2 || wsp <= 0) {
      return emptyResult(wsp)
    }

    const G = 9.81
    const hasBridge = !!(bukProfile && bukProfile.length >= 2)
    const hasBok    = !!(bokProfile && bokProfile.length >= 2)

    // Hydraulischer Zustand über Extremwerte von BUK/BOK bestimmen
    const bukMin = hasBridge ? Math.min(...bukProfile.map(p => p.z)) : Infinity
    const bokMin = hasBok    ? Math.min(...bokProfile.map(p => p.z)) : Infinity

    // Sicherheitscheck: BOK muss über BUK liegen (sonst Zonenüberlappung)
    // Wenn BOK < BUK: BOK-Profil hydraulisch ignorieren bis Geometriefehler behoben
    const bokEffMin    = Math.max(bokMin, bukMin)
    const isSubmergedGeo = hasBridge && wsp >= bukMin
    // Effektiver Zustand: flowMode-Override des Ingenieurs
    const isSubmerged = !hasBridge          ? false
      : flowMode === 'free'                 ? false
      : flowMode === 'pressure'             ? true
      : isSubmergedGeo
    const hasOverflow = hasBok && bokMin >= bukMin && wsp > bokMin   // Guard: BOK < BUK → kein Overflow

    const I05     = Math.sqrt(Math.max(slope, 0))
    const xValues = allKeyX(crossSectionPoints, bukProfile, bokProfile, kstZones)

    // Aggregatoren (kSt-Zonen) für Manning (Zustand 0/1)
    const zoneMap = {}

    // Brückenöffnung für Orifice-Formel
    let A_bridge = 0    // Fließquerschnitt innerhalb BUK-Fußabdruck
    let bukZxDx  = 0    // Für flächengewichteten BUK-Mittelwert
    let bukDxSum = 0

    // Vorlandabfluss außerhalb BOK-Fußabdruck (Manning auch bei Druckabfluss)
    const plainMap = {}

    // Zone-2-Vorland außerhalb BOK-Fußabdruck (Manning für überströmtes Vorland)
    const zone2PlainMap = {}

    // Poleni: Streifenintegration über Brückendeck
    let Q_poleni = 0

    // Geometrische Gesamtwerte
    let totalA1 = 0, totalP1 = 0, totalT1 = 0   // T1 = Wasserspiegelbreite Zone 1
    let totalA2 = 0, totalP2 = 0

    for (let i = 0; i < xValues.length - 1; i++) {
      const x1 = xValues[i], x2 = xValues[i + 1]
      const dx = x2 - x1
      if (dx <= 1e-9) continue

      const xm   = (x1 + x2) / 2
      const g1   = interpZ(crossSectionPoints, x1)
      const g2   = interpZ(crossSectionPoints, x2)
      const buk1 = interpBridgeZ(bukProfile, x1)
      const buk2 = interpBridgeZ(bukProfile, x2)
      const bok1 = interpBridgeZ(bokProfile, x1)
      const bok2 = interpBridgeZ(bokProfile, x2)
      const bRef1 = bokRefZ(bokProfile, x1)
      const bRef2 = bokRefZ(bokProfile, x2)
      const kst  = getKstAtX(kstZones, xm)
      const key  = String(kst)

      if (!zoneMap[key]) zoneMap[key] = { kst, A1: 0, P1: 0, A2: 0, P2: 0 }

      // ── BUK-Fußabdruck: Öffnungsgeometrie für Orifice ───────────────────
      if (buk1 < Infinity && buk2 < Infinity) {
        const hO1  = Math.max(0, Math.min(wsp, buk1) - g1)
        const hO2  = Math.max(0, Math.min(wsp, buk2) - g2)
        A_bridge  += 0.5 * (hO1 + hO2) * dx
        // Flächenschwerpunkt der Öffnung: z_c = (Sohle + BUK) / 2 pro Streifen
        // (nur wo BUK über Gelände, sonst würde z_centroid künstlich sinken)
        const hFull1 = Math.max(0, buk1 - g1)
        const hFull2 = Math.max(0, buk2 - g2)
        if (hFull1 > 1e-9 || hFull2 > 1e-9) {
          bukZxDx  += 0.5 * (0.5 * (g1 + buk1) * hFull1 + 0.5 * (g2 + buk2) * hFull2) * dx
          bukDxSum += 0.5 * (hFull1 + hFull2) * dx
        }
      }

      // ── Zone 1: Gerinne unterhalb BOK-Referenz ───────────────────────────
      const c1_1 = buk1 < Infinity ? Math.min(wsp, buk1)
                 : bok1 < Infinity ? g1
                 : Math.min(wsp, bRef1)
      const c1_2 = buk2 < Infinity ? Math.min(wsp, buk2)
                 : bok2 < Infinity ? g2
                 : Math.min(wsp, bRef2)
      const h1_1 = Math.max(0, c1_1 - g1)
      const h1_2 = Math.max(0, c1_2 - g2)

      let stripA1 = 0, stripP1 = 0
      if (h1_1 > 1e-9 || h1_2 > 1e-9) {
        stripA1 = 0.5 * (h1_1 + h1_2) * dx
        stripP1 = Math.sqrt(dx * dx + (g2 - g1) ** 2)
        if (isSubmerged && buk1 < Infinity && buk2 < Infinity) {
          stripP1 += Math.sqrt(dx * dx + (buk2 - buk1) ** 2)  // BUK zu benetztem Umfang
        }
      }

      zoneMap[key].A1 += stripA1
      zoneMap[key].P1 += stripP1
      totalA1 += stripA1; totalP1 += stripP1
      if (stripA1 > 1e-9) totalT1 += dx

      // Vorlandstreifen außerhalb BOK-Fußabdruck → Manning auch bei Druckabfluss
      if (isSubmerged && buk1 >= Infinity && bok1 >= Infinity && stripA1 > 1e-9) {
        if (!plainMap[key]) plainMap[key] = { kst, A: 0, P: 0 }
        plainMap[key].A += stripA1
        plainMap[key].P += stripP1
      }

      // ── Zone 2: Fließbereich oberhalb BOK-Referenz ───────────────────────
      if (hasBok && (bRef1 < Infinity || bRef2 < Infinity)) {
        const floor2_1 = bRef1 < Infinity ? Math.max(g1, bRef1) : wsp + 1
        const floor2_2 = bRef2 < Infinity ? Math.max(g2, bRef2) : wsp + 1
        const h2_1 = Math.max(0, wsp - floor2_1)
        const h2_2 = Math.max(0, wsp - floor2_2)

        if (h2_1 > 1e-9 || h2_2 > 1e-9) {
          const stripA2 = 0.5 * (h2_1 + h2_2) * dx
          const stripP2 = Math.sqrt(dx * dx + (floor2_2 - floor2_1) ** 2)

          zoneMap[key].A2 += stripA2
          zoneMap[key].P2 += stripP2
          totalA2 += stripA2; totalP2 += stripP2

          if (bok1 < Infinity && bok2 < Infinity) {
            // Innerhalb BOK-Fußabdruck → Poleni-Streifen
            const bokMid = 0.5 * (bok1 + bok2)
            const h_ue   = Math.max(0, wsp - bokMid)
            if (h_ue > 1e-9) {
              Q_poleni += (2 / 3) * muDeck * Math.sqrt(2 * G) * Math.pow(h_ue, 1.5) * dx
            }
          } else {
            // Außerhalb BOK-Fußabdruck → Manning für überströmtes Vorland
            if (!zone2PlainMap[key]) zone2PlainMap[key] = { kst, A: 0, P: 0 }
            zone2PlainMap[key].A += stripA2
            zone2PlainMap[key].P += stripP2
          }
        }
      }
    }

    // ── Abflussberechnung je nach Zustand ────────────────────────────────────
    const zoneResults = []
    let Q1_total = 0, Q2_total = 0
    let Q_orifice_result = 0, Q_poleni_result = 0
    let h_drive_result = 0, mu_eff_result = mu
    let phi_result = 0, A_netto_result = A_bridge
    let uwActive_result = false

    // Manning-Q₁ immer berechnen — wird als Untergrenze beim Zustandsübergang verwendet
    let Q_manning_z1 = 0
    for (const z of Object.values(zoneMap)) {
      const R1 = z.A1 > 0 && z.P1 > 0 ? z.A1 / z.P1 : 0
      Q_manning_z1 += R1 > 0 ? z.kst * Math.pow(R1, 2 / 3) * I05 * z.A1 : 0
    }

    if (!isSubmerged) {
      // Zustand 0 / 1: Manning-Strickler (Freispiegel)
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
    } else {
      // Zustand 2 / 3: Orifice + ggf. Poleni

      // Zone 1: Manning Vorland vorab berechnen — wird für Übergangskorrektur benötigt
      // (Q_manning_z1 enthält auch Vorland; es würde sonst doppelt gezählt)
      let Q_plain1 = 0
      for (const z of Object.values(plainMap)) {
        const R = z.A > 0 && z.P > 0 ? z.A / z.P : 0
        Q_plain1 += R > 0 ? z.kst * Math.pow(R, 2 / 3) * I05 * z.A : 0
      }

      // Zone 1: Orifice-Formel für Brückenöffnung
      const z_centroid  = bukDxSum > 0 ? bukZxDx / bukDxSum : wsp
      const h_drive_geo = Math.max(0, wsp - z_centroid)
      // Eingestauter Orifice: Δh = OW − UW statt OW − z̄_BUK
      uwActive_result = wspUW != null && isFinite(wspUW) && wspUW < wsp
      const h_drive  = uwActive_result ? Math.max(0, wsp - wspUW) : h_drive_geo
      // Versperrungsgrad durch Pfeiler: φ = n·b_P / L_BUK → A_netto = A_bridge·(1−φ)
      const L_BUK  = hasBridge ? bukProfile[bukProfile.length - 1].x - bukProfile[0].x : 0
      phi_result   = (L_BUK > 1e-9 && nPiers > 0) ? Math.min(nPiers * bPier / L_BUK, 0.95) : 0
      A_netto_result = A_bridge * (1 - phi_result)
      // ζ-Pfeilerterm: analytische Lösung Q = μ·A_netto·√(2g·Δh)/√(1+μ²·ζ)
      const mu_eff     = zeta > 1e-9 ? mu / Math.sqrt(1 + mu * mu * zeta) : mu
      const Q_orifice_raw = mu_eff * A_netto_result * Math.sqrt(2 * G * h_drive)

      h_drive_result = h_drive
      mu_eff_result  = mu_eff

      // Übergangsglättung: Untergrenze = nur Brückenzone-Manning (ohne Vorland)
      // Q_manning_z1 enthält gesamtes Zone-1-Manning inkl. Vorland → Q_plain1 subtrahieren
      const Q_manning_bridge = Math.max(0, Q_manning_z1 - Q_plain1)
      Q_orifice_result = Math.max(Q_orifice_raw, Q_manning_bridge)

      Q1_total = Q_orifice_result + Q_plain1

      // Zone 2: Poleni (Brückendeck) + Manning (Vorland außerhalb BOK)
      let Q_plain2 = 0
      for (const z of Object.values(zone2PlainMap)) {
        const R = z.A > 0 && z.P > 0 ? z.A / z.P : 0
        Q_plain2 += R > 0 ? z.kst * Math.pow(R, 2 / 3) * I05 * z.A : 0
      }

      Q_poleni_result = hasOverflow ? Q_poleni : 0
      Q2_total = Q_poleni_result + Q_plain2

      // Ergebniseintrag (ein Eintrag für den Druckabflussbereich)
      const v_orifice = A_netto_result > 0 ? Q_orifice_result / A_netto_result : 0
      const R_bridge  = A_bridge > 0 && totalP1 > 0 ? A_bridge / totalP1 : 0
      zoneResults.push({
        kst: null,
        A1: A_bridge, P1: totalP1, R1: R_bridge, v1: v_orifice, Q1: Q_orifice_result,
        A2: totalA2,  P2: totalP2, R2: 0,         v2: 0,          Q2: Q2_total
      })
    }

    // Mittlere Hydraulik für Gesamtdarstellung
    const R1_mean = totalA1 > 0 && totalP1 > 0 ? totalA1 / totalP1 : 0
    const v1_mean = Q1_total > 0 && totalA1 > 0 ? Q1_total / totalA1 : 0
    const R2_mean = totalA2 > 0 && totalP2 > 0 ? totalA2 / totalP2 : 0
    const v2_mean = Q2_total > 0 && totalA2 > 0 ? Q2_total / totalA2 : 0

    // Froude-Zahl: Fr = v / √(g · D),  D = A/T (hydraulische Tiefe)
    const D1_hydraulic = totalT1 > 1e-9 ? totalA1 / totalT1 : 0
    const Fr1 = D1_hydraulic > 1e-9 && v1_mean > 0 ? v1_mean / Math.sqrt(G * D1_hydraulic) : 0

    const state = !hasBridge ? 0 : hasOverflow ? 3 : isSubmerged ? 2 : 1

    return {
      wsp, state,
      Q1_total, Q2_total, Q_total: Q1_total + Q2_total,
      A1_total: totalA1, P1_total: totalP1, R1_mean, v1_mean,
      A2_total: totalA2, P2_total: totalP2, R2_mean, v2_mean,
      zoneResults,
      hasBridge, isSubmerged, hasOverflow,
      A_bridge, Q_orifice: Q_orifice_result, Q_poleni: Q_poleni_result,
      h_drive: h_drive_result, mu_eff: mu_eff_result, zeta_used: isSubmerged ? zeta : 0,
      phi: phi_result, A_netto: A_netto_result,
      isSubmergedGeo, flowModeUsed: flowMode, isUWActive: uwActive_result,
      Fr1, frWarn: Fr1 >= 0.8,
    }
  }

  function emptyResult(wsp) {
    return {
      wsp, state: 0,
      Q1_total: 0, Q2_total: 0, Q_total: 0,
      A1_total: 0, P1_total: 0, R1_mean: 0, v1_mean: 0,
      A2_total: 0, P2_total: 0, R2_mean: 0, v2_mean: 0,
      zoneResults: [],
      hasBridge: false, isSubmerged: false, hasOverflow: false,
      A_bridge: 0, Q_orifice: 0, Q_poleni: 0,
      h_drive: 0, mu_eff: 0, zeta_used: 0,
      phi: 0, A_netto: 0,
      isSubmergedGeo: false, flowModeUsed: 'auto', isUWActive: false,
      Fr1: 0, frWarn: false,
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

  /**
   * Bisection: Q_target → WSP.
   * Scans 50 coarse intervals first to bracket the root (handles state-transition kinks),
   * then refines to tol = 0.001 m with up to 60 bisection steps.
   */
  function findWSPForQ(params, Q_target, wspMin, wspMax) {
    if (Q_target <= 0) return wspMin
    const N = 50
    const dw = (wspMax - wspMin) / N
    let lo = wspMin, hi = wspMax, found = false
    let Q_prev = calculateAtWSP({ ...params, wsp: wspMin }).Q_total
    for (let i = 1; i <= N; i++) {
      const wi = wspMin + i * dw
      const Qi = calculateAtWSP({ ...params, wsp: wi }).Q_total
      if (Math.min(Q_prev, Qi) <= Q_target && Q_target <= Math.max(Q_prev, Qi)) {
        lo = wi - dw; hi = wi; found = true; break
      }
      Q_prev = Qi
    }
    if (!found) {
      const Q_lo = calculateAtWSP({ ...params, wsp: wspMin }).Q_total
      const Q_hi = calculateAtWSP({ ...params, wsp: wspMax }).Q_total
      return Math.abs(Q_target - Q_lo) < Math.abs(Q_target - Q_hi) ? wspMin : wspMax
    }
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (hi - lo < 0.001) break
      const Q_mid = calculateAtWSP({ ...params, wsp: mid }).Q_total
      if (Q_mid < Q_target) lo = mid; else hi = mid
    }
    return Math.round((lo + hi) / 2 * 1000) / 1000
  }

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
    calculateAtWSP, generateRatingCurve, findWSPForQ, customProfileGeom,
    interpZ, interpBridgeZ, bokRefZ,
  }
}
