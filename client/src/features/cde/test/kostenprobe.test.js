// @vitest-environment node
/**
 * WAS EIN NEUES WERKZEUG KOSTET (Teil XXV, V0).
 *
 * Sechs Fälle, am 2026-09-19 im Gespräch gemessen und hier eingefroren. Die
 * Frage je Fall ist immer dieselbe: reicht ein Eintrag im KATALOG (Daten aus
 * einem Repo), oder muss der KERN ein neues Wort lernen?
 *
 *   a) Rechteckkanal statt Kreisrohr        Katalog — 0 Zeilen Code
 *   b) Bordstein: Profil neben der Achse    Katalog SEIT V2 — `versatzU`, `polygon`
 *   c) Leitpfosten als Punktobjekt          Katalog — Rezept da, Vorlage genügt
 *   d) Gerinnesohle als Zielfläche          Katalog — Eintrag der Operation (V7)
 *   e) mehrere Bauteile gleichzeitig        Katalog — ein Feld `mehrfach`
 *   f) löscht eines und erzeugt zwei        Katalogeintrag mit eigener Rechnung
 *
 * Das System wächst mit DATEN, solange ein Werkzeug in den fünf Vokabularen
 * bleibt (Geometrieart, Profilart, Bauform, Netzrolle, Setzer-Operation). Ein
 * neues WORT kostet den Kern. Fall b ist der Beweis dafür — und der Fall, den
 * V2 auf die Katalogseite holt.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { rahmenOhneBezug } from '../services/kommando/Kommando.js';
import { flaecheVon } from '../services/gelaende/Operationen.js';
import { scheitelAnAchse } from '../services/Achsbezug.js';
import { WELT } from './hilfen/werkzeugProben.js';

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
const K = (id, werkzeug, rest) => ({ schema: 1, id, werkzeug, ziel: [], wer: 'probe',
                                     wann: '2026-09-20T08:00:00Z', ...rest });

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => { registriereRezepte([]); repo.setBackend(null); });

async function welt() {
    const ae = useAenderungen();
    await ae.eintragenVorgang(
        [...WELT].map(([globalId, plan]) => ({ art: 'erzeugt', globalId, nachher: plan, modell: 'cde', wer: 'probe' })),
        { vorgang: 'welt' });
    return { ae, bearbeitung: useBearbeitung() };
}

/** Der tiefste und höchste Punkt eines gebauten Körpers, und seine Ausdehnung quer zur Achse. */
function huelle(geometrie) {
    const p = geometrie.getAttribute('position').array;
    const aus = { yMin: Infinity, yMax: -Infinity, zMin: Infinity, zMax: -Infinity };
    for (let i = 0; i < p.length; i += 3) {
        aus.yMin = Math.min(aus.yMin, p[i + 1]); aus.yMax = Math.max(aus.yMax, p[i + 1]);
        aus.zMin = Math.min(aus.zMin, p[i + 2]); aus.zMax = Math.max(aus.zMax, p[i + 2]);
    }
    return aus;
}

// ── (a) Ein Rechteckkanal ist ein JSON ──────────────────────────────────────

