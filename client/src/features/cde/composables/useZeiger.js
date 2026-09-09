/**
 * useZeiger — der EINE Besitzer des Zeigers (Teil XVI, S1).
 *
 * Drei Dinge, die vorher drei Besitzer hatten oder keinen:
 *
 *   1. Die CURSOR-KLASSE auf dem Canvas. Die Engine schrieb `style.cursor`
 *      inline und schlug damit jede CSS-Klasse — der Mess-Cursor kam nie an.
 *      Jetzt: eine `computed`, vier Klassen, kein Inline-Style.
 *   2. Die ZIELMARKE im Raum (Ring + Kreuz in der Trefferebene), sobald ein
 *      Werkzeug scharf ist — gezeichnet vom Overlay, gefüttert von hier.
 *   3. Die PILLE am Zeiger (Koordinaten, Fangname) — als Daten fürs HUD.
 *
 * Hausstil: Verhalten hier, Zustand als Refs heraus; die Farben kommen zur
 * Laufzeit aus den Tokens (`--cde-accent`, `--cde-warn`), nie aus dem Code.
 */

import { computed, ref, watch } from 'vue';
import { eingabenFuer } from '../services/Eingaben.js';

/**
 * @param {object} opt
 * @param {import('vue').Ref} opt.engine         Ref auf die IfcEngine
 * @param {object}            opt.bearbeitung    der Bearbeitungs-Store
 * @param {import('vue').Ref<boolean>} opt.messenAktiv
 * @param {import('vue').Ref<boolean>} opt.notizAktiv
 * @param {() => ({accent:string, warn:string})} [opt.farben]  injizierbar für Tests
 */
export function useZeiger({ engine, bearbeitung, messenAktiv, notizAktiv, farben = null } = {}) {
    /** Der letzte Treffer unter dem Zeiger (siehe `engine.probeTreffer`), oder null. */
    const treffer = ref(null);
    /** Die Pille: { x, y, punkt:{x,y,z}, modelId, fang:{art,name}|null } in Canvas-Pixeln, oder null. */
    const marke = ref(null);

    const scharf = computed(() => !!bearbeitung?.scharfId);
    /**
     * Zeigt das scharfe Werkzeug auf etwas (Zug, Umriss, Punkt-/Auswahl-Geste)?
     * Nur dann gehören Fadenkreuz, Zielmarke und Fang-Pille ins Bild. Ein
     * Formular- oder Griff-Werkzeug (Verschieben, Sohlhöhen, Kostengruppe)
     * bekommt sie NICHT — sonst streiten Griffkugel und Zielring um dieselbe
     * Rolle (Fabio, PROD-Test 2026-09-08: „der Griffpunkt ist ein anderer als
     * der orangene").
     */
    const zeigt = computed(() => {
        const b = bearbeitung?.scharf;
        if (!b) return false;
        const e = bearbeitung?.eingabe;
        if (e && (e.phase !== 'aus' || e.geste)) return true;
        const ein = eingabenFuer(b);
        return ein.schlitze.some(s => s.schlitz === 'zug' || s.schlitz === 'umriss');
    });

    /**
     * Die Cursor-Klasse — genau eine, in dieser Rangfolge:
     *   messen   ein Tipp-Werkzeug läuft (gelbes Fadenkreuz-Quadrat)
     *   werkzeug eine Bearbeitung ist scharf (Fadenkreuz)
     *   hover    der Zeiger steht auf einem Bauteil (grüner Ring)
     *   auswahl  Ruhe (weisser Ring)
     */
    const klasse = computed(() => {
        if (messenAktiv?.value || notizAktiv?.value) return 'zeiger--messen';
        if (zeigt.value) return 'zeiger--werkzeug';
        return treffer.value?.key ? 'zeiger--hover' : 'zeiger--auswahl';
    });

    const _farben = () => (farben ? farben() : tokenFarben());

    /**
     * Ein Schwebe-Ereignis verarbeiten.
     * @param {object|null} t   Treffer aus `engine.hoverElement` (null = nichts unter dem Zeiger)
     * @param {{x,y}|null}  px  Zeigerlage in Canvas-Pixeln
     */
    function aufHover(t, px) {
        treffer.value = t ?? null;
        if (!zeigt.value) {
            if (marke.value) { marke.value = null; engine?.value?.setzeZeiger?.(null); }
            return;
        }
        if (!t?.point) {
            engine?.value?.setzeZeiger?.(null);
            marke.value = null;
            return;
        }
        const fang = t.fang ?? null;
        const punkt = fang?.punkt ?? t.point;
        const f = _farben();
        // Beim Fang liegt die Marke auf dem gefangenen Punkt, nicht auf dem
        // rohen Treffer — und ohne Normale (eine Ecke hat keine): Billboard.
        engine?.value?.setzeZeiger?.({
            punkt,
            normal: fang ? null : t.normal,
            farbe: fang ? f.warn : f.accent,
        });
        marke.value = px
            ? { x: px.x, y: px.y, punkt, modelId: t.modelId ?? null,
                fang: fang ? { art: fang.art, name: fang.name } : null }
            : null;
    }

    /** Der Zeiger hat das Canvas verlassen. */
    function verlassen() {
        treffer.value = null;
        marke.value = null;
        engine?.value?.setzeZeiger?.(null);
    }

    // Werkzeug aus → Marke weg. Ohne das stünde der Ring an der letzten Stelle.
    // SYNCHRON: wird ein Werkzeug im selben Tick scharf und wieder verdrängt
    // (Slot-Wechsel), sieht ein gepufferter Watcher nur „aus → aus" und
    // schweigt — die Marke bliebe an der letzten Stelle stehen.
    watch(zeigt, (an) => {
        if (!an) {
            marke.value = null;
            engine?.value?.setzeZeiger?.(null);
        }
    }, { flush: 'sync' });

    return { klasse, treffer, marke, scharf, zeigt, aufHover, verlassen };
}

/**
 * Die Farben der Vorschau aus den Tokens — zur Laufzeit gelesen, nie aus dem
 * Code. Gemeinsam für Zeiger und Vorschau; ohne DOM (Tests) die Vorgaben.
 */
export function tokenFarben() {
    if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') {
        return { accent: '#4fc3f7', warn: '#ffb74d', ok: '#66bb6a', danger: '#ef5350' };
    }
    const stil = getComputedStyle(document.documentElement);
    const lies = (name, vorgabe) => stil.getPropertyValue(name).trim() || vorgabe;
    return { accent: lies('--cde-accent', '#4fc3f7'), warn: lies('--cde-warn', '#ffb74d'),
             ok: lies('--cde-success', '#66bb6a'), danger: lies('--cde-danger', '#ef5350') };
}
