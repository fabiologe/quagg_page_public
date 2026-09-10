/**
 * Nachspielen — das Rebase der Festlegungen auf ein frisch geladenes Modell
 * (Stufe 9.2).
 *
 * Ohne diese Datei ist jede Bearbeitung beim Neuladen weg: das Journal liegt
 * in der RepoFacade, das Modell kommt roh vom Planer. Hier treffen sie sich.
 *
 * Fabios Bild ist Git, und es hält bis in die Einzelheiten:
 *
 *     Lieferstand        Basis-Stand
 *     Journal            die eigenen Commits
 *     neue Revision      der Upstream hat sich bewegt
 *     Nachspielen        Rebase
 *     Konflikt           beide haben dieselbe Stelle angefasst
 *
 * ZWEI ENTSCHEIDUNGEN, die diese Datei umsetzt:
 *
 * (4) Nachgespielt wird der STAND, nicht die Historie. Git checkt einen
 *     Zustand aus; es spult nicht die Tipparbeit nach. `standMitEintrag`
 *     liefert je Bauteil den Schritt, der zuletzt gewonnen hat — der wird
 *     angewandt, nicht die fünf davor.
 *
 * (5) Ein Konflikt ist laut, aber blockiert nicht. Er wird gemeldet, der Rest
 *     läuft. Nichts verschwindet still — das ist ISO 19650 und Git zugleich.
 *
 * IDEMPOTENZ ist die Eigenschaft, auf der alles ruht: zweimal nachspielen darf
 * nichts ändern. Sie kommt daher, dass die Werte ABSOLUT sind (Anker, nicht
 * Versatz) — ein absoluter Zielwert zweimal gesetzt ergibt denselben Zustand,
 * ein Zuwachs verdoppelt sich. Deshalb ist `leseLieferstand` auch bewusst der
 * Stand VOR jeder Anwendung: der Bezugspunkt darf sich beim Anwenden nicht
 * mitbewegen, sonst wäre der zweite Lauf ein anderer als der erste.
 *
 * Reine Funktionen, ohne Vue, ohne WebGL — die Attrappe reicht ein Map hinein.
 */

import { AENDERUNGS_ARTEN, standMitEintragEbenen, vergleicheMitModell } from '../stores/useAenderungen.js';
import { pruefmassGleich } from './geometrie/ops/Raster.js';
import { istEigen } from './Bauteilrezepte.js';

/**
 * Welche Festlegungen lassen sich auf dieses Modell anwenden, und wo hakt es?
 *
 * @param {Array} eintraege        das AUFTRAGSJOURNAL (gilt in jedem Modellsatz)
 * @param {(globalId: string, art: string) => *} leseLieferstand
 *        Wert im GELIEFERTEN Modell; `undefined` heißt „Bauteil nicht da".
 *        Muss der Stand VOR jeder Anwendung sein — siehe Idempotenz oben.
 * @param {object} [opts]
 * @param {string[]} [opts.arten]  nur diese Arten (Vorgabe: alle modellberührenden)
 * @param {Array} [opts.standEintraege]  das Journal des aktiven Modellsatzes.
 *        Wird GETRENNT gefaltet und danach überlagert — verkettet man beide,
 *        löscht ein `null` im Satz die Auftragskorrektur mit aus dem Plan, und
 *        sie käme beim Laden nicht mehr aufs Modell (Stufe 11.1).
 * @returns {{anzuwenden: Array, konflikte: Array, zusammenfassung: object}}
 *   anzuwenden: [{ globalId, art, wert, eintrag, modell }]
 *   konflikte:  [{ globalId, art, eintrag, zustand, grund, istWert }]
 */
/** Ab dieser Bewegung des Bezugsziels wird nachgeführt (m). */
const BEZUG_TOLERANZ_M = 0.001;

/**
 * Der zweite Drei-Wege-Vergleich — für den BEZUG eines lage-Eintrags
 * (Stufe 16, „rohr-an-schacht"). Rein und eingefroren: `leseBezug` liefert
 * den LIEFERSTAND des Zielknotens, nie den angewandten — deshalb ist das
 * Nachführen idempotent (zweimal nachgespielt ergibt zweimal denselben
 * Anker) und die EIGENE Schacht-Verschiebung führt nichts nach (dafür gibt
 * es den Regler an „Schacht verschieben").
 *
 *   Ziel unbewegt → sauber, Wert unverändert
 *   Ziel bewegt   → Anker um die Zielbewegung NACHGEFÜHRT — kein neuer
 *                   Eintrag, aber gemeldet (stilles Verhalten ist genau
 *                   das, wogegen das Journal angetreten ist)
 *   Ziel fehlt    → der absolute Anker gilt weiter; gemeldet als bezug_fehlt
 */
