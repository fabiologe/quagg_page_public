/**
 * Zwischenspeicher für die Plan-Inhalte (Sprint P, AP-6).
 *
 * DAS IST KEINE OPTIMIERUNG, SONDERN DIE VORAUSSETZUNG.
 * Der Bildschirmplan zeichnet bei jedem Schwenk neu. Die Sammlung dahinter
 * durchläuft je Bauteil einen Geometrie-Abruf und eine Polygon-Vereinigung —
 * bei einem mittleren Modell Sekunden, synchron auf dem Hauptthread. Ohne
 * Zwischenspeicher wäre die Ansicht schlicht nicht bedienbar.
 *
 * FÜNF TEILE, FÜNF SCHLÜSSEL. Ein gemeinsamer Schlüssel für alles wäre
 * einfacher zu schreiben und in der Praxis nutzlos: Jeder Maßstabswechsel
 * würde die teuersten Posten mitreißen, obwohl sie vom Maßstab gar nicht
 * abhängen. Der Zuschnitt folgt deshalb der Frage „was macht DIESES Ergebnis
 * ungültig?":
 *
 *   umrisse   — Modelle, Blickrichtung, Schnittebene, Stilregeln, Label-Vorlage
 *   flaeche   — Modelle, Gelände-Kategorien, Rasterweite (nur DIE hängt am Maßstab)
 *   achsen    — Modelle, Achs-Kategorien, Label-Vorlage
 *   schnitt   — Modelle, Schnittebene
 *   footprint — Modelle
 *
 * Was hier bewusst NICHT auftaucht: Papierformat, Ausrichtung, Blattmitte,
 * Bildschirmzoom, Nordwinkel, Wasserzeichen, Maßstabsleiste, Sichtbarkeits-
 * schalter. Die wirken erst im Zeichnen. Schwenken, Zoomen und Blattwechsel
 * kosten damit keine einzige Neurechnung.
 *
 * Der Maßstab bleibt aus `umrisse` heraus, weil die maßstabsabhängige
 * RDP-Vereinfachung ein billiger Nachschritt auf dem teuren Rohergebnis ist.
 */

import {
    sammleUmrisseRoh, vereinfacheUmrisse, sammleGelaendeflaeche, gelaendeZellweite,
    werteGelaendeAus, sammleAchsen, sammleSchnitt, sammleFootprints,
} from './IfcPdfExporter.js';
import { basisModelId } from './DeltaBoxen.js';

/** Stabiler Schlüssel aus beliebigen Werten (Funktionen zählen als vorhanden). */
function schluessel(...teile) {
    return JSON.stringify(teile, (_k, v) => {
        if (typeof v === 'function') return '#fn';
        if (v instanceof Float64Array || v instanceof Float32Array) return `#arr${v.length}`;
        return v;
    });
}

/** Schnittebene auf 1 mm / 1e-4 gerundet — Zittern soll nichts entwerten. */
function ebeneSchluessel(cutPlane) {
    if (!cutPlane) return null;
    const n = cutPlane.normal ?? {};
    const r = (v) => Math.round((v ?? 0) * 1e4) / 1e4;
    return [r(n.x), r(n.y), r(n.z), Math.round((cutPlane.constant ?? 0) * 1000) / 1000];
}

/**
 * @param {object} api  viewerApi (IfcViewer.vue) — liefert Modelle, Szene, Schnitt
 * @returns {{hole: Function, entwerte: Function, stand: Function, rechnetGerade: Function}}
 */
