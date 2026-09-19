/**
 * Das Subjekt eines EIGENEN Bauteils — aus dem Stand, ohne Viewer (Teil XXIV, K3).
 *
 * Ein Werkzeug liest sein Bauteil als Objekt: Stand, Hülle, Lage, Achse,
 * Strang, Anschlüsse. Bis K3 trug der Viewer es zusammen, aus der Engine —
 * und für ein EIGENES Bauteil kam dort weniger an, als im Journal steht.
 * Gemessen im Browser (2026-09-18, 42069, zwei eigene Schächte und eine
 * eigene Haltung per Kommando): die Haltung hatte weder Achse noch Strang
 * (die Engine führt sie unter `cde:<gid>`, der Viewer fragte unter der
 * Modellkennung), und kein eigenes Bauteil hatte einen Versatz (die Engine
 * setzt ihn nur für gelieferte Modelle) — Verschieben per Formular tat an
 * ihnen nichts.
 *
 * Für ein eigenes Bauteil steht alles im Journal: der Bauplan, seine
 * Netzprojektion (`CdeAchsen`), seine Geometrie (das Rezept baut sie rein).
 * Diese Funktion macht daraus das Subjekt — EIN Ort für den Viewer und für
 * den Kommandoweg ohne Oberfläche. Der Viewer reicht nur das Netz über ALLE
 * Modelle herein (`engine.netzAuskunft()`), ohne Oberfläche gilt das Netz der
 * eigenen Bauteile.
 *
 * Nicht hier: was nur die Engine weiss und kein eigenes Bauteil beschreibt
 * (Geländekandidaten, Prüfmass einer Quelle, Beziehungsindex, Vorlagen aus
 * der Bibliothek). Die Ableitungen (Erdbau, Graben, Grube) bauen ihre
 * Geometrie erst im Ableitungslauf — ihre Hülle bleibt beim Viewer.
 *
 * Rein: kein Vue, kein Store, keine Engine.
 */
import { istAbleitung, rezeptNach, teileVon } from '../Bauteilrezepte.js';
import { eigeneNetzauskunft, verdeckteAus } from '../CdeAchsen.js';
import { anschluesseMitAchsen, strangMitAchsen } from '../Netztopologie.js';
import { huelleAusGrenzen } from '../geometrie/Huelle.js';
import { rahmenOhneBezug } from './Kommando.js';

/**
 * Was für dieses Bauteil GERADE gilt — aus dem Journal, nicht aus der Datei.
 *
 * Die Vorbelegungen im Katalog lesen `el.stand.kg`, `el.stand.din277`,
 * `el.stand.profilGroesse` und `el.stand.dicke`. Vor Stufe 9 erzeugte keine
 * Stelle einen `stand`: das Formular zeigte nie den geltenden Wert, und die
 * Setzer ohne `leerErlaubt` standen ab dem Aufschlagen auf „fehlt".
 *
 * `parametrik` faltet je ROLLE (Stufe 14.2) — der Wert ist eine Karte und
 * lässt sich unverändert übernehmen. Die Geschwister-Teile einer Ableitung
 * (Teil XIV) kommen als `teile` dazu: die Folgeformung schreibt sie unter
 * denselben GlobalIds.
 *
 * Bis K3 lebte das als `useBearbeitung._standVon` — jetzt rufen Store und
 * `subjektAusStand` dieselbe Funktion.
 *
 * @param {string} globalId
 * @param {function(string): Map} wirksamerStand  Art → GlobalId → Wert (`useAenderungen.wirksamerStand`)
 */
