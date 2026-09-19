/**
 * Der Prüflauf über die EIGENEN Bauteile — ohne Engine (Teil XXIV, K6).
 *
 * Bis K6 prüfte nur die Prüfliste der Engine (`engine/Pruefliste.js`), und die
 * eigenen Kanten liefen dort INNERHALB der Schleife über die gelieferten
 * Modelle: ohne geliefertes Modell wurde ein eigenes Netz gar nicht geprüft,
 * mit zweien stand jede eigene Haltung zweimal in der Liste. Und ohne Engine
 * gab es überhaupt keine Markierung — der Abnahmefall „Haltung wird markiert,
 * sobald das Mindestgefälle unterschritten ist" war ohne Oberfläche nicht
 * auslösbar.
 *
 * Hier werden die eigenen Kanten und Knoten EINMAL geprüft, mit denselben
 * Regeln wie alles andere (`Befunde.befundeFuer`, `befundeFuerNetz`, das
 * Regelwerk aus dem Katalog). Zwei Zuführungen, eine Rechnung:
 *   - `pruefeStandAusJournal` liest den Stand aus dem Journal — der Weg ohne
 *     Oberfläche (Kommandos, Skripte, der Store).
 *   - die Engine reicht ihre eigenen Kanten, Knoten und ihr Netz mit dem
 *     Gelieferten herein (`Pruefliste.pruefeAlles`).
 *
 * Die Toleranz des Netzes kommt aus dem Regelwerk (`netzToleranzM`, K8).
 *
 * Dazu die FACHGRENZEN der Rezeptwerte (K10, Fabios E5): ein eigenes Rohr mit
 * DN 5000 wird gebaut, nicht abgelehnt — und bleibt hier markiert, solange
 * der Wert steht, nicht nur in der Momentaufnahme am Eintrag.
 *
 * Rein: kein Vue, kein Store, keine Engine.
 */
import { befundeFuer, befundeFuerForderung, befundeFuerNetz, befundeFuerWerte } from './Befunde.js';
import { rezeptNach } from './Bauteilrezepte.js';
import { achseAusKante, cdeAchsenAus, netzauskunftAus, verdeckteAus } from './CdeAchsen.js';
import { aufgeloestesRegelwerk } from './regeln/Regelwerk.js';

/**
 * Die Befunde der eigenen Kanten und Knoten.
 *
 * @param {object} opts
 * @param {Array} opts.kanten   eigene Kanten (`cdeAchsenAus(...).kanten` oder `engine._cdeKanten`)
 * @param {Array} opts.knoten   eigene Knoten
 * @param {Set}   [opts.verdeckt]
 * @param {object} [opts.netz]  ein Netz, das die eigenen Teile unter `cde:<gid>` führt — die
 *        Engine gibt ihres mit dem Gelieferten; ohne: das Netz der eigenen Teile allein
 * @param {(globalId) => boolean} [opts.umgekehrtFuer]  festgelegte Fliessrichtung
 * @param {(kategorie) => object|null} [opts.typprofilFuer]
 * @param {object} [opts.regelwerk]
 * @param {Map<string, object>} [opts.bauplaene]  eigene Baupläne je GlobalId — für die
 *        Fachgrenzen ihrer Rezeptwerte (K10); ohne: keine Wertebefunde
 * @returns {Array<{localId, globalId, kategorie, name, befunde}>}  nur Bauteile mit Befund
 */
export function pruefeStand({ kanten = [], knoten = [], verdeckt = new Set(), netz = null,
                              umgekehrtFuer = () => false, typprofilFuer = () => null,
                              regelwerk = aufgeloestesRegelwerk(), bauplaene = null,
                              forderungVon = () => null, hoehenversatz = 0 } = {}) {
    const sichtbarK = kanten.filter(k => k?.globalId && !verdeckt.has(k.globalId));
    const sichtbarN = knoten.filter(k => k?.globalId && !verdeckt.has(k.globalId));
    const n = netz ?? netzauskunftAus(sichtbarK, sichtbarN).netz;
    const netzBefunde = befundeFuerNetz(n, regelwerk);
    const out = [];
    for (const k of sichtbarK) {
        const kategorie = k.kategorie ?? 'IFCPIPESEGMENT';
        const befunde = befundeFuer({
            globalId: k.globalId, kategorie,
            achse: achseAusKante(k),
            umgekehrt: umgekehrtFuer(k.globalId),
            typprofil: typprofilFuer(kategorie),
        }, regelwerk).concat(netzBefunde.get(`cde:${k.globalId}`) ?? [])
            // Eine alte Forderung, die kein Werkzeug mehr einlöst (Fahrplan R3).
            .concat(befundeFuerForderung(k, forderungVon(k.globalId), { hoehenversatz }));
        if (befunde.length) out.push({ localId: `cde:${k.globalId}`, globalId: k.globalId, kategorie, name: k.name ?? '', befunde });
    }
    for (const k of sichtbarN) {
        const befunde = netzBefunde.get(`cde:${k.globalId}`) ?? [];
        if (befunde.length) {
            out.push({ localId: `cde:${k.globalId}`, globalId: k.globalId,
                       kategorie: k.kategorie ?? 'IFCDISTRIBUTIONCHAMBERELEMENT', name: k.name ?? '', befunde });
        }
    }
    // Die Rezeptwerte JEDES eigenen Bauteils (nicht nur der Netzteile): ein
    // Pfosten, eine Platte haben keine Achse, aber eine Höhe, eine Dicke.
    const zeile = new Map(out.map(z => [z.globalId, z]));
    for (const [globalId, plan] of bauplaene ?? []) {
        if (!globalId || verdeckt.has(globalId)) continue;
        const befunde = befundeFuerWerte(rezeptNach(plan?.rezept)?.felder, plan?.parameter);
        if (!befunde.length) continue;
        const z = zeile.get(globalId);
        // EIN FELD, EIN BEFUND: beurteilt schon eine Regel diesen Wert (die
        // Nennweite gegen das Typprofil, `dn_ausserhalb`), bleibt es dabei.
        const schon = new Set((z?.befunde ?? []).map(x => x.feld).filter(Boolean));
        const neu = befunde.filter(b => !schon.has(b.feld));
        if (!neu.length) continue;
        if (z) { z.befunde = z.befunde.concat(neu); continue; }
        out.push({ localId: `cde:${globalId}`, globalId, kategorie: plan?.kategorie ?? '', name: plan?.name ?? '', befunde: neu });
    }
    return out;
}

/**
 * Derselbe Lauf aus dem JOURNAL — ohne Engine, ohne Oberfläche.
 *
 * @param {function(string): Map} wirksamerStand  `useAenderungen.wirksamerStand`
 * @param {object} [opts]  wie `pruefeStand` (ohne kanten/knoten/verdeckt)
 */
export function pruefeStandAusJournal(wirksamerStand, opts = {}) {
    if (typeof wirksamerStand !== 'function') return [];
    const erzeugt = wirksamerStand('erzeugt');
    const { kanten, knoten } = cdeAchsenAus(erzeugt);
    const masse = wirksamerStand('parametrik');
    return pruefeStand({
        kanten, knoten, bauplaene: erzeugt,
        verdeckt: verdeckteAus(wirksamerStand('geloescht')),
        // Eine festgelegte Fliessrichtung gilt auch hier — wie in der Prüfliste.
        umgekehrtFuer: (gid) => masse.get(gid)?.fliessrichtung === 'umgekehrt',
        forderungVon: (gid) => masse.get(gid) ?? null,
        ...opts,
    });
}
