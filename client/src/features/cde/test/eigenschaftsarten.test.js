// @vitest-environment jsdom
/**
 * Die Eigenschaftsarten — Schicht 3 zwischen Operationen und Katalog
 * (Teil XXIII, AE; Audit „Bearbeitungsstruktur" 2026-09-18, Befund S4).
 *
 * Eine Operation fragt, was ein Bauteil HAT: eine Achse, eine Rolle im Netz,
 * eine Grösse seines Typs. Die Antwort steht im Katalog — Rezept, Bauformregel,
 * Typprofil. Geprüft wird am ECHTEN Weg: der Store ordnet ein
 * (`einordne` → `passendeKontext` → `moeglich`), die Toolbox erklärt mit
 * demselben Kontext (`herleite`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
    EIGENSCHAFTSARTEN, eigenschaftenVon, fehlendeEigenschaften, netzrolleVon, verlangtVon,
} from '../services/eigenschaften/Eigenschaftsarten.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { rezeptFuerNetzrolle, rezeptNach } from '../services/Bauteilrezepte.js';
import { netzrollenWurzeln, profilFuer } from '../services/bauform/Typprofile.js';
import { MITGELIEFERTE_REGELN, bauformAusRegel } from '../services/bauform/Bauformregeln.js';
import { AXIS_CATEGORIES_DEFAULT } from '../services/AxisAnnotations.js';
import { herleite, warumNicht } from '../services/Herleitung.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';

const NETZ = ['schacht-verschieben', 'schacht-einfuegen', 'schacht-entfernen', 'haltung-teilen',
              'an-schacht-anschliessen', 'trasse-aendern', 'strang-gefaelle-setzen', 'strang-massnahme',
              'strang-umbenennen', 'fliessrichtung-setzen'];

describe('Das Vokabular ist knapp — und jede Art hat einen Nutzer', () => {
    it('drei Arten: Achse, Rolle im Netz, Grösse', () => {
        expect(Object.keys(EIGENSCHAFTSARTEN).sort()).toEqual(['achse', 'mass', 'netzrolle']);
    });
    it('jede Art wird von mindestens einem Werkzeug verlangt (Kriterium 10)', async () => {
        const { BEARBEITUNGEN } = await import('../services/Bearbeitungen.js');
        const benutzt = new Set(BEARBEITUNGEN.flatMap(verlangtVon).map(a => a.split(':')[0]));
        for (const art of Object.keys(EIGENSCHAFTSARTEN)) expect(benutzt.has(art), art).toBe(true);
    });
});

describe('Die Rolle im Netz kommt aus dem Katalog', () => {
    it('Typprofil der Familie: Fliessabschnitt → Kante, Schacht → Knoten, Träger → keine', () => {
        expect(netzrolleVon({ typprofil: profilFuer('IFCPIPESEGMENT') })).toBe('kante');
        expect(netzrolleVon({ typprofil: profilFuer('IFCCABLESEGMENT') })).toBe('kante');   // erbt von IfcFlowSegment
        expect(netzrolleVon({ typprofil: profilFuer('IFCDISTRIBUTIONCHAMBERELEMENT') })).toBe('knoten');
        expect(netzrolleVon({ typprofil: profilFuer('IFCBEAM') })).toBeNull();
    });
    it('Rezept eines eigenen Bauteils: Rohr → Kante, Schacht → Knoten', () => {
        expect(netzrolleVon({ rezept: rezeptNach('rohr') })).toBe('kante');
        expect(netzrolleVon({ rezept: rezeptNach('schacht') })).toBe('knoten');
        expect(netzrolleVon({ rezept: rezeptNach('linie') })).toBeNull();
    });
    it('Bauformregel eines Proxys: ProVI „Haltung" → Kante, „Schacht" → Knoten', () => {
        const ctx = (name) => ({ category: 'IFCBUILDINGELEMENTPROXY', attributes: { Name: name }, psets: {} });
        expect(bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Haltung')).regel.netzrolle).toBe('kante');
        expect(bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Schacht')).regel.netzrolle).toBe('knoten');
    });
    it('das Spezifischere gewinnt: Rezept vor Regel vor Typprofil', () => {
        expect(netzrolleVon({ rezept: { netzrolle: 'knoten' }, regel: { netzrolle: 'kante' }, typprofil: { netzrolle: 'kante' } })).toBe('knoten');
        expect(netzrolleVon({ regel: { netzrolle: 'knoten' }, typprofil: { netzrolle: 'kante' } })).toBe('knoten');
        expect(netzrolleVon({ typprofil: { netzrolle: 'unsinn' } })).toBeNull();
    });
    it('die Engine liest DIESELBEN Familien — und der Rückfall der Nebenleser ist deckungsgleich', () => {
        expect(netzrollenWurzeln('kante')).toEqual(AXIS_CATEGORIES_DEFAULT);
        expect(netzrollenWurzeln('knoten')).toEqual(['IFCDISTRIBUTIONCHAMBERELEMENT']);
    });
});

describe('Was ein Bauteil hat', () => {
    it('ein geliefertes Rohr: Achse, Kante, seine Grössen', () => {
        const e = eigenschaftenVon({ bauform: 'achse+profil', typprofil: profilFuer('IFCPIPESEGMENT') });
        expect([...e]).toEqual(expect.arrayContaining(['achse', 'netzrolle:kante', 'mass:sohlhoeheAnfang', 'mass:sohlhoeheEnde']));
    });
    it('`brauchtRolle` ist die Kurzform von `mass:`', () => {
        expect(verlangtVon({ brauchtRolle: ['a', 'b'], braucht: ['achse'] })).toEqual(['achse', 'mass:a', 'mass:b']);
        expect(fehlendeEigenschaften(new Set(['achse', 'mass:a']), ['achse', 'mass:a', 'mass:b'])).toEqual(['mass:b']);
    });
});

describe('Die Netzwerkzeuge hängen an der Netzrolle, nicht am Namen', () => {
    const geliefert = (kat, bauform) => passende({ bauform, guete: 'gemessen' }, { typprofil: profilFuer(kat) }).map(x => x.id);

    it('am gelieferten Rohr und Schacht: dieselben Werkzeuge wie vor AE', () => {
        const rohr = geliefert('IFCPIPESEGMENT', 'achse+profil');
        for (const id of ['schacht-einfuegen', 'haltung-teilen', 'an-schacht-anschliessen', 'trasse-aendern',
                          'strang-gefaelle-setzen', 'strang-massnahme', 'strang-umbenennen', 'fliessrichtung-setzen']) {
            expect(rohr, id).toContain(id);
        }
        const schacht = geliefert('IFCDISTRIBUTIONCHAMBERELEMENT', 'koerper');
        for (const id of ['schacht-verschieben', 'schacht-entfernen']) expect(schacht, id).toContain(id);
    });

    it('am Träger: KEIN Netzwerkzeug mehr — „Haltung teilen" machte daraus Rohre', () => {
        const traeger = geliefert('IFCBEAM', 'achse+profil');
        for (const id of NETZ) expect(traeger, id).not.toContain(id);
        // Die allgemeinen Werkzeuge bleiben.
        expect(traeger).toContain('verschieben');
    });

    it('warum nicht? Die fehlende Eigenschaft steht da', () => {
        const w = warumNicht(nachId('haltung-teilen'), { bauform: 'achse+profil', guete: 'gemessen', typprofil: profilFuer('IFCBEAM') });
        expect(w).toMatch(/Rolle „Kante" im Netz/);
        expect(w).toMatch(/Typprofil oder eine Bauformregel/);
    });

    it('warum nicht? Bei ZWEI fehlenden Grössen beide — vorher suchte es nach „a,b"', () => {
        const w = warumNicht(nachId('strang-gefaelle-setzen'), { bauform: 'achse+profil', guete: 'gemessen', typprofil: null });
        expect(w).toMatch(/sohlhoeheAnfang/);
        expect(w).toMatch(/sohlhoeheEnde/);
    });
});

/** Wie in `bauformregeln.test.js`: ein Resolver, der Formen liefert, wie die Engine sie misst. */
const resolverMit = (formen) => ({
    forElements: () => ({
        async getForm(form) { return formen[form] ?? { form, data: null, perElement: [], warnings: [] }; },
    }),
});
const netzMitAchse = (source) => ({
    axis: { form: 'axis', perElement: [{ polyline: [[0, 0, 0], [10, 0, 0]], source, warnings: [] }] },
    solid: { form: 'solid', data: { positions: new Float64Array(9), triCount: 1, closed: true }, warnings: [] },
});
const proxy = (name, gid = 'P1') => ({ globalId: gid, modelId: 'm1', localId: 1, category: 'IFCBUILDINGELEMENTPROXY', name });

