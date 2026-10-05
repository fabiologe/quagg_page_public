/**
 * Zeichenhilfe — präzise zeichnen ohne Formular (Teil XXX, B5).
 *
 * Drei Dinge, die ein CAD-Planer erwartet und die beim Zeichnen fehlten
 * (Messlauf vorher: ein Klick 6 px neben das Ende einer Wand landete 469 mm
 * daneben; keine Länge tippbar; eine „waagerechte" Wand wich 34–42° von Ost
 * ab):
 *
 *   - FANG auf eigene Bauteile: ihre Punkte als Kandidaten für `fangePunkt`
 *     (`Fangpunkte.js` war gebaut, hatte aber keinen Aufrufer),
 *   - ORTHO: rechte Winkel zur vorigen Strecke, die erste in Ost/Nord,
 *   - LÄNGE und WINKEL tippen: der nächste Punkt in fester Entfernung.
 *
 * Rein: kein three, kein DOM, kein Vue. Welt-Koordinaten: x = Ost, Nord = −z.
 * Der WINKEL zählt wie im Lageplan: 0° = Ost, 90° = Nord (gegen den
 * Uhrzeigersinn, von oben gesehen).
 */
import { fangePunkt, fangkandidaten } from './Fangpunkte.js';

const _endlich = (v) => Number.isFinite(v);
const _p = (q) => (Array.isArray(q) ? { x: Number(q[0]), y: Number(q[1]), z: Number(q[2]) } : q);

/**
 * Die Fangkandidaten aus den EIGENEN Bauplänen: Knoten (Netzrolle Knoten,
 * erster Punkt), Achsenden und Stützpunkte von Kanten, die Punkte aller
 * übrigen (Wand, Platte, Pfosten). Ableitungen (Erdbau, Schichten) haben
 * keine Punkte eines Planers — ihre Ecken sind Rasterknoten.
 *
 * @param {Map<string, object>} stand  globalId → Bauplan (wirksamer Stand „erzeugt")
 * @param {object} opt
 * @param {Set<string>} [opt.verdeckt]  verborgene Kennungen (gelöscht)
 * @param {(id) => object|null} opt.rezeptNach
 * @param {(plan) => boolean} [opt.ausnehmen]  Bauwerke, Anzeigeformen …
 */
export function eigeneFangkandidaten(stand, { verdeckt = new Set(), rezeptNach, ausnehmen = null } = {}) {
    const knoten = [], achsen = [], stuetzpunkte = [];
    for (const [gid, plan] of stand ?? []) {
        if (!plan || verdeckt.has(gid) || ausnehmen?.(plan)) continue;
        const rz = rezeptNach?.(plan.rezept) ?? null;
        if (!rz || typeof rz.leite === 'function') continue;               // Ableitung: keine Planerpunkte
        const punkte = (plan.parameter?.punkte ?? []).map(_p)
            .filter(q => q && _endlich(q.x) && _endlich(q.y) && _endlich(q.z));
        if (!punkte.length) continue;
        const name = plan.name || rz.titel || 'Bauteil';
        if (rz.netzrolle === 'knoten') { knoten.push({ ...punkte[0], name, globalId: gid }); continue; }
        if (rz.netzrolle === 'kante' && punkte.length >= 2) {
            achsen.push({ punkte, name, globalId: gid });
            for (const q of punkte.slice(1, -1)) stuetzpunkte.push({ ...q, name: `${name} · Stützpunkt`, globalId: gid });
            continue;
        }
        punkte.forEach((q, i) => stuetzpunkte.push({ ...q, name: punkte.length > 1 ? `${name} · Punkt ${i + 1}` : name, globalId: gid }));
    }
    return fangkandidaten({ knoten, achsen, stuetzpunkte });
}

/**
 * Welcher Fang gilt beim Zeichnen? Die eigenen Punkte und der Fang der Bibliothek (Ecke/Kante an Geliefertem) treten
 * gegeneinander an — der nähere gewinnt, bei Gleichstand der fachliche (`fangePunkt`). Bei RECHTEN WINKELN zählt eine
 * Kante nicht: sie legt keinen Punkt fest, und auf einem Gelände-TIN liegt fast jeder Ort 14 px neben einer
 * Dreieckskante — Ortho griffe nie (Messlauf B5: 22,45° statt 0°).
 * @returns {{art, name, punkt, globalId}|null}
 */
