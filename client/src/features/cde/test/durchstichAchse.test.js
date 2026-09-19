// @vitest-environment node
/**
 * DER ABNAHMETEST DES DURCHSTICHS „ACHSE ZIEHEN" (Teil XXIV, K7).
 *
 * Fabios Abnahmekriterium: zwei Schächte setzen, eine Haltung dazwischen
 * ziehen, die Sohlhöhen ändern; das Gefälle wird berechnet, und die Haltung
 * wird markiert, sobald das Mindestgefälle unterschritten ist — alles ohne
 * Oberfläche, allein über Kommandos. Dazu seine Vorgaben: die Haltung
 * entsteht aus Muster „Achse ziehen" plus Katalogeintrag, das Mindestgefälle
 * steht im Katalog, die Geometrie wird als Rezept gespeichert.
 *
 * Umgebung `node`, kein DOM: der Test braucht keinen Browser, keine Engine,
 * kein WebGL — nur die Kommandos, das Journal und den Prüflauf. Die Ablage
 * ist ein Speicher im Test, damit auch die gespeicherte Datei geprüft wird.
 *
 * Die Kommandofolge und die Zahlen stehen in
 * `docs/cde/kommando/durchstich-vorpruefung-und-plan-2026-09-18.md`, C2.
 * Seit K8 (Fabios E6) nennt die Haltung ihre Schächte (`{knoten}`), statt sie
 * in der Draufsicht zufällig zu treffen; der Bauplan trägt den Anschluss.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { cdeAchsenAus } from '../services/CdeAchsen.js';
import { gefaellePromille, punkteDerAchse } from '../services/geometrie/Stationierung.js';
import { eingebauteRegel, setzeRegelwerk } from '../services/regeln/Regelwerk.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';

/** Die Ablage im Speicher — gespeichert wird JSON, wie auf dem Server. */
class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
    journal() { const k = [...this.daten.keys()].find(x => x.endsWith(':aenderungen')); return k ? this.daten.get(k) : null; }
}

let speicher;
beforeEach(() => {
    speicher = new Speicher();
    repo.setBackend(speicher);
    setActivePinia(createPinia());
});
afterEach(() => {
    setzeRegelwerk([]);
    repo.setBackend(null);
});

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T11:00:00Z', ...rest });
const SCHACHT = { kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 };

/** Die sieben Kommandos aus C2 (Nr. 6 ist ein Katalogwechsel, Nr. 7 Rückgängig). */
const C2 = {
    1: kommando('ko-1', 'schacht-zeichnen', { neu: ['cde-A'], werte: { name: 'A', ...SCHACHT },
        eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100.00 }, { ost: 0, nord: -0.001, hoehe: 102.50 }] } }),
    2: kommando('ko-2', 'schacht-zeichnen', { neu: ['cde-B'], werte: { name: 'B', ...SCHACHT },
        eingaben: { zug: [{ ost: 30, nord: 0, hoehe: 99.85 }, { ost: 30, nord: -0.001, hoehe: 102.40 }] } }),
    // Seit K8 (E6) NENNT die Haltung ihre Schächte — Lage und Sohle kommen vom Knoten.
    3: kommando('ko-3', 'rohr-zeichnen', { neu: ['cde-H'], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
        eingaben: { zug: [{ knoten: 'cde-A' }, { knoten: 'cde-B' }] } }),
    4: kommando('ko-4', 'sohlhoehen-setzen', { ziel: ['cde-H'], werte: { anfang: 100.00, ende: 99.91 } }),
    5: kommando('ko-5', 'sohlhoehen-setzen', { ziel: ['cde-H'], werte: { anfang: 100.00, ende: 99.88 } }),
};

/** Der tiefste Punkt des GEBAUTEN Körpers am Ort x — die Sohle im Raum. */
function sohleImRaum(plan, x) {
    const p = rezeptNach(plan.rezept).baue(plan.parameter).getAttribute('position').array;
    let tief = Infinity;
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < 0.01) tief = Math.min(tief, p[i + 1]);
    return tief;
}

