/**
 * Vorschau — aus der BESCHREIBUNG einer Bearbeitung wird ein Bild (Teil XVI, S2).
 *
 * Kein Werkzeug schreibt seine Vorschau. `anwenden(el, werte, {zug})` ist
 * rein und liefert die Journaleinträge, die es schreiben WÜRDE; diese Datei
 * übersetzt sie nach `art` × Bauform in wenige PRIMITIVE, die das Overlay
 * zeichnet. Ein neues Werkzeug bekommt seine Vorschau geschenkt — dieselbe
 * Bewegung, die `bauform` gegenüber `typ` gemacht hat.
 *
 *   geloescht            → Färbung `dimmen` (das Original tritt zurück) —
 *                          außer es wird ERSETZT (Gelände unter einer Anzeige)
 *   erzeugt (Rezept)     → `bauplan` (das Overlay baut die Geometrie, three)
 *   erzeugt (Ableitung)  → `rezept.vorschau(parameter, ctx)` — leicht:
 *                          Trapez-Sweep, extrudierte Platte; NIE `leite`
 *   lage                 → `box` am neuen Ort + `versatz`-Pfeil + Lot + Pille
 *   parametrik           → `forderung` (gestrichelt) — geliefert = Forderung,
 *                          die Geometrie bleibt beim Planer (Gesetz 8)
 *   alles andere         → ein Chip („Festlegung")
 *
 * REIN: kein three, kein Vue, kein Journal — die Beschreibung kommt herein,
 * das Bild geht als Daten heraus. Und BUDGET: eine Vorschau, die länger als
 * einen Frame rechnet, ist keine; sie meldet ihre Dauer, und der Aufrufer
 * schaltet für dieses Werkzeug auf `einfach` (nur Färbung + Linien).
 *
 * Die Vorschau ist ANSCHAUUNG, nicht das Ergebnis: das Ergebnis entsteht
 * beim Übernehmen über denselben Neuaufbau wie immer. Deshalb der Chip
 * „Massen nach Übernehmen" an jeder Ableitung.
 */

import { ableitungNach } from './ableitung/Ableitungen.js';
import { weltAusNn } from './Hoehenbezug.js';
import { sohleAnAchse } from './Achsbezug.js';
import { gefaelle, punkteDerAchse } from './geometrie/Stationierung.js';
import { istAnzeigeform } from './Bauteilrezepte.js';

/** Ein Frame — mehr darf eine Vorschau je Änderung nicht kosten. */
export const VORSCHAU_BUDGET_MS = 16;

/** Färbe-Rollen, die das Overlay bzw. die Engine kennen. */
export const FAERBE_ROLLEN = Object.freeze(['dimmen', 'kandidat', 'ziel']);

const FARBEN_VORGABE = Object.freeze({ accent: '#4fc3f7', warn: '#ffb74d', ok: '#66bb6a' });

/**
 * DIE FARBE EINER ROLLE — als sRGB-Hex, an EINER Stelle.
 *
 * Gemessen 2026-09-17 (three r181, ColorManagement an): `new THREE.Color(0.31,
 * 0.76, 0.97)` im Färbe-Stapel der Engine gilt als LINEAR und erscheint am
 * Bildschirm als `#97e2fc` — während der Geist derselben Bearbeitung mit
 * `'#4fc3f7'` gezeichnet wird. Zwei Farben für dieselbe Aussage, nebeneinander
 * im Bild. Aus Hex gebaut rechnet three sRGB → linear und zeigt, was dasteht;
 * der Katalog (`Bauteilfarben`) ging diesen Weg immer.
 */
export const FAERBE_FARBEN = Object.freeze({
    dimmen:   '#737373',            // neutrales Grau, damit das Gedimmte zurücktritt
    kandidat: FARBEN_VORGABE.accent,
    ziel:     FARBEN_VORGABE.warn,
});

/**
 * @param {Array<object>|object|null} beschreibungen  Journaleinträge aus `anwenden`
 * @param {object} ctx
 * @param {object}   [ctx.subjekt]        das eingeordnete Bauteil (anker, box, achse, …)
 * @param {object}   [ctx.werkzeug]       der scharfe Katalogeintrag (nurFestlegung, …)
 * @param {Function} [ctx.hoeheAn]        (x, z) → Geländehöhe (Welt) | null | undefined
 * @param {number}   [ctx.hoehenversatz]  NN − Welt
 * @param {object}   [ctx.farben]         {accent, warn, ok} als Hex
 * @param {boolean}  [ctx.einfach]        nur Färbung + Linien (Budget überschritten)
 * @param {Function} [ctx.jetzt]          Uhr (Tests)
 * @returns {{primitive:Array, faerbungen:Array<{globalId, rolle}>, chips:Array<{art, text}>,
 *            hinweise:string[], dauerMs:number}}
 */
