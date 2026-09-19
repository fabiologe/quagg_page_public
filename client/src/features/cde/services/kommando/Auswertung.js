/**
 * Die Auswertung eines Kommandos — rein (Teil XXIV, K1).
 *
 * `werteAus(kommando, kontext)` macht aus einer Absicht die Journalschritte,
 * die sie bedeutet. Sie ruft das UNVERÄNDERTE `anwenden` des Katalogwerkzeugs —
 * der Katalog bleibt, was er seit A6 ist: Muster + Operation + Katalogeintrag.
 * Neu ist nur, dass die Eingaben aus einem Wert kommen statt aus dem Zustand
 * der Oberfläche, und dass die Kennungen neuer Bauteile vom Aufrufer stammen.
 *
 * Geschrieben wird hier nichts. Das tut `useBearbeitung.fuehreAus`, ganz oder
 * gar nicht.
 *
 * Der KONTEXT sagt, woher die Auswertung liest, was nicht im Kommando steht:
 *   subjektVon(globalId)  das Bauteil, wie ein Werkzeug es erwartet (heute die
 *                         Einordnung des Viewers; mit K3 auch aus dem Journal)
 *   rahmen                Welt ↔ Projektkoordinaten (`Kommando.rahmenAusBezug`)
 *   kennungsgeber()       liefert Kennungen, wenn `neu` nicht reicht — die
 *                         Oberfläche gibt ihren; ein Skript nennt sie in `neu`
 *   typprofilFuer(el)     das Typprofil der Familie — die Formularprüfung
 *                         braucht es, wie in der Oberfläche
 *   bauplanVon(globalId)  der wirksame Bauplan eines eigenen Bauteils — für
 *                         Werkzeuge, die mehr als ihr Subjekt schreiben (K5)
 *   knotenVon(globalId)   Ort eines Knotens in der Welt `{x, y, z, hoehenbezug?}` —
 *                         für Zugpunkte `{knoten}` (K8)
 */
import { felderFuer, nachId, pruefe, werkzeugKatalog } from '../Bearbeitungen.js';
import { befundeFuerWerte } from '../Befunde.js';
import { KENNUNGS_PRAEFIX, mitKennungen } from '../Bauteilrezepte.js';
import { adressenAlsNummern, istErzeugen, punktInWelt, rahmenOhneBezug, schlitzVon, werteFuerWerkzeug } from './Kommando.js';

const KENNUNG_FEHLT = Symbol('kennung-fehlt');

/**
 * @returns {{ schritte: object[], uebersprungen: number, neu: string[],
 *             werkzeug: object|null, grund: string|null, hinweise: object[] }}
 *          `grund` gesetzt = nichts auszuführen (abgelehnt oder ohne Wirkung);
 *          `hinweise` = Fachgrenzen, die der Wert überschreitet — ausgeführt
 *          wird trotzdem (K10, E5)
 */
