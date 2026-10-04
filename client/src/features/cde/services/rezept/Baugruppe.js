/**
 * DIE BAUGRUPPE (Teil XXIX, G5 — Konzept § 6, Fabios E45): ein fertiges Bauwerk als Schnappschuss in der Bibliothek.
 *
 * Die dritte Sorte Vorlage neben der Bauteil-Vorlage (ein Rezept + Werte) und der Bauwerk-Vorlage (Rollen aus Werten,
 * Code): Teile mit ihren Parametern, die Punkte RELATIV zu einem Bezugspunkt, ohne Formeln. „Mein Drosselbauwerk",
 * „unser Durchlass DN 800" — gesichert mit einem Knopf am Bauwerk, gesetzt mit einem Punkt und einer Drehung, ein
 * Kommando. Was mit Massen wächst (Becken), bleibt parametrisch (`Bauwerksvorlagen.js`).
 *
 * Bezugspunkt: „Mitte unten" — die Mitte des Grundrisses aller Punkte, die tiefste Höhe. Wer setzt, tippt diese Stelle.
 * Verweise unter den Teilen (`hoeheVon.bauteil`, `anschluss.anfang|ende`) werden ROLLEN; ein Verweis nach draussen
 * entfällt und wird genannt. Nicht mit kommen, mit Grund: Ableitungen (sie hängen an ihrer Quelle, etwa dem Gelände) und
 * Bauwerke im Bauwerk.
 *
 * Rein: kein Store, keine Engine. Das Journal kommt als `bauplaene` (Map GlobalId → Bauplan).
 */
import { istBehaelter, rezeptNach } from '../Bauteilrezepte.js';
import { gewerkVon } from '../Bauteilrezepte.js';

/** Felder, die eine Kennung tragen — und wie man sie liest und schreibt. */
const VERWEISE = Object.freeze([
    { feld: 'hoeheVon', lies: (p) => p?.hoeheVon?.bauteil, schreib: (p, v) => ({ ...p, hoeheVon: { ...p.hoeheVon, bauteil: v } }),
      ohne: (p) => { const { hoeheVon: _w, ...r } = p; return r; } },
    { feld: 'anschluss.anfang', lies: (p) => p?.anschluss?.anfang, schreib: (p, v) => ({ ...p, anschluss: { ...p.anschluss, anfang: v } }),
      ohne: (p) => { const { anfang: _w, ...a } = p.anschluss ?? {}; return Object.keys(a).length ? { ...p, anschluss: a } : (({ anschluss: _x, ...r }) => r)(p); } },
    { feld: 'anschluss.ende', lies: (p) => p?.anschluss?.ende, schreib: (p, v) => ({ ...p, anschluss: { ...p.anschluss, ende: v } }),
      ohne: (p) => { const { ende: _w, ...a } = p.anschluss ?? {}; return Object.keys(a).length ? { ...p, anschluss: a } : (({ anschluss: _x, ...r }) => r)(p); } },
]);
export const BAUGRUPPE_VERWEISE = Object.freeze(VERWEISE.map(v => v.feld));

const _slug = (s) => String(s ?? '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'teil';

/**
 * Ein Bauwerk → Baugruppe.
 * @returns {{baugruppe: object|null, ausgelassen: Array<{globalId, name, grund}>, grund: string|null}}
 */
export function baugruppeAus(bauwerkGid, { bauplaene, verdeckt = new Set(), name = null } = {}) {
    const bauwerk = bauplaene?.get?.(bauwerkGid);
    if (!bauwerk || !istBehaelter(bauwerk)) return { baugruppe: null, ausgelassen: [], grund: 'Kein Bauwerk.' };
    const ausgelassen = [];
    const kinder = [...bauplaene].filter(([gid, p]) => !verdeckt.has(gid) && p?.parameter?.teilVon === bauwerkGid);
    const teile = [];
    for (const [gid, p] of kinder) {
        const rz = rezeptNach(p.rezept);
        const nm = p.parameter?.name || p.name || gid;
        if (!rz) { ausgelassen.push({ globalId: gid, name: nm, grund: `Rezept „${p.rezept}" unbekannt` }); continue; }
        if (typeof rz.leite === 'function') { ausgelassen.push({ globalId: gid, name: nm, grund: 'eine Ableitung — sie hängt an ihrer Quelle' }); continue; }
        if (istBehaelter(p)) { ausgelassen.push({ globalId: gid, name: nm, grund: 'ein Bauwerk im Bauwerk — kommt nicht mit' }); continue; }
        teile.push({ gid, plan: p });
    }
    if (!teile.length) return { baugruppe: null, ausgelassen, grund: 'Das Bauwerk hat keine Teile, die mitkommen können.' };

    // Rollen: aus den Namen, eindeutig.
    const rolleVon = new Map();
    const vergeben = new Set();
    for (const { gid, plan } of teile) {
        let r = _slug(plan.parameter?.name || plan.name);
        for (let i = 2; vergeben.has(r); i++) r = `${_slug(plan.parameter?.name || plan.name)}-${i}`;
        vergeben.add(r); rolleVon.set(gid, r);
    }
    // Bezugspunkt „Mitte unten".
    const alle = teile.flatMap(({ plan }) => (Array.isArray(plan.parameter?.punkte) ? plan.parameter.punkte : []))
        .filter(q => Array.isArray(q) && q.length >= 3 && q.every(Number.isFinite));
    if (!alle.length) return { baugruppe: null, ausgelassen, grund: 'Die Teile haben keine Punkte.' };
    const xs = alle.map(q => q[0]), zs = alle.map(q => q[2]);
    const bezug = [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...alle.map(q => q[1])), (Math.min(...zs) + Math.max(...zs)) / 2];

    const gewerkZahl = new Map();
    const aus = teile.map(({ gid, plan }) => {
        let parameter = { ...plan.parameter };
        delete parameter.teilVon;
        delete parameter.bauwerksvorlage;
        if (Array.isArray(parameter.punkte)) parameter.punkte = parameter.punkte.map(q => [q[0] - bezug[0], q[1] - bezug[1], q[2] - bezug[2]]);
        for (const v of VERWEISE) {
            const ziel = v.lies(parameter);
            if (ziel === undefined || ziel === null) continue;
            if (rolleVon.has(ziel)) parameter = v.schreib(parameter, { rolle: rolleVon.get(ziel) });
            else {
                parameter = v.ohne(parameter);
                ausgelassen.push({ globalId: gid, name: plan.parameter?.name || plan.name || gid,
                                   grund: `Verweis ${v.feld} nach draussen (${ziel}) entfällt` });
            }
        }
        const g = gewerkVon(plan).gewerk;
        if (g) gewerkZahl.set(g, (gewerkZahl.get(g) ?? 0) + 1);
        return { rolle: rolleVon.get(gid), rezept: plan.rezept, kategorie: plan.kategorie ?? null, name: plan.name ?? '', parameter };
    });
    const gewerk = [...gewerkZahl].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const { name: _n, teilVon: _t, bauwerksvorlage: _bv, vorlage: _v, ...bauwerkArt } = bauwerk.parameter ?? {};
    return {
        baugruppe: {
            name: String(name ?? bauwerk.name ?? 'Baugruppe').trim() || 'Baugruppe',
            art: 'baugruppe', rezept: rezeptNach(bauwerk.rezept)?.id ?? bauwerk.rezept, werkzeug: 'baugruppe-setzen',
            ...(gewerk ? { gewerk } : {}),
            bauwerk: { ...bauwerkArt },
            bezug: 'mitte-unten',
            vorgaben: {},
            teile: aus,
        },
        ausgelassen, grund: null,
    };
}

