/**
 * Ansichts-Zustand des Arbeitsbereichs (Sprint P, AP-8).
 *
 * Hält NUR Zustand — welcher Modus, welches Blatt, welcher Maßstab, wo liegt
 * die Blattmitte, wie stark ist der Bildschirmzoom. Keine Engine, kein Canvas.
 * Muster und Persistenzweg wie `stores/usePanels.js`.
 *
 * Die Trennung von `massstab` (geht ins PDF, steht im Schriftfeld) und
 * `pxProMm` (reine Bildschirmlupe) ist Absicht — siehe `services/PlanViewport.js`.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';
import { normalisiereModus, istVerfuegbar } from '../services/ViewModes.js';
import { zeichenflaeche, frustumFuerBlatt, haelften } from '../services/PlanViewport.js';

const REPO_KEY = 'ansicht-state';

export const useAnsicht = defineStore('cde-ansicht', () => {
    const modus       = ref('3d');
    const format      = ref('A3');
    const ausrichtung = ref('landscape');
    const massstab    = ref(100);
    const mitte       = ref({ x: 0, z: 0 });
    const hoeheY      = ref(0);
    const pxProMm     = ref(2);

    /** Was der aktuelle Modellstand hergibt — von außen gesetzt. */
    const stand = ref({ hatModell: false, hatAchsen: false });

    const flaeche = computed(() => zeichenflaeche(format.value, ausrichtung.value));

    /** Plot-Frustum der aktuellen Blattlage — zeichnet UND exportiert. */
    const frustum = computed(() => frustumFuerBlatt({
        mitte: mitte.value, hoeheY: hoeheY.value, massstab: massstab.value,
        dw: flaeche.value.dw, dh: flaeche.value.dh,
    }));

    /** Weltausdehnung einer Blatthälfte — für Pan-Klemme und Rezentrierung. */
    const halb = computed(() =>
        haelften(massstab.value, flaeche.value.dw, flaeche.value.dh));

    function setzeModus(id) {
        const ziel = normalisiereModus(id);
        if (!istVerfuegbar(ziel, stand.value)) return false;
        modus.value = ziel;
        sichern();
        return true;
    }

    function setzeBlatt(neuesFormat, neueAusrichtung) {
        if (neuesFormat) format.value = neuesFormat;
        if (neueAusrichtung) ausrichtung.value = neueAusrichtung;
        sichern();
    }

    function setzeMassstab(m) { massstab.value = m; sichern(); }
    function setzeMitte(m)    { mitte.value = { x: m.x, z: m.z }; }
    function setzeZoom(z)     { pxProMm.value = Math.min(40, Math.max(0.3, z)); }
    function setzeStand(s)    { stand.value = { ...stand.value, ...s }; }

    /** Für gespeicherte Ansichten und Issue-Viewpoints. */
    function serialisieren() {
        return {
            modus: modus.value, format: format.value, ausrichtung: ausrichtung.value,
            massstab: massstab.value, mitte: { ...mitte.value }, hoeheY: hoeheY.value,
        };
    }

    /**
     * Gegenstück zu serialisieren(). Fehlt das Feld ganz (alle Ansichten von
     * vor Sprint P), landet man sauber im 3D-Modus — dafür sorgt
     * `normalisiereModus`, hier ist kein Sonderfall nötig.
     */
    function anwenden(zustand) {
        if (!zustand) { modus.value = '3d'; return; }
        modus.value       = normalisiereModus(zustand.modus);
        format.value      = zustand.format ?? format.value;
        ausrichtung.value = zustand.ausrichtung ?? ausrichtung.value;
        massstab.value    = zustand.massstab ?? massstab.value;
        hoeheY.value      = zustand.hoeheY ?? hoeheY.value;
        if (zustand.mitte) mitte.value = { x: zustand.mitte.x, z: zustand.mitte.z };
    }

    async function sichern() {
        try {
            await repo.set(REPO_KEY, {
                format: format.value, ausrichtung: ausrichtung.value, massstab: massstab.value,
            });
        } catch { /* Ansichtseinstellungen sind kein Grund für einen Fehler */ }
    }

    // Bewusst NICHT persistiert: Modus, Blattmitte und Zoom. Nach dem Neuladen
    // ist kein Modell da — ein wiederhergestellter Lageplan wäre ein weißes
    // Blatt. Blattformat und Maßstab sind dagegen Bürogewohnheiten.
    async function laden() {
        try {
            const g = await repo.get(REPO_KEY);
            if (!g) return;
            if (g.format) format.value = g.format;
            if (g.ausrichtung) ausrichtung.value = g.ausrichtung;
            if (g.massstab) massstab.value = g.massstab;
        } catch { /* egal */ }
    }

    const bereit = laden();

    return {
        modus, format, ausrichtung, massstab, mitte, hoeheY, pxProMm, stand,
        flaeche, frustum, halb,
        setzeModus, setzeBlatt, setzeMassstab, setzeMitte, setzeZoom, setzeStand,
        serialisieren, anwenden, bereit,
    };
});
