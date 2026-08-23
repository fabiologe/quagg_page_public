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

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_SCHRITT = 1.2;      // Faktor je Zoom-Klick / Radraste

export const useViewStore = defineStore('pdfed-view', () => {
    const zoom = ref(1);
    const sichtbareSeiten = ref({ von: 0, bis: 0 });
    const theme = ref('light');        // 'light' | 'dark'
    const gesteAktiv = ref(false);     // Pinch läuft → TextLayer u. Ä. pausieren

    // ── PWA-Installation (Stufe 13) ─────────────────────────────────────────
    // Das abgefangene beforeinstallprompt-Event — sein .prompt() IST der
    // Install-Knopf. shallowRef: das Event darf nicht reaktiv zerlegt werden.
    const installEvent = shallowRef(null);
    const appInstalliert = ref(istInstalliert());

    const zoomProzent = computed(() => Math.round(zoom.value * 100));

    function setzeZoom(wert) {
        zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, wert));
    }

    /** Fit-Width: Seitenbreite (Punkte) in die verfügbare Breite (CSS-px) einpassen. */
    function passeBreiteAn(verfuegbareBreitePx, seitenBreitePt) {
        if (seitenBreitePt > 0) setzeZoom(verfuegbareBreitePx / seitenBreitePt);
    }

    async function ladeEinstellungen() {
        const e = await repo.get('einstellungen');
        if (e?.theme === 'dark' || e?.theme === 'light') theme.value = e.theme;
        return e ?? {};
    }

    async function speichereEinstellung(patch) {
        const e = (await repo.get('einstellungen')) ?? {};
        await repo.set('einstellungen', { ...e, ...patch });
    }

    function schalteTheme() {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
        speichereEinstellung({ theme: theme.value });
    }

    return {
        zoom, zoomProzent, sichtbareSeiten, theme, gesteAktiv,
        installEvent, appInstalliert,
        setzeZoom, passeBreiteAn, ladeEinstellungen, speichereEinstellung, schalteTheme,
    };
});
