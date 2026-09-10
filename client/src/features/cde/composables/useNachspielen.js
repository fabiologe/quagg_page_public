/**
 * useNachspielen — die Festlegungen auf das frisch geladene Modell bringen (9.2).
 *
 * Der Ladepfad war bis hierher blind für das Journal: `_loadBuffer` holte das
 * Modell, und alles, was jemand daran festgelegt hatte, blieb in der RepoFacade
 * liegen. Diese Datei schließt den Kreis.
 *
 * Hausstil (wie `useSchnitt`, `useMessen`): Datei und Export englisch, Inhalt
 * deutsch, ein Optionsobjekt hinein, ein flaches Objekt aus Refs und Handlern
 * heraus. Verhalten gehört ins Composable, Zustand in den Store.
 *
 * DIE REIHENFOLGE IST DER GANZE WITZ:
 *
 *   1. Zuordnung bauen   GlobalId → localId (über die echten Kategorien)
 *   2. LIEFERSTAND EINFRIEREN   die Anker lesen, BEVOR irgendetwas angewandt wird
 *   3. Planen            Drei-Wege-Vergleich gegen den eingefrorenen Stand
 *   4. Anwenden
 *
 * Schritt 2 vor Schritt 4 ist keine Ordnungsliebe, sondern die Bedingung für
 * Idempotenz: Läse man den Bezugspunkt erst beim Anwenden, verschöbe er sich
 * mit jeder Änderung, und ein zweiter Lauf ergäbe etwas anderes als der erste.
 * Genau das unterscheidet einen Rebase von einem Zufall.
 */