export function vorschauFuer(beschreibungen, ctx = {}) {
    const uhr = ctx.jetzt ?? _jetzt;
    const t0 = uhr();
    const liste = (Array.isArray(beschreibungen) ? beschreibungen : [beschreibungen]).filter(e => e?.art);
    const farben = { ...FARBEN_VORGABE, ...(ctx.farben ?? {}) };
    const aus = { primitive: [], faerbungen: [], chips: [], hinweise: [] };
    const klammern = new Map();      // ableitungId → { rezept, parameter, teile }
    let neue = 0;
    let festlegungen = 0;
    // ERSETZT ist nicht ENTFERNT (Abnahme 2026-09-12, K4): was ein Erdbau-
    // Vorgang als Gelände-Quelle nimmt oder unter seiner Anzeige verbirgt,
    // bleibt, wie es ist — das Dimmen machte das Gelände für die Dauer der
    // Bearbeitung grau und durchscheinend. Die Vorschau zeichnet ohnehin
    // durch (Overlay mit `depthTest: false`).
    const erzeugte = liste.filter(e => e.art === 'erzeugt');
    const ersetzt = new Set(erzeugte.map(e => e.nachher?.parameter?.quellen?.gelaende).filter(Boolean));
    const unterAnzeige = erzeugte.some(e => istAnzeigeform(e.nachher));

    for (const e of liste) {
        switch (e.art) {
            case 'geloescht':
                if (e.nachher && e.globalId && !unterAnzeige && !ersetzt.has(e.globalId)) {
                    aus.faerbungen.push({ globalId: e.globalId, rolle: 'dimmen' });
                }
                break;
            case 'erzeugt': {
                const n = e.nachher;
                if (!n) break;
                if (n.ableitung) {
                    const k = klammern.get(n.ableitung) ?? { rezept: n.rezept, parameter: n.parameter, teile: [] };
                    k.teile.push(n.rolle ?? null);
                    klammern.set(n.ableitung, k);
                } else {
                    neue++;
                    if (!ctx.einfach) aus.primitive.push({ art: 'bauplan', bauplan: n, farbe: farben.accent, opacity: 0.4 });
                }
                break;
            }
            case 'lage':
                _lage(e, ctx, farben, aus);
                break;
            case 'parametrik':
                _forderung(e, ctx, farben, aus);
                festlegungen++;
                break;
            default:
                festlegungen++;
                aus.chips.push({ art: 'festlegung', text: `${_artTitel(e.art)} — Wert im Verlauf` });
        }
    }

    for (const [, k] of klammern) {
        const r = ableitungNach(k.rezept);
        const titel = r?.titel ?? k.rezept;
        if (r?.vorschau && !ctx.einfach) {
            let v = null;
            try { v = r.vorschau(k.parameter, { ...ctx, farben }); }
            catch (fehler) { aus.hinweise.push(`vorschau_fehlgeschlagen: ${titel} — ${fehler?.message ?? fehler}`); }
            if (v) {
                aus.primitive.push(...(v.primitive ?? []));
                aus.faerbungen.push(...(v.faerbungen ?? []));
                aus.chips.push(...(v.chips ?? []));
                aus.hinweise.push(...(v.hinweise ?? []));
            }
        }
        aus.chips.push({ art: 'ableitung', text: `${titel} · ${k.teile.length} Teile — Massen nach Übernehmen` });
    }
    if (neue) aus.chips.push({ art: 'neu', text: neue === 1 ? '1 neues Bauteil' : `${neue} neue Bauteile` });
    if (festlegungen && !aus.chips.some(c => c.art === 'forderung')) {
        aus.chips.push({ art: 'forderung', text: 'Forderung — die Geometrie bleibt beim Planer' });
    }

    const dauerMs = uhr() - t0;
    if (dauerMs > VORSCHAU_BUDGET_MS) {
        aus.hinweise.push(`vorschau_langsam: ${dauerMs.toFixed(0)} ms — über dem Budget von ${VORSCHAU_BUDGET_MS} ms`);
    }
    if (ctx.einfach) aus.chips.push({ art: 'einfach', text: 'Vorschau vereinfacht' });
    return { ...aus, dauerMs };
}

// ── Lage ──────────────────────────────────────────────────────────────────

