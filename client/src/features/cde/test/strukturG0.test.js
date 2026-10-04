// @vitest-environment jsdom
/**
 * Teil XXIX, G0 — messen und einfrieren, bevor gebaut wird
 * (Konzept docs/cde/konzept-teil-xxix-struktur-gewerke-2026-10-04.md).
 *
 * 1. Die Werkzeugleiste von heute: wie viele Werkzeuge, Knöpfe am Bauteil, Einträge in „Erzeugen".
 * 2. Gewerke: kein Rezept nennt eines.
 * 3. Der Retentionsteich (§ 11.1): je Element, das keinen Erdbau braucht, das passendste Kommando
 *    von HEUTE — und was im Paket ankommt (Klasse, Ausführung, Objekttyp). Gemessen, nicht geschätzt.
 *    Die Erdbau-Elemente (Mulde, Damm, Verankerungsgraben, Dammscharte) belegen die Erdbau-Tests.
 * 4. Die zwei Kern-Lücken: keine Ableitung baut einen Raum aus dem Gelände oder eine Schicht darauf.
 *
 * Die Stufe, die einen Befund behebt, dreht seine Erwartung um.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { passende, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { REZEPTE, rezeptNach } from '../services/Bauteilrezepte.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { e, k } from './hilfen/kammerKommandos.js';
import { Speicher, paketAus } from './hilfen/vorlagenKommandos.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_teich_g0.json');

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

/** Eine geneigte Fläche 1 : 3 (Böschung) — vier Ecken, Höhe in m NN. */
const BOESCHUNG = [e(0, 0, 100), e(6, 0, 100), e(6, -3, 99), e(0, -3, 99)];
const EBEN = (h) => [e(0, 0, h), e(4, 0, h), e(4, -2, h), e(0, -2, h)];
const LINIE = (h) => [e(0, 0, h), e(5, 0, h)];
const PUNKT = (h) => [e(1, -1, h)];
const platte = (kategorie, predefinedType, objektTyp = '', umriss = BOESCHUNG, dicke = 0.3) =>
    k('platte-zeichnen', { neu: ['cde-X'], eingaben: { umriss }, werte: { name: 'X', kategorie, hoehe: '', dicke, predefinedType, objektTyp } });
