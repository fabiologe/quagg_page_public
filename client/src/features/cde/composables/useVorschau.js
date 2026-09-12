/**
 * useVorschau — die Vorschau AM Objekt, während man bearbeitet (Teil XVI, S2).
 *
 * Beobachtet die scharfe Bearbeitung, ihre Werte und den Zug im Store, fragt
 * `anwenden` im Trockenlauf (rein, mutiert nichts — derselbe Vertrag, den
 * `useZeichnen` fürs Prüfen des Bauplans schon nutzt), übersetzt die
 * Beschreibung über `Vorschau.js` in Primitive und Färbungen und bringt sie
 * über die Engine ins Bild. Ins Journal geht NICHTS — dieser Weg kennt
 * `useAenderungen` nicht, und ein Wächter hält das fest.
 *
 * Entprellt (50 ms): eine Färbung ist ein Worker-Roundtrip plus
 * `core.update(true)`; je Tastendruck wäre das zu viel. Und BUDGET: meldet
 * `Vorschau.js` mehr als einen Frame, läuft dieses Werkzeug fortan
 * `einfach` (nur Färbung und Linien) — ehrlich, statt die Oberfläche
 * anzuhalten.
 */

import { getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue';
import { vorschauFuer, VORSCHAU_BUDGET_MS } from '../services/Vorschau.js';
import { karteMitEngine } from '../services/GlobalIdKarte.js';
import { weltAusNn } from '../services/Hoehenbezug.js';
import { tokenFarben } from './useZeiger.js';
import { stationAuf } from '../services/Fangpunkte.js';

const ROLLEN = ['dimmen', 'kandidat', 'ziel'];

/**
 * @param {object} opt
 * @param {import('vue').Ref} opt.engine
 * @param {object}   opt.bearbeitung       der Bearbeitungs-Store
 * @param {Function} [opt.getHoeheAn]      (x, z) → Welt-Y | null | undefined
 * @param {Function} [opt.getHoehenversatz]
 * @param {Function} [opt.farben]          () → {accent, warn, ok}
 * @param {number}   [opt.verzoegerungMs]
 */
export function useVorschau({ engine, bearbeitung, getHoeheAn = null, getHoehenversatz = null,
                              farben = null, verzoegerungMs = 50 } = {}) {
    /** { chips, hinweise, dauerMs, einfach } oder null, wenn nichts scharf ist. */
    const stand = ref(null);
    let timer = null;
    let lauf = 0;
    /** Werkzeug-Id, die das Budget gerissen hat — läuft ab jetzt vereinfacht. */
    let einfachFuer = null;

    function plane() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; rechne().catch(e => console.warn('cde: vorschau', e?.message ?? e)); }, verzoegerungMs);
    }

    async function rechne() {
        const b = bearbeitung?.scharf;
        const e = engine?.value;
        const nr = ++lauf;
        if (!b || !bearbeitung.modusAn || !e) { await leeren(); return null; }

        const zug = bearbeitung.eingabe?.punkte ?? [];
        const versatz = getHoehenversatz?.() ?? bearbeitung.bauteil?.hoehenversatz ?? 0;
        const amBauteil = b.gruppe !== 'erzeugen';
        const el = amBauteil ? bearbeitung.bauteil : { punkte: zug, hoehenversatz: versatz };
        let beschreibung = null;
        if (el) {
            try { beschreibung = amBauteil ? b.anwenden(el, bearbeitung.werte, { zug }) : b.anwenden(el, bearbeitung.werte); }
            catch (fehler) { beschreibung = null; console.warn('cde: vorschau anwenden', fehler?.message ?? fehler); }
        }
        const f = (farben ?? tokenFarben)();
        const einfach = einfachFuer === b.id;
        const v = vorschauFuer(beschreibung ?? [], {
            subjekt: bearbeitung.bauteil ?? null, werkzeug: b,
            hoeheAn: getHoeheAn, hoehenversatz: versatz, farben: f, einfach,
        });
        if (nr !== lauf) return null;                       // überholt

        // Der laufende Zug — aus dem Store, auch wenn `anwenden` noch nichts liefert.
        const hoeheVorgabe = Number.isFinite(Number(bearbeitung.werte?.hoehe)) && bearbeitung.werte.hoehe !== ''
            ? weltAusNn(Number(bearbeitung.werte.hoehe), versatz)
            : (bearbeitung.bauteil?.bezugshoehe ?? null);
        const zugPrimitive = _zugPrimitive(zug, bearbeitung.eingabe?.zeiger ?? null, {
            hoeheAn: getHoeheAn, hoeheVorgabe, farbe: f.accent,
            umriss: b.eingabe === 'umriss', geschlossen: !!bearbeitung.eingabe?.zugGeschlossen, fangFarbe: f.warn,
        });

        // Die GESTE (S3): Kandidaten einer Auswahl werden gefärbt, der Zeiger
        // auf der Achse zeigt den Stationspunkt, bevor getippt wird.
        const geste = bearbeitung.eingabe?.geste ?? null;
        const gestePrimitive = [];
        const gesteFaerbungen = [];
        if (geste?.art === 'auswahl') {
            for (const g of geste.kandidaten ?? []) gesteFaerbungen.push({ globalId: g, rolle: 'kandidat' });
        }
        if (geste?.art === 'punkt' && geste.auf === 'achse') {
            const a = bearbeitung.bauteil?.achse ?? null;
            const stuetz = a?.polyline ?? a?.punkte ?? (a?.anfang && a?.ende ? [a.anfang, a.ende] : null);
            const zg = bearbeitung.eingabe?.zeiger ?? null;
            const st = (stuetz && zg) ? stationAuf({ punkte: stuetz }, zg) : null;
            if (st) gestePrimitive.push({ art: 'marke', punkt: st.punkt, normal: { x: 0, y: 1, z: 0 }, farbe: f.warn, radius: 0.3 });
        }

        e.overlayZeige?.('vorschau', [...zugPrimitive, ...gestePrimitive, ...v.primitive]);
        await _faerben(e, [...v.faerbungen, ...gesteFaerbungen]);
        if (nr !== lauf) return null;

        if (!einfach && v.dauerMs > VORSCHAU_BUDGET_MS) einfachFuer = b.id;
        stand.value = { chips: v.chips, hinweise: v.hinweise, dauerMs: v.dauerMs, einfach };
        return stand.value;
    }

    /** Färbungen je Rolle über die GlobalId-Karte in Orte übersetzen — nicht genannte Rollen fallen. */
    async function _faerben(e, faerbungen) {
        const jeRolle = new Map(ROLLEN.map(r => [r, []]));
        for (const f of faerbungen ?? []) if (jeRolle.has(f.rolle) && f.globalId) jeRolle.get(f.rolle).push(f.globalId);
        const alle = new Set([...jeRolle.values()].flat());
        let karte = new Map();
        if (alle.size) {
            try { ({ karte } = await karteMitEngine(e, alle)); } catch { karte = new Map(); }
        }
        for (const [rolle, ids] of jeRolle) {
            const orte = ids.map(g => karte.get(g)).filter(Boolean).map(o => ({ modelId: o.modelId, localId: o.localId }));
            if (orte.length) await e.faerbe?.(rolle, orte);
            else await e.entfaerbe?.(rolle);
        }
    }

    async function leeren() {
        lauf++;
        const e = engine?.value;
        e?.overlayLeere?.('vorschau');
        // NUR die eigenen Rollen (Abnahme 2026-09-12, K4): `entfaerbeAlle` nahm
        // den Farbkatalog mit — nach jeder Vorschau stand das gelieferte
        // Gelände in seiner IFC-Farbe da, bis zum nächsten Laden.
        for (const rolle of ROLLEN) await e?.entfaerbe?.(rolle);
        stand.value = null;
    }

    watch(
        () => [bearbeitung?.scharfId, bearbeitung?.werte, bearbeitung?.eingabe?.punkte,
               bearbeitung?.eingabe?.zeiger, bearbeitung?.eingabe?.geste, bearbeitung?.bauteil, bearbeitung?.modusAn],
        () => plane(),
    );

    // Nur in einer Komponente — im Test (ohne Instanz) gäbe es sonst eine Vue-Warnung.
    if (getCurrentInstance()) onBeforeUnmount(() => { if (timer) clearTimeout(timer); leeren(); });

    return { stand, rechne, leeren };
}