function _bezugsArm(eintrag, wert, leseBezug) {
    const b = eintrag?.bezug;
    if (eintrag?.art !== 'lage' || !b?.ziel || !b?.zielBasis || !wert) return { wert };
    const zielIst = leseBezug?.(b.ziel);
    if (!zielIst) return { wert, meldung: 'bezug_fehlt' };
    const dx = zielIst.x - b.zielBasis.x;
    const dy = zielIst.y - b.zielBasis.y;
    const dz = zielIst.z - b.zielBasis.z;
    if (Math.hypot(dx, dy, dz) <= BEZUG_TOLERANZ_M) return { wert };
    return {
        wert: { x: wert.x + dx, y: wert.y + dy, z: wert.z + dz },
        meldung: 'nachgefuehrt',
    };
}

/**
 * Der QUELLEN-ARM einer Ableitung (Teil XIV, G4) — das Gegenstück zum
 * Bezugs-Arm: `quellBasis` ist die Momentaufnahme der Quelle beim Setzen
 * (Prüfmass: Dreieckszahl, Ausdehnung), `leseQuellmass` liefert das
 * heutige. Weicht es ab, hat der Planer die Quelle geändert — angewandt
 * wird trotzdem (der Neuaufbau rechnet ohnehin auf der neuen Quelle), aber
 * GEMELDET: laut, nicht blockierend, wie `nachgefuehrt`.
 */
function _quellenArm(eintrag, leseQuellmass) {
    const p = eintrag?.nachher?.parameter;
    const basis = p?.quellBasis;
    if (eintrag?.art !== 'erzeugt' || !basis || typeof basis !== 'object' || !leseQuellmass) return null;
    const quellen = p.quellen ?? (p.quelle ? { gelaende: p.quelle } : {});
    const geaendert = [];
    for (const [schlitz, massOderListe] of Object.entries(basis)) {
        // Ein Schlitz darf eine LISTE tragen (B3): Masse und GlobalIds laufen
        // Index für Index nebeneinander.
        const gids = Array.isArray(quellen[schlitz]) ? quellen[schlitz] : [quellen[schlitz]];
        const masse = Array.isArray(massOderListe) ? massOderListe : [massOderListe];
        for (let i = 0; i < gids.length; i++) {
            const gid = gids[i], mass = masse[i];
            if (!gid || !mass) continue;
            const ist = leseQuellmass(gid, mass);
            if (!ist) continue;                          // CDE-Quelle oder nicht lesbar: kein Urteil
            if (!pruefmassGleich(mass, ist)) geaendert.push(gid);
        }
    }
    return geaendert.length ? geaendert : null;
}

export function planeNachspielen(eintraege, leseLieferstand, { arten = null, standEintraege = null, leseBezug = null, leseQuellmass = null } = {}) {
    const anzuwenden = [];
    const konflikte = [];
    const hinweise = [];
    let nachgefuehrt = 0;
    let bezugFehlt = 0;
    let quelleGeaendert = 0;

    const zuPruefen = arten ?? Object.entries(AENDERUNGS_ARTEN)
        .filter(([, a]) => a.beruehrtModell)
        .map(([name]) => name);

    for (const art of zuPruefen) {
        for (const [globalId, { wert, eintrag }] of standMitEintragEbenen(eintraege ?? [], standEintraege, art)) {
            // Erzeugte Bauteile stehen nicht im gelieferten Modell — sie im
            // Lieferstand zu suchen und dann „fehlt" zu melden, wäre ein
            // Fehlalarm mit Ansage. `istEigen` liest Aussage UND Kennung:
            // ein Journal von vor Stufe 0 trägt an verborgenen eigenen DGMs
            // kein `modell` — und meldete genau diesen Fehlalarm.
            if (istEigen(eintrag)) {
                const geaendert = _quellenArm(eintrag, leseQuellmass);
                if (geaendert) {
                    quelleGeaendert++;
                    hinweise.push({ globalId, art, zustand: 'quelle_geaendert',
                                    grund: `Quelle vom Planer geändert: ${geaendert.join(', ')}` });
                }
                anzuwenden.push({ globalId, art, wert, eintrag, modell: 'cde',
                                  ...(geaendert ? { grund: 'quelle_geaendert' } : {}) });
                continue;
            }

            const istWert = leseLieferstand?.(globalId, art);
            const { zustand, grund } = vergleicheMitModell(eintrag, istWert);

            if (zustand === 'sauber') {
                const arm = _bezugsArm(eintrag, wert, leseBezug);
                if (arm.meldung === 'nachgefuehrt') nachgefuehrt++;
                if (arm.meldung === 'bezug_fehlt') bezugFehlt++;
                anzuwenden.push({ globalId, art, wert: arm.wert, eintrag,
                                  modell: 'geliefert', grund: arm.meldung ?? grund });
            } else {
                konflikte.push({ globalId, art, eintrag, zustand, grund, istWert });
            }
        }
    }

    return {
        anzuwenden,
        konflikte,
        // Dieser Plan kennt den GANZEN Stand. Nur er darf das CDE-Modell neu
        // aufbauen — auch wenn gar kein `erzeugt` darin steht, denn dann muss
        // es leer werden. Ein Ein-Schritt-Plan (`planFuerEintrag`) trägt die
        // Kennzeichnung nicht und lässt Erzeugtes deshalb in Ruhe.
        vollstaendig: true,
        hinweise,
        zusammenfassung: {
            angewandt: anzuwenden.length,
            konflikte: konflikte.length,
            fehlend: konflikte.filter(k => k.zustand === 'fehlt').length,
            ueberschnitten: konflikte.filter(k => k.zustand === 'konflikt').length,
            nachgefuehrt,
            bezugFehlt,
            quelleGeaendert,
        },
    };
}

