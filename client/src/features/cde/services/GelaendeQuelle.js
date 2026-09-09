/**
 * Welche Elemente SIND das Gelände? (Teil XIV, G3 · erweitert 2026-09-03)
 *
 * Eine Frage, die bis hierher drei Stellen verschieden beantworteten: der
 * Längsschnitt über die Terrain-Kategorien, das Gelände-Rezept über die
 * GlobalId der Quelle, die Prüfliste gar nicht. Seit der Ableitung gibt es
 * aber Dinge, die die Kategorienliste nicht unterscheiden kann:
 *
 *   - das UR-GELÄNDE ist nach der Formung VERDECKT — seine Kategorie sagt
 *     weiter „Gelände", und weil `makeHeightSampler` den HÖCHSTEN Treffer
 *     nimmt, gewänne das alte Gelände über dem neuen Graben, still;
 *   - der AUSHUBKÖRPER ist ein IfcEarthworksCut — seine Oberseite ist exakt
 *     das alte Gelände; als „Gelände" gesampelt füllte er den Graben wieder;
 *   - das NEUE DGM liegt im CDE-Modell und heisst IfcGeographicElement wie
 *     das alte.
 *
 * DIE KATEGORIENLISTE WAR EINE ZWEITE ANTWORT — und sie widersprach der
 * ersten (2026-09-03). `IFCEARTHWORKSFILL` stand darin, ist im Typprofil aber
 * als `koerper` deklariert: der AUFTRAGSkörper zwischen Gelände und Planum,
 * ausdrücklich kein Gelände. Umgekehrt konnte ein `IFCBUILDINGELEMENTPROXY`,
 * den eine Bauformregel zum `hoehenfeld` erklärt hatte, hier nie ankommen.
 * Also: **die BAUFORM ist die Antwort.** Die Kategorienliste bleibt als
 * VORBELEGUNG — sie sagt, wo man überhaupt nachschauen muss, nicht was gilt.
 *
 * Die DEKLARATION zuerst — synchron, geometriefrei (`deklarierteBauform`).
 * Seit dem 2026-09-07 gibt es aber eine zweite Antwort: hat niemand etwas
 * erklärt (Sammeltyp wie `IfcCivilElement`), sagt `istGelaende` NULL statt
 * false, und dann wird die FORMSIGNATUR gefragt (`bauformAusGeometrie`,
 * asynchron, nur für die wenigen Kandidaten). Vorher galt null als „kein
 * Gelände" — und Fabios DGM fehlte dem Sampler, obwohl es in der Vorbelegung
 * stand.
 *
 * Rein — die Modelle und die Entscheidung kommen herein, nichts wird gehalten.
 */
import { basisModelId } from './DeltaBoxen.js';
import { baueGlobalIdKarte } from './GlobalIdKarte.js';
import { mitUntertypen } from './IfcQuelle.js';

/**
 * Wo nach Gelände GESUCHT wird, solange niemand etwas anderes erklärt hat.
 *
 * Das ist eine Vorbelegung, kein Ergebnis: welche dieser Elemente wirklich
 * Gelände sind, entscheidet `istGelaende` je Element. Ein Cut ist ein Void —
 * nicht dabei.
 */
export const GELAENDE_VORBELEGUNG = Object.freeze([
    'IFCGEOGRAPHICELEMENT',
    'IFCEARTHWORKSFILL',
    'IFCEARTHWORKSELEMENT',
    'IFCCIVILELEMENT',           // IFC4-Erdkörper (in 4.3 gestrichen, in Dateien noch da)
]);

/** Altname — Verbraucher, die noch die reine Liste lesen. */
export const GELAENDE_KATEGORIEN = GELAENDE_VORBELEGUNG;

/**
 * In welchen Kategorien kann überhaupt Gelände stecken?
 *
 * Der billige Vorfilter: statt jedes Element des Modells einzuordnen, wird
 * erst gefragt, welche KATEGORIEN nach Regeln und Typprofilen ein Höhenfeld
 * hervorbringen können. Nur deren Elemente werden danach einzeln geprüft.
 *
 * Dass `IFCEARTHWORKSFILL` hier trotzdem auftaucht, ist kein Fehler, sondern
 * die Auflösung des alten Widerspruchs: es erbt von `IFCEARTHWORKSELEMENT`
 * (das `hoehenfeld` deklariert), kommt deshalb in die Kandidatenmenge — und
 * fällt beim Einzeltest wieder heraus, weil sein EIGENES Typprofil `koerper`
 * sagt. Der Vorfilter darf grosszügig sein; die Entscheidung ist es nicht.
 *
 * @param {object} opts
 * @param {Array}  [opts.regeln]      Bauformregeln (Projekt > Büro > mitgeliefert)
 * @param {object} [opts.profilSatz]  wirksamer Typprofil-Satz
 * @returns {string[]} Kategorienamen in Grossschrift
 */
export function kandidatKategorien({ regeln = [], profilSatz = {}, vorbelegung = GELAENDE_VORBELEGUNG } = {}) {
    const out = new Set(vorbelegung);
    for (const r of regeln ?? []) {
        if (r?.bauform !== 'hoehenfeld') continue;
        const kat = r.condition?.category;
        if (kat) out.add(String(kat).toUpperCase());
    }
    for (const [typ, profil] of Object.entries(profilSatz ?? {})) {
        if (profil?.bauform !== 'hoehenfeld') continue;
        // Aufwärts deklariert, abwärts gültig: wer `IFCEARTHWORKSELEMENT` auf
        // `hoehenfeld` setzt, meint auch die Typen, die davon erben.
        for (const t of mitUntertypen(typ)) out.add(t);
        out.add(String(typ).toUpperCase());
    }
    return [...out];
}