import { ref } from 'vue';
import { karteMitEngine } from '../services/GlobalIdKarte.js';
import { fasseZusammen, konfliktKarte, planeNachspielen } from '../services/Nachspielen.js';
import { AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';
import { istEigen } from '../services/Bauteilrezepte.js';

/** Alle GlobalIds, die modellberührende Festlegungen nennen. */
export function betroffeneGlobalIds(eintraege) {
    const ids = new Set();
    for (const e of eintraege ?? []) {
        if (!e?.globalId) continue;
        if (!AENDERUNGS_ARTEN[e.art]?.beruehrtModell) continue;
        if (istEigen(e)) continue;                  // lebt nicht im gelieferten Modell
        ids.add(e.globalId);
    }
    return ids;
}

/**
 * Nennt das Journal überhaupt ein selbst erzeugtes Bauteil?
 *
 * Nötig, weil `betroffeneGlobalIds` erzeugte Bauteile mit Absicht auslässt —
 * sie stehen nicht im gelieferten Modell, und in dessen Zuordnung zu suchen
 * wäre ein Fehlalarm mit Ansage. Ohne diese zweite Frage bliebe der Ladepfad
 * aber genau dann stehen, wenn ALLES selbst erzeugt ist: `gesucht` wäre leer,
 * die Abkürzung griffe, und kein einziges eigenes Bauteil käme in den Raum.
 */
export function hatErzeugte(eintraege) {
    return (eintraege ?? []).some(
        e => istEigen(e) && AENDERUNGS_ARTEN[e.art]?.beruehrtModell && e.nachher != null,
    );
}

export function useNachspielen({ engine, aenderungen } = {}) {
    /** Was der letzte Lauf ergeben hat — für die Meldung und den Reiter. */
    const meldung = ref('');
    /**
     * Der EINGEFRORENE Lieferstand: globalId → Anker im gelieferten Modell.
     *
     * Gelesen beim Laden, VOR jeder Anwendung — und danach unverändert. Das
     * Ziehen (9.3) braucht ihn als `basis` seiner Einträge: nähme es die
     * AKTUELLE Lage, wäre `basis` nach dem ersten Zug gleich `nachher`, und der
     * Drei-Wege-Vergleich vergliche gegen sich selbst. Jeder Konflikt fiele
     * dann still durch — dieselbe Fehlerklasse wie Versatz-statt-Anker in 9.1.
     */
    const lieferstand = ref(new Map());
    const konflikte = ref([]);
    /** Laute, aber nicht blockierende Meldungen (quelle_geaendert) — Teil XIV. */
    const hinweise = ref([]);
    const karte = ref(new Map());        // `${art}|${globalId}` → {zustand, grund}
    const laeuft = ref(false);
    /**
     * Standen beim letzten Lauf eigene Bauteile im Raum?
     *
     * Der Merker existiert für genau einen Fall: Wechsel von einem Modellsatz
     * MIT erzeugten Bauteilen auf einen OHNE. Dann gibt es nichts anzuwenden —
     * aber sehr wohl etwas wegzuräumen. Ohne ihn bliebe die Variante Nord in
     * der Variante Süd stehen.
     */
    const erzeugteStanden = ref(false);

    function zuruecksetzen() {
        meldung.value = '';
        konflikte.value = [];
        hinweise.value = [];
        karte.value = new Map();
        lieferstand.value = new Map();
    }

    /**
     * Nach dem Laden eines Modells aufrufen.
     *
     * Scheitert absichtlich LEISE nach außen (der Viewer soll das Modell
     * zeigen), aber niemals STILL: was nicht angewandt werden konnte, steht in
     * `meldung` und `konflikte`.
     *
     * @returns {Promise<{angewandt:number, konflikte:number}>}
     */
    async function nachModellladung(modelId) {
        zuruecksetzen();
        const eintraege = aenderungen?.eintraege ?? [];
        const gesucht = betroffeneGlobalIds(eintraege);
        // Auch OHNE Bezug ins gelieferte Modell gibt es zu tun: selbst erzeugte
        // Bauteile müssen aufgebaut werden. Und selbst wenn es GAR NICHTS zu
        // tun gibt, muss `wendeAn` laufen, sobald zuvor etwas dastand — der
        // Neuaufbau ist es, der das CDE-Modell beim Satzwechsel LEERT.
        if (!engine?.value) return { angewandt: 0, konflikte: 0 };
        if (!gesucht.size && !hatErzeugte(eintraege) && !erzeugteStanden.value) {
            return { angewandt: 0, konflikte: 0 };
        }
        erzeugteStanden.value = hatErzeugte(eintraege);

        laeuft.value = true;
        try {
            // 1. GlobalId → localId
            const { karte: idKarte, fehlend } = await karteMitEngine(engine.value, gesucht);

            // 2. Lieferstand EINFRIEREN — vor jeder Anwendung.
            const proModell = new Map();
            for (const { modelId: mid, localId } of idKarte.values()) {
                (proModell.get(mid) ?? proModell.set(mid, []).get(mid)).push(localId);
            }
            const anker = new Map();          // globalId → {x,y,z}
            for (const [mid, ids] of proModell) {
                const geleseneAnker = await engine.value.ankerVon(mid, ids);
                for (const [globalId, ort] of idKarte) {
                    if (ort.modelId !== mid) continue;
                    const a = geleseneAnker.get(ort.localId);
                    if (a) anker.set(globalId, a);
                }
            }

            lieferstand.value = anker;        // ab hier eingefroren

            // 2b. Die SCHACHTKNOTEN einfrieren — der Vergleichswert für den
            //     Bezugs-Arm (Stufe 16). Dasselbe Mass wie `zielBasis` beim
            //     Setzen (`schachtPunkteVon`); der Hüllen-Anker daneben wäre
            //     ein anderes Mass und meldete „bewegt", wo nur zweierlei
            //     gemessen wurde. Auch das VOR jeder Anwendung.
            const knotenStand = engine.value.schachtPunkteVon?.(modelId) ?? new Map();

            // 2c. Die PRÜFMASSE der Ableitungs-Quellen einfrieren (Teil XIV):
            //     nur gelieferte Quellen — eine CDE-Quelle entsteht erst im
            //     Aufbau und trägt kein Prüfmass. Auch das VOR der Anwendung.
            //     Netzmass wie bisher; die ROHRE eines Strang-Grabens tragen ein
            //     ACHSMASS (B3, `achse: true`) — dafür fragt der Vergleich das
            //     Achsenband statt den Resolver (viele Rohre, kein Netz nötig).
            const quellmassStand = new Map();
            const achsmassStand = new Map();
            const erzeugtStand = aenderungen?.wirksamerStand?.('erzeugt') ?? new Map();
            for (const plan of erzeugtStand.values()) {
                const q = plan?.parameter?.quellen ?? (plan?.parameter?.quelle ? { gelaende: plan.parameter.quelle } : {});
                const basis = plan?.parameter?.quellBasis ?? {};
                for (const [schlitz, roh] of Object.entries(q)) {
                    const gids = Array.isArray(roh) ? roh : [roh];
                    const masse = Array.isArray(basis[schlitz]) ? basis[schlitz] : [basis[schlitz]];
                    for (let i = 0; i < gids.length; i++) {
                        const gid = gids[i];
                        if (!gid || erzeugtStand.has(gid)) continue;
                        if (masse[i]?.achse) {
                            if (!achsmassStand.has(gid)) { const m = engine.value.achsmassVon?.(gid); if (m) achsmassStand.set(gid, m); }
                        } else if (!quellmassStand.has(gid)) {
                            const mass = await engine.value.pruefmassVon?.(gid);
                            if (mass) quellmassStand.set(gid, mass);
                        }
                    }
                }
            }

            // 3. Planen. Ein nicht gefundenes Bauteil liefert `undefined` —
            //    daraus wird im Vergleich der Zustand „fehlt", nicht ein
            //    stiller Ausfall.
            const plan = planeNachspielen(
                aenderungen?.auftragsEintraege ?? [],
                (globalId) => anker.get(globalId),
                {
                    standEintraege: aenderungen?.standEintraege ?? [],
                    leseBezug: (globalId) => knotenStand.get(globalId),
                    leseQuellmass: (globalId, mass) => (mass?.achse ? achsmassStand.get(globalId) : quellmassStand.get(globalId)),
                },
            );
            hinweise.value = plan.hinweise ?? [];
            plan.modelId = modelId;

            // 4. Anwenden.
            const localIdKarte = new Map(
                [...idKarte].map(([globalId, ort]) => [globalId, ort.localId]),
            );
            const { misserfolge, nichtAngewandt = [] } = await engine.value.wendeFestlegungenAn(plan, {
                globalIdZuLocalId: localIdKarte,
            });

            // Was beim Anwenden scheiterte, ist kein Erfolg — es wandert zu den
            // Konflikten, statt in der Zusammenfassung mitgezählt zu werden.
            const alleKonflikte = [
                ...plan.konflikte,
                ...misserfolge.map(m => ({ ...m, zustand: 'fehlgeschlagen' })),
            ];
            konflikte.value = alleKonflikte;
            karte.value = konfliktKarte(alleKonflikte);
            // Weder Erfolg noch Panne: eine Festlegung, die das Modell
            // absichtlich nicht anfasst (Querschnittsgröße als Forderung an
            // den Planer). Sie mitzuzählen hiesse, Erfolg für etwas zu melden,
            // das nirgends zu sehen ist.
            //
            // EINE Zahl, nicht zwei. Die Meldung rechnete `nichtAngewandt`
            // heraus, der Rückgabewert vier Zeilen tiefer nicht — dieselbe
            // Ladung meldete auf dem Schirm „0 angewandt" und gab `1` zurück.
            // Wer den Rückgabewert liest, sah einen Erfolg, den es nicht gab.
            const angewandt = plan.zusammenfassung.angewandt
                - misserfolge.length - nichtAngewandt.length;
            meldung.value = fasseZusammen({
                ...plan.zusammenfassung,
                angewandt,
                nurFestlegung: nichtAngewandt.length,
                konflikte: alleKonflikte.length,
            });

            if (fehlend.length) {
                console.info('[CDE] Nachspielen: nicht im Modell gefunden', fehlend);
            }
            return { angewandt, konflikte: alleKonflikte.length };
        } catch (fehler) {
            // Ein Fehler hier darf das Laden nicht abbrechen — ein Modell ohne
            // Festlegungen ist besser als gar keins. Aber er wird gesagt.
            meldung.value = `Festlegungen konnten nicht angewandt werden: ${fehler?.message ?? fehler}`;
            console.warn('cde: nachspielen', fehler);
            return { angewandt: 0, konflikte: 0 };
        } finally {
            laeuft.value = false;
        }
    }

    /**
     * Der Anker eines Bauteils im GELIEFERTEN Modell.
     *
     * `undefined`, wenn das Bauteil beim Laden nicht gebraucht wurde (das
     * Journal nannte es nicht) — dann muss der Aufrufer ihn selbst lesen und
     * einfrieren, BEVOR er etwas verschiebt.
     */
    function lieferstandVon(globalId) {
        return lieferstand.value.get(globalId);
    }

    /** Einen Anker nachtragen, den das Journal beim Laden noch nicht nannte. */
    function merkeLieferstand(globalId, anker) {
        if (!globalId || !anker) return;
        // NICHT überschreiben: der erste gelesene Wert ist der gelieferte. Ein
        // zweiter Aufruf nach einer Verschiebung dürfte ihn nicht verrücken.
        if (!lieferstand.value.has(globalId)) lieferstand.value.set(globalId, anker);
    }

    /** Der Konfliktzustand eines Eintrags — für den Änderungen-Reiter. */
    function zustandVon(eintrag) {
        return karte.value.get(`${eintrag?.art}|${eintrag?.globalId}`) ?? null;
    }

    return {
        meldung, konflikte, karte, laeuft, lieferstand,
        nachModellladung, zustandVon, zuruecksetzen, lieferstandVon, merkeLieferstand, hinweise,
    };
}