/**
 * Die Teile einer Baugruppe als Rollen einer Vorlage — so setzt sie dieselbe Rechnung wie eine Bauwerk-Vorlage
 * (`vorlageTeile`: Rahmen mit Ort und Drehung). Die Höhen sind relativ zum Bezugspunkt, der Rahmen trägt die Höhe.
 */
export function alsVorlage(baugruppe) {
    return {
        id: baugruppe.id, titel: baugruppe.name, felder: [],
        rollen: (_w, ort) => (baugruppe.teile ?? []).map(t => ({
            ...t,
            parameter: Array.isArray(t.parameter?.punkte)
                ? { ...t.parameter, punkte: t.parameter.punkte.map(([dx, dy, dz]) => [dx, ort.y + dy, dz]) } : { ...t.parameter },
        })),
    };
}

/** Rollen-Verweise eines Teils in Kennungen auflösen (nach dem Setzen). */
export function verweiseAufloesen(parameter, gidVonRolle) {
    let p = parameter;
    for (const v of VERWEISE) {
        const ziel = v.lies(p);
        if (ziel && typeof ziel === 'object' && ziel.rolle) {
            const gid = gidVonRolle(ziel.rolle);
            p = gid ? v.schreib(p, gid) : v.ohne(p);
        }
    }
    return p;
}

/** Prüft eine Baugruppe aus der Bibliothek — nur Daten, nur bekannte Rezepte, nur Verweise auf eigene Rollen. */
export function pruefeBaugruppe(v, fehler) {
    const teile = v?.teile;
    if (!Array.isArray(teile) || !teile.length) { fehler.push('Eine Baugruppe braucht Teile.'); return; }
    const rollen = new Set();
    for (const t of teile) {
        if (!t || typeof t !== 'object') { fehler.push('Ein Teil ist kein Objekt.'); continue; }
        if (!/^[\w-]+$/.test(String(t.rolle ?? ''))) fehler.push(`Teil ohne gültige Rolle: ${JSON.stringify(t.rolle)}.`);
        if (rollen.has(t.rolle)) fehler.push(`Rolle „${t.rolle}" steht doppelt.`);
        rollen.add(t.rolle);
        const rz = rezeptNach(t.rezept);
        if (!rz) fehler.push(`Teil „${t.rolle}": unbekanntes Rezept „${t.rezept}".`);
        else if (typeof rz.leite === 'function' || rz.behaelter) fehler.push(`Teil „${t.rolle}": „${t.rezept}" kann kein Teil einer Baugruppe sein.`);
        if (!t.parameter || typeof t.parameter !== 'object' || Array.isArray(t.parameter)) fehler.push(`Teil „${t.rolle}": Parameter fehlen.`);
        else if (t.parameter.punkte !== undefined && !(Array.isArray(t.parameter.punkte)
            && t.parameter.punkte.every(q => Array.isArray(q) && q.length === 3 && q.every(Number.isFinite)))) {
            fehler.push(`Teil „${t.rolle}": Punkte müssen [x, y, z] sein.`);
        }
        if (/function|=>/.test(JSON.stringify(t.parameter ?? {}))) fehler.push(`Teil „${t.rolle}": nur Daten, kein Code.`);
    }
    for (const t of teile) {
        for (const v of VERWEISE) {
            const ziel = v.lies(t?.parameter);
            if (ziel === undefined || ziel === null) continue;
            if (!(ziel && typeof ziel === 'object' && rollen.has(ziel.rolle))) fehler.push(`Teil „${t.rolle}": ${v.feld} zeigt auf keine Rolle der Baugruppe.`);
        }
    }
}