export function werteAus(kommando, { katalog = werkzeugKatalog(), subjektVon = null, rahmen = rahmenOhneBezug(),
                                    kennungsgeber = null, typprofilFuer = null, pruefeWerte = null, bauplanVon = null,
                                    knotenVon = null, felder: felderVorgabe = null } = {}) {
    const k = kommando;
    const b = nachId(k.werkzeug, katalog);
    const leer = (grund) => ({ schritte: [], uebersprungen: 0, neu: [], werkzeug: b, grund, hinweise: [] });
    if (!b) return leer(`Das Werkzeug „${k.werkzeug}" gibt es nicht`);

    const erzeugt = istErzeugen(b);
    // DIE PUNKTE — ein Verweis auf einen Knoten (K8) wird hier zum Ort: Lage
    // und, bei einem eigenen Knoten, seine SOHLE. Die steht dann fest
    // (`hoeheFest`): eine getippte Höhe gilt für die freien Punkte, nicht für
    // den, der auf einem Schacht sitzt.
    const roh = k.eingaben?.[schlitzVon(b)] ?? [];
    const punkte = [];
    for (const q of roh) {
        if (!q?.knoten) { punkte.push(punktInWelt(q, rahmen)); continue; }
        const kn = knotenVon?.(q.knoten) ?? null;
        const mitLage = typeof q.ost === 'number' && typeof q.nord === 'number';
        // E8: ein Knoten, den es nicht gibt und dessen Ort das Kommando nicht nennt — unmöglich.
        if (!kn && !mitLage) return leer(`Den Knoten ${q.knoten} gibt es nicht (mehr) — ein Zug kann nicht an ihm beginnen oder enden.`);
        const lage = mitLage ? punktInWelt(q, rahmen) : { x: kn.x, z: kn.z };
        // Fest steht die Höhe, wenn das Kommando sie für diesen Punkt nennt oder
        // der Knoten seine Sohle kennt (ein eigener Schacht); bei einem
        // gelieferten Knoten ohne Höhe gilt die getippte (seine Platzierung ist
        // nicht sicher die Sohle, Achsbezug.knotensohle).
        const explizit = typeof q.hoehe === 'number';
        const hoeheFest = explizit || kn?.hoehenbezug === 'sohle';
        const y = explizit ? punktInWelt(q, rahmen).y : (Number.isFinite(kn?.y) ? kn.y : undefined);
        punkte.push({ x: lage.x, ...(y !== undefined ? { y } : {}), z: lage.z, knoten: q.knoten,
                      ...(hoeheFest ? { hoeheFest: true } : {}) });
    }

    // DIE SUBJEKTE. Erzeugen hat keines — dort steht das Gezeichnete an seiner
    // Stelle, wie es `useEingabe` bisher hereinreichte.
    const subjekte = erzeugt
        ? [{ punkte, hoehenversatz: rahmen.hoehenversatz ?? 0 }]
        : k.ziel.map(gid => subjektVon?.(gid) ?? null);
    const fehlt = erzeugt ? [] : k.ziel.filter((gid, i) => !subjekte[i]);
    // E8: ein fehlendes oder gelöschtes Ziel ist technisch unmöglich — ablehnen.
    if (fehlt.length) return leer(`Das Bauteil ${fehlt.join(', ')} gibt es nicht (mehr) — ein Kommando wirkt nur auf vorhandene Bauteile.`);

    // DIE FORMULARPRÜFUNG — dieselbe wie `bereit` in der Oberfläche, gegen das
    // ERSTE Subjekt. Eine zweite Regel für Kommandos gibt es nicht. Seit K10
    // (E5) sperrt sie nur das technisch Unmögliche (`gueltig`); die
    // Fachgrenzen (`min`/`max`) werden HINWEISE und reisen mit dem Ergebnis.
    // Die Oberfläche reicht ihre Felder und ihr schon gerechnetes Ergebnis
    // herein (`felder`, `pruefeWerte`), damit dieselben Felder zählen, die das
    // Formular zeigt.
    // Adressen → Nummern (E3), gegen den AKTUELLEN Stand des ersten Subjekts.
    const { werte, grund: grundAdresse } = adressenAlsNummern(b, subjekte[0], werteFuerWerkzeug(k), rahmen);
    if (grundAdresse) return leer(grundAdresse);
    const felderJetzt = felderVorgabe ?? felderFuer(b, typprofilFuer?.(subjekte[0]) ?? null, subjekte[0]);
    const fehlerFelder = pruefeWerte ? (pruefeWerte(b, werte, subjekte[0]) ?? []) : pruefe(felderJetzt, werte);
    if (fehlerFelder.length) return leer(fehlerFelder.join(' · '));
    const hinweise = befundeFuerWerte(felderJetzt, werte);

    // DIE KENNUNGEN (E2, E3): erst die genannten — je Art (Bauteil `cde-…`,
    // Operation `op-…`) in ihrer Reihenfolge —, dann der Geber des Aufrufers.
    const vorrat = [...(k.neu ?? [])];
    const verwendet = [];
    let fehlendeArt = null;
    const quelle = (art = 'bauteil') => {
        const praefix = KENNUNGS_PRAEFIX[art] ?? KENNUNGS_PRAEFIX.bauteil;
        const i = vorrat.findIndex(id => id.startsWith(praefix));
        if (i >= 0) { const [id] = vorrat.splice(i, 1); verwendet.push(id); return id; }
        if (kennungsgeber) { const id = kennungsgeber(art); verwendet.push(id); return id; }
        fehlendeArt = art;
        throw KENNUNG_FEHLT;
    };

    const schritte = [];
    let uebersprungen = 0;
    try {
        mitKennungen(quelle, () => {
            for (const [i, el] of subjekte.entries()) {
                // `zug` ist die zweite Eingabeart neben den Formularwerten; beim
                // Erzeugen steckt er schon im Subjekt.
                // `bauplanVon` (K5): ein Werkzeug, das über das Subjekt hinaus
                // schreibt (der ganze Strang), fragt so nach den Bauplänen der
                // anderen — ohne selbst ins Journal zu greifen.
                const roh = b.anwenden(el, werte, { nummer: i, zug: erzeugt ? [] : punkte, bauplanVon });
                const teil = (Array.isArray(roh) ? roh : [roh]).filter(x => x?.art);
                if (!teil.length) uebersprungen++;
                schritte.push(...teil);
            }
        });
    } catch (fehler) {
        if (fehler === KENNUNG_FEHLT) {
            const praefix = KENNUNGS_PRAEFIX[fehlendeArt] ?? '';
            const n = (k.neu ?? []).filter(id => id.startsWith(praefix)).length;
            return leer(`Das Kommando nennt ${n} neue Kennung(en) „${praefix}…" in „neu" — das Werkzeug braucht mehr.`);
        }
        throw fehler;
    }
    if (vorrat.length) return leer(`„neu" nennt ${vorrat.length} Kennung(en) mehr, als entstehen.`);

    if (!schritte.length) {
        // DAS WERKZEUG DARF SAGEN, WARUM ES NICHT KANN — derselbe Weg wie bisher.
        let grund = null;
        try { grund = b.warumNicht?.(subjekte[0], werte, { zug: punkte }) ?? null; } catch { grund = null; }
        return { ...leer(grund || 'Dem Bauteil fehlt der Bezug für diese Bearbeitung.'), uebersprungen };
    }
    return { schritte, uebersprungen, neu: verwendet, werkzeug: b, grund: null, hinweise };
}
