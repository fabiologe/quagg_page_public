// @vitest-environment jsdom
/**
 * Teil XXIX, G1 — die Gewerke als Katalog und ihre Regelkette (Konzept § 3).
 * Messgröße: am Retentionsteich (Konzept § 11.1) bekommen die Elemente das Gewerk des Katalogs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { REZEPTE, gewerkVon } from '../services/Bauteilrezepte.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { EINGEBAUTE_REZEPTE } from '../services/rezept/Eingebaut.js';
import { GEWERKE, gewerkNachKlasse, istGewerk } from '../services/katalog/Gewerke.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { TEICH } from './hilfen/teichKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

describe('Teil XXIX, G1 — der Gewerke-Katalog', () => {
    it('zehn Gewerke, jedes mit Titel, Beschreibung, Wortquelle und IFC-Abbildung', () => {
        expect(Object.keys(GEWERKE)).toEqual(['erdbau', 'entwaesserung', 'wasserbau', 'konstruktiv', 'verkehr', 'ausstattung',
                                              'leitungen', 'ta', 'landschaft', 'vermessung']);
        for (const [id, g] of Object.entries(GEWERKE)) {
            expect(g.titel && g.beschreibung && g.ifc && g.stlk.length, id).toBeTruthy();
        }
    });

    it('jedes eingebaute Rezept (17) und jede Ableitung (7) nennt ein Gewerk aus dem Katalog', () => {
        const rezepte = Object.values(REZEPTE).filter(r => !r.behaelter);
        expect(rezepte.filter(r => istGewerk(r.gewerk)).map(r => r.id)).toEqual(rezepte.map(r => r.id));
        expect(Object.values(ABLEITUNGEN).filter(r => !istGewerk(r.gewerk)).map(r => r.id)).toEqual([]);
        expect(Object.keys(ABLEITUNGEN)).toHaveLength(7);
    });

    it('die Katalogprüfung: ein Gewerk, das es nicht gibt, ist ein Fehler — ohne Gewerk ist erlaubt', () => {
        const wand = EINGEBAUTE_REZEPTE.find(r => r.id === 'wand');
        expect(pruefeEintrag('rezept', { ...wand, id: 'w2', gewerk: 'wasserbau' }).fehler).toEqual([]);
        expect(pruefeEintrag('rezept', { ...wand, id: 'w2', gewerk: 'gleisbau' }).fehler.join(' ')).toMatch(/Gewerk „gleisbau" gibt es nicht/);
        const { gewerk: _g, ...ohne } = wand;
        expect(pruefeEintrag('rezept', { ...ohne, id: 'w2' }).fehler).toEqual([]);
    });
});

describe('Teil XXIX, G1 — die Regelkette', () => {
    const plan = (rezept, kategorie, parameter = {}) => ({ rezept, kategorie, parameter });
    it('ausdrücklich am Bauplan schlägt alles', () => {
        expect(gewerkVon(plan('wand', 'IFCWALL', { gewerk: 'wasserbau' }))).toEqual({ gewerk: 'wasserbau', quelle: 'bauplan' });
    });
    it('das Rezept, solange die Klasse seine ist', () => {
        expect(gewerkVon(plan('wand', 'IFCWALL'))).toEqual({ gewerk: 'konstruktiv', quelle: 'rezept' });
        expect(gewerkVon(plan('rigole', 'IFCCOURSE'))).toEqual({ gewerk: 'entwaesserung', quelle: 'rezept' });
    });
    it('die Klasse, wenn jemand sie überschreibt — eine Platte als Steinschüttung ist Wasserbau, als Weg Verkehrsfläche', () => {
        expect(gewerkVon(plan('platte', 'IFCCOURSE', { predefinedType: 'ARMOUR' }))).toEqual({ gewerk: 'wasserbau', quelle: 'klasse' });
        expect(gewerkVon(plan('platte', 'IFCCOURSE', { predefinedType: 'PAVEMENT' }))).toEqual({ gewerk: 'verkehr', quelle: 'klasse' });
        expect(gewerkVon(plan('wand', 'IFCRAILING', { predefinedType: 'FENCE' }))).toEqual({ gewerk: 'ausstattung', quelle: 'klasse' });
    });
    it('eine Klasse ohne Regel fällt aufs Rezept zurück; ohne Rezept: keines', () => {
        expect(gewerkVon(plan('platte', 'IFCANNOTATION'))).toEqual({ gewerk: 'konstruktiv', quelle: 'rezept' });
        expect(gewerkVon({ rezept: 'gibtsnicht', kategorie: 'IFCANNOTATION', parameter: {} })).toEqual({ gewerk: null, quelle: null });
    });
    it('Geliefertes nach Klasse — eine Wurzel deckt jeden Untertyp', () => {
        expect(['IFCPIPESEGMENT', 'IFCWALL', 'IFCSLAB', 'IFCRAILING', 'IFCEARTHWORKSCUT', 'IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCANNOTATION']
            .map(k => gewerkNachKlasse(k))).toEqual(['entwaesserung', 'konstruktiv', 'konstruktiv', 'ausstattung', 'erdbau', 'entwaesserung', null]);
        expect(gewerkNachKlasse('IFCGEOGRAPHICELEMENT', 'VEGETATION')).toBe('landschaft');
        expect(gewerkNachKlasse('IFCGEOGRAPHICELEMENT', 'TERRAIN')).toBe('vermessung');
    });
});

describe('Teil XXIX, G1 — der Retentionsteich bekommt seine Gewerke', () => {
    it('28 von 30 Elementen wie im Katalog; zwei brauchen eine ausdrückliche Wahl (G2/G3)', async () => {
        const abweichend = [];
        for (const [nr, name, , kom, soll] of TEICH) {
            repo.setBackend(new Speicher()); setActivePinia(createPinia());
            expect((await useBearbeitung().fuehreAus(kom)).ausgefuehrt, name).toBe(true);
            const { gewerk } = gewerkVon(useAenderungen().wirksamerStand('erzeugt').get('cde-X'));
            if (gewerk !== soll) abweichend.push(`${nr} ${name}: ${gewerk} statt ${soll}`);
        }
        // Oberboden ist IfcEarthworksFill (Klasse → Erdbau), gehört aber zum Landschaftsbau; die Stirnwand des
        // Einlaufs ist eine Wand (Konstruktiv), gehört aber zum Einlaufbauwerk (Wasserbau). Beides entscheidet der
        // Planer — beim Zeichnen aus dem Gewerk (G3) oder im Formular (G2), nicht eine Regel.
        expect(abweichend).toEqual(['8 Oberboden auf der Böschung: erdbau statt landschaft',
                                    '15 Einlaufbauwerk (Stirnwand): konstruktiv statt wasserbau']);
    });

    it('ausdrücklich gesetzt, gilt es — auch beim Oberboden', async () => {
        const [, , , kom] = TEICH.find(t => t[0] === 8);
        const mit = JSON.parse(JSON.stringify(kom));
        mit.werte.gewerk = 'landschaft';
        const b = useBearbeitung();
        expect((await b.fuehreAus(mit)).ausgefuehrt).toBe(true);
        // G1 fror ein: das Zeichenwerkzeug nahm nur Rezeptfelder, ein Gewerk im Kommando ging verloren.
        // G3 gedreht: das Zeichenwerkzeug hat das Feld „Gewerk" und schreibt es, wo es von der Regel abweicht.
        expect(gewerkVon(useAenderungen().wirksamerStand('erzeugt').get('cde-X'))).toEqual({ gewerk: 'landschaft', quelle: 'bauplan' });
    });
});