/** Der Zug als Marken + Linie + Gummiband — Höhen aus dem Punkt, dem Sampler oder der Vorgabe. */
export function _zugPrimitive(zug, zeiger, { hoeheAn = null, hoeheVorgabe = null, farbe = '#4fc3f7',
                                             umriss = false, geschlossen = false, fangFarbe = '#ffb74d' } = {}) {
    const hoehe = (p) => {
        if (Number.isFinite(p?.y)) return p.y;
        const h = hoeheAn?.(p.x, p.z);
        if (Number.isFinite(h)) return h;
        return Number.isFinite(hoeheVorgabe) ? hoeheVorgabe : NaN;
    };
    const pts = (zug ?? [])
        .filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.z))
        .map(p => ({ x: p.x, y: hoehe(p), z: p.z }))
        .filter(p => Number.isFinite(p.y));
    const aus = pts.map(p => ({ art: 'marke', punkt: p, normal: { x: 0, y: 1, z: 0 }, farbe, radius: 0.2 }));
    if (pts.length >= 2) aus.push({ art: 'linie', punkte: pts, farbe });
    // UMRISS (Teil XX): der erste Punkt ist das Ziel des Schliessfangs — gross
    // und in der Fang-Farbe; die Schlusskante steht gestrichelt, bis der
    // Umriss geschlossen ist, dann durchgezogen.
    if (umriss && pts.length) {
        aus.push({ art: 'marke', punkt: pts[0], normal: { x: 0, y: 1, z: 0 }, farbe: fangFarbe, radius: 0.35 });
        if (pts.length >= 3) aus.push({ art: 'linie', punkte: [pts[pts.length - 1], pts[0]], farbe, gestrichelt: !geschlossen });
    }
    if (zeiger && pts.length && Number.isFinite(zeiger.x) && Number.isFinite(zeiger.z)) {
        const y = hoehe(zeiger);
        if (Number.isFinite(y)) {
            aus.push({ art: 'linie', punkte: [pts[pts.length - 1], { x: zeiger.x, y, z: zeiger.z }], farbe, gestrichelt: true });
        }
    }
    return aus;
}
