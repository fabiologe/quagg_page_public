/**
 * DIE PALETTE DER WERKZEUGLEISTE OHNE AUSWAHL (Teil XXIX, G3 — Konzept § 5): „Allgemein" (Grundformen mit
 * wählbarer Klasse, ein Bauwerk anlegen), darunter je Gewerk seine Bauteile und Vorlagen, und eine Suche
 * über alles. Ersetzt die flache Liste „Erzeugen" (G0: 18 Einträge) und die Liste „Vorlagen".
 *
 * Woher ein Eintrag sein Gewerk hat, sagt dieselbe Regelkette wie am Bauteil (`gewerkVon`): ein Rezept sein
 * `gewerk` (und `auchIn`), eine Bauwerk-Vorlage ihres, eine Bibliotheks-Vorlage ausdrücklich oder über
 * Klasse und Ausführung ihrer Vorgaben — eine „Steinschüttung" (Platte als IfcCourse/ARMOUR) landet im
 * Wasserbau, ohne dass jemand sie dort einträgt.
 *
 * Rein: kein Store, keine Engine, kein Vue.
 */
import { GEWERKE } from './katalog/Gewerke.js';
import { gewerkVon, rezeptNach } from './Bauteilrezepte.js';
import { vorlageNach } from './rezept/Bauwerksvorlagen.js';

/** Das Gewerk einer Bibliotheks-Vorlage — ausdrücklich, sonst die Regel aus Rezept, Klasse und Ausführung. */
export function gewerkDerVorlage(v) {
    if (v?.gewerk) return v.gewerk;
    return gewerkVon({ rezept: v?.rezept, kategorie: v?.vorgaben?.kategorie ?? null, parameter: v?.vorgaben ?? {} }).gewerk;
}

const _eintragWerkzeug = (b, gewerk = null) => ({ art: 'werkzeug', id: b.id, titel: b.titel.replace(/ zeichnen$/, ''), icon: b.icon, gewerk });
const _eintragVorlage = (v) => ({ art: 'vorlage', id: v.id, titel: v.name, rezept: v.rezept, vorlage: v, herkunft: v.herkunft ?? 'eingebaut' });

/**
 * @param {object[]} katalog   die Werkzeuge (`werkzeugKatalog()`)
 * @param {object[]} vorlagen  die Bibliothek (`ladeVorlagen`)
 * @returns {{ allgemein, gewerke: Array<{id, titel, bauteile, vorlagen}> }} — ein Eintrag aus einem Reiter
 *          trägt `gewerk`, wenn das Zeichnen es setzen soll (nur, wo es von der Regel abweicht: `auchIn`)
 */
export function palette({ katalog = [], vorlagen = [] } = {}) {
    const zeichnen = katalog.filter(b => b.gruppe === 'erzeugen' && b.ausRezept);
    const allgemein = [
        ...zeichnen.filter(b => rezeptNach(b.ausRezept)?.allgemein).map(b => _eintragWerkzeug(b)),
        ...katalog.filter(b => b.id === 'bauwerk-anlegen').map(b => _eintragWerkzeug(b)),
    ];
    const gewerke = Object.entries(GEWERKE).map(([id, g]) => ({
        id, titel: g.titel,
        bauteile: [
            ...zeichnen.filter(b => rezeptNach(b.ausRezept)?.gewerk === id).map(b => _eintragWerkzeug(b)),
            ...zeichnen.filter(b => (rezeptNach(b.ausRezept)?.auchIn ?? []).includes(id)).map(b => _eintragWerkzeug(b, id)),
        ],
        vorlagen: [
            ...katalog.filter(b => b.ausVorlage && vorlageNach(b.ausVorlage)?.gewerk === id).map(b => _eintragWerkzeug(b)),
            ...vorlagen.filter(v => gewerkDerVorlage(v) === id).map(_eintragVorlage),
        ],
    }));
    return { allgemein, gewerke };
}

/** Die Suche über alles: Titel enthält den Text (ohne Gross/Klein), jeder Eintrag einmal. */
export function suchePalette(p, text) {
    const t = String(text ?? '').trim().toLowerCase();
    if (!t) return [];
    const alle = [...p.allgemein, ...p.gewerke.flatMap(g => [...g.bauteile, ...g.vorlagen])];
    const gesehen = new Set();
    return alle.filter(e => e.titel.toLowerCase().includes(t) && !gesehen.has(`${e.art}:${e.id}:${e.gewerk ?? ''}`)
        && gesehen.add(`${e.art}:${e.id}:${e.gewerk ?? ''}`));
}