/** Sonst identisch zum Rohr: Achse, Kante im Netz — nur das Profil ist ein Rechteck. */
const RECHTECKKANAL = Object.freeze({
    id: 'rechteckkanal', titel: 'Rechteckkanal', icon: 'laengsschnitt',
    bauform: 'achse+profil', kategorieVorgabe: 'IFCPIPESEGMENT',
    mindestPunkte: 2, geschlossen: false, netzrolle: 'kante',
    felder: [
        { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
        { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
        { name: 'hoehe', titel: 'Sohlhöhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        { name: 'breite', titel: 'Breite', einheit: 'mm', typ: 'zahl', gueltig: { ueber: 0 }, vorgabe: 800, setzbar: true },
        { name: 'tiefe', titel: 'Höhe', einheit: 'mm', typ: 'zahl', gueltig: { ueber: 0 }, vorgabe: 1200, setzbar: true },
    ],
    geometrie: { art: 'sweep', profil: { art: 'rechteck', breite: 'breite', tiefe: 'tiefe', einheit: 'mm' } },
});

describe('a — ein Rechteckkanal kostet keine Zeile Code', () => {
    it('das Schema nimmt ihn an, und der Katalog macht drei Werkzeuge daraus', () => {
        const vorher = werkzeugKatalog().length;
        expect(pruefeEintrag('rezept', RECHTECKKANAL)).toEqual({ ok: true, fehler: [] });
        expect(registriereRezepte([RECHTECKKANAL]).befunde).toEqual([]);
        const neu = werkzeugKatalog().map(b => b.id).filter(id => id.startsWith('rechteckkanal'));
        expect(neu).toEqual(['rechteckkanal-zeichnen', 'rechteckkanal-breite-setzen', 'rechteckkanal-tiefe-setzen']);
        expect(werkzeugKatalog().length).toBe(vorher + 3);
        // Der Fang auf Knoten kommt aus der NETZROLLE, nicht aus dem Namen (K9).
        expect(nachId('rechteckkanal-zeichnen').eingaben?.[0]?.fang).toBe('knoten');
    });

    it('sein Körper liegt auf der kommandierten Sohle — die Fähigkeit rechnet aus dem Profil', () => {
        registriereRezepte([RECHTECKKANAL]);
        const r = rezeptNach('rechteckkanal');
        expect(r.netzrolle).toBe('kante');
        const plan = { punkte: [[0, 100, 0], [20, 99.9, 0]], breite: 800, tiefe: 1200, achsbezug: 'sohle' };
        expect(r.sohlen.abstand(plan)).toBeCloseTo(0.6, 9);       // halbe Tiefe
        expect(r.sohlen.lies(plan)).toEqual([100, 99.9]);
        const h = huelle(r.baue(plan));
        expect(h.yMin).toBeCloseTo(99.9, 3);                      // Sohle im Raum = kommandierte Sohle
        expect(h.yMax).toBeCloseTo(101.2, 3);                     // + Profilhöhe
    });
});

// ── (b) Ein Bordstein: Profil NEBEN der Achse ───────────────────────────────

const BORDSTEIN = Object.freeze({
    id: 'bordstein', titel: 'Bordstein', bauform: 'achse+profil', kategorieVorgabe: 'IFCKERB',
    mindestPunkte: 2, geschlossen: false,
    felder: [
        { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
        { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
        { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        { name: 'breite', titel: 'Breite', einheit: 'm', typ: 'zahl', gueltig: { ueber: 0 }, vorgabe: 0.15 },
        { name: 'tiefe', titel: 'Höhe des Steins', einheit: 'm', typ: 'zahl', gueltig: { ueber: 0 }, vorgabe: 0.3 },
    ],
});
const mitProfil = (profil) => ({ ...BORDSTEIN, geometrie: { art: 'sweep', profil } });
const RECHTECK = { art: 'rechteck', breite: 'breite', tiefe: 'tiefe', einheit: 'm' };
const BORDSTEIN_PLAN = { punkte: [[0, 100, 0], [10, 100, 0]], breite: 0.15, tiefe: 0.3 };

describe('b — ein Bordstein steht NEBEN seiner Achse (V2)', () => {
    it('ohne Versatz sitzt das Profil auf der Achse: quer von −b/2 bis +b/2', () => {
        registriereRezepte([mitProfil(RECHTECK)]);
        const h = huelle(rezeptNach('bordstein').baue(BORDSTEIN_PLAN));
        expect(h.zMin).toBeCloseTo(-0.075, 4);
        expect(h.zMax).toBeCloseTo(0.075, 4);
    });

    it('A1: mit `versatzU` ist der Bordstein ein JSON — die Linie ist seine Kante', () => {
        // Bis V2 war das nicht ausdrückbar: jedes Profil war um den Ursprung
        // zentriert, und ein `versatzU` bestand die Prüfung, ohne zu wirken.
        const versetzt = mitProfil({ ...RECHTECK, versatzU: 0.075 });
        expect(pruefeEintrag('rezept', versetzt)).toEqual({ ok: true, fehler: [] });
        expect(registriereRezepte([versetzt]).aktiv).toEqual(['bordstein']);
        // Positiv ist LINKS in Zeichenrichtung; die Achse läuft nach Osten,
        // der Stein liegt also nördlich davon — und die Linie ist seine Kante.
        const h = huelle(rezeptNach('bordstein').baue(BORDSTEIN_PLAN));
        expect(h.zMin).toBeCloseTo(-0.15, 4);        // vorher −0,075
        expect(h.zMax).toBeCloseTo(0, 4);            // vorher +0,075
        // Und die Höhe bleibt, wo sie war — der Versatz ist nur seitlich.
        expect(h.yMin).toBeCloseTo(99.85, 4);
        expect(h.yMax).toBeCloseTo(100.15, 4);
    });

    it('der Versatz darf auch ein FELD sein — dann stellt ihn das Formular', () => {
        const ueberFeld = mitProfil({ ...RECHTECK, versatzU: 'abstand' });
        const mitFeld = { ...ueberFeld, felder: [...ueberFeld.felder,
            { name: 'abstand', titel: 'Abstand zur Achse', einheit: 'm', typ: 'zahl', vorgabe: 0.075 }] };
        expect(pruefeEintrag('rezept', mitFeld)).toEqual({ ok: true, fehler: [] });
        registriereRezepte([mitFeld]);
        const h = huelle(rezeptNach('bordstein').baue({ ...BORDSTEIN_PLAN, abstand: 0.5 }));
        expect(h.zMin).toBeCloseTo(-0.575, 4);
        expect(h.zMax).toBeCloseTo(-0.425, 4);
    });

    it('V1 bleibt scharf: ein Tippfehler im Profil wird abgelehnt, mit Vorschlag', () => {
        const { ok, fehler } = pruefeEintrag('rezept', mitProfil({ ...RECHTECK, versatzX: 0.5 }));
        expect(ok).toBe(false);
        expect(fehler.join(' ')).toMatch(/versatzX.*meintest du .versatzU/);
    });

    it('ein POLYGON beschreibt seinen Querschnitt selbst — Sohle und Scheitel stimmen', () => {
        // Unsymmetrisch mit Absicht: die Sohle liegt AUF der Achse (v = 0), der
        // Scheitel 0,30 m darüber. Die alte Rechnung „Sohle + 2 × Sohlabstand"
        // hätte den Scheitel auf die Sohle gelegt.
        const eiform = { ...BORDSTEIN, id: 'eiprofil', kategorieVorgabe: 'IFCPIPESEGMENT',
                         geometrie: { art: 'sweep', profil: { art: 'polygon', einheit: 'm',
                                      punkte: [[-0.1, 0], [0.1, 0], [0.1, 0.2], [-0.1, 0.3]] } } };
        expect(pruefeEintrag('rezept', eiform)).toEqual({ ok: true, fehler: [] });
        registriereRezepte([eiform]);
        const plan = { punkte: [[0, 100, 0], [10, 100, 0]], achsbezug: 'sohle' };
        const h = huelle(rezeptNach('eiprofil').baue(plan));
        expect(h.yMin).toBeCloseTo(100, 4);          // Sohle auf der kommandierten Höhe
        expect(h.yMax).toBeCloseTo(100.3, 4);         // float32 im Puffer: 0,1 mm genau
        const form = rezeptNach('eiprofil').formAus(plan, 'linie');
        expect(form.sohlabstand).toBeCloseTo(0, 9);
        expect(form.profilhoehe).toBeCloseTo(0.3, 9);
        expect(scheitelAnAchse(100, form)).toBeCloseTo(100.3, 9);
        // Gegenprobe: ohne die Profilhöhe fällt der Scheitel auf die Sohle.
        expect(scheitelAnAchse(100, { ...form, profilhoehe: undefined })).toBeCloseTo(100, 9);
    });

    it('ein Polygon mit weniger als drei Punkten ist keines', () => {
        const zuKlein = { ...BORDSTEIN, geometrie: { art: 'sweep', profil: {
            art: 'polygon', einheit: 'm', punkte: [[0, 0], [1, 0]] } } };
        expect(pruefeEintrag('rezept', zuKlein).ok).toBe(false);
    });
});

// ── (c) Ein Leitpfosten ist eine Vorlage ────────────────────────────────────

describe('c — ein Punktobjekt gibt es schon, ein bestimmtes ist eine Vorlage', () => {
    it('das Rezept `pfosten` trägt Bauform, Stab, Plansymbol und IFC-Typ', () => {
        const p = rezeptNach('pfosten');
        expect(p.bauform).toBe('punkt');
        expect(p.kategorieVorgabe).toBe('IFCSIGN');
        expect(p.netzrolle ?? null).toBe(null);          // keine Rolle im Netz
        expect(p.hoechstPunkte).toBe(1);                 // ein Ort
    });

    it('ein Leitpfosten ist ein Eintrag mit Vorgaben — kein Code', () => {
        const vorlage = { id: 'vl-leitpfosten', name: 'Leitpfosten', rezept: 'pfosten',
                          vorgaben: { laenge: 1.0, breite: 0.11, tiefe: 0.11 } };
        expect(pruefeEintrag('vorlage', vorlage)).toEqual({ ok: true, fehler: [] });
    });
});

// ── (d) Eine weitere Zielfläche ─────────────────────────────────────────────

describe('d — eine Zielfläche ist eine Angabe am Eintrag der Operation', () => {
    const GERINNE = { art: 'gerinne', parameter: {
        achse: [{ x: 0, z: 0 }, { x: 10, z: 0 }], sohleAnfang: 98, sohleEnde: 97.8,
        sohlbreite: 1, boeschung: 1.5,
    } };

    it('der Leser ist allgemein: wer eine Fläche HAT, taugt als Ziel', () => {
        // `flaecheVon` fragt den Eintrag, nie den Namen (Durchstich 2).
        // Bis V7 hatte GENAU EINE Operation eine Fläche — der Mechanismus
        // diente einem Paar. Jetzt sind es zwei, und die zweite kostete
        // keine Zeile am Auföser: nur eine Angabe an ihrem Eintrag.
        expect(flaecheVon({ art: 'planum', parameter: { hoehe: 101 } })).toBeTypeOf('function');
        expect(flaecheVon(GERINNE)).toBeTypeOf('function');
    });

    it('die Gerinnefläche ist die gerechnete Sohle, nicht eine zweite Formel', () => {
        const an = flaecheVon(GERINNE);
        expect(an(0, 0)).toBeCloseTo(98, 9);            // Anfang
        expect(an(10, 0)).toBeCloseTo(97.8, 9);         // Ende
        expect(an(5, 0)).toBeCloseTo(97.9, 9);          // dazwischen linear
        // Neben der Sohle steigt sie mit der Böschung 1 : 1,5 — 0,5 m Sohlrand,
        // dann 1,5 m quer: 1,0 m über der Sohle.
        expect(an(5, 2)).toBeCloseTo(97.9 + 1, 9);
    });
});

// ── (e) Mehrere Bauteile in EINEM Kommando ──────────────────────────────────

describe('e — mehrere Bauteile gleichzeitig kosten ein Feld', () => {
    it('`mehrfach` steht am Eintrag; das Kommando nennt seine Ziele als Liste', async () => {
        expect(nachId('umbenennen').mehrfach).toBe(true);
        const { ae, bearbeitung } = await welt();
        const erg = await bearbeitung.fuehreAus(
            K('ko-viele', 'umbenennen', { ziel: ['cde-S1', 'cde-S2', 'cde-S3'],
                                          werte: { muster: 'SCH-{n:3}', beginnBei: 1 } }),
            { rahmen: RAHMEN });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(erg.eintraege).toHaveLength(3);
        // EIN Vorgang, ein Rückgängig (K2).
        expect([...new Set(erg.eintraege.map(e => e.vorgang))]).toEqual(['ko-viele']);
        await ae.zurueck('probe');
        expect(['cde-S1', 'cde-S2', 'cde-S3'].map(g => ae.wirksamerStand('bezeichnung').get(g) ?? null))
            .toEqual([null, null, null]);
    });
});

// ── (f) Löschen und Erzeugen in einem Zug ───────────────────────────────────

describe('f — ein Werkzeug darf löschen und erzeugen', () => {
    it('„Haltung teilen": ein Kommando, drei Schritte, ein Vorgang', async () => {
        const { bearbeitung } = await welt();
        const erg = await bearbeitung.fuehreAus(
            K('ko-teilen', 'haltung-teilen', { ziel: ['cde-H1'], neu: ['cde-T1', 'cde-T2'],
                                               werte: { station: 10 } }),
            { rahmen: RAHMEN });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(erg.eintraege.map(e => e.art)).toEqual(['geloescht', 'erzeugt', 'erzeugt']);
        expect([...new Set(erg.eintraege.map(e => e.vorgang))]).toEqual(['ko-teilen']);
        // Die Stücke behalten das Rezept ihrer Vorgängerin (N1, Teil XXIII).
        expect(erg.eintraege.slice(1).map(e => e.nachher.rezept)).toEqual(['rohr', 'rohr']);
    });
});