const wand = (kategorie, predefinedType, objektTyp = '') =>
    k('wand-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(100) }, werte: { name: 'X', kategorie, hoehe: '', dicke: 0.05, wandhoehe: 1.2, predefinedType, objektTyp } });
const stab = (kategorie) =>
    k('pfosten-zeichnen', { neu: ['cde-X'], eingaben: { zug: PUNKT(100) }, werte: { name: 'X', kategorie, hoehe: '', laenge: 1.5, breite: 0.2, tiefe: 0.2 } });
const traeger = (kategorie, predefinedType) =>
    k('streifenfundament-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(100.3) }, werte: { name: 'X', kategorie, hoehe: '', breite: 0.2, dicke: 0.3, predefinedType } });

/** Der Teich, § 11.1 — ohne die Erdbau-Elemente. `soll`: Klasse, Ausführung (null = egal), Objekttyp. */
const TEICH = [
    [5, 'Tondichtung', ['IFCCOURSE', 'CORE'], platte('IFCCOURSE', 'CORE')],
    [6, 'Schutzvlies', ['IFCCOURSE', 'FILTER'], platte('IFCCOURSE', 'FILTER', '', BOESCHUNG, 0.005)],
    [7, 'Dichtungsschutzschicht', ['IFCCOURSE', 'PROTECTION'], platte('IFCCOURSE', 'PROTECTION')],
    [8, 'Oberboden auf der Böschung', ['IFCEARTHWORKSFILL', 'USERDEFINED', 'Oberbodenandeckung'], platte('IFCEARTHWORKSFILL', 'USERDEFINED', 'Oberbodenandeckung')],
    [9, 'Steinschüttung', ['IFCCOURSE', 'ARMOUR'], platte('IFCCOURSE', 'ARMOUR')],
    [10, 'Schilf', ['IFCGEOGRAPHICELEMENT', 'VEGETATION'], platte('IFCGEOGRAPHICELEMENT', 'VEGETATION', '', EBEN(99.2), 0.4)],
    [11, 'Rasenansaat', ['IFCGEOGRAPHICELEMENT', 'VEGETATION'], platte('IFCGEOGRAPHICELEMENT', 'VEGETATION', '', BOESCHUNG, 0.05)],
    [12, 'Dauerstau', ['IFCSPACE', 'EXTERNAL'], k('raum-zeichnen', { neu: ['cde-X'], eingaben: { umriss: EBEN(98) }, werte: { name: 'Dauerstau', hoehe: '', raumhoehe: 1, predefinedType: 'EXTERNAL' } })],
    [13, 'Rückhalteraum', ['IFCSPACE', 'EXTERNAL'], k('raum-zeichnen', { neu: ['cde-X'], eingaben: { umriss: EBEN(99) }, werte: { name: 'Rückhalteraum', hoehe: '', raumhoehe: 1, predefinedType: 'EXTERNAL' } })],
    [14, 'Zulaufhaltung DN 600', ['IFCPIPESEGMENT', null], k('rohr-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(98.5) }, werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 600 } })],
    [15, 'Einlaufbauwerk (Stirnwand)', ['IFCWALL', null], wand('IFCWALL', 'RETAININGWALL')],
    [16, 'Kolkschutz', ['IFCCOURSE', 'ARMOUR'], platte('IFCCOURSE', 'ARMOUR', '', EBEN(98), 0.4)],
    [17, 'Grobrechen', ['IFCFILTER', 'STRAINER'], k('rechen-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(98) }, werte: { name: 'Rechen', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.2 } })],
    [18, 'Drosselschacht', ['IFCDISTRIBUTIONCHAMBERELEMENT', 'MANHOLE'], k('schacht-zeichnen', { neu: ['cde-X'], eingaben: { zug: [e(1, -1, 97.5), e(1, -1, 100)] }, werte: { name: 'Drosselschacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1500 } })],
    [19, 'Drossel', ['IFCVALVE', 'REGULATING'], k('drossel-zeichnen', { neu: ['cde-X'], eingaben: { zug: [e(0, 0, 97.5), e(1, 0, 97.5)] }, werte: { name: 'Drossel', kategorie: 'IFCVALVE', hoehe: '', dn: 200 } })],
    [20, 'Wehrschwelle', ['IFCWALL', 'USERDEFINED', 'Überlaufschwelle'], k('ueberlaufschwelle-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(99.5) }, werte: { name: 'Wehrschwelle', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5 } })],
    [21, 'Tauchwand', ['IFCWALL', 'USERDEFINED', 'Tauchwand'], k('tauchwand-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(98.8) }, werte: { name: 'Tauchwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1 } })],
    [22, 'Ablaufhaltung', ['IFCPIPESEGMENT', null], k('rohr-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(97.5) }, werte: { name: 'Ablauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 } })],
    [24, 'Befestigung der Dammscharte', ['IFCCOURSE', 'ARMOUR'], platte('IFCCOURSE', 'ARMOUR')],
    [25, 'Pfahl', ['IFCPILE', 'DRIVEN'], stab('IFCPILE')],
    [26, 'Jochträger', ['IFCBEAM', 'JOIST'], traeger('IFCBEAM', 'JOIST')],
    [27, 'Stegbelag', ['IFCSLAB', 'FLOOR'], platte('IFCSLAB', 'FLOOR', '', EBEN(100.5), 0.05)],
    [28, 'Geländer', ['IFCRAILING', 'HANDRAIL'], wand('IFCRAILING', 'HANDRAIL')],
    [29, 'Weg zum Steg', ['IFCCOURSE', 'PAVEMENT'], platte('IFCCOURSE', 'PAVEMENT', '', EBEN(100), 0.15)],
    [30, 'Wegeinfassung', ['IFCKERB', null], traeger('IFCKERB', 'NOTDEFINED')],
    [31, 'Zufahrt', ['IFCCOURSE', 'PAVEMENT'], platte('IFCCOURSE', 'PAVEMENT', '', EBEN(100), 0.3)],
    [32, 'Zaun', ['IFCRAILING', 'FENCE'], wand('IFCRAILING', 'FENCE')],
    [33, 'Tor', ['IFCDOOR', 'GATE'], wand('IFCDOOR', 'GATE')],
    [34, 'Pegellatte', ['IFCSENSOR', 'LEVELSENSOR'], stab('IFCSENSOR')],
    [35, 'Warnschild', ['IFCSIGN', 'PICTORAL'], stab('IFCSIGN')],
];

/** Ein Element über sein Kommando — was im Paket ankommt: 'voll' | 'ohne Ausführung' | 'abgelehnt: …'. */
async function miss([, , [klasse, pdt, objektTyp], kom]) {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    const b = useBearbeitung(), ae = useAenderungen();
    const erg = await b.fuehreAus(kom);
    if (!erg.ausgefuehrt) return `abgelehnt: ${erg.grund}`;
    const t = (await paketAus(ae)).bauteile.find(x => x.cdeId === 'cde-X');
    if (!t) return 'abgelehnt: kein Bauteil im Paket';
    if (t.klasse !== klasse) return `falsche Klasse ${t.klasse}`;
    if (pdt && t.predefinedType !== pdt) return `ohne Ausführung (${t.predefinedType ?? '—'})`;
    if (objektTyp && t.objektTyp !== objektTyp) return `ohne Objekttyp (${t.objektTyp ?? '—'})`;
    return 'voll';
}

describe('Teil XXIX, G0 — die Werkzeugleiste von heute', () => {
    it('147 Werkzeuge, davon 84 Setzer; „Erzeugen" sind 18 Einträge in einer Liste', () => {
        const kat = werkzeugKatalog();
        expect(kat).toHaveLength(147);
        expect(kat.filter(b => b.setzt)).toHaveLength(84);
        expect(kat.filter(b => b.gruppe === 'erzeugen')).toHaveLength(18);
    });

    it('Knöpfe am gewählten Bauteil: Wand 30, Rohr 36, Platte 24, Raum 21, Bauwerk 16', () => {
        const knoepfe = (r, bauform, kat) => passende({ bauform, guete: 'gemessen' },
            { eigenes: true, rezept: rezeptNach(r), typprofil: kat ? profilFuer(kat) : null }).length;
        expect([knoepfe('wand', 'achse+profil', 'IFCWALL'), knoepfe('rohr', 'achse+profil', 'IFCPIPESEGMENT'),
                knoepfe('platte', 'flaeche+dicke', 'IFCSLAB'), knoepfe('raum', 'koerper', 'IFCSPACE'),
                knoepfe('bauwerk', 'netz', null)]).toEqual([30, 36, 24, 21, 16]);
    });

    it('Dicke und Höhe einer Wand ändern: zwei Kommandos, zwei Vorgänge', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        for (const kom of [wand('IFCWALL', 'RETAININGWALL'),
                           k('wand-dicke-setzen', { ziel: ['cde-X'], werte: { dicke: 0.4 } }),
                           k('wand-wandhoehe-setzen', { ziel: ['cde-X'], werte: { wandhoehe: 2 } })]) {
            expect((await b.fuehreAus(kom)).ausgefuehrt).toBe(true);
        }
        expect(new Set(ae.eintraege.map(x => x.vorgang)).size - 1).toBe(2);
    });

    it('Gewerk: kein Rezept nennt eines (0 von 17)', () => {
        const rezepte = Object.values(REZEPTE).filter(r => !r.behaelter);
        expect(rezepte).toHaveLength(17);
        expect(rezepte.filter(r => r.gewerk)).toHaveLength(0);
    });
});

describe('Teil XXIX, G0 — der Retentionsteich mit den Kommandos von heute', () => {
    it('je Element: was im Paket ankommt (30 Elemente ohne Erdbau: 26 voll, 4 ohne Ausführung)', async () => {
        const ergebnis = {};
        for (const el of TEICH) ergebnis[`${el[0]} ${el[1]}`] = await miss(el);
        // EINGEFROREN, wie es HEUTE ist — die Stufe, die ein Element richtig baut, ändert seine Zeile.
        // Befund G0: die KLASSE ist kaum das Problem — 26 von 30 kommen über die allgemeinen Rezepte (Platte, Wand,
        // Fundament) mit überschriebener Klasse richtig an; vier fehlt nur die Ausführung (Pfosten und Schacht haben
        // kein Feld dafür). Die Lücke ist die FORM: eine Platte auf der Böschung ist eben, ihre Dicke lotrecht, sie folgt
        // dem Gelände nicht (§ 11.2 L-A) — und ein Raum ist ein Prisma (L-B, unten).
        expect(Object.fromEntries(Object.entries(ergebnis).map(([n, v]) => [n, v.replace(/:.*$/, '')]))).toEqual({
            '5 Tondichtung': 'voll', '6 Schutzvlies': 'voll', '7 Dichtungsschutzschicht': 'voll',
            '8 Oberboden auf der Böschung': 'voll', '9 Steinschüttung': 'voll', '10 Schilf': 'voll', '11 Rasenansaat': 'voll',
            '12 Dauerstau': 'voll', '13 Rückhalteraum': 'voll', '14 Zulaufhaltung DN 600': 'voll',
            '15 Einlaufbauwerk (Stirnwand)': 'voll', '16 Kolkschutz': 'voll', '17 Grobrechen': 'voll',
            '18 Drosselschacht': 'ohne Ausführung (—)', '19 Drossel': 'voll', '20 Wehrschwelle': 'voll', '21 Tauchwand': 'voll',
            '22 Ablaufhaltung': 'voll', '24 Befestigung der Dammscharte': 'voll',
            '25 Pfahl': 'ohne Ausführung (—)', '26 Jochträger': 'voll', '27 Stegbelag': 'voll', '28 Geländer': 'voll',
            '29 Weg zum Steg': 'voll', '30 Wegeinfassung': 'voll', '31 Zufahrt': 'voll', '32 Zaun': 'voll', '33 Tor': 'voll',
            '34 Pegellatte': 'ohne Ausführung (—)', '35 Warnschild': 'ohne Ausführung (—)',
        });
    });

    it('alle 30 in EINEM Paket — das Vertragspaket für den Schreiber (Mengen und Merkmale folgen dem Rezept, nicht der Klasse)', async () => {
        //     TEICH_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/strukturG0.test.js
        const b = useBearbeitung(), ae = useAenderungen();
        for (const [nr, , , kom] of TEICH) {
            const k2 = JSON.parse(JSON.stringify(kom).replaceAll('cde-X', `cde-T${nr}`));
            k2.id = `g0-${nr}`;
            expect((await b.fuehreAus(k2)).ausgefuehrt, String(nr)).toBe(true);
        }
        const p = await paketAus(ae);
        // Die Steinschüttung über „Platte zeichnen": Klasse richtig, Mengen und Merkmale die der Platte.
        const stein = p.bauteile.find(t => t.cdeId === 'cde-T9');
        expect([stein.klasse, stein.predefinedType, Object.keys(stein.mengen).sort(), Object.keys(stein.merkmale)])
            .toEqual(['IFCCOURSE', 'ARMOUR', ['depth', 'netArea', 'netVolume', 'perimeter'], ['Pset_SlabCommon']]);
        if (process.env.TEICH_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: TEICH_VERTRAG_SCHREIBEN=1 …').toBe(true);
        expect(JSON.parse(readFileSync(FIXTURE, 'utf8')).bauteile.map(t => [t.cdeId, t.klasse, t.predefinedType ?? null]))
            .toEqual(p.bauteile.map(t => [t.cdeId, t.klasse, t.predefinedType ?? null]));
    });

    it('die zwei Kern-Lücken: keine Ableitung baut einen Raum aus dem Gelände oder eine Schicht darauf', () => {
        expect(Object.keys(ABLEITUNGEN).sort()).toEqual(['anzeige', 'aussparung', 'bauwerksgrube', 'durchfuehrung', 'erdbau', 'kanalgraben', 'oeffnung']);
        // Ein Raum ist ein senkrechtes Prisma: Grundfläche × Höhe — die Mulde 1 : 3 hätte 1 424 m³ zwischen 99 und 100,
        // ein Prisma über der Wasserfläche bei 99 (46 × 26) hat 1 196 m³.
        const prisma = rezeptNach('raum').mengen({ punkte: [[0, 99, 0], [46, 99, 0], [46, 99, 26], [0, 99, 26]], raumhoehe: 1 });
        expect(Math.round(prisma.netVolume)).toBe(1196);
    });
});
