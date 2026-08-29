/**
 * Ausgabe des Plans — PDF, DXF, Längsschnitt, Querprofile (Sprint I, AP-9).
 *
 * Diese vier Wege lagen im PDF-Export-Modal, jeder mit seiner eigenen Kopie
 * derselben zwölf Beschaffungszeilen (`api.getScene()`, `getCategoryGroups()`,
 * `getFragmentsList()` …). Hier stehen sie einmal.
 *
 * Der entscheidende Unterschied zum Modal: das Plot-Frustum kommt aus
 * `useAnsicht.frustum` statt aus der 3D-Kamera. Damit exportiert der Knopf
 * genau das Blatt, das auf dem Bildschirm liegt — vorher waren das zwei
 * getrennte Rechenwege, die auseinanderlaufen konnten.
 */
import { ref } from 'vue';
import { useViewerApi } from './viewerApi.js';
import { usePlan } from '../stores/usePlan.js';
import { usePlanInhalt } from '../stores/usePlanInhalt.js';
import { useRotstift } from '../stores/useRotstift.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useCdeStore, resolveWatermarkText } from '../stores/useCdeStore.js';
import { exportVectorPlanPDF, exportVectorPlanDXF } from '../services/IfcPdfExporter.js';
import { buildLaengsschnittFromModel } from '../services/LaengsschnittBuilder.js';
import { exportLaengsschnittPDF, exportQuerprofilePDF } from '../services/LaengsschnittPdf.js';

