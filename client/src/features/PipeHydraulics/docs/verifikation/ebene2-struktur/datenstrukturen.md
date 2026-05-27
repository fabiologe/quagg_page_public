---
name: Ebene 2 — Datenstrukturen
tags: [verifikation, ebene-2, datenstrukturen, schema]
---

# Schlüssel-Datenstrukturen

← [[index|Ebene 2 Index]]

---

## calcParams — Eingabe-Objekt

Gebündeltes Eingabe-Objekt für alle Hydraulik-Funktionen.
Wird in `useBridgeStore.js` als `computed` aus den einzelnen State-Feldern zusammengebaut.

```javascript
calcParams: {
  crossSectionPoints: [{ x: number, z: number }, ...],   // Terrain-Profil (≥2 Punkte)
  bukProfile:         [{ x: number, z: number }, ...],   // Brückenunterkante (null = keine Brücke)
  bokProfile:         [{ x: number, z: number }, ...],   // Brückenoberkante (null = kein Overflow)
  kstZones: [{
    id:     string,    // Eindeutiger Bezeichner
    xLeft:  number|null,   // Linke Zonengrenze (null = von −∞)
    xRight: number|null,   // Rechte Zonengrenze (null = bis +∞)
    kst:    number,    // Strickler-Beiwert [m^(1/3)/s]
    color:  string,    // CSS-Farbe für SVG-Darstellung
    label:  string,    // Anzeigename
  }, ...],
  slope:    number,    // Sohlgefälle I [–] (z.B. 0.001)
  mu:       number,    // Druckabfluss-Beiwert μ [–] (0.60–0.90)
  muDeck:   number,    // Überströmungs-Beiwert μD [–] (0.35–0.50)
  zeta:     number,    // Pfeiler-Formwiderstand ζ [–]
  nPiers:   number,    // Anzahl Pfeiler
  bPier:    number,    // Pfeilerbreite [m]
  flowMode: string,    // 'auto' | 'free' | 'pressure'
  wspUW:    number|undefined,  // Unterwasserstand [m] (undefined = kein Rückstau)
}
```

---

## currentResult — Berechnungsergebnis

Vollständiges Ergebnisobjekt von `calculateAtWSP()`.
Alle Felder immer vorhanden — bei `emptyResult` auf 0/false gesetzt.

```javascript
currentResult: {
  // Eingang
  wsp:          number,   // Wasserspiegellage [m ü. Bezug]
  state:        0|1|2|3,  // Hydraulischer Zustand (niemals undefined)

  // Gesamtabfluss
  Q_total:      number,   // Gesamtabfluss [m³/s]
  Q1_total:     number,   // Zone-1-Abfluss (Brücke + Vorland) [m³/s]
  Q2_total:     number,   // Zone-2-Abfluss (Überströmung) [m³/s]

  // Zone-1-Geometrie
  A1_total:     number,   // Zone-1-Querschnittsfläche [m²]
  P1_total:     number,   // Zone-1-Benetzter Umfang [m]
  R1_mean:      number,   // Mittlerer hydraulischer Radius [m]
  v1_mean:      number,   // Mittlere Fließgeschwindigkeit [m/s]

  // Brücken-Hydraulik
  A_bridge:     number,   // Geometrische Öffnungsfläche [m²]
  Q_orifice:    number,   // Orifice-Abfluss [m³/s]
  Q_poleni:     number,   // Poleni-Abfluss [m³/s]
  h_drive:      number,   // Treibende Druckhöhe Δh [m]
  mu_eff:       number,   // Effektiver Beiwert nach ζ-Korrektur

  // Pfeiler
  phi:          number,   // Versperrungsgrad [–]  (n·b/L_BUK)
  A_netto:      number,   // Netto-Öffnungsfläche [m²]

  // Flags
  hasBridge:    boolean,  // BUK vorhanden und ≥2 Punkte
  isSubmerged:  boolean,  // WSP ≥ min(BUK.z)
  hasOverflow:  boolean,  // WSP > min(BOK.z)
  isUWActive:   boolean,  // Rückstau wirksam (wspUW relevant)

  // Froude
  Fr1:          number,   // Froude-Zahl Zone 1
  frWarn:       boolean,  // true wenn Fr ≥ 0.8

  // Pro kSt-Zone
  zoneResults: [{
    kst:   number,
    A:     number,
    P:     number,
    R:     number,
    Q:     number,
    label: string,
  }, ...],
}
```

---

## z1Segment — Fließsegment (Renderer)

Ergebnis von `buildZ1SegmentData()` — treibt die farbkodierte SVG-Darstellung an.

```javascript
z1Segment: {
  zone:     'bridge'|'masked'|'floodplain',
  type:     'main'|'side'|'island'|'floodplain',
  isClosed: boolean,   // true für 'bridge' (BUK als Deckel mitberechnet)
  vertices: [{ x: number, zBot: number, zTop: number, h: number }, ...],
  xLeft:    number,    // Linkeste x-Koordinate des Segments
  xRight:   number,    // Rechteste x-Koordinate
  A:        number,    // Querschnittsfläche [m²]
  P:        number,    // Benetzter Umfang [m]
  maxH:     number,    // Maximale Wassertiefe im Segment [m]
}
```

**Typ-Klassifikation (`type`):**

| Typ | Bedingung | Farbe (SVG) | Hydraulisch aktiv |
|-----|-----------|-------------|------------------|
| `main` | Grenzt an beide BUK-Enden | #3b82f6 blau | ✓ ja |
| `side` | Grenzt an genau eine BUK-Seite | #60a5fa hellblau | ✓ ja |
| `island` | Kein BUK-Kontakt | #f59e0b amber | ✗ Warnung |
| `floodplain` | Außerhalb BUK-Fußabdruck | #93c5fd sehr hell | ✓ Manning |

Insel-Polygone (`island`) lösen eine Validierungswarnung aus und gehen
**nicht** in die Hydraulikberechnung ein.

---

## ValidationItem

```javascript
ValidationItem: {
  code:     string,    // Eindeutiger Code (z.B. 'BUK_BELOW_TERRAIN')
  layer:    'terrain'|'buk'|'bok'|'global',
  title:    string,    // Kurzbeschreibung (1 Zeile)
  detail:   string,    // Ausführliche Erklärung + Handlungsempfehlung
  xMarkers: number[],  // x-Koordinaten für SVG-Marker im Profil
}
```

Fehler (`errors`) blockieren die Berechnung (`isValid = false`).
Warnungen (`warnings`) erlauben die Berechnung, signalisieren aber Risiko.
