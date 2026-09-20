// @vitest-environment node
/**
 * DIE REICHWEITE DES KOMMANDOSTROMS (Teil XXV, V0).
 *
 * Gemessen am 2026-09-19 im Gespräch, hier eingefroren: WIE VIELE der
 * Katalogwerkzeuge lassen sich allein mit einem Kommando auslösen — ohne
 * Oberfläche, ohne Viewer, ohne hereingereichtes Subjekt?
 *
 * Der Weg ist `useBearbeitung.fuehreAus(kommando)` OHNE `subjektVon`: dann
 * baut der Store das Subjekt aus dem Journal (`subjektAusStand`, K3). Drei
 * Ausgänge sind möglich:
 *
 *   AUSGEFÜHRT   das Werkzeug kommt ohne Oberfläche aus.
 *   GELIEFERT    sein Ziel lebt in einer geladenen Datei — abgelehnt mit
 *                Grund (K3, Fabios E5). So entschieden, kein Mangel.
 *   OFFEN        sein Ziel ist EIGEN und es scheitert trotzdem: die
 *                Auswertung braucht eine Liste, die nur der Viewer führt
 *                (`el.eigeneFlaechen`, `el.vorlagen`). Das ist die Lücke,
 *                die V3 schliesst.
 *
 * Die Zahlen sind eine RATSCHE: `AUSGEFÜHRT` darf steigen, `OFFEN` muss
 * fallen. Wer eine Zahl ändert, ändert sie hier bewusst und nennt den Grund.
 *
 * Je Werkzeug ein FRISCHES Journal — sonst verschiebt die Probe des einen
 * Werkzeugs die Welt des nächsten (der erste Lauf am 2026-09-19 meldete
 * deshalb falsche Lücken: „loeschen" hatte die Linie entfernt, die „linie-teilen"
 * danach suchte).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { kommandoAusZustand, rahmenOhneBezug } from '../services/kommando/Kommando.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { PROBEN_ALLE, VORLAGEN, WELT } from './hilfen/werkzeugProben.js';

/**
 * Der Stand (63 Werkzeuge). Steigt `ausgefuehrt`, fällt `offen`.
 *   2026-09-19, gemessen:  38 / 23 / 2
 *   2026-09-20, nach V3:   40 / 23 / 0
 */
const HEUTE = Object.freeze({
    werkzeuge: 63,
    ausgefuehrt: 40,
    geliefert: 23,
    /** EIGENES Ziel und trotzdem abgelehnt. Seit V3 keines mehr. */
    offen: Object.freeze([]),
});