export function standVon(globalId, wirksamerStand) {
    if (!globalId || typeof wirksamerStand !== 'function') return {};
    const erzeugt = wirksamerStand('erzeugt');
    const stand = {
        kg:     wirksamerStand('kg').get(globalId) ?? null,
        din277: wirksamerStand('din277').get(globalId) ?? null,
        // Der wirksame BAUPLAN eines erzeugten Bauteils (Stufe 15).
        bauplan: erzeugt.get(globalId) ?? null,
        // Die AUSLEGUNG dieses einen Bauteils — sie schlägt die Regel, weil
        // sie spezifischer ist, und ist die Vorbelegung von `bauform-auslegen`.
        bauformAusnahme: wirksamerStand('bauform').get(globalId) ?? null,
        // Die Merkmalssätze (O6) — „Merkmalssatz setzen" schreibt den vollen Stand fort.
        pset: wirksamerStand('pset').get(globalId) ?? null,
    };
    if (stand.bauplan?.ableitung) stand.teile = teileVon(erzeugt, stand.bauplan.ableitung);
    const masse = wirksamerStand('parametrik').get(globalId);
    return masse && typeof masse === 'object' ? { ...stand, ...masse } : stand;
}

/**
 * Die Hülle aus der REZEPTGEOMETRIE — dieselbe Geometrie, die der Autor in
 * den Raum stellt (`baueAusBauplan` → `rezept.baue`), dieselbe Formel wie für
 * die Box aus dem Raum. Ableitungen und Rezepte mit Quellraster bauen nicht
 * synchron: null, ihre Hülle bleibt beim Viewer.
 */
function _huelleAusRezept(plan) {
    const r = rezeptNach(plan?.rezept);
    if (typeof r?.baue !== 'function' || r.braucht || istAbleitung(r)) return null;
    let g = null;
    try {
        g = r.baue(plan.parameter ?? {});
        g?.computeBoundingBox?.();
        const bb = g?.boundingBox;
        return bb ? huelleAusGrenzen(bb.min, bb.max) : null;
    } catch {
        return null;
    } finally {
        g?.dispose?.();
    }
}

/**
 * Das Subjekt eines eigenen Bauteils, wie ein Werkzeug es liest.
 *
 * @param {string} globalId
 * @param {object} opts
 * @param {function(string): Map} opts.wirksamerStand  wie bei `standVon`
 * @param {object} [opts.rahmen]  Welt ↔ Projektkoordinaten (`Kommando.rahmenAusBezug`)
 * @param {{netz, achseVon, knoten}} [opts.netz]  das Netz über alle Modelle
 *        (`engine.netzAuskunft()`); ohne: das Netz der eigenen Bauteile
 * @returns {object|null}  null, wenn die GlobalId kein eigenes, sichtbares Bauteil ist
 */
