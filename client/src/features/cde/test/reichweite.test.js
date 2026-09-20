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
import { PROBEN_ALLE, WELT } from './hilfen/werkzeugProben.js';

/** Der Stand am 2026-09-19 (63 Werkzeuge). Steigt `ausgefuehrt`, fällt `offen`. */
const HEUTE = Object.freeze({
    werkzeuge: 63,
    ausgefuehrt: 38,
    geliefert: 23,
    /** EIGENES Ziel und trotzdem abgelehnt — die Lücke aus V3. */
    offen: Object.freeze(['flaeche-vereinigen', 'koerper-tauschen']),
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
    return { ae, bearbeitung: useBearbeitung() };
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

    it('die beiden offenen Werkzeuge scheitern an einer LISTE, nicht am Schema', async () => {
        // Das Kommando nennt die Partnerfläche korrekt; `werteAus` findet sie nur
        // in `el.eigeneFlaechen`, und die führt `subjektAusStand` nicht (V3).
        const { bearbeitung } = await frischeWelt();
        const zweite = await bearbeitung.fuehreAus({
            schema: 1, id: 'ko-f2', werkzeug: 'flaeche-zeichnen', ziel: [], neu: ['cde-F2'],
            werte: { name: 'F2', kategorie: 'IFCSLAB', hoehe: '' },
            eingaben: { umriss: [{ ost: 10, nord: -30, hoehe: 100 }, { ost: 20, nord: -30, hoehe: 100 },
                                 { ost: 20, nord: -40, hoehe: 100 }, { ost: 10, nord: -40, hoehe: 100 }] },
            wer: 'probe', wann: '2026-09-20T08:00:00Z',
        }, { rahmen: RAHMEN });
        expect(zweite.ausgefuehrt).toBe(true);

        const kommando = (id) => ({
            schema: 1, id, werkzeug: 'flaeche-vereinigen', ziel: ['cde-F1'],
            eingaben: { auswahl: { andere: 'cde-F2' } }, wer: 'probe', wann: '2026-09-20T08:00:00Z',
        });
        const erg = await bearbeitung.fuehreAus(kommando('ko-v'), { rahmen: RAHMEN });
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/fehlt der Bezug/);

        // Dasselbe Kommando mit der Liste, die der Viewer führen würde: es läuft.
        // Das Schema trägt also — es fehlt der Auflöser (V3).
        const mitListe = (gid) => {
            const s = subjektAusStand(gid, { wirksamerStand: useAenderungen().wirksamerStand, rahmen: RAHMEN });
            if (!s) return null;
            const flaechen = [...useAenderungen().wirksamerStand('erzeugt')]
                .filter(([, plan]) => plan.rezept === 'flaeche')
                .map(([globalId, plan]) => ({ globalId, name: plan.parameter?.name ?? globalId,
                                              punkte: plan.parameter?.punkte, hoehenversatz: 300 }));
            return { ...s, eigeneFlaechen: flaechen };
        };
        const mit = await bearbeitung.fuehreAus({ ...kommando('ko-v2'), neu: ['cde-FU'] },
                                                { rahmen: RAHMEN, subjektVon: mitListe });
        expect(mit.ausgefuehrt, mit.grund ?? '').toBe(true);
        expect(mit.eintraege).toHaveLength(3);          // beide Flächen weg, die vereinigte neu
    });
});