class Speicher {
    constructor() { this.d = new Map(); }
    async get(k) { return this.d.has(k) ? JSON.parse(this.d.get(k)) : null; }
    async set(k, v) { this.d.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.d.delete(k); return true; }
    async listKeys(p) { return [...this.d.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

const RAHMEN = rahmenOhneBezug({ hoehenversatz: 300 });

/** Ein frisches Journal mit der Probenwelt (drei Schächte, zwei Haltungen, Linie, Fläche, Platte, Pfosten, Erdbau). */
async function frischeWelt() {
    repo.setBackend(new Speicher());
    setActivePinia(createPinia());
    const ae = useAenderungen();
    await ae.eintragenVorgang(
        [...WELT].map(([globalId, plan]) => ({ art: 'erzeugt', globalId, nachher: plan, modell: 'cde', wer: 'probe' })),
        { vorgang: 'welt' });
    const bearbeitung = useBearbeitung();
    // Die Bibliothek ist eine EINGABE, kein Viewer-Zustand: ohne Oberfläche
    // lädt sie `ladeProfile` mit dem Katalog (V3), hier setzt der Test sie.
    bearbeitung.vorlagen = [...VORLAGEN];
    return { ae, bearbeitung };
}

/** Ein Werkzeug OHNE Oberfläche auslösen — das Kommando aus der Probe, das Subjekt aus dem Stand. */
async function ohneOberflaeche(probe) {
    const { bearbeitung } = await frischeWelt();
    let n = 0;
    const kennungsgeber = (art) => (art === 'operation' ? `op-p${n++}` : `cde-p${n++}`);
    try {
        const { kommando } = kommandoAusZustand({
            werkzeug: nachId(probe.id), werte: probe.werte[0], subjekte: [probe.el],
            punkte: probe.zug ?? null, rahmen: RAHMEN, wer: 'probe',
        });
        return await bearbeitung.fuehreAus(kommando, { rahmen: RAHMEN, kennungsgeber });
    } catch (fehler) {
        return { ausgefuehrt: false, grund: `WIRFT: ${fehler?.message ?? fehler}`, eintraege: [] };
    }
}

afterEach(() => { repo.setBackend(null); });

describe('Die Reichweite des Kommandostroms — ohne Oberfläche', () => {
    it('jedes Katalogwerkzeug: ausgeführt, geliefertes Ziel oder offene Lücke', async () => {
        const erste = new Map();
        for (const p of PROBEN_ALLE) if (!erste.has(p.id)) erste.set(p.id, p);
        const ids = werkzeugKatalog().map(b => b.id);
        expect(ids.filter(id => !erste.has(id)), 'Werkzeug ohne Probe').toEqual([]);

        const ausgefuehrt = [];
        const geliefert = [];
        const offen = [];
        for (const id of ids) {
            const probe = erste.get(id);
            const erg = await ohneOberflaeche(probe);
            if (erg.ausgefuehrt) { ausgefuehrt.push(id); continue; }
            // Ein geliefertes Ziel sagt es selbst — der Satz kommt aus `fuehreAus` (K3).
            if (/geliefertes Bauteil braucht sein geladenes Modell/.test(erg.grund ?? '')) geliefert.push(id);
            else offen.push(`${id}: ${erg.grund}`);
        }

        expect(offen.map(z => z.split(':')[0]), 'eigenes Ziel und trotzdem abgelehnt').toEqual([...HEUTE.offen]);
        expect(geliefert.length, 'geliefertes Ziel').toBe(HEUTE.geliefert);
        expect(ausgefuehrt.length, 'ohne Oberfläche ausführbar').toBe(HEUTE.ausgefuehrt);
        expect(ids.length).toBe(HEUTE.werkzeuge);
    }, 300_000);

    it('was ein Werkzeug AUSSER seinem Ziel braucht, löst der Kontext auf (V3)', async () => {
        // Bis V3 erwarteten beide eine Liste am Subjekt (`el.eigeneFlaechen`,
        // `el.vorlagen`), und die trug nur der Viewer ein: dieselben Kommandos
        // liefen mit hereingereichter Liste durch und scheiterten ohne sie.
        const { ae, bearbeitung } = await frischeWelt();
        const kommando = (id, werkzeug, rest) => ({ schema: 1, id, werkzeug, ziel: [], wer: 'probe',
                                                    wann: '2026-09-20T08:00:00Z', ...rest });

        // Die andere Fläche kommt aus dem JOURNAL.
        const vereinigt = await bearbeitung.fuehreAus(
            kommando('ko-v', 'flaeche-vereinigen', { ziel: ['cde-F1'], neu: ['cde-FU'],
                                                     eingaben: { auswahl: { andere: 'cde-F2' } } }),
            { rahmen: RAHMEN });
        expect(vereinigt.ausgefuehrt, vereinigt.grund ?? '').toBe(true);
        expect(vereinigt.eintraege.map(e => e.art)).toEqual(['geloescht', 'geloescht', 'erzeugt']);
        expect(ae.wirksamerStand('erzeugt').get('cde-FU')?.parameter?.punkte?.length).toBeGreaterThan(3);

        // Die Vorlage kommt aus der geladenen BIBLIOTHEK.
        const getauscht = await bearbeitung.fuehreAus(
            kommando('ko-t', 'koerper-tauschen', { ziel: ['cde-S1'], werte: { vorlage: 'vl-dn1200' } }),
            { rahmen: RAHMEN });
        expect(getauscht.ausgefuehrt, getauscht.grund ?? '').toBe(true);
        expect(ae.wirksamerStand('erzeugt').get('cde-S1')?.parameter?.dn).toBe(1200);

        // Und das FORMULAR füllt seine Auswahl aus derselben Quelle.
        const el = bearbeitung.kandidatenVon('vorlage:gleichesRezept',
            { stand: { bauplan: ae.wirksamerStand('erzeugt').get('cde-S2') } });
        expect(el.map(k => k.id)).toEqual(['vl-dn1200']);
    });
});