/**
 * Die Meldung nach dem Laden — kurz, und sie verschweigt nichts.
 *
 * „18 Festlegungen angewandt" allein wäre eine halbe Wahrheit; die zwei, die
 * nicht durchgingen, sind die interessanten.
 */
export function fasseZusammen({ angewandt = 0, konflikte = 0, fehlend = 0, ueberschnitten = 0,
                                nurFestlegung = 0, nachgefuehrt = 0, bezugFehlt = 0, quelleGeaendert = 0 } = {}) {
    if (!angewandt && !konflikte && !nurFestlegung) return '';
    const teile = [`${angewandt} ${angewandt === 1 ? 'Festlegung' : 'Festlegungen'} angewandt`];
    // Getrennt genannt, weil es weder Erfolg noch Panne ist: die CDE ändert das
    // Autorenmodell absichtlich nicht, sie stellt eine Forderung (ISO 19650).
    if (nurFestlegung) teile.push(`${nurFestlegung} × nur festgehalten (Forderung an den Planer)`);
    if (ueberschnitten) teile.push(`${ueberschnitten} × auch vom Planer geändert`);
    if (fehlend) teile.push(`${fehlend} × Bauteil nicht mehr im Modell`);
    if (nachgefuehrt) teile.push(`${nachgefuehrt} × dem Bezug nachgeführt`);
    if (bezugFehlt) teile.push(`${bezugFehlt} × Bezugsziel nicht mehr im Modell`);
    if (quelleGeaendert) teile.push(`${quelleGeaendert} × Quelle vom Planer geändert — neu abgeleitet`);
    return teile.join(' · ');
}

/**
 * Konflikte je Bauteil nachschlagen — für die Anzeige im Änderungen-Reiter.
 *
 * Der Zustand wird NICHT gespeichert (siehe `vergleicheMitModell`): er gilt
 * für das gerade geladene Modell und heilt von selbst, wenn ein Bauteil in
 * einer späteren Revision zurückkommt.
 *
 * @returns {Map<string, {zustand, grund}>}  Schlüssel `${art}|${globalId}`
 */
export function konfliktKarte(konflikte) {
    const karte = new Map();
    for (const k of konflikte ?? []) {
        karte.set(`${k.art}|${k.globalId}`, { zustand: k.zustand, grund: k.grund });
    }
    return karte;
}

// ── Einen EINZELNEN Eintrag anwenden (Stufe 12.0b) ──────────────────────────

