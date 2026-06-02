// Normative Datengrundlage für den AFS63-Behandlungsbedarf nach DWA-A 102-2/BWK-A 3-2:2020
//
// Quelle: client/src/features/afs63/Normative-Grundlagen/DWA-A_102-2.pdf
//   - Tabelle A.1 (Anhang A): Zuordnung Flächengruppe -> Belastungskategorie
//   - Tabelle 4 (Abschnitt 5.2.2): flächenspezifischer Stoffabtrag bR,a,AFS63 je Kategorie
//   - Abschnitt 5.2.2.4: zulässiger flächenspezifischer Stoffaustrag bR,e,zul,AFS63
//
// Diese Datei ist die Single Source of Truth für Klassifizierung und Frachtwerte.

/**
 * Belastungskategorien mit flächenspezifischem Stoffabtrag bR,a,AFS63 nach Tabelle 4.
 * specificLoad in kg/(ha·a), concentration in mg/l (Jahresregenwasserabfluss).
 */
export const LOAD_CATEGORIES = {
  I: {
    id: 'I',
    label: 'gering belastet',
    specificLoad: 280,
    concentration: 50,
    color: '#2ecc71'
  },
  II: {
    id: 'II',
    label: 'mäßig belastet',
    specificLoad: 530,
    concentration: 95,
    color: '#f39c12'
  },
  III: {
    id: 'III',
    label: 'stark belastet',
    specificLoad: 760,
    concentration: 136,
    color: '#e74c3c'
  }
}

/**
 * Zulässiger flächenspezifischer Stoffaustrag bR,e,zul,AFS63 (Abschnitt 5.2.2.4).
 * Entspricht dem Wert der Kategorie I. Überschreitet der gebietsbezogene
 * Stoffabtrag diesen Wert, ist eine Behandlung erforderlich.
 */
export const ALLOWED_SPECIFIC_LOAD = 280 // kg/(ha·a)

/**
 * Flächengruppen nach Tabelle A.1 (Anhang A) mit Zuordnung zur Belastungskategorie.
 * id = Kurzzeichen der Flächengruppe, category = Belastungskategorie (I/II/III).
 */
export const SURFACE_GROUPS = [
  // --- Kategorie I (gering belastet) ---
  { id: 'D', name: 'Dächer (≤ 50 m² bzw. ohne SD1/SD2-Material)', flaechenart: 'Dächer', category: 'I' },
  { id: 'VW1', name: 'Fuß-/Rad-/Wohnwege, Höfe ohne Kfz, Garagenzufahrten', flaechenart: 'Hof- und Wegeflächen', category: 'I' },
  { id: 'V1', name: 'Wohngebiet, geringer Kfz-Verkehr (DTV ≤ 300)', flaechenart: 'Verkehrsflächen', category: 'I' },
  { id: 'BG1', name: 'Gleisanlagen Schotter (freie Strecke / Bahnhof ≤ 100.000 BRT)', flaechenart: 'Betriebsflächen', category: 'I' },
  { id: 'BF', name: 'Start-/Landebahnen, Flughafen-Betriebsflächen (ohne SF)', flaechenart: 'Betriebsflächen', category: 'I' },
  { id: 'BL', name: 'Landwirtschaftliche Hofflächen (ohne SL)', flaechenart: 'Betriebsflächen', category: 'I' },

  // --- Kategorie II (mäßig belastet) ---
  { id: 'VW2', name: 'Marktplätze, Freiluftveranstaltungen, Einkaufsstraßen', flaechenart: 'Hof- und Wegeflächen', category: 'II' },
  { id: 'V2', name: 'Mäßiger Kfz-Verkehr (DTV 300–15.000), Gewerbe/Industrie DTV ≤ 2.000', flaechenart: 'Verkehrsflächen', category: 'II' },
  { id: 'BG2', name: 'Gleisanlagen Bahnhof > 100.000 BRT / feste Fahrbahn ≤ 100.000 BRT', flaechenart: 'Betriebsflächen', category: 'II' },
  { id: 'SD1', name: 'Dächer mit 20–70 % gewässerschädlichem Material', flaechenart: 'Sonderflächen', category: 'II' },

  // --- Kategorie III (stark belastet) ---
  { id: 'V3', name: 'Hoher Kfz-Verkehr (DTV > 15.000), Gewerbe/Industrie DTV > 2.000', flaechenart: 'Verkehrsflächen', category: 'III' },
  { id: 'SV', name: 'Verkehrs-/Lagerflächen Gewerbe/Industrie mit besonderer Belastung', flaechenart: 'Sonderflächen', category: 'III' },
  { id: 'SVW', name: 'Hof-/Stellplätze Gewerbe/Industrie mit besonderer Belastung', flaechenart: 'Sonderflächen', category: 'III' },
  { id: 'SD2', name: 'Dächer mit > 70 % gewässerschädlichem Material', flaechenart: 'Sonderflächen', category: 'III' },
  { id: 'SF', name: 'Flughafenflächen mit Flugzeugwäsche/Betankung/Enteisung', flaechenart: 'Sonderflächen', category: 'III' },
  { id: 'SL', name: 'Landwirtschaft mit Tieransammlungen / Fahrzeugreinigung', flaechenart: 'Sonderflächen', category: 'III' },
  { id: 'BG3', name: 'Gleisanlagen feste Fahrbahn > 100.000 BRT', flaechenart: 'Betriebsflächen', category: 'III' },
  { id: 'SG', name: 'Gleisanlagen mit starkem Rangier-/Bremsbetrieb, Herbizideinsatz', flaechenart: 'Sonderflächen', category: 'III' },
  { id: 'SA', name: 'Hof-/Verkehrsflächen auf Abwasser-/Abfallanlagen', flaechenart: 'Sonderflächen', category: 'III' }
]

