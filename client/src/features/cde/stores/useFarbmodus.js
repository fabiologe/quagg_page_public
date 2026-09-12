/**
 * Der Farbmodus der CDE — dunkel (Vorgabe) oder hell im Stil von Quagg-PDF
 * (Kassensturz H6, Abnahme 2026-09-12 K1).
 *
 * Er gilt je Gerät (localStorage), nicht je Projekt: wer im Büro hell und
 * draußen auf dem Tablet dunkel arbeitet, legt das nicht für alle fest.
 * Gespiegelt wird er auf `<html data-cde-modus>` — auf die Wurzel, weil
 * teleportierte Dialoge unter <body> hängen und nur so die Tokens erben.
 * Warum nicht `data-theme`, steht in `styles/theme.css`.
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

const SCHLUESSEL = 'cde-farbmodus';
const MODI = ['dunkel', 'hell'];

function lies() {
    try {
        const m = localStorage.getItem(SCHLUESSEL);
        return MODI.includes(m) ? m : 'dunkel';
    } catch { return 'dunkel'; }
}
function merke(m) {
    try { localStorage.setItem(SCHLUESSEL, m); } catch { /* privater Modus: gilt nur für diese Sitzung */ }
}
const wurzel = () => (typeof document !== 'undefined' ? document.documentElement : null);

export const useFarbmodus = defineStore('cde-farbmodus', () => {
    const modus = ref(lies());
    const hell = computed(() => modus.value === 'hell');

    /** Auf <html> spiegeln — die Schale ruft es beim Start, `setze` bei jedem Wechsel. */
    function spiegeln() {
        const w = wurzel();
        if (w) w.dataset.cdeModus = modus.value;
    }
    /** Beim Verlassen der CDE: die übrige App kennt den Modus nicht. */
    function abraeumen() {
        const w = wurzel();
        if (w) delete w.dataset.cdeModus;
    }

    function setze(m) {
        modus.value = MODI.includes(m) ? m : 'dunkel';
        merke(modus.value);
        spiegeln();
    }
    function umschalten() { setze(hell.value ? 'dunkel' : 'hell'); }

    return { modus, hell, setze, umschalten, spiegeln, abraeumen };
});