describe('Am echten Weg: Store ordnet ein, Toolbox erklärt mit demselben Kontext', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
    const toolboxIds = (b) => herleite({ el: b.bauteil, einordnung: b.einordnung, profilSatz: b.profilSatz, kontext: b.passendeKontext })
        .gruppen.flatMap(g => g.eintraege.map(e => e.id));

    it('ProVI-Proxy „Haltung" mit gemessener Achse: die Regel gibt Form UND Rolle — „Haltung teilen" steht da', async () => {
        const b = useBearbeitung();
        await b.einordne(proxy('Haltung'), resolverMit(netzMitAchse('extrusion')));
        expect(b.einordnung.bauform).toBe('achse+profil');
        expect(b.einordnung.guete).toBe('gemessen');
        const ids = b.moeglich.map(x => x.id);
        expect(ids).toContain('haltung-teilen');
        // Ohne Grössen im Typprofil KEINE Strangwerkzeuge: die Engine baut ihr
        // Netz nur aus Katalogfamilien, ein Knopf ohne Netz täte nichts.
        expect(ids).not.toContain('strang-gefaelle-setzen');
        // Die Toolbox rechnet mit DEMSELBEN Kontext — kein Knopf, den der Store ablehnt.
        expect(toolboxIds(b)).toContain('haltung-teilen');
    });

    it('… mit Skelettachse: die Rolle ist da, die Güte nicht — wie vor AE', async () => {
        const b = useBearbeitung();
        await b.einordne(proxy('Haltung'), resolverMit(netzMitAchse('mesh')));
        expect(b.einordnung.guete).toBe('geschaetzt');
        expect(b.moeglich.map(x => x.id)).not.toContain('haltung-teilen');
        const w = warumNicht(nachId('haltung-teilen'), { ...b.einordnung, typprofil: b.typprofil, ...b.passendeKontext });
        expect(w).toMatch(/Güte „gemessen"/);
    });

    it('ein anderer Proxy trifft keine Regel und bekommt keine Netzrolle', async () => {
        const b = useBearbeitung();
        await b.einordne(proxy('Bordstein', 'P2'), resolverMit(netzMitAchse('extrusion')));
        expect(b.passendeKontext.regel).toBeNull();
        expect(b.moeglich.map(x => x.id)).not.toContain('haltung-teilen');
    });
});

describe('Werkzeuge schreiben das Rezept, das der Katalog für die Rolle nennt', () => {
    it('Kante → Rohr, Knoten → Schacht', () => {
        expect(rezeptFuerNetzrolle('kante')).toBe('rohr');
        expect(rezeptFuerNetzrolle('knoten')).toBe('schacht');
    });
    it('ein EIGENES Bauteil behält sein Rezept — wenn es dieselbe Rolle hat', () => {
        expect(rezeptFuerNetzrolle('kante', { rezept: 'rohr' })).toBe('rohr');
        expect(rezeptFuerNetzrolle('kante', { rezept: 'schacht' })).toBe('rohr');   // falsche Rolle → Katalog
        expect(rezeptFuerNetzrolle('kante', { rezept: 'linie' })).toBe('rohr');
    });
});