export function zeichenfang({ punkt, bibliothek = null, eigene = [], projiziere, ortho = false } = {}) {
    const fremd = bibliothek && !(ortho && bibliothek.art === 'kante')
        ? [{ punkt: bibliothek.punkt, art: bibliothek.art, name: bibliothek.name }] : [];
    const { fang } = fangePunkt({ punkt, kandidaten: [...eigene, ...fremd], projiziere });
    return fang ? { art: fang.art, name: fang.name, punkt: fang.punkt, globalId: fang.globalId ?? null } : null;
}

/** Länge im Grundriss und Winkel (Grad, 0 = Ost, 90 = Nord) der Strecke von `von` nach `nach`. */
export function streckeMass(von, nach) {
    if (!von || !nach || ![von.x, von.z, nach.x, nach.z].every(_endlich)) return null;
    const dx = nach.x - von.x, nord = -(nach.z - von.z);
    const laenge = Math.hypot(dx, nord);
    let winkel = Math.atan2(nord, dx) * 180 / Math.PI;
    if (winkel < 0) winkel += 360;
    return { laenge, winkel: laenge > 0 ? winkel : null };
}

/**
 * ORTHO: der Punkt auf die nächste rechtwinklige Richtung gezogen — zur
 * vorigen Strecke, oder (bei der ersten Strecke) zu Ost/Nord. Die Länge ist
 * die Projektion des Zeigers auf diese Richtung (wie im CAD), die Höhe bleibt.
 *
 * @param {{x,y?,z}} p          der rohe Punkt
 * @param {{x,y?,z}} letzter    der zuletzt gesetzte Punkt
 * @param {{x,y?,z}|null} [vorletzter]
 */
export function orthoPunkt(p, letzter, vorletzter = null) {
    if (!p || !letzter || ![p.x, p.z, letzter.x, letzter.z].every(_endlich)) return p;
    const basis = vorletzter && [vorletzter.x, vorletzter.z].every(_endlich)
        ? streckeMass(vorletzter, letzter)?.winkel : null;
    const w0 = _endlich(basis) ? basis : 0;
    const m = streckeMass(letzter, p);
    if (!m || !(m.laenge > 0)) return p;
    const relativ = m.winkel - w0;
    const winkel = w0 + Math.round(relativ / 90) * 90;
    const rad = winkel * Math.PI / 180;
    const ox = Math.cos(rad), on = Math.sin(rad);
    const dx = p.x - letzter.x, nord = -(p.z - letzter.z);
    const l = dx * ox + nord * on;
    return { ...p, x: letzter.x + l * ox, z: letzter.z - l * on };
}

/**
 * Der nächste Punkt aus getippter Länge und Winkel. Ohne Winkel gilt die
 * Richtung `richtung` (Grad) — die Zeigerrichtung oder die der vorigen
 * Strecke. Die Höhe übernimmt der Punkt vom letzten (auf Gelände rechnet der
 * Motor sie danach neu).
 * @returns {{x,y,z}|null}
 */
export function punktNachMass(letzter, { laenge, winkel = null, richtung = 0 } = {}) {
    if (!letzter || ![letzter.x, letzter.z].every(_endlich) || !(laenge > 0)) return null;
    const w = _endlich(winkel) ? winkel : (_endlich(richtung) ? richtung : 0);
    const rad = w * Math.PI / 180;
    return {
        x: letzter.x + laenge * Math.cos(rad),
        ...(_endlich(letzter.y) ? { y: letzter.y } : {}),
        z: letzter.z - laenge * Math.sin(rad),
    };
}

/** Eine getippte Zahl lesen: „5", „5,25", „-12.5" — sonst null. */
export function liesZahl(text) {
    const t = String(text ?? '').trim().replace(',', '.');
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

/** Was eine Taste zur getippten Zahl beiträgt — nur Ziffern, ein Komma/Punkt, ein führendes Minus. */
export function tippeInZahl(text, taste) {
    const t = String(text ?? '');
    if (/^\d$/.test(taste)) return t + taste;
    if ((taste === ',' || taste === '.') && !/[.,]/.test(t)) return t + ',';
    if (taste === '-' && !t) return '-';
    return null;
}

/** Zahl für Pille und Formular: „12,34". */
export function zahlText(v, stellen = 2) {
    return _endlich(v) ? v.toFixed(stellen).replace('.', ',') : '';
}