export function usePlanExport() {
    const api = useViewerApi();
    const plan = usePlan();
    const planInhalt = usePlanInhalt();
    const rotstiftStore = useRotstift();
    const ansicht = useAnsicht();
    const ifc = useIfcStore();
    const cde = useCdeStore();

    /** null | 'pdf' | 'dxf' | 'ls' | 'qp' — sperrt zugleich die Knöpfe. */
    const busy = ref(null);
    const fehler = ref('');

    /** Erster Koordinaten-Versatz — die UTM-Kreuze rechnen darauf. */
    function _ersterVersatz() {
        const alle = api.getAllCoordOffsets?.() ?? {};
        return Object.values(alle)[0] ?? { x: 0, y: 0, z: 0 };
    }

    /** Was aus der Engine kommt und in jeden Aufruf gehört. */
    function _modell() {
        return {
            scene:            api.getScene?.() ?? null,
            cutPlane:         api.getSectionCutPlane?.() ?? null,
            ifcData:          api.getWebIfcAPI?.() ?? null,
            categoryGroups:   api.getCategoryGroups?.() ?? null,
            fragmentsList:    api.getFragmentsList?.() ?? null,
            fragmentsManager: api.getFragmentsManager?.() ?? null,
        };
    }

    /** Stile und Beschriftungsvorlagen des Nutzers. */
    function _stile() {
        return {
            styleMap:         ifc.resolvedVectorStyleMap,
            styleMapPerModel: ifc.vectorStylesByModel ?? null,
            rules:            ifc.vectorRules ?? [],
            labelTemplateFor: (cat) => ifc.vectorStyles?.[cat]?.labelTemplate ?? '',
        };
    }

    /**
     * Die Tiefbau-Blöcke aus dem Store, ergänzt um das, was nur die Engine
     * weiß: die web-ifc-Instanzen für die Haltungsbeschriftung und den
     * Koordinaten-Versatz für die UTM-Kreuze.
     */
    function tiefbauOptionen() {
        const z = plan.zeichenOptionen;
        return {
            slopeHatch: z.slopeHatch,
            contours:   z.contours,
            axisLabels: z.axisLabels && {
                ...z.axisLabels,
                apis:         api.getWebIfcAPIs?.() ?? null,
                coordOffsets: api.getAllCoordOffsets?.() ?? null,
            },
            utmGrid: z.utmGrid && { ...z.utmGrid, offset: _ersterVersatz() },
        };
    }

    /** Wasserzeichen: Handeintrag schlägt Dokumentstatus. */
    function _wasserzeichen() {
        const eigen = (plan.optionen.watermarkText ?? '').trim();
        if (eigen) return eigen;
        const sha = api.getLoadedModelSha?.();
        return (sha ? resolveWatermarkText(cde.dokumente, sha) : null) || null;
    }

    async function _pdf() {
        const o = plan.optionen;
        const z = plan.zeichenOptionen;
        await exportVectorPlanPDF({
            format:      ansicht.format,
            orientation: ansicht.ausrichtung,
            titleBlock:  { ...plan.schriftfeld, massstab: `1:${ansicht.massstab}` },
            logo:        plan.logo,
            // Das Blatt vom Bildschirm, nicht die 3D-Kamera.
            plotFrustum: ansicht.frustum,
            scaleRatio:  ansicht.massstab,
            ..._modell(),
            ..._stile(),
            ...tiefbauOptionen(),
            hatch:        z.hatch,
            scaleBar:     z.scaleBar,
            showLabels:   z.showLabels,
            northAngle:   z.northAngle,
            annotations:  o.annotations ? (ifc.annotations ?? []) : [],
            measurements: o.measurements ? (api.getMeasurements?.() ?? []) : [],
            dimensions:   o.dimensions ? (ifc.planDimensions ?? []) : [],
            // Gesetzte Beschriftung und Symbole gehören immer aufs Blatt —
            // sie sind kein abgeleiteter Inhalt, den man abschalten würde.
            planInhalte:  planInhalt.inhalte,
            rotstift:     rotstiftStore.striche,
            ifcGridAxes:  o.ifcGrids ? (api.getIfcGridAxes?.() ?? null) : null,
            watermark:    _wasserzeichen(),
        });
    }

    async function _dxf() {
        await exportVectorPlanDXF({
            titleBlock:  { ...plan.schriftfeld },
            scaleRatio:  ansicht.massstab,
            coordOffset: _ersterVersatz(),
            ..._modell(),
            ..._stile(),
            ...tiefbauOptionen(),
        });
    }

    /** Achsen, Schächte und Geländeprofil des Haltungsstrangs. */
    async function _laengsschnittDaten() {
        return buildLaengsschnittFromModel({
            apis:         api.getWebIfcAPIs?.() ?? [],
            coordOffsets: api.getAllCoordOffsets?.() ?? {},
            ..._modell(),
        });
    }

    async function _laengsschnitt({ scaleV }) {
        const daten = await _laengsschnittDaten();
        if (!daten?.strang?.length) throw new Error('Keine Haltungsachsen im Modell gefunden.');
        await exportLaengsschnittPDF({
            data: daten,
            titleBlock: { ...plan.schriftfeld },
            logo: plan.logo,
            format: ansicht.format,
            scaleV,
            heightOffsetY: _ersterVersatz().y ?? 0,
        });
    }

    async function _querprofile({ scaleV, interval }) {
        const daten = await _laengsschnittDaten();
        if (!daten?.strang?.length) throw new Error('Keine Haltungsachsen im Modell gefunden.');
        await exportQuerprofilePDF({
            data: daten,
            sampler: daten.sampler ?? null,
            titleBlock: { ...plan.schriftfeld },
            logo: plan.logo,
            format: ansicht.format,
            interval,
            scale: scaleV,
            heightOffsetY: _ersterVersatz().y ?? 0,
        });
    }

    /**
     * @param {'pdf'|'dxf'|'ls'|'qp'} art
     * @param {{scaleV?: number, interval?: number}} einstellungen
     */
    async function ausfuehren(art, { scaleV = 100, interval = 25 } = {}) {
        if (busy.value) return false;
        busy.value = art;
        fehler.value = '';
        try {
            if (art === 'pdf') await _pdf();
            else if (art === 'dxf') await _dxf();
            else if (art === 'ls') await _laengsschnitt({ scaleV });
            else if (art === 'qp') await _querprofile({ scaleV, interval });
            return true;
        } catch (e) {
            // Sichtbar machen statt alert(): das Panel hat eine Fehlerzeile,
            // und ein alert reisst den Nutzer aus dem Plan.
            fehler.value = e?.message || 'Ausgabe fehlgeschlagen.';
            console.error('[CDE] Planausgabe', art, e);
            return false;
        } finally {
            busy.value = null;
        }
    }

    return { ausfuehren, busy, fehler, tiefbauOptionen };
}