// --- Sonderregelung: Außerortsstraßen (REwS, Tabelle 7) ---
//
// Niederschlagswasser außerörtlicher Straßen ist NICHT Gegenstand der DWA-A 102
// (siehe A 102-2 Abschn. 1 / A 102-1). Für die emissionsbezogene Bewertung von
// Straßenabflüssen gelten die mittleren AFS63-Abtragsfrachten nach REwS, Tabelle 7:
//   Kategorie I   Straßen DTV < 2.000 Kfz/24 h            ≤ 280 kg/(ha·a)
//   Kategorie II  Straßen DTV 2.000 bis ≤ 15.000 Kfz/24 h   360 kg/(ha·a)  *)
//   Kategorie III Straßen DTV > 15.000 Kfz/24 h             550 kg/(ha·a)  **)
export const RURAL_ROAD_SOURCE = 'REwS, Tabelle 7 (Außerortsstraßen)'

// Fußnoten aus Tabelle 7 (REwS).
export const RURAL_ROAD_FOOTNOTES = {
  '*': 'Für Straßen mit DTV kleiner 15.000 Kfz/24 h liegen außerorts nur wenige Messungen an SOW vor. Jedoch zeigt die Auswertung von zahlreichen Bankettproben, die an Außerortsstraßen mit breitflächiger Versickerung genommen wurden (Kocher, 2008), dass Bankette von Straßen mit DTV zwischen 5.000 und 20.000 Kfz/24 h (Bundes- und Landesstraßen) deutlich geringere Konzentrationen der relevanten Schadstoffe enthalten als Straßen mit DTV zwischen 20.000 und > 100.000 Kfz/24 h. Die Konzentrationen an Kreisstraßen liegen bis auf geogene Metalle noch weit darunter.',
  '**': 'Mittlere AFS63-Abtragsfrachten nach Grotehusmann et al. (2017) ergänzt um weitere Messdaten von Kategorie III-Straßenabflüssen mit einem angenommenen AFS63-Anteil von 84 % an AFSgesamt nach Lange et al. (2003) und Krauth; Klein (1982).'
}

/**
 * Klassifiziert eine Außerortsstraße nach DTV (RAS-Ew, Tabelle 7).
 * @param {number} dtv Durchschnittliche tägliche Verkehrsstärke [Kfz/24 h]
 * @returns {{category:string, specificLoad:number, footnote:(string|null)}}
 */
export function classifyRuralRoad(dtv) {
  const v = Number(dtv) || 0
  if (v > 15000) return { category: 'III', specificLoad: 550, footnote: '**' }
  if (v >= 2000) return { category: 'II', specificLoad: 360, footnote: '*' }
  return { category: 'I', specificLoad: 280, footnote: null }
}

/**
 * Liefert die Belastungskategorie-Definition für eine Flächengruppe.
 * @param {string} groupId Kurzzeichen der Flächengruppe (z.B. 'V2')
 * @returns {{id:string,label:string,specificLoad:number,concentration:number,color:string}|null}
 */
export function getCategoryForGroup(groupId) {
  const group = SURFACE_GROUPS.find(g => g.id === groupId)
  if (!group) return null
  return LOAD_CATEGORIES[group.category] || null
}

/**
 * Optionen für den Flächengruppen-Selector (inkl. abgeleiteter Kategorie + Farbe).
 * Bringt die Daten in die vom SurfaceGroupSelector erwartete Form.
 */
export const SURFACE_GROUP_OPTIONS = SURFACE_GROUPS.map(group => {
  const cat = LOAD_CATEGORIES[group.category]
  return {
    id: group.id,
    name: group.name,
    flaechenart: group.flaechenart,
    category: group.category,
    categoryLabel: cat.label,
    specificLoad: cat.specificLoad,
    color: cat.color
  }
})
