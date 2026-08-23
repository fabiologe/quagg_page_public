/**
 * useToolStore — aktives Werkzeug, Werkzeugoptionen, Eingabemodus.
 *
 * Der Eingabemodus steuert die Stift/Finger-Konfliktregeln (EingabeRouting):
 *   'stiftUndFinger' (Default): ein Finger zeichnet, zwei Finger navigieren.
 *   'nurStift': Finger ist reine Navigation — Arbeiten mit aufgelegter Hand.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useViewStore } from './useViewStore';

// Genau vier Stiftfarben (Nutzerwunsch Stufe 8): Schwarz, Blau, Rot, Grün.
export const STIFT_FARBEN = [
    '#111827',  // Schwarz (Tinte)
    '#1d4ed8',  // Blau
    '#b91c1c',  // Rot
    '#15803d',  // Grün
];

export const STIFT_ARTEN = [
    { id: 'kugelschreiber', icon: 'stift',     titel: 'Kugelschreiber' },
    { id: 'bleistift',      icon: 'bleistift', titel: 'Bleistift' },
    { id: 'filzstift',      icon: 'filzstift', titel: 'Filzstift (konstante Breite)' },
];

export const MARKER_FARBEN = [
    '#facc15',  // Gelb
    '#4ade80',  // Grün
    '#38bdf8',  // Cyan
    '#f472b6',  // Pink
    '#fb923c',  // Orange
];

export const STIFT_BREITEN_PT = [0.9, 1.6, 3, 5, 8];
export const MARKER_BREITEN_PT = [8, 12, 18];

export const TEXT_GROESSEN_PT = [10, 14, 18, 24, 32, 40, 50];
export const TEXT_HINTERGRUENDE = [
    { wert: 'transparent', titel: 'Ohne Hintergrund' },
    { wert: '#ffffff',     titel: 'Weiß' },
    { wert: '#fef9c3',     titel: 'Gelb' },
    { wert: '#e0f2fe',     titel: 'Hellblau' },
];

// Bewährte Stempel-Texte (Freitext bleibt zusätzlich möglich).
export const STEMPEL_TEXTE = ['VORABZUG', 'ENTWURF', 'GEPRÜFT', 'FREIGEGEBEN'];
export const STEMPEL_FARBEN = [
    '#b91c1c',  // Rot (klassischer Stempel)
    '#1d4ed8',  // Blau
    '#15803d',  // Grün
];

export const useToolStore = defineStore('pdfed-tool', () => {
    const viewStore = useViewStore();

    const aktivesWerkzeug = ref('stift');   // pan|stift|textmarker|radierer|lasso|kommentar|signatur|…
    const eingabemodus = ref('stiftUndFinger');
    // Vom SignatureDialog gewählte Vorlage, die auf den nächsten Tipp wartet:
    const signaturZumPlatzieren = ref(null);
    // Laufende Messung/Kalibrierung: { page, kind: 'distance'|'area'|'kalibrieren', points: [[x,y]] }
    const messungInArbeit = ref(null);
    // 2-Punkt-Kalibrierung abgeschlossen → Dialog fragt die reale Länge ab:
    // { laengePt: number|null, page: number|null }
    const kalibrierungAnfrage = ref(null);

    const stift = ref({ art: 'kugelschreiber', farbe: STIFT_FARBEN[0], breitePt: 1.6, deckkraft: 1 });
    const textmarker = ref({ farbe: MARKER_FARBEN[0], breitePt: 12, deckkraft: 0.4 });
    // modus 'punkt' = radiert Teilstücke aus Strichen (OneNote-Radiergummi),
    // modus 'strich' = ganzer Strich verschwindet bei Berührung.
    const radierer = ref({ radiusPt: 8, modus: 'punkt' });
    const textfeld = ref({ schriftGroessePt: 12, textFarbe: STIFT_FARBEN[0], hintergrundFarbe: 'transparent' });
    const stempel = ref({ text: STEMPEL_TEXTE[0], farbe: STEMPEL_FARBEN[0], mitDatum: true, groessePt: 18 });

    const istZeichnend = computed(() =>
        ['stift', 'textmarker', 'radierer'].includes(aktivesWerkzeug.value));

    function waehleWerkzeug(w) {
        aktivesWerkzeug.value = w;
        if (messungInArbeit.value) messungInArbeit.value = null;
    }

    function schalteEingabemodus() {
        eingabemodus.value = eingabemodus.value === 'stiftUndFinger' ? 'nurStift' : 'stiftUndFinger';
        viewStore.speichereEinstellung({ eingabemodus: eingabemodus.value });
    }

    /** Optionen des Werkzeugs, mit dem ein neuer Strich entsteht. */
    function inkOptionen(werkzeug) {
        if (werkzeug === 'textmarker') {
            return { tool: 'textmarker', ...textmarker.value };
        }
        const { art, ...rest } = stift.value;
        return { tool: 'stift', stiftArt: art, ...rest };
    }

    async function ladeEinstellungen(einstellungen) {
        if (einstellungen?.eingabemodus === 'nurStift') eingabemodus.value = 'nurStift';
        if (einstellungen?.stift) stift.value = { ...stift.value, ...einstellungen.stift };
        if (einstellungen?.textmarker) textmarker.value = { ...textmarker.value, ...einstellungen.textmarker };
        if (einstellungen?.textfeld) textfeld.value = { ...textfeld.value, ...einstellungen.textfeld };
        if (einstellungen?.radierer) radierer.value = { ...radierer.value, ...einstellungen.radierer };
        if (einstellungen?.stempel) stempel.value = { ...stempel.value, ...einstellungen.stempel };
        // Farben, die es nach der Palettenkürzung nicht mehr gibt → Schwarz.
        if (!STIFT_FARBEN.includes(stift.value.farbe)) stift.value.farbe = STIFT_FARBEN[0];
    }

    function speichereWerkzeugOptionen() {
        viewStore.speichereEinstellung({
            stift: { ...stift.value },
            textmarker: { ...textmarker.value },
            textfeld: { ...textfeld.value },
            radierer: { ...radierer.value },
            stempel: { ...stempel.value },
        });
    }

    // Lineal: { page, x, y (Anker in Seitenpunkten), winkelGrad } | null
    const lineal = ref(null);

    return {
        aktivesWerkzeug, eingabemodus, stift, textmarker, radierer, textfeld, stempel,
        istZeichnend, signaturZumPlatzieren, messungInArbeit, kalibrierungAnfrage,
        lineal,
        waehleWerkzeug, schalteEingabemodus, inkOptionen,
        ladeEinstellungen, speichereWerkzeugOptionen,
    };
});
