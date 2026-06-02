// Anlagenbibliothek für die Niederschlagswasserbehandlung (AFS63-Rückhalt).
//
// Strukturierte, maschinenlesbare Aufbereitung gängiger Behandlungs- und Quellmaßnahmen
// mit ihren AFS63-Wirkungsgraden, anwendbaren Belastungskategorien und der Eigenschaft
// "Rückhaltung" (Speicher-/Drosselwirkung). Grundlage: Herstellerangaben und
// DWA-Regelwerk (u. a. DWA-A 102-2 Abschnitt 6, DWA-M 153).
//
// efficiency.type:
//   'numeric'      → AFS63-Wirkungsgrad quantifiziert (min/max, optional je Kategorie)
//   'qualitative'  → wirkt v. a. über Abflussvermeidung/Sonderbehandlung, nicht als AFS63-%
//
// categories: anwendbare Belastungskategorien ('I','II','III') und/oder Sondertags
//   'B' = Betriebsflächen, 'S' = Sonderflächen, 'LW' = landwirtschaftliche Hofflächen
//
// group: 'treatment' (Behandlungsanlage), 'source' (Quellmaßnahme/Abflussvermeidung),
//        'special' (Sonderanlage für Betriebs-/Sonderflächen)

export const FACILITY_GROUPS = {
  treatment: 'Behandlungsanlage',
  source: 'Quellmaßnahme / Abflussvermeidung',
  special: 'Sonderanlage (Betriebs-/Sonderflächen)'
}

export const TREATMENT_FACILITIES = [
  {
    id: 'rkb_ohne_dauerstau',
    name: 'Regenklärbecken ohne Dauerstau',
    group: 'treatment',
    categories: ['II', 'III'],
    retention: true,
    efficiency: { type: 'numeric', min: 84, max: 89, byCategory: { II: 84, III: 89 }, text: '84 % (Kategorie II) bis 89 % (Kategorie III)' }
  },
  {
    id: 'rkb_mit_dauerstau',
    name: 'Regenklärbecken mit Dauerstau',
    group: 'treatment',
    categories: ['II', 'III'],
    retention: true,
    note: 'nur Bestand',
    efficiency: { type: 'numeric', min: 10, max: 55, text: '10 % bis 40 % (maximal 55 %)' }
  },
  {
    id: 'retentionsbodenfilter',
    name: 'Retentionsbodenfilter',
    group: 'treatment',
    categories: ['II', 'III'],
    retention: true,
    efficiency: { type: 'numeric', min: 60, max: 95, text: '95 % (Filtration) / 60 % (Sedimentation im Bypassfall)' }
  },
  {
    id: 'flaechenversickerung_bbp',
    name: 'Flächenversickerung über belebte Bodenpassage',
    group: 'treatment',
    categories: ['I', 'II', 'III'],
    retention: true,
    efficiency: { type: 'numeric', min: 40, max: 80, byCategory: { I: 40, II: 70, III: 80 }, text: '40 % (Kat. I) / 70 % (Kat. II) / 80 % (Kat. III)' }
  },
  {
    id: 'substratfilter_viaplus',
    name: 'Dezentrale Substratfilter (ViaPlus)',
    group: 'treatment',
    categories: ['II', 'III'],
    retention: false,
    efficiency: { type: 'numeric', min: 80, max: 95, text: '80 % bis 95 %' }
  },
  {
    id: 'lamellenklaerer_ohne_dauerstau_viakan',
    name: 'Lamellenklärer ohne Dauerstau (ViaKan)',
    group: 'treatment',
    categories: ['II', 'III'],
    retention: false,
    efficiency: { type: 'numeric', min: 47, max: 89, text: '47 % bis 63 % (Durchlauf) / bis 89 % (mit Entleerung)' }
  },
  {
    id: 'lamellenklaerer_mit_dauerstau_viatub',
    name: 'Lamellenklärer mit Dauerstau (ViaTub)',
    group: 'treatment',
    categories: ['II', 'III'],
    retention: false,
    efficiency: { type: 'numeric', min: 0, max: 55, text: 'maximal 55 %' }
  },
  {
    id: 'sedimentationsanlagen_m153',
    name: 'Sedimentationsanlagen (DWA-M 153)',
    group: 'treatment',
    categories: ['I', 'II'],
    retention: false,
    efficiency: { type: 'numeric', min: 60, max: 70, text: '60 % bis 70 % (Durchgangswert D = 0,3 bis 0,4)' }
  },
  {
    id: 'sedipipe',
    name: 'Hydrodynamische Sedimentationsrohre (SediPipe)',
    group: 'treatment',
    categories: ['I', 'II'],
    retention: false,
    efficiency: { type: 'numeric', min: 34, max: 60, text: '34 % bis 60 %' }
  },
  {
    id: 'schmutzfangzellen_viacap',
    name: 'Schmutzfangzellen (ViaCap)',
    group: 'special',
    categories: ['B', 'S'],
    retention: true,
    efficiency: { type: 'qualitative', text: 'Auffangen und Ableitung der ersten Schmutzwelle zur Kläranlage' }
  },
  {
    id: 'biologische_kompaktanlagen_thermoclean',
    name: 'Biologische Kompaktanlagen (ThermoClean)',
    group: 'special',
    categories: ['S'],
    retention: true,
    efficiency: { type: 'numeric', min: 95, max: 100, text: 'nahezu 100 % (biologischer Abbau und Filtration)' }
  },
  {
    id: 'verregnungsanlagen_thermorain',
    name: 'Landwirtschaftliche Verregnungsanlagen (ThermoRain)',
    group: 'special',
    categories: ['LW'],
    retention: true,
    efficiency: { type: 'qualitative', text: 'hochgradige Filtration über die Grasnarbe' }
  },
  {
    id: 'koaleszenzabscheider_neutrapass',
    name: 'Koaleszenzabscheider (NeutraPass)',
    group: 'special',
    categories: ['B', 'S'],
    retention: false,
    efficiency: { type: 'qualitative', text: 'gering bezüglich AFS63 (Fokus auf Mineralölkohlenwasserstoffe)' }
  },
  {
    id: 'sickerpflaster_ohne_substrat',
    name: 'Infiltration / Sickerpflaster ohne Substrat',
    group: 'source',
    categories: ['I', 'II'],
    retention: true,
    efficiency: { type: 'qualitative', text: 'sehr gering bezüglich Feinstoffen und gelösten Metallen' }
  },
  {
    id: 'dachbegruenung_extensiv',
    name: 'Extensive Dachbegrünung',
    group: 'source',
    categories: ['I'],
    retention: true,
    efficiency: { type: 'qualitative', text: 'hochgradige Abflussreduktion durch Verdunstung und Speicherung' }
  },
  {
    id: 'dachbegruenung_intensiv',
    name: 'Intensive Dachbegrünung',
    group: 'source',
    categories: ['I'],
    retention: true,
    efficiency: { type: 'qualitative', text: 'maximale Abflussreduktion durch Verdunstung und Speicherung' }
  },
  {
    id: 'regenwassernutzung',
    name: 'Regenwassernutzungsanlagen',
    group: 'source',
    categories: ['I'],
    retention: true,
    efficiency: { type: 'qualitative', text: 'Reduktion des Direktabflusses durch gezielte Entnahme' }
  }
]

