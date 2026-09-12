/**
 * Zeichenoptionen und Schriftfeld des Plans (Sprint I, AP-9).
 *
 * Bis hierher lagen sie als achtzehn Refs im PDF-Export-Modal und wurden über
 * `localStorage` gesichert — der letzte Direktzugriff darauf im ganzen Feature.
 * Das hatte zwei Folgen: die Optionen galten nur im Modal (der Bildschirmplan
 * bekam in `CdeView` eine feste Standardausstattung und zeichnete Böschungen,
 * Höhenlinien und UTM-Kreuze deshalb nie), und sie hingen am Browser statt am
 * Projekt.
 *
 * Muster und Persistenzweg wie `stores/useAnsicht.js`: reiner Zustand, keine
 * Engine, kein Canvas, Sicherung über die RepoFacade — mit Server-Backend
 * landen sie damit im Projektordner und gelten für jeden, der das Projekt
 * öffnet.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';

const REPO_OPTIONEN = 'plan-optionen';
const REPO_SCHRIFTFELD = 'plan-schriftfeld';
const REPO_LOGO = 'plan-logo';

/** Vorgaben. Wer eine Option ergänzt, ergänzt sie hier — sonst nirgends. */
export const PLAN_VORGABEN = Object.freeze({
    // Was gezeichnet wird
    hatch:          true,    // Schnittflächen schraffieren
    scaleBar:       true,    // Maßstabsleiste + Nordpfeil
    showLabels:     true,    // Bauteilbeschriftung nach Kategorie-Vorlage
    footprints:     true,    // Grundriss-Kurven
    annotations:    true,    // Issue-Pins
    measurements:   true,    // Messstrecken
    dimensions:     true,    // Bemaßung (AP-10)
    ifcGrids:       false,   // IFC-Achsenraster
    // Was aufs Blatt kommt (Abnahme 2026-09-12, T3): die AUSGELASSENEN Modelle —
    // ein neu geladenes ist so von selbst drauf — und der Eigenbau.
    modelleAus:     Object.freeze([]),
    eigenbau:       true,

    // Tiefbau (Sprint T1)
    slopeHatch:     false,   // Böschungsschraffur aus Gelände-Kategorien
    slopeMinAngle:  20,      // ab dieser Neigung (°) gilt eine Fläche als Böschung
    slopeTickMm:    3,       // Strichabstand auf dem Papier
    contours:       false,   // Höhenlinien
    contourInterval: 0.5,    // Höhenstufen-Abstand in m
    utmGrid:        false,   // UTM-Gitterkreuze (nur georeferenziert sinnvoll)
    axisLabels:     true,    // Haltungsbeschriftung entlang der Achse
    northAngle:     0,       // Nordpfeil-Verdrehung in Grad

    // Wasserzeichen: '' = automatisch aus dem ISO-19650-Status des Dokuments
    watermarkText:  '',
});

export const SCHRIFTFELD_VORGABEN = Object.freeze({
    projekt: '', auftraggeber: '', bearbeiter: '', firma: '',
    nummer: '', datum: '', index: 'A',
});