export function subjektAusStand(globalId, { wirksamerStand, rahmen = rahmenOhneBezug(), netz = null } = {}) {
    if (!globalId || typeof wirksamerStand !== 'function') return null;
    const erzeugt = wirksamerStand('erzeugt');
    const plan = erzeugt.get(globalId);
    if (!plan?.rezept) return null;
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    // Ein verdecktes Bauteil gibt es für ein Werkzeug nicht (E8).
    if (verdeckt.has(globalId)) return null;

    const kategorie = String(plan.kategorie ?? rezeptNach(plan.rezept)?.kategorieVorgabe ?? '').toUpperCase();
    const s = {
        globalId,
        name: plan.name ?? '',
        // Beide Namen: der Viewer liest die Kategorie als `type`, die
        // Typprofile und Regeln fragen `category ?? type`.
        category: kategorie,
        type: kategorie,
        hoehenversatz: Number.isFinite(rahmen?.hoehenversatz) ? rahmen.hoehenversatz : 0,
        stand: standVon(globalId, wirksamerStand),
    };

    // HÜLLE UND LAGE. Der Versatz ist die Umkehrung des Rahmens am Ursprung —
    // die Werkzeuge rechnen `welt = ost − versatz.x`, `welt.z = −nord − versatz.z`.
    // Gilt eine Kartenumrechnung, ist diese Formel nicht umkehrbar; das sagt
    // `lageUmkehrbar`, und die Werkzeuge verweigern dann (wie bei Geliefertem).
    const h = _huelleAusRezept(plan);
    if (h) {
        const null0 = rahmen.ausProjekt({ ost: 0, nord: 0, hoehe: 0 });
        Object.assign(s, {
            anker: h.anker, bezugshoehe: h.unterkante, oberkante: h.oberkante, box: h.box,
            lage: rahmen.nachProjekt(h.anker),
            versatz: { x: 0 - null0.x, y: 0 - null0.y, z: 0 - null0.z },   // 0 − v: keine −0
            lageUmkehrbar: !rahmen.mapAngewandt,
        });
    }

    // DAS NETZ: eine Kante bekommt Achse, Strang und die Knoten (für „An
    // Schacht anschliessen"), ein Knoten seine Anschlüsse — dieselbe
    // Unterscheidung wie im Viewer, dieselben Funktionen wie in der Engine.
    const n = netz ?? eigeneNetzauskunft(erzeugt, { verdeckt });
    const id = `cde:${globalId}`;
    const achse = n.netz?.kanten?.has(id) ? n.achseVon(id) : null;
    if (achse) {
        s.achse = achse;
        s.strang = strangMitAchsen(n.netz, id, n.achseVon);
        s.knotenImNetz = (n.knoten ?? []).map(k => ({ globalId: k.globalId, punkt: { ...k.punkt }, name: k.name ?? '',
                                                     ...(k.hoehenbezug ? { hoehenbezug: k.hoehenbezug } : {}),
                                                     ...(k.hoeheFest ? { hoeheFest: true } : {}) }));
    } else {
        const anschluesse = anschluesseMitAchsen(n.netz, id, n.achseVon);
        if (anschluesse.length) s.anschluesse = anschluesse;
    }
    return s;
}

/**
 * Das Subjekt eines GELIEFERTEN Glieds im Strang (Teil XXIV, O6) — was der
 * Längsschnitt von einem Nachbarn des gewählten Bauteils kennt: seine Achse
 * (die Engine bringt sie mit dem Strang am gewählten Bauteil mit,
 * `Netztopologie.strangMitAchsen`), seinen Stand aus dem Journal, den
 * Höhenversatz. Dieselbe Achse, aus der der Längsschnitt seine Sohle zeigt —
 * das Werkzeug liest also, was im Bild steht.
 *
 * Nicht mehr: keine Hülle, kein Anker. Ein Werkzeug, das an einem Glied mehr
 * braucht, bekommt es hier nicht — und schreibt dann nichts.
 *
 * @param {object} glied  ein Eintrag aus `strangMitAchsen`
 * @param {object} opts   { wirksamerStand, hoehenversatz }
 */
export function subjektAusStrang(glied, { wirksamerStand, hoehenversatz = 0 } = {}) {
    if (!glied?.globalId || !glied.anfang || !glied.ende) return null;
    const { globalId, name = '' } = glied;
    return {
        globalId, name, hoehenversatz,
        achse: {
            globalId, name, anfang: glied.anfang, ende: glied.ende, laenge: glied.laenge ?? null, dn: glied.dn ?? null,
            polyline: glied.punkte ?? null,
            ...(glied.achsbezug ? { achsbezug: glied.achsbezug } : {}),
            ...(Number.isFinite(glied.sohlabstand) ? { sohlabstand: glied.sohlabstand } : {}),
        },
        stand: standVon(globalId, wirksamerStand),
    };
}

/**
 * Das Subjekt eines Bauteils, von dem der Aufrufer nur die KENNUNG kennt
 * (Teil XXIV, O6) — eine Zeile in einer Liste (Kostengruppen, Flächen), das
 * Bauteil im Merkmalsfenster. Für Merkmale genügt das: Kennung und Stand.
 * Ein Werkzeug, das mehr braucht (Achse, Hülle), schreibt damit nichts.
 */
export function subjektAusKennung(globalId, { wirksamerStand } = {}) {
    if (!globalId) return null;
    return { globalId, stand: standVon(globalId, wirksamerStand) };
}
