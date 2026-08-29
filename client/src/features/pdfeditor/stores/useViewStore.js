/**
 * useViewStore — Ansichtszustand: Zoom, sichtbare Seiten, Theme.
 *
 * `zoom` ist der Maßstab CSS-Pixel je PDF-Punkt (1 ≙ 100 % bei 72 dpi).
 * Das Rendern der Seiten-Canvases läuft zusätzlich über devicePixelRatio
 * und den Flächendeckel — das regelt PdfPage, nicht der Store.
 */

import { defineStore } from 'pinia';
import { ref, shallowRef, computed } from 'vue';
import { repo } from '../services/PdfRepo';
import { istInstalliert } from '../services/InstallLogik';
import { normalisiereDrehung, DREHSCHRITT } from '../services/AnsichtRotation';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_SCHRITT = 1.2;      // Faktor je Zoom-Klick / Radraste

export const useViewStore = defineStore('pdfed-view', () => {
    const zoom = ref(1);
    const sichtbareSeiten = ref({ von: 0, bis: 0 });
    // Der Editor läuft hell. Die Dunkel-Tokens bleiben in theme.css stehen
    // (kostenlos), ein Umschalter existiert auf Nutzerwunsch aber nicht mehr.
    const theme = ref('light');
    const gesteAktiv = ref(false);     // Pinch läuft → TextLayer u. Ä. pausieren
    // Ansichtsdrehung in Grad im Uhrzeigersinn (0/90/180/270). Reine
    // ANZEIGE-Sache: Annotationen und Export bleiben unrotiert.
    const drehung = ref(0);

    // ── PWA-Installation (Stufe 13) ─────────────────────────────────────────
    // Das abgefangene beforeinstallprompt-Event — sein .prompt() IST der
    // Install-Knopf. shallowRef: das Event darf nicht reaktiv zerlegt werden.
    const installEvent = shallowRef(null);
    const appInstalliert = ref(istInstalliert());

    const zoomProzent = computed(() => Math.round(zoom.value * 100));

    function setzeZoom(wert) {
        zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, wert));
    }

    function setzeDrehung(grad) {
        drehung.value = normalisiereDrehung(grad);
    }

    /** Ansicht drehen: +1 = nach rechts (im Uhrzeigersinn), -1 = nach links. */
    function drehe(richtung) {
        setzeDrehung(drehung.value + richtung * DREHSCHRITT);
    }

    /** Fit-Width: Seitenbreite (Punkte) in die verfügbare Breite (CSS-px) einpassen. */
    function passeBreiteAn(verfuegbareBreitePx, seitenBreitePt) {
        if (seitenBreitePt > 0) setzeZoom(verfuegbareBreitePx / seitenBreitePt);
    }

    async function ladeEinstellungen() {
        const e = await repo.get('einstellungen');
        // Ein früher gespeichertes 'dark' wird bewusst IGNORIERT und
        // aufgeräumt: ohne Umschalter käme man sonst nie wieder heraus.
        if (e?.theme && e.theme !== 'light') {
            speichereEinstellung({ theme: 'light' }).catch(() => {});
        }
        return e ?? {};
    }

    async function speichereEinstellung(patch) {
        const e = (await repo.get('einstellungen')) ?? {};
        await repo.set('einstellungen', { ...e, ...patch });
    }

    return {
        zoom, zoomProzent, sichtbareSeiten, theme, gesteAktiv, drehung,
        installEvent, appInstalliert,
        setzeZoom, passeBreiteAn, setzeDrehung, drehe, ladeEinstellungen, speichereEinstellung,
    };
});