function _lage(e, ctx, farben, aus) {
    const nach = e.nachher;
    if (!_endlich(nach)) return;
    const s = ctx.subjekt;
    const eigenes = s?.globalId && s.globalId === e.globalId;
    const anker = eigenes ? s.anker : null;
    if (anker && _endlich(anker)) {
        const d = { x: nach.x - anker.x, y: nach.y - anker.y, z: nach.z - anker.z };
        const weg = Math.hypot(d.x, d.y, d.z);
        if (s.box && _endlich(s.box.min) && _endlich(s.box.max)) {
            aus.primitive.push({ art: 'box', farbe: farben.accent,
                min: { x: s.box.min.x + d.x, y: s.box.min.y + d.y, z: s.box.min.z + d.z },
                max: { x: s.box.max.x + d.x, y: s.box.max.y + d.y, z: s.box.max.z + d.z } });
        } else {
            aus.primitive.push({ art: 'marke', punkt: nach, normal: { x: 0, y: 1, z: 0 }, farbe: farben.accent });
        }
        if (weg > 1e-4) aus.primitive.push({ art: 'versatz', von: anker, nach, farbe: farben.accent });
        const teile = [];
        const dxz = Math.hypot(d.x, d.z);
        if (dxz > 1e-4) teile.push(`Δ ${dxz.toFixed(2)} m in der Ebene`);
        if (Math.abs(d.y) > 1e-4) teile.push(`ΔH ${d.y > 0 ? '+' : '−'}${Math.abs(d.y).toFixed(2)} m`);
        aus.chips.push({ art: 'lage', text: teile.length ? teile.join(' · ') : 'unverändert' });
        // GUMMIBÄNDER zu den Partnern (Teil XVII, B2): ein Lauf, der an
        // Schächten hängt, reisst beim Verschieben seine Anschlüsse — jedes
        // Band läuft vom Knoten (dort lag das Ende) zum verschobenen Ende.
        // Die Beziehungen hängen am Subjekt; hier wird nichts nachgeschlagen.
        if (weg > 1e-4) {
            const gerissen = (s.beziehungen ?? []).filter(r => r.art === 'anschluss' && r.a === s.globalId && _endlich(r.mass?.punkt));
            for (const r of gerissen) {
                const von = r.mass.punkt;
                const zu = { x: von.x + d.x, y: von.y + d.y, z: von.z + d.z };
                aus.primitive.push({ art: 'linie', gestrichelt: true, farbe: farben.warn, punkte: [von, zu] });
                aus.primitive.push({ art: 'marke', punkt: von, normal: { x: 0, y: 1, z: 0 }, farbe: farben.warn, radius: 0.2 });
            }
            if (gerissen.length) {
                aus.chips.push({ art: 'warnung', text: `${gerissen.length} ${gerissen.length === 1 ? 'Anschluss' : 'Anschlüsse'} gelöst (${gerissen.map(r => r.bn || r.b).join(', ')})` });
            }
        }
    } else {
        // Ein Nachbar (Anschluss beim Mitführen) — nur die Marke, ohne Box.
        aus.primitive.push({ art: 'marke', punkt: nach, normal: { x: 0, y: 1, z: 0 }, farbe: farben.accent });
    }
    // Das LOT: wo setzt der Punkt auf dem Gelände auf? Das ist in einer
    // perspektivischen Ansicht die einzige Tiefeninformation.
    const h = ctx.hoeheAn?.(nach.x, nach.z);
    if (Number.isFinite(h) && Math.abs(h - nach.y) > 0.01) {
        aus.primitive.push({ art: 'linie', gestrichelt: true, farbe: farben.accent,
                             punkte: [nach, { x: nach.x, y: h, z: nach.z }] });
    }
    if (e.bezug?.zielBasis && _endlich(e.bezug.zielBasis)) {
        aus.primitive.push({ art: 'marke', punkt: e.bezug.zielBasis, normal: { x: 0, y: 1, z: 0 }, farbe: farben.warn });
        aus.chips.push({ art: 'bezug', text: `Bezug: ${e.bezug.art ?? 'Anschluss'} an ${e.bezug.ziel ?? '?'}` });
    }
}

// ── Forderungen (parametrik) ──────────────────────────────────────────────