function lauf() {
    const b = useBearbeitung();
    const ae = useAenderungen();
    const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
    const achseH = () => subjektAusStand('cde-H', { wirksamerStand: ae.wirksamerStand }).achse;
    return { b, ae, plan, achseH };
}

describe('Abnahme C2 — nur Kommandos, ohne Oberfläche', () => {
    it('Schächte, Haltung, Sohlhöhen, Markierung, Katalog, Rückgängig', async () => {
        const { b, ae, plan, achseH } = lauf();

        // 1 · Schacht A — ein Eintrag, die Kennung aus `neu`, der Knoten auf seiner Sohle.
        let erg = await b.fuehreAus(C2[1]);
        expect(erg.ausgefuehrt).toBe(true);
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-A']);
        // 2 · Schacht B
        erg = await b.fuehreAus(C2[2]);
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-B']);
        const knoten = Object.fromEntries(cdeAchsenAus(ae.wirksamerStand('erzeugt')).knoten.map(k => [k.globalId, k.punkt.y]));
        expect(knoten).toEqual({ 'cde-A': 100, 'cde-B': 99.85 });

        // 3 · Haltung A → B: 0,15 m auf 30 m = 5,0 ‰ ≥ 1000/300 = 3,33 ‰ — keine Markierung,
        //     kein loses Ende, kein Schacht ohne Anschluss.
        erg = await b.fuehreAus(C2[3]);
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-H']);
        expect(rezeptNach('rohr').sohlen.lies(plan('cde-H').parameter)).toEqual([100, 99.85]);
        expect(plan('cde-H').parameter.anschluss).toEqual({ anfang: 'cde-A', ende: 'cde-B' });
        expect(gefaellePromille(punkteDerAchse(achseH()))).toBeCloseTo(5.0, 9);
        expect(b.pruefeEigenes()).toEqual([]);

        // 4 · Ende := 99,91 → 3,0 ‰ < 3,33 ‰: AUSGEFÜHRT und markiert, nicht abgelehnt.
        const vorher4 = ae.eintraege.length;
        erg = await b.fuehreAus(C2[4]);
        expect(erg.ausgefuehrt).toBe(true);
        expect(ae.eintraege.length).toBe(vorher4 + 1);
        expect(Math.abs(sohleImRaum(plan('cde-H'), 30) - 99.91)).toBeLessThan(0.001);
        expect(b.befundeVon('cde-H')).toEqual([expect.objectContaining({
            regel: 'gefaelle_zu_flach', wert: '3.0 ‰', grenze: 'mindestens 3.3 ‰', quelle: 'Faustregel 1:DN',
        })]);
        const standNach4 = JSON.parse(JSON.stringify(plan('cde-H')));

        // 5 · Ende := 99,88 → 4,0 ‰ — die Markierung ist weg.
        await b.fuehreAus(C2[5]);
        expect(gefaellePromille(punkteDerAchse(achseH()))).toBeCloseTo(4.0, 9);
        expect(b.befundeVon('cde-H')).toEqual([]);

        // Jeder Vorgang trägt seinen Beleg mit Schema 1, und der Vorgang IST das Kommando.
        const belege = ae.eintraege.filter(e => e.kommando).map(e => [e.kommando.id, e.kommando.schema, e.vorgang]);
        expect(belege).toEqual(['ko-1', 'ko-2', 'ko-3', 'ko-4', 'ko-5'].map(id => [id, KOMMANDO_SCHEMA, id]));

        // 6 · Das Mindestgefälle steht im KATALOG: ein Büro-Regelwerk mit 5 ‰ markiert 4,0 ‰ wieder.
        setzeRegelwerk([{ id: 'gefaelleMindestPromille', wert: 5, herkunft: 'buero' }]);
        expect(b.befundeVon('cde-H')).toEqual([expect.objectContaining({
            regel: 'gefaelle_zu_flach', wert: '4.0 ‰', grenze: 'mindestens 5.0 ‰', quelle: 'Büro-Regelwerk',
        })]);

        // 7 · Rückgängig — EIN Schritt: der Stand wie nach Kommando 4, nicht weiter zurück.
        const vorher7 = ae.eintraege.length;
        await ae.zurueck('fabio');
        expect(ae.eintraege.length).toBe(vorher7 - 1);
        expect(plan('cde-H')).toEqual(standNach4);
        expect(ae.eintraege.some(e => e.vorgang === 'ko-4')).toBe(true);
        expect(ae.eintraege.some(e => e.vorgang === 'ko-5')).toBe(false);
        // Mit dem Büro-Regelwerk ist 3,0 ‰ erst recht markiert.
        expect(b.befundeVon('cde-H').map(x => [x.regel, x.wert, x.quelle])).toEqual([['gefaelle_zu_flach', '3.0 ‰', 'Büro-Regelwerk']]);
    });

    it('im Journal steht das Rezept, nicht das Ergebnis: kein Gefälle, kein Netz, kein Körper', async () => {
        const { b } = lauf();
        for (const n of [1, 2, 3, 4, 5]) expect((await b.fuehreAus(C2[n])).ausgefuehrt).toBe(true);
        const datei = speicher.journal();
        expect(datei).toBeTruthy();
        const roh = JSON.parse(datei);
        const schritte = [...(roh.commits ?? []).flatMap(c => c.schritte ?? []), ...(roh.sitzung?.schritte ?? [])];
        expect(schritte).toHaveLength(5);
        for (const s of schritte) {
            expect(Object.keys(s.nachher).sort()).toEqual(expect.arrayContaining(['rezept', 'parameter']));
            expect(Object.keys(s.nachher.parameter).sort()).toEqual(['achsbezug', 'anschluss', 'dn', 'kategorie', 'name', 'punkte'].filter(k => k in s.nachher.parameter).sort());
        }
        // Nichts Gerechnetes: kein Gefälle, kein Netz (Kanten-/Knotenlisten, von/nach), kein Körper.
        // Ein Knoten als VERWEIS im Beleg (`{knoten: 'cde-A'}`, K8) ist Absicht, kein Ergebnis.
        expect(datei).not.toMatch(/gefaelle|promille|"netz"|"kanten"|"kantenAb"|"kantenAn"|"von"|"nach"|positions|triCount/i);
        for (const s of schritte) expect(JSON.stringify(s.nachher)).not.toMatch(/"knoten"/);
        // Jedes Kommando trägt die Schemaversion — in der gespeicherten Datei.
        const belege = schritte.filter(s => s.kommando).map(s => s.kommando.schema);
        expect(belege).toEqual([1, 1, 1, 1, 1]);
    });

    it('wirft die Auswertung von Kommando 3, ist das Journal wie nach Kommando 2 — auch in der Datei', async () => {
        const { b, ae } = lauf();
        for (const n of [1, 2]) await b.fuehreAus(C2[n]);
        const imSpeicher = JSON.stringify(ae.eintraege);
        const inDatei = speicher.journal();
        // Kommando 3 ohne `neu`, und der Kennungsgeber wirft — die Auswertung bricht ab.
        expect(C2[3].eingaben.zug).toEqual([{ knoten: 'cde-A' }, { knoten: 'cde-B' }]);
        const { neu, ...ohneNeu } = C2[3];
        await expect(b.fuehreAus(ohneNeu, { kennungsgeber: () => { throw new Error('Auswertung wirft'); } }))
            .rejects.toThrow('Auswertung wirft');
        expect(JSON.stringify(ae.eintraege)).toBe(imSpeicher);
        expect(speicher.journal()).toBe(inDatei);
    });

    it('die Haltung entsteht aus Muster „Achse ziehen" plus Katalogeintrag — kein eigenes Haltungswerkzeug', () => {
        const w = nachId('rohr-zeichnen');
        expect(w.ausRezept).toBe('rohr');                   // Katalogeintrag
        expect(w.eingabe).toBe('zug');                      // Muster: ein Zug
        expect(rezeptNach('rohr').netzrolle).toBe('kante'); // was es im Netz ist, sagt das Rezept
        // Die Mindestgefälle-Regel ist ein Katalogeintrag mit benannter Formel — keine Zahl im Code.
        expect(eingebauteRegel('gefaelleMindestPromille')).toMatchObject({ wert: null, formel: 'einsDurchNennmass' });
    });
});
