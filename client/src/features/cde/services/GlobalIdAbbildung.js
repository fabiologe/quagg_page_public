/**
 * GlobalId-Abbildung — welche Kennung der neuen Revision ist welche der alten?
 * (Stufe 5 des Aushub-Fachmodells, 2026-09-10.) Rein: kein Vue, keine Engine.
 *
 * DER ANLASS: TEST-ERDKOERPER R01 → R02 trug eine NEUE GlobalId für dasselbe
 * Gelände. Das Journal hing an der alten: `geloescht` fand sein Bauteil nicht
 * (beide Gelände sichtbar), jede Erdbau-Ableitung verlor ihre Quelle, und der
 * Export meldete `fehlende_wirte`. Die Bibliothek kann nicht wissen, dass
 * zwei Kennungen dasselbe meinen — der Planer weiss es, und diese Datei macht
 * ihm einen VORSCHLAG. Bestätigt wird in der Tabelle; ohne Bestätigung wird
 * nichts umgehängt.
 *
 * Woher das Journal Name, Kategorie und Prüfmass einer VERSCHWUNDENEN Kennung
 * kennt: aus sich selbst — die Anzeige trägt den Namen des Ur-Geländes, jede
 * Ableitung dessen Prüfmass (`quellBasis.gelaende`). Mehr wird nicht geraten.
 */
import { pruefmassGleich } from './geometrie/ops/Raster.js';
import { rezeptNach } from './Bauteilrezepte.js';

/**
 * Die Kennungen, die das Journal nennt und das geladene Modell nicht kennt —
 * mit dem, was das Journal über sie weiss.
 *
 * @param {Array} konflikte   aus dem Nachspielen (`zustand: 'fehlt'` zählt)
 * @param {Map} erzeugtStand  wirksamer erzeugt-Stand
 * @returns {Array<{gid, arten: string[], name, kategorie, pruefmass}>}
 */
export function fehlendeAusJournal({ konflikte = [], erzeugtStand = new Map() } = {}) {
    const je = new Map();
    for (const k of konflikte ?? []) {
        if (k?.zustand !== 'fehlt' || !k.globalId) continue;
        const f = je.get(k.globalId) ?? { gid: k.globalId, arten: new Set(), name: null, kategorie: null, pruefmass: null };
        f.arten.add(k.art);
        je.set(k.globalId, f);
    }
    for (const [, plan] of erzeugtStand ?? []) {
        const gid = plan?.parameter?.quellen?.gelaende ?? plan?.parameter?.quelle ?? null;
        const f = gid ? je.get(gid) : null;
        if (!f) continue;                                   // nur, was ohnehin fehlt
        f.kategorie ??= 'IFCGEOGRAPHICELEMENT';
        f.pruefmass ??= plan.parameter?.quellBasis?.gelaende ?? null;
        // Den Quellnamen kennt das Rezept, das ihn um sein Suffix erweitert hat.
        const quellname = rezeptNach(plan.rezept)?.quellnameAus?.(plan);
        if (quellname) f.name ??= quellname;
    }
    return [...je.values()].map(f => ({ ...f, arten: [...f.arten] }));
}

/**
 * Ein Vorschlag je fehlender Kennung — oder keiner, wenn es nicht eindeutig ist.
 *
 * Reihenfolge: dieselbe Kennung (dann fehlt sie gar nicht) → EIN Kandidat mit
 * gleichem Namen und gleicher Kategorie → EIN Kandidat gleicher Kategorie mit
 * gleichem Prüfmass. Zwei gleich gute Kandidaten sind kein Vorschlag, sondern
 * eine Frage (`mehrdeutig`) — geraten wird nicht.
 *
 * @returns {Array<{alt, neu: string|null, grund: 'gleich'|'name+kategorie'|'pruefmass'|'mehrdeutig'|'keiner'}>}
 */
export function schlageVor({ fehlend = [], kandidaten = [], vergleiche = pruefmassGleich } = {}) {
    const kat = (x) => String(x ?? '').toUpperCase();
    return (fehlend ?? []).map(f => {
        const gleich = kandidaten.find(k => k.globalId === f.gid);
        if (gleich) return { alt: f.gid, neu: gleich.globalId, grund: 'gleich' };
        const passend = kandidaten.filter(k => !f.kategorie || kat(k.kategorie) === kat(f.kategorie));
        const nachName = f.name ? passend.filter(k => k.name && k.name === f.name) : [];
        if (nachName.length === 1) return { alt: f.gid, neu: nachName[0].globalId, grund: 'name+kategorie' };
        const nachMass = f.pruefmass ? passend.filter(k => k.pruefmass && vergleiche(f.pruefmass, k.pruefmass)) : [];
        if (nachMass.length === 1) return { alt: f.gid, neu: nachMass[0].globalId, grund: 'pruefmass' };
        return { alt: f.gid, neu: null, grund: nachName.length > 1 || nachMass.length > 1 ? 'mehrdeutig' : 'keiner' };
    });
}