export function erstellePlanInhalt(api) {
    const speicher = new Map();       // teilName → { key, wert }
    let stand = 0;                    // zählt hoch, wenn sich Inhalte geändert haben
    let laufend = 0;
    let letztesErgebnis = null;

    /** Ein Teil: bei gleichem Schlüssel den alten Wert, sonst neu rechnen. */
    async function teil(name, key, rechne) {
        const alt = speicher.get(name);
        if (alt && alt.key === key) return alt.wert;
        const wert = await rechne();
        speicher.set(name, { key, wert });
        return wert;
    }

    /**
     * Bestimmte Teile verwerfen.
     * @param {'modell'|'schnitt'|'regeln'|'labels'|'gelaende'|'alles'} grund
     */
    function entwerte(grund = 'alles') {
        const raus = {
            modell:   ['umrisse', 'flaeche', 'achsen', 'schnitt', 'footprint'],
            schnitt:  ['umrisse', 'schnitt'],   // die Schnittebene bestimmt auch, was „über dem Schnitt" liegt
            regeln:   ['umrisse'],
            labels:   ['umrisse', 'achsen'],
            gelaende: ['flaeche'],
            alles:    ['umrisse', 'flaeche', 'achsen', 'schnitt', 'footprint'],
        }[grund] ?? [];
        for (const n of raus) speicher.delete(n);
        stand++;
    }

    /**
     * Inhalte für die aktuelle Einstellung holen.
     * Läuft bereits eine Rechnung, kommt das VORIGE Ergebnis zurück — der Plan
     * bleibt stehen, statt für die Dauer der Sammlung weiß zu blinken.
     */
    async function hole(optionen = {}) {
        const {
            scaleRatio = 100, slopeHatch = null, contours = null, axisLabels = null,
            hatch = false, footprints = true, rules = [], labelTemplateFor = null,
            styleMap = null, viewDir = 'top', modelleAus = [],
        } = optionen;

        // T3 (Abnahme 2026-09-12): abgewählte Modelle kommen nicht aufs Blatt.
        // Gefiltert wird die LISTE — alle Sammler gehen über sie, und der
        // Schlüssel (modellIds) wechselt mit; Deltas zählen zu ihrer Basis.
        const aus = new Set(modelleAus ?? []);
        const alle = api?.getFragmentsList?.() ?? null;
        const modelle = alle && aus.size ? new Map([...alle].filter(([id]) => !aus.has(basisModelId(id)))) : alle;
        // Grundriss-Kurven und Haltungstexte liest web-ifc aus dem ERSTEN Modell —
        // ist es abgewählt, fallen sie mit.
        const erstesIfc = api?.getWebIfcAPI?.() ?? null;
        const ifcDaten = erstesIfc && !aus.has(basisModelId(erstesIfc.fragmentModelId ?? '')) ? erstesIfc : null;
        const modellIds = modelle ? [...modelle.keys()].sort() : [];
        const cutPlane = api?.getSectionCutPlane?.() ?? null;
        const ebene = ebeneSchluessel(cutPlane);

        // Der Schlüssel wird aus DENSELBEN Werten gebaut, die auch in die
        // Sammlung gehen — ein Eingang, zwei Verwendungen. Ein vergessener
        // Eingang produziert sonst veraltete Pläne, und das fällt erheblich
        // später auf als Langsamkeit.
        const gemeinsam = { modellIds, viewDir, ebene };

        laufend++;
        try {
            const basis = {
                viewDir, rules, labelTemplateFor, styleMap, cutPlane,
                categoryGroups:   api?.getCategoryGroups?.() ?? null,
                fragmentsList:    modelle,
                fragmentsManager: api?.getFragmentsManager?.() ?? null,
            };

            const roh = await teil('umrisse',
                schluessel(gemeinsam, rules, labelTemplateFor),
                () => sammleUmrisseRoh(basis));

            const cell = gelaendeZellweite(slopeHatch, scaleRatio);
            const flaeche = (slopeHatch?.enabled || contours?.enabled)
                ? await teil('flaeche',
                    schluessel(modellIds, slopeHatch?.categories ?? null, cell),
                    () => sammleGelaendeflaeche({ ...basis, slopeHatch, cell }))
                : null;

            const achsen = axisLabels?.enabled
                ? await teil('achsen',
                    schluessel(modellIds, axisLabels.categories ?? null, labelTemplateFor),
                    () => sammleAchsen({ ...basis, axisLabels, ifcData: ifcDaten }))
                : null;

            const schnitt = await teil('schnitt',
                schluessel(gemeinsam, hatch),
                () => sammleSchnitt(api?.getScene?.() ?? null, cutPlane, hatch));

            const fuesse = (footprints && ifcDaten?.webIfc != null)
                ? await teil('footprint', schluessel(modellIds), () => sammleFootprints(ifcDaten))
                : null;

            // Billige Nachschritte — laufen bei jedem Maßstabswechsel neu,
            // kosten aber nur Millisekunden.
            const { slopeSegments, contourLevels } =
                werteGelaendeAus(flaeche, { slopeHatch, contours, scaleRatio });

            letztesErgebnis = {
                outlines: vereinfacheUmrisse(roh, scaleRatio),
                slopeSegments,
                contourLevels,
                axisItems: achsen,
                sectionSegments: schnitt?.sectionSegments ?? null,
                hatchPolygons: schnitt?.hatchPolygons ?? null,
                footprintProducts: fuesse,
            };
            return letztesErgebnis;
        } finally {
            laufend--;
        }
    }

    return {
        hole,
        entwerte,
        stand: () => stand,
        rechnetGerade: () => laufend > 0,
        letztes: () => letztesErgebnis,
        /** Nur für Tests/Diagnose: welche Teile liegen gerade im Speicher? */
        _teile: () => [...speicher.keys()].sort(),
    };
}