/**
 * @param {object} opts
 * @param {Array<{name, groupData}>} opts.categoryGroups   Engine-Kategorienindex
 * @param {Map|Array} opts.fragmentsList                    fragments.list (Werte: Modelle mit modelId)
 * @param {Set<string>} [opts.verdeckt]                      GlobalIds ausgeblendeter Bauteile
 * @param {Set<string>} [opts.cdeGelaende]                   GlobalIds der CDE-DGM-Teile
 * @param {string} [opts.cdeModelId]
 * @param {string[]} [opts.kategorien]   Vorfilter, aus `kandidatKategorien`
 * @param {(modelId, localId) => object|null} [opts.leseKontext]
 *   Der Elementzusammenhang {category, attributes, psets, globalId}, wie ihn
 *   die Regel-Maschine erwartet. Kommt von aussen, weil nur die Engine ihn
 *   billig hat — und weil diese Datei rein bleiben soll.
 * @param {(ctx) => boolean|null} [opts.istGelaende]
 *   Die Entscheidung aus der DEKLARATION. Synchron. `null` heisst „niemand
 *   hat etwas erklärt" — dann fragt `bauformAusGeometrie`. Ohne beides gilt
 *   die Kategorie allein (Tests, Altpfade).
 * @param {(modelId, localId) => Promise<string|null>} [opts.bauformAusGeometrie]
 *   Die Formsignatur des Elements — nur für Kandidaten ohne Deklaration.
 * @returns {Promise<Array<{modelId, localId}>>}
 */
export async function gelaendeElemente({
    categoryGroups = [], fragmentsList = new Map(), verdeckt = new Set(),
    cdeGelaende = new Set(), cdeModelId = 'cde-eigenbau', kategorien = GELAENDE_VORBELEGUNG,
    leseKontext = null, istGelaende = null, bauformAusGeometrie = null,
} = {}) {
    const modelle = fragmentsList instanceof Map ? [...fragmentsList.values()] : [...(fragmentsList ?? [])];
    const gewollt = new Set(kategorien);

    // Verdecktes als (modelId, localId)-Paare — über denselben GUID-Index wie
    // das Nachspielen, nicht über eine zweite Zuordnung.
    const { karte: verdecktKarte } = await baueGlobalIdKarte({ modelle, gesuchte: verdeckt });
    const gesperrt = new Set([...verdecktKarte.values()].map(t => `${t.modelId}|${t.localId}`));

    const out = [];
    const gesehen = new Set();
    for (const group of categoryGroups ?? []) {
        if (!gewollt.has(group?.name)) continue;
        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        if (!map) continue;
        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
        for (const [modelId, rawIds] of entries) {
            if (modelId === cdeModelId) continue;          // CDE-Teile kommen über den Stand, nicht über die Kategorie
            const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : []);
            for (const localId of localIds) {
                const k = `${modelId}|${localId}`;
                if (gesperrt.has(k) || gesehen.has(k)) continue;
                // Die eigentliche Frage. Ein Kontext, den niemand lesen kann,
                // fällt auf die Kategorie zurück — nicht heraus: sonst
                // verschwände das Gelände, sobald ein Modell keine Quelle hat.
                if (istGelaende) {
                    const ctx = leseKontext ? leseKontext(modelId, localId) : null;
                    if (ctx) {
                        const urteil = istGelaende({ ...ctx, category: (ctx.category ?? group.name ?? '').toUpperCase() });
                        if (urteil === false) continue;
                        if (urteil == null && bauformAusGeometrie) {
                            // Keine Deklaration: die Geometrie schlägt vor. Ein
                            // Fehler dabei zählt wie „unbekannt" — die
                            // Vorbelegung gilt dann weiter, nichts fällt still heraus.
                            let b = null;
                            try { b = await bauformAusGeometrie(modelId, localId); } catch { b = null; }
                            if (b && b !== 'hoehenfeld') continue;
                        }
                    }
                }
                gesehen.add(k);
                out.push({ modelId, localId });
            }
        }
    }

    // Die eigenen DGM-Teile — nur die Höhenfelder, nie die Körper.
    //
    // BASIS *UND* DELTA fragen. Der fragments-Editor legt jede Bearbeitung in
    // ein eigenes `…-DELTA-MODEL-…` und führt den GUID-Rückwärtsindex NUR
    // dort: `getLocalIdsByGuids` auf `cde-eigenbau` antwortet nicht. Wer nur
    // die Basis fragt, bekommt eine leere Karte — und dann ist das gerade
    // gebaute Gelände kein Gelände mehr. Gemessen (2026-09-09): nach jeder
    // Formung war `gelaendeKandidaten()` leer, `hoeheAn` lieferte NaN, eine
    // zweite Formung fand keinen Bezug, und Längsschnitt wie Höhenlinien
    // sahen das neue DGM nicht. Dieselbe Landmine wie bei den Griffen (S10),
    // nur an einer zweiten Stelle — deshalb steht sie hier ausgeschrieben.
    const cdeModelle = modelle.filter(m => basisModelId(m?.modelId) === cdeModelId);
    if (cdeModelle.length && cdeGelaende.size) {
        const { karte } = await baueGlobalIdKarte({ modelle: cdeModelle, gesuchte: cdeGelaende });
        for (const gid of cdeGelaende) {
            if (verdeckt.has(gid)) continue;
            const t = karte.get(gid);
            if (t) out.push({ modelId: t.modelId, localId: t.localId });
        }
    }
    return out;
}
