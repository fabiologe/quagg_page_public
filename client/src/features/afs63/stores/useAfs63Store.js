import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { area } from '@turf/area'
import {
  SURFACE_GROUP_OPTIONS,
  LOAD_CATEGORIES,
  ALLOWED_SPECIFIC_LOAD,
  getCategoryForGroup,
  classifyRuralRoad,
  RURAL_ROAD_SOURCE,
  RURAL_ROAD_FOOTNOTES
} from '../data/dwaA102Categories'
import { suggestFacilities } from '../data/treatmentFacilities'
import { designRetentionBasin, designLamellaClarifier, RKB_DEFAULTS } from '../data/facilityDimensioning'

// Berechnungskern für den AFS63-Behandlungsbedarf nach DWA-A 102-2:2020 (Abschnitt 5.2.3).
// Spiegelt strukturell useFloodCheckStore, ersetzt aber den hydraulischen Kern durch die
// emissionsbezogene Stoffbilanzierung (Gl. 3–8).
export const useAfs63Store = defineStore('afs63', () => {
  const surfaces = ref([])

  // Auswahlliste der Flächengruppen (Tabelle A.1) für den Selector.
  const surfaceGroups = SURFACE_GROUP_OPTIONS
  const allowedSpecificLoad = ALLOWED_SPECIFIC_LOAD

  // Behandlungsszenario: 'none' (nur Bestandsbilanz), 'decentral' (Wirkungsgrad je Fläche),
  // 'central' (ein Gesamtwirkungsgrad für das ganze Gebiet).
  const treatmentMode = ref('none')
  const centralEfficiency = ref(0) // ηges in % (0–100)

  // Stufe 2: Anlagenbemessung (Regenklärbecken nach DWA-A 102-2, Abschnitt 6.2)
  const dimensioning = ref({
    enabled: false,
    facility: 'rkb', // 'rkb' | 'schraegklaerer'
    overflowFraction: RKB_DEFAULTS.overflowFraction,
    rkrit: RKB_DEFAULTS.rkrit,
    foreignWater: RKB_DEFAULTS.foreignWater,
    fD: RKB_DEFAULTS.fD,
    basinDepth: RKB_DEFAULTS.basinDepth,
    qAmax: RKB_DEFAULTS.qAmax
  })

  // --- Flächenverwaltung (Logik aus useFloodCheckStore, Felder angepasst) ---

  function addOrUpdateSurface(feature) {
    if (!feature) return
    const areaVal = Math.round(area(feature) * 100) / 100

    const index = surfaces.value.findIndex(s => s.id === feature.id)
    const defaultGroup = surfaceGroups[0]

    const importedName = feature.properties?.name
    const importedGroup = feature.properties?.groupId || feature.properties?.type
    const isValidGroup = importedGroup && surfaceGroups.some(g => g.id === importedGroup)

    const newSurface = {
      id: feature.id,
      area: areaVal,
      groupId: index > -1 ? surfaces.value[index].groupId : (isValidGroup ? importedGroup : defaultGroup.id),
      name: index > -1 ? surfaces.value[index].name : (importedName || `Fläche ${surfaces.value.length + 1}`),
      // Wirkungsgrad ηi in % bei dezentraler Behandlung
      treatmentEfficiency: index > -1 ? surfaces.value[index].treatmentEfficiency : 0,
      // Sonderfall Außerortsstraße (REwS, Tabelle 7): Fracht DTV-abhängig statt Tabelle 4
      isRuralRoad: index > -1 ? surfaces.value[index].isRuralRoad : (feature.properties?.isRuralRoad || false),
      dtv: index > -1 ? surfaces.value[index].dtv : (feature.properties?.dtv || 0)
    }

    if (index > -1) {
      surfaces.value[index] = newSurface
    } else {
      surfaces.value.push(newSurface)
    }
  }

  function removeSurface(id) {
    surfaces.value = surfaces.value.filter(s => s.id !== id)
  }

  // --- BERECHNUNGEN (DWA-A 102-2, Abschnitt 5.2.3) ---

  // Gesamtfläche (angeschlossene befestigte Fläche Ab,a) in m² bzw. ha.
  const totalArea = computed(() => surfaces.value.reduce((sum, s) => sum + s.area, 0))
  const totalAreaHa = computed(() => totalArea.value / 10000)

  // Je Fläche: Kategorie, spez. Abtrag bR,a,i, Stoffabtrag BR,a,i (Gl. 3) und
  // – bei dezentraler Behandlung – Reststofffracht BR,e,i (Gl. 7).
  const surfaceLoads = computed(() => {
    return surfaces.value.map(s => {
      // Sonderfall Außerortsstraße: Kategorie + Fracht aus DTV (REwS, Tabelle 7),
      // ansonsten innerörtliche Flächengruppe (Tabelle A.1 / Tabelle 4).
      let categoryId, specificLoad, groupName, source, footnote
      if (s.isRuralRoad) {
        const r = classifyRuralRoad(s.dtv)
        categoryId = r.category
        specificLoad = r.specificLoad // kg/(ha·a)
        footnote = r.footnote
        source = RURAL_ROAD_SOURCE
        groupName = `Außerortsstraße (DTV ${Number(s.dtv) || 0} Kfz/24 h)`
      } else {
        const group = surfaceGroups.find(g => g.id === s.groupId)
        const cat = getCategoryForGroup(s.groupId)
        categoryId = cat ? cat.id : null
        specificLoad = cat ? cat.specificLoad : 0
        groupName = group ? group.name : 'Unbekannt'
        source = 'DWA-A 102-2, Tabelle 4'
        footnote = null
      }
      const cat = categoryId ? LOAD_CATEGORIES[categoryId] : null
      const areaHa = s.area / 10000
      const load = areaHa * specificLoad // BR,a,i (Gl. 3) in kg/a

      // Dezentraler Wirkungsgrad nur im Modus 'decentral' wirksam.
      const efficiency = treatmentMode.value === 'decentral'
        ? Math.min(Math.max(s.treatmentEfficiency || 0, 0), 100) / 100
        : 0
      const residualLoad = load * (1 - efficiency) // BR,e,i (Gl. 7) in kg/a
      const residualSpecific = areaHa > 0 ? residualLoad / areaHa : 0

      return {
        id: s.id,
        name: s.name,
        area: s.area,
        areaHa,
        groupId: s.groupId,
        groupName,
        isRuralRoad: !!s.isRuralRoad,
        dtv: Number(s.dtv) || 0,
        source,
        footnote, // '*' | '**' | null (nur Außerortsstraßen)
        footnoteText: footnote ? RURAL_ROAD_FOOTNOTES[footnote] : null,
        category: categoryId || '–',
        categoryLabel: cat ? cat.label : '',
        color: cat ? cat.color : '#95a5a6',
        specificLoad,
        load,
        efficiency,
        residualLoad,
        residualSpecific
      }
    })
  })

  // Gesamter Stoffabtrag BR,a,AFS63 (Gl. 4) in kg/a.
  const totalLoad = computed(() => surfaceLoads.value.reduce((sum, s) => sum + s.load, 0))

  // Flächenspezifischer Stoffabtrag des Gebiets bR,a,AFS63 (Gl. 5) in kg/(ha·a).
  const specificLoad = computed(() => totalAreaHa.value > 0 ? totalLoad.value / totalAreaHa.value : 0)

  // Behandlungserfordernis: spez. Abtrag > zulässiger Stoffaustrag (280 kg/(ha·a)).
  const treatmentRequired = computed(() => specificLoad.value > ALLOWED_SPECIFIC_LOAD)

  // Gebietsbezogener erforderlicher Wirkungsgrad ηerf (Gl. 6) in %.
  const requiredEfficiency = computed(() => {
    if (specificLoad.value <= 0) return 0
    return Math.max(0, 1 - ALLOWED_SPECIFIC_LOAD / specificLoad.value) * 100
  })

  // Erforderlicher Wirkungsgrad je vorkommender Fracht-/Kategorie-Kombination (Gl. 6).
  // Aus den tatsächlich erfassten Flächen abgeleitet, damit Außerortsstraßen (REwS)
  // mit ihrer abweichenden Fracht eine eigene Zeile erhalten.
  const requiredEfficiencyByCategory = computed(() => {
    const combos = new Map()
    surfaceLoads.value.forEach(s => {
      if (!s.category || s.specificLoad <= 0) return
      const key = `${s.category}|${s.specificLoad}`
      if (!combos.has(key)) {
        combos.set(key, {
          id: s.category,
          label: s.categoryLabel,
          specificLoad: s.specificLoad,
          isRuralRoad: s.isRuralRoad,
          source: s.source,
          requiredEfficiency: Math.max(0, 1 - ALLOWED_SPECIFIC_LOAD / s.specificLoad) * 100
        })
      }
    })
    return Array.from(combos.values()).sort((a, b) => a.specificLoad - b.specificLoad)
  })

  // Aufteilung nach Belastungskategorie I/II/III (Fläche, Anteil, Stoffabtrag).
  const categoryBreakdown = computed(() => {
    return Object.values(LOAD_CATEGORIES).map(cat => {
      const items = surfaceLoads.value.filter(s => s.category === cat.id)
      const areaHa = items.reduce((sum, s) => sum + s.areaHa, 0)
      const load = items.reduce((sum, s) => sum + s.load, 0)
      return {
        id: cat.id,
        label: cat.label,
        color: cat.color,
        specificLoad: cat.specificLoad,
        areaHa,
        areaPct: totalAreaHa.value > 0 ? (areaHa / totalAreaHa.value) * 100 : 0,
        load
      }
    })
  })

  // Resultierende Reststofffracht nach Behandlung BR,e,AFS63 (Gl. 7 dezentral / Gl. 8 zentral) in kg/a.
  const residualLoad = computed(() => {
    if (treatmentMode.value === 'central') {
      const eff = Math.min(Math.max(centralEfficiency.value || 0, 0), 100) / 100
      return totalLoad.value * (1 - eff)
    }
    if (treatmentMode.value === 'decentral') {
      return surfaceLoads.value.reduce((sum, s) => sum + s.residualLoad, 0)
    }
    return totalLoad.value
  })

  // Resultierender flächenspezifischer Stoffaustrag nach Behandlung in kg/(ha·a).
  const residualSpecificLoad = computed(() => totalAreaHa.value > 0 ? residualLoad.value / totalAreaHa.value : 0)

  // Zielerreichung: liegt der Reststoffaustrag im zulässigen Bereich?
  const residualWithinLimit = computed(() => residualSpecificLoad.value <= ALLOWED_SPECIFIC_LOAD)

  // Anlagenvorschläge je behandlungsbedürftiger Kategorie (Vorschlagsalgorithmus).
  // Bei zentraler Behandlung wird zusätzlich auf den gebietsbezogenen ηerf gefiltert
  // (Rückhaltung gefordert, da ein zentrales Becken Speicher-/Drosselwirkung benötigt).
  const treatmentSuggestions = computed(() => {
    if (!treatmentRequired.value) return []
    const needRetention = treatmentMode.value === 'central'
    return requiredEfficiencyByCategory.value
      .filter(c => c.requiredEfficiency > 0)
      .map(c => ({
        category: c.id,
        categoryLabel: c.label,
        specificLoad: c.specificLoad,
        isRuralRoad: c.isRuralRoad,
        requiredEfficiency: c.requiredEfficiency,
        facilities: suggestFacilities(c.id, c.requiredEfficiency, { needRetention }).slice(0, 4)
      }))
  })

  // Bemessungsergebnis (Regenklärbecken; optional Schrägklärer). null, wenn keine
  // Behandlung erforderlich ist. Reaktiv auf b_a, A_b,a und die Bemessungseingaben.
  const dimensioningResult = computed(() => {
    if (!treatmentRequired.value) return null
    const d = dimensioning.value
    const rkb = designRetentionBasin({
      specificLoad: specificLoad.value,
      totalAreaHa: totalAreaHa.value,
      overflowFraction: d.overflowFraction,
      rkrit: d.rkrit,
      foreignWater: d.foreignWater,
      fD: d.fD,
      basinDepth: d.basinDepth,
      allowed: ALLOWED_SPECIFIC_LOAD
    })
    const lamella = d.facility === 'schraegklaerer'
      ? designLamellaClarifier({ qBemTr: rkb.qBemTr, qAmax: d.qAmax })
      : null
    return { ...rkb, lamella }
  })

  return {
    // State
    surfaces,
    surfaceGroups,
    allowedSpecificLoad,
    treatmentMode,
    centralEfficiency,
    dimensioning,
    // Aktionen
    addOrUpdateSurface,
    removeSurface,
    // Ergebnisse
    totalArea,
    totalAreaHa,
    surfaceLoads,
    totalLoad,
    specificLoad,
    treatmentRequired,
    requiredEfficiency,
    requiredEfficiencyByCategory,
    categoryBreakdown,
    residualLoad,
    residualSpecificLoad,
    residualWithinLimit,
    treatmentSuggestions,
    dimensioningResult
  }
})