/**
 * Auf welchem Weg wird ein frisch geschriebener Eintrag wirksam?
 *
 * DER ANLASS: Das Formular schrieb ins Journal — und niemand brachte es ans
 * Modell. Nur drei Wege taten das überhaupt: das (inzwischen entfernte)
 * Ziehen (rief
 * `setzeAnker` selbst), Laden (`useNachspielen`) und Zeichnen
 * (`baueErzeugteNeu`). Wer eine Sohlhöhe im Formular eintrug, sah nichts
 * geschehen; erst nach `F5` sprang das Bauteil. Für den Nutzer ist das
 * ununterscheidbar von „kaputt".
 *
 * Diese Funktion trifft die Weiche EINMAL und rein, statt sie in jeder
 * Oberfläche nachzubauen:
 *
 *   'einzeln'        ein Schritt über denselben `wendeAn`, den auch das
 *                    Nachspielen benutzt — kein zweiter Anwendungsweg.
 *   'neuaufbau'      das CDE-Modell wird GANZ aus dem Journal neu gebaut.
 *                    ERZEUGTES DARF NIE EINZELN LAUFEN: `baueErzeugte`
 *                    verwirft das Modell und baut nur, was man ihm gibt — ein
 *                    Ein-Schritt-Plan löschte alles andere Erzeugte mit.
 *   'nur-festlegung' berührt das Modell absichtlich nicht (Querschnittsgröße,
 *                    Stärke, Kostengruppe). Muss trotzdem GEMELDET werden,
 *                    sonst sieht richtiges Verhalten aus wie kaputtes.
 *   'auslegung'      berührt das Modell ebenfalls nicht — aber aus dem
 *                    GEGENTEILIGEN Grund. Eine Festlegung ist eine FORDERUNG
 *                    an den Planer („die Sohle gehört auf 132,40"); eine
 *                    Auslegung ist unsere LESART seines Modells („dieser
 *                    Körper ist das Gelände"). Sie geht deshalb nicht in den
 *                    Änderungsbericht, und die Rückmeldung darf nicht „die
 *                    Geometrie bleibt beim Planer" lauten — es gibt nichts,
 *                    das er ändern soll. Wirksam wird sie über die
 *                    Entwertung (`FormSchreiber`), nicht über `wendeAn`.
 */
export function anwendungsweg(eintrag) {
    if (!eintrag?.art) return 'nur-festlegung';
    if (eintrag.art === 'erzeugt') return 'neuaufbau';
    const art = AENDERUNGS_ARTEN[eintrag.art];
    if (art?.auslegung) return 'auslegung';
    return art?.beruehrtModell ? 'einzeln' : 'nur-festlegung';
}

/**
 * Ein Eintrag als Plan in der Form, die `IfcAutor.wendeAn` erwartet.
 *
 * Damit läuft eine im Formular gesetzte Sohlhöhe über EXAKT denselben Weg wie
 * eine nachgespielte — inklusive der Meldung, wenn es nicht ging. Ein eigener
 * „jetzt sofort"-Pfad wäre der zweite Anwendungsweg, und der liefe irgendwann
 * anders als der erste.
 *
 * @returns {object|null} null, wenn dieser Eintrag nicht einzeln anzuwenden ist
 */
export function planFuerEintrag(eintrag, modelId = null) {
    if (anwendungsweg(eintrag) !== 'einzeln') return null;
    return {
        modelId,
        anzuwenden: [{
            globalId: eintrag.globalId,
            art: eintrag.art,
            wert: zielWert(eintrag),
            eintrag,
            modell: istEigen(eintrag) ? 'cde' : 'geliefert',
        }],
        konflikte: [],
    };
}

/**
 * Wohin dieser eine Eintrag das Bauteil bringen soll — JETZT.
 *
 * Fast immer `nachher`. Die Ausnahme ist die Rücknahme des ERSTEN Zuges an
 * einem Bauteil: dort ist `nachher` gleich `null`, weil im Stand vorher nichts
 * lag. Fürs Nachspielen ist das genau richtig — „nichts im Stand" heisst
 * „unberührt", und beim nächsten Laden kommt das Bauteil ohnehin dort heraus,
 * wo der Planer es hingelegt hat.
 *
 * Im SOFORT-Pfad ist es das nicht: das Modell liegt schon verschoben im
 * Speicher, und `setzeAnker(…, null)` weiss nicht, wohin. „Zurück" schrieb
 * dann den Gegeneintrag und bewegte nichts — bis zum nächsten F5 stand die
 * Rücknahme im Journal und die Verschiebung im Raum.
 *
 * Der Lieferstand steht in `basis`, und genau dorthin gehört das Bauteil.
 * Die Unterscheidung bleibt HIER, in der Übersetzung eines einzelnen Eintrags
 * in einen Plan — was ein Journaleintrag bedeutet, ändert sie nicht.
 */
function zielWert(eintrag) {
    if (eintrag.art === 'lage' && eintrag.nachher === null && eintrag.basis) {
        return eintrag.basis;
    }
    return eintrag.nachher;
}