export const usePlan = defineStore('cde-plan', () => {
    const optionen = ref({ ...PLAN_VORGABEN });
    const schriftfeld = ref({ ...SCHRIFTFELD_VORGABEN });
    /** Firmenlogo als PNG-Data-URL (siehe setzeLogo) oder null. */
    const logo = ref(null);

    /**
     * Die Optionen in der Form, die `drawVectorPlan` erwartet.
     *
     * Der Plotter kennt teils andere Namen und erwartet für die Tiefbau-Pakete
     * ein Objekt statt eines Schalters — `null` heißt „nicht zeichnen". Diese
     * Übersetzung steht hier einmal, damit Bildschirm und PDF sie teilen.
     */
    const zeichenOptionen = computed(() => {
        const o = optionen.value;
        return {
            hatch:        o.hatch,
            scaleBar:     o.scaleBar,
            showLabels:   o.showLabels,
            footprints:   o.footprints,
            modelleAus:   o.modelleAus ?? [],
            eigenbau:     o.eigenbau !== false,
            northAngle:   Number(o.northAngle) || 0,
            // Feldnamen wie in IfcPdfExporter (`minSlopeDeg`, `tickSpacingMm`,
            // `interval`). Ein falscher Name zeichnet still gar nichts —
            // deshalb steht die Übersetzung hier einmal und nicht je Aufrufer.
            slopeHatch:   o.slopeHatch
                ? { enabled: true, minSlopeDeg: Number(o.slopeMinAngle) || 20,
                    tickSpacingMm: Number(o.slopeTickMm) || 3 }
                : null,
            contours:     o.contours ? { enabled: true, interval: Number(o.contourInterval) || 0.5 } : null,
            // `apis` und `coordOffsets` kann der Store nicht liefern — sie
            // kommen aus der Engine. Der Aufrufer ergänzt sie (siehe
            // usePlanExport.tiefbauOptionen).
            axisLabels:   o.axisLabels ? { enabled: true } : null,
            utmGrid:      o.utmGrid ? { flipNorth: false } : null,
        };
    });

    function setzeOption(schluessel, wert) {
        if (!(schluessel in PLAN_VORGABEN)) return false;
        optionen.value = { ...optionen.value, [schluessel]: wert };
        sichern();
        return true;
    }

    function setzeSchriftfeld(patch) {
        schriftfeld.value = { ...schriftfeld.value, ...patch };
        sichern();
    }

    /** Alles auf die Vorgaben — für „von vorn anfangen". */
    function zuruecksetzen() {
        optionen.value = { ...PLAN_VORGABEN };
        sichern();
    }

    /**
     * Logo setzen — IMMER als PNG.
     *
     * Die Dateiauswahl lässt auch SVG und WebP zu. Der Canvas des
     * Bildschirmplans zeichnet die problemlos, jsPDF kann SVG aber nicht.
     * Statt an zwei Stellen Sonderfälle zu führen, wird beim Einlesen einmal
     * nach PNG gewandelt: danach zeigt der Bildschirm garantiert dasselbe wie
     * das Blatt.
     *
     * @param {string} datenUrl beliebiges Bildformat als Data-URL
     * @returns {Promise<boolean>} false, wenn das Bild nicht lesbar war
     */
    async function setzeLogo(datenUrl) {
        if (!datenUrl) { logo.value = null; await sichern(); return true; }
        try {
            const png = await _alsPng(datenUrl);
            logo.value = png;
            await sichern();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Den aktuellen Stand als Bürovorgabe hinterlegen.
     *
     * Bewusst ein eigener Schritt und kein Nebeneffekt des Speicherns: was
     * fürs ganze Büro gilt, soll man ausdrücklich sagen. Sonst überschriebe
     * die Blattlage eines einzelnen Plans die Gewohnheit aller.
     *
     * @returns {Promise<boolean>} false, wenn keine Büroablage erreichbar ist
     */
    async function alsBuerovorgabe() {
        if (!repo.buero) return false;
        await Promise.all([
            repo.buero.set(REPO_OPTIONEN, { ...optionen.value }),
            repo.buero.set(REPO_SCHRIFTFELD, { ...schriftfeld.value }),
            repo.buero.set(REPO_LOGO, logo.value),
        ]);
        return true;
    }

    /**
     * Projekteigene Werte verwerfen — ab dann gilt wieder die Bürovorgabe.
     *
     * Der Gegenzug zur Vorrangregel: solange ein Projektwert steht, ist die
     * Bürovorgabe unsichtbar. Ohne diesen Weg käme man nie zu ihr zurück.
     */
    async function zurueckAufBuero() {
        await Promise.all([
            repo.delete(REPO_OPTIONEN),
            repo.delete(REPO_SCHRIFTFELD),
            repo.delete(REPO_LOGO),
        ]);
        await laden();
    }

    async function sichern() {
        try {
            await Promise.all([
                repo.set(REPO_OPTIONEN, { ...optionen.value }),
                repo.set(REPO_SCHRIFTFELD, { ...schriftfeld.value }),
                repo.set(REPO_LOGO, logo.value),
            ]);
        } catch { /* Zeichenoptionen sind kein Grund für einen Fehler */ }
    }

    /**
     * Laden mit Vorrang: **Projekt schlägt Büro schlägt Vorgabe.**
     *
     * Das Firmenlogo und die Blattgewohnheiten gehören dem Büro, nicht dem
     * Projekt — sie einmal zu pflegen und in jedem Projekt zu haben ist der
     * ganze Zweck der Büro-Ebene. Wer sie in EINEM Projekt anders will, setzt
     * sie dort, und der Projektwert gewinnt (siehe `waehleMitVorrang`).
     */
    async function laden() {
        try {
            const [o, sf, l] = await Promise.all([
                repo.mitVorrang(REPO_OPTIONEN),
                repo.mitVorrang(REPO_SCHRIFTFELD),
                repo.mitVorrang(REPO_LOGO),
            ]);
            // Unbekannte Schlüssel aus älteren Ständen fallen weg, fehlende
            // bekommen die Vorgabe — so überlebt der Stand das Ergänzen einer
            // Option.
            if (o && typeof o === 'object') {
                optionen.value = Object.fromEntries(
                    Object.keys(PLAN_VORGABEN).map(k => [k, k in o ? o[k] : PLAN_VORGABEN[k]]),
                );
            }
            if (sf && typeof sf === 'object') {
                schriftfeld.value = { ...SCHRIFTFELD_VORGABEN, ...sf };
            }
            if (typeof l === 'string') logo.value = l;
        } catch { /* egal */ }
    }

    const bereit = laden();

    return {
        optionen, schriftfeld, logo, zeichenOptionen,
        setzeOption, setzeSchriftfeld, setzeLogo, zuruecksetzen, bereit,
        alsBuerovorgabe, zurueckAufBuero,
    };
});

/** Beliebige Bild-Data-URL nach PNG wandeln. Rein, damit prüfbar. */
export function _alsPng(datenUrl) {
    if (/^data:image\/png/i.test(datenUrl)) return Promise.resolve(datenUrl);
    return new Promise((aufloesen, ablehnen) => {
        const bild = new Image();
        bild.onload = () => {
            try {
                const cv = document.createElement('canvas');
                cv.width = bild.naturalWidth || bild.width || 1;
                cv.height = bild.naturalHeight || bild.height || 1;
                cv.getContext('2d').drawImage(bild, 0, 0);
                aufloesen(cv.toDataURL('image/png'));
            } catch (fehler) { ablehnen(fehler); }
        };
        bild.onerror = () => ablehnen(new Error('Bild nicht lesbar'));
        bild.src = datenUrl;
    });
}