/**
 * Erreichbarer AFS63-Wirkungsgrad einer Anlage für eine Belastungskategorie.
 * Liefert den kategoriespezifischen Wert, sonst das obere Ende der Spanne.
 * @returns {number|null} Wirkungsgrad in % oder null bei qualitativer Wirkung
 */
export function getAchievableEfficiency(facility, category) {
  const e = facility.efficiency
  if (!e || e.type !== 'numeric') return null
  if (e.byCategory && e.byCategory[category] != null) return e.byCategory[category]
  return e.max
}

/**
 * Vorschlagsalgorithmus: empfiehlt Behandlungsanlagen für eine Belastungskategorie
 * und einen erforderlichen Wirkungsgrad ηerf.
 *
 * Bewertung je Anlage:
 *   'geeignet'     erreichbarer Wirkungsgrad ≥ ηerf
 *   'grenzwertig'  bis 5 %-Punkte unter ηerf
 *   'unzureichend' mehr als 5 %-Punkte unter ηerf
 *
 * Sortierung: geeignete zuerst (wirtschaftlichste, d. h. geringste Überdimensionierung),
 * danach grenzwertige, zuletzt unzureichende. Optional kann Rückhaltung gefordert werden.
 *
 * @param {string} category Belastungskategorie ('I'|'II'|'III')
 * @param {number} requiredEfficiency ηerf in %
 * @param {{ needRetention?: boolean }} [opts]
 * @returns {Array} bewertete, sortierte Anlagenliste
 */
export function suggestFacilities(category, requiredEfficiency, opts = {}) {
  const { needRetention = false } = opts
  const statusOrder = { geeignet: 0, grenzwertig: 1, unzureichend: 2 }

  const candidates = TREATMENT_FACILITIES
    .filter(f => f.efficiency.type === 'numeric' && f.categories.includes(category))
    .filter(f => !needRetention || f.retention)
    .map(f => {
      const achievable = getAchievableEfficiency(f, category)
      const margin = achievable - requiredEfficiency
      let status
      if (margin >= 0) status = 'geeignet'
      else if (margin >= -5) status = 'grenzwertig'
      else status = 'unzureichend'
      return {
        id: f.id,
        name: f.name,
        group: f.group,
        retention: f.retention,
        note: f.note || null,
        efficiencyText: f.efficiency.text,
        achievable,
        margin,
        status
      }
    })

  return candidates.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status]
    }
    // geeignete: geringste Überdimensionierung zuerst; sonst höchster Wirkungsgrad zuerst
    return a.status === 'geeignet' ? a.achievable - b.achievable : b.achievable - a.achievable
  })
}

/** Quellmaßnahmen (Abflussvermeidung) – informativ, v. a. für Kategorie I. */
export const SOURCE_MEASURES = TREATMENT_FACILITIES.filter(f => f.group === 'source')