function _forderung(e, ctx, farben, aus) {
    const n = e.nachher ?? {};
    const s = ctx.subjekt;
    const eigenes = s?.globalId && s.globalId === e.globalId;
    const v = ctx.hoehenversatz ?? 0;
    const a = eigenes ? (s.achse ?? null) : null;

    if ('sohlhoeheAnfang' in n || 'sohlhoeheEnde' in n) {
        if (a?.anfang && a?.ende) {
            // Ein Ende ohne Forderung gilt mit seiner SOHLE (K4) — nicht mit der
            // rohen Achshöhe: sonst stünden im Gefälle Sohle gegen Rohrmitte.
            const p1 = { x: a.anfang.x, y: Number.isFinite(Number(n.sohlhoeheAnfang)) ? weltAusNn(Number(n.sohlhoeheAnfang), v) : sohleAnAchse(a.anfang.y, a), z: a.anfang.z };
            const p2 = { x: a.ende.x,   y: Number.isFinite(Number(n.sohlhoeheEnde))   ? weltAusNn(Number(n.sohlhoeheEnde), v)   : sohleAnAchse(a.ende.y, a),   z: a.ende.z };
            aus.primitive.push({ art: 'forderung', farbe: farben.warn, linien: [[p1, p2], [a.anfang, p1], [a.ende, p2]] });
            aus.primitive.push({ art: 'marke', punkt: p1, normal: { x: 0, y: 1, z: 0 }, farbe: farben.warn, radius: 0.2 });
            aus.primitive.push({ art: 'marke', punkt: p2, normal: { x: 0, y: 1, z: 0 }, farbe: farben.warn, radius: 0.2 });
            // Die EINE Rechnung (K5), entlang der Achse.
            const g = gefaelle(punkteDerAchse(a), { anfang: p1.y, ende: p2.y });
            if (g.laenge2d > 0.01) {
                const gef = g.promille;
                aus.chips.push({ art: 'forderung', text: `Sohlen ${Number(n.sohlhoeheAnfang).toFixed(2)} → ${Number(n.sohlhoeheEnde).toFixed(2)} m NN · ${gef >= 0 ? '' : '−'}${Math.abs(gef).toFixed(1)} ‰` });
            }
        }
        return;
    }
    if ('deckelhoehe' in n && eigenes && _endlich(s.anker)) {
        const y = weltAusNn(Number(n.deckelhoehe), v);
        const p = { x: s.anker.x, y, z: s.anker.z };
        const von = Number.isFinite(s.oberkante) ? { x: s.anker.x, y: s.oberkante, z: s.anker.z } : s.anker;
        aus.primitive.push({ art: 'forderung', farbe: farben.warn, linien: [[von, p]] });
        aus.primitive.push({ art: 'marke', punkt: p, normal: { x: 0, y: 1, z: 0 }, farbe: farben.warn });
        aus.chips.push({ art: 'forderung', text: `Deckel ${Number(n.deckelhoehe).toFixed(2)} m NN` });
        return;
    }
    if (n.anschlusspunkt) {
        aus.chips.push({ art: 'forderung', text: `Anschluss ${n.anschlusspunkt.ende ?? ''} → E ${n.anschlusspunkt.ost} · N ${n.anschlusspunkt.nord}` });
        return;
    }
    // Alle übrigen Rollen (DN, Profilform, Stärke, Fliessrichtung …): der
    // Umriss des Bauteils gestrichelt — ES ist gemeint, und es bleibt, wie es ist.
    if (eigenes && s.box && _endlich(s.box.min) && _endlich(s.box.max)) {
        aus.primitive.push({ art: 'box', min: s.box.min, max: s.box.max, farbe: farben.warn, opacity: 0.6 });
    }
    const rollen = Object.keys(n).filter(k => n[k] !== null && n[k] !== undefined);
    aus.chips.push({ art: 'forderung', text: rollen.length
        ? `${rollen.map(k => `${_rolleTitel(k)} ${_wert(n[k])}`).join(' · ')} — Forderung`
        : 'Forderung — die Geometrie bleibt beim Planer' });
}

// ── Helfer ────────────────────────────────────────────────────────────────

const ROLLEN_TITEL = {
    profilGroesse: 'DN', profilform: 'Profil', dicke: 'Stärke', deckelhoehe: 'Deckel',
    sohlhoehe: 'Sohle', fliessrichtung: 'Fliessrichtung', sohlhoeheAnfang: 'Sohle A', sohlhoeheEnde: 'Sohle E',
};
function _rolleTitel(k) { return ROLLEN_TITEL[k] ?? k; }
function _wert(w) { return typeof w === 'number' ? (Number.isInteger(w) ? String(w) : w.toFixed(2)) : String(w); }
function _artTitel(art) {
    return { kg: 'Kostengruppe', din277: 'DIN 277', bezeichnung: 'Bezeichnung', massnahme: 'Maßnahme',
             bauform: 'Bauform', pset: 'Merkmale' }[art] ?? art;
}
function _endlich(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function _jetzt() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
