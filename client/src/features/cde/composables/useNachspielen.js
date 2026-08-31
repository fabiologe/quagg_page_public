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

/** Alle GlobalIds, die modellberührende Festlegungen nennen. */
export function betroffeneGlobalIds(eintraege) {
    const ids = new Set();
    for (const e of eintraege ?? []) {
        if (!e?.globalId) continue;
        if (!AENDERUNGS_ARTEN[e.art]?.beruehrtModell) continue;
        if (e.modell === 'cde') continue;          // lebt nicht im gelieferten Modell
        ids.add(e.globalId);
    }
    return ids;
}

export function useNachspielen({ engine, aenderungen } = {}) {
    /** Was der letzte Lauf ergeben hat — für die Meldung und den Reiter. */
    const meldung = ref('');
    const konflikte = ref([]);
    const karte = ref(new Map());        // `${art}|${globalId}` → {zustand, grund}
    const laeuft = ref(false);

    function zuruecksetzen() {
        meldung.value = '';
        konflikte.value = [];
        karte.value = new Map();
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
        if (!gesucht.size || !engine?.value) return { angewandt: 0, konflikte: 0 };

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

            // 3. Planen. Ein nicht gefundenes Bauteil liefert `undefined` —
            //    daraus wird im Vergleich der Zustand „fehlt", nicht ein
            //    stiller Ausfall.
            const plan = planeNachspielen(
                aenderungen?.auftragsEintraege ?? [],
                (globalId) => anker.get(globalId),
                { standEintraege: aenderungen?.standEintraege ?? [] },
            );
            plan.modelId = modelId;

            // 4. Anwenden.
            const localIdKarte = new Map(
                [...idKarte].map(([globalId, ort]) => [globalId, ort.localId]),
            );
            const { misserfolge } = await engine.value.wendeFestlegungenAn(plan, {
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
            meldung.value = fasseZusammen({
                ...plan.zusammenfassung,
                angewandt: plan.zusammenfassung.angewandt - misserfolge.length,
                konflikte: alleKonflikte.length,
            });

            if (fehlend.length) {
                console.info('[CDE] Nachspielen: nicht im Modell gefunden', fehlend);
            }
            return { angewandt: plan.anzuwenden.length - misserfolge.length, konflikte: alleKonflikte.length };
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

    /** Der Konfliktzustand eines Eintrags — für den Änderungen-Reiter. */
    function zustandVon(eintrag) {
        return karte.value.get(`${eintrag?.art}|${eintrag?.globalId}`) ?? null;
    }

    return { meldung, konflikte, karte, laeuft, nachModellladung, zustandVon, zuruecksetzen };
}
