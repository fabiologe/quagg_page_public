// @vitest-environment jsdom
/**
 * Teil XXIX, G3 — die Palette der Werkzeugleiste ohne Auswahl (Konzept § 5):
 * „Allgemein", ein Reiter je Gewerk (Bauteile, Vorlagen), eine Suche. G0: „Erzeugen" war eine flache Liste
 * mit 18 Einträgen, die Vorlagen eine zweite daneben.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { werkzeugKatalog } from '../services/Bearbeitungen.js';
import { gewerkVon } from '../services/Bauteilrezepte.js';
import { EINGEBAUTE_VORLAGEN } from '../services/Bibliothek.js';
import { gewerkDerVorlage, palette, suchePalette } from '../services/Palette.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { e, k } from './hilfen/kammerKommandos.js';
import { Speicher, paketAus } from './hilfen/vorlagenKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const P = () => palette({ katalog: werkzeugKatalog(), vorlagen: EINGEBAUTE_VORLAGEN.map(v => ({ ...v, herkunft: 'eingebaut' })) });
const titel = (liste) => liste.map(x => x.titel);
const reiter = (p, id) => p.gewerke.find(g => g.id === id);

describe('Teil XXIX, G3 — die Palette', () => {
    it('„Allgemein": sechs Grundformen und das Bauwerk — sieben Knöpfe (G0: 18 in einer Liste)', () => {
        expect(titel(P().allgemein)).toEqual(['Linie', 'Fläche', 'Pfosten', 'Platte', 'Wand', 'Raum', 'Bauwerk anlegen']);
    });

    it('jedes Zeichenwerkzeug steht im Reiter seines Gewerks; kein Abschnitt hat mehr als neun Einträge', () => {
        const p = P();
        const zeichnen = werkzeugKatalog().filter(b => b.gruppe === 'erzeugen');
        for (const b of zeichnen) {
            const in_ = p.gewerke.filter(g => [...g.bauteile, ...g.vorlagen].some(x => x.id === b.id && !x.gewerk)).map(g => g.id);
            expect(in_, b.id).toHaveLength(1);
        }
        // G-T2: die Entwässerung trägt neun — der Raum in der Mulde (Regenrückhaltung, DWA-M 176) gehört dorthin,
        // nicht in einen fachfremden Reiter, nur damit die Liste kurz bleibt.
        expect(Math.max(...p.gewerke.flatMap(g => [g.bauteile.length, g.vorlagen.length]))).toBeLessThanOrEqual(9);
        expect(Object.fromEntries(p.gewerke.map(g => [g.id, [g.bauteile.length, g.vorlagen.length]]))).toEqual({
            // G-T1: Schicht und Band auf dem Gelände im Wasserbau, dazu (mit Gewerk-Vorgabe) in Verkehr und Landschaft.
            erdbau: [0, 0], entwaesserung: [9, 5], wasserbau: [2, 4], konstruktiv: [5, 2], verkehr: [2, 2], ausstattung: [1, 4],
            leitungen: [1, 0], ta: [0, 1], landschaft: [2, 3], vermessung: [2, 1],
        });
    });

    it('die Vorlagen finden ihr Gewerk über die Regel — niemand hat „Steinschüttung" in den Wasserbau eingetragen', () => {
        const p = P();
        expect(titel(reiter(p, 'wasserbau').vorlagen)).toEqual(['Steinschüttung', 'Tondichtung', 'Schutzvlies (Geotextil)', 'Dichtungsschutzschicht']);
        expect(titel(reiter(p, 'landschaft').vorlagen)).toEqual(['Schilf (Röhricht)', 'Rasenansaat', 'Oberbodenandeckung']);
        expect(titel(reiter(p, 'ausstattung').vorlagen)).toEqual(['Zaun', 'Geländer', 'Tor', 'Warnschild']);
        expect(titel(reiter(p, 'konstruktiv').vorlagen)).toEqual(['Pfahl (gerammt)', 'Träger (Holz)']);
        expect(titel(reiter(p, 'entwaesserung').vorlagen)).toEqual(['Rechteckkammer aus Vorlage', 'Zweikammer-RÜB aus Vorlage', 'Rohr DN 300', 'Rohr DN 500', 'Schacht DN 1000']);
        // Nur der Oberboden nennt sein Gewerk ausdrücklich — seine Klasse (IfcEarthworksFill) sagte Erdbau.
        expect(EINGEBAUTE_VORLAGEN.filter(v => v.gewerk).map(v => v.id)).toEqual(['oberboden']);
        expect(gewerkDerVorlage({ rezept: 'platte', vorgaben: { kategorie: 'IFCEARTHWORKSFILL' } })).toBe('erdbau');
    });

    it('jede eingebaute Vorlage besteht das Katalogschema; ein unbekanntes Gewerk nicht', () => {
        for (const v of EINGEBAUTE_VORLAGEN) expect(pruefeEintrag('vorlage', v).fehler, v.id).toEqual([]);
        expect(pruefeEintrag('vorlage', { ...EINGEBAUTE_VORLAGEN[0], gewerk: 'gleisbau' }).ok).toBe(false);
    });

    it('das Rohr steht auch unter „Leitungen" — von dort gezeichnet, trägt es das Gewerk', async () => {
        expect(reiter(P(), 'leitungen').bauteile).toEqual([expect.objectContaining({ id: 'rohr-zeichnen', gewerk: 'leitungen' })]);
        const b = useBearbeitung(), ae = useAenderungen();
        const rohr = (neu, gewerk) => k('rohr-zeichnen', { neu: [neu], eingaben: { zug: [e(0, 0, 99), e(10, 0, 99)] },
            werte: { name: neu, kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 150, gewerk } });
        expect((await b.fuehreAus(rohr('cde-L', 'leitungen'))).ausgefuehrt).toBe(true);
        expect((await b.fuehreAus(rohr('cde-E', 'entwaesserung'))).ausgefuehrt).toBe(true);
        const s = ae.wirksamerStand('erzeugt');
        expect(gewerkVon(s.get('cde-L'))).toEqual({ gewerk: 'leitungen', quelle: 'bauplan' });
        // Aus „Entwässerung" sagt die Regel dasselbe — nichts wird zusätzlich gespeichert.
        expect('gewerk' in s.get('cde-E').parameter).toBe(false);
    });

    it('die Suche findet über alle Reiter', () => {
        const p = P();
        expect(titel(suchePalette(p, 'stein'))).toEqual(['Steinschüttung']);
        // Das Rohr zweimal: aus „Entwässerung" und aus „Leitungen" (mit Gewerk) — verschiedene Einträge.
        expect(suchePalette(p, 'ROHR').map(x => [x.titel, x.gewerk ?? null])).toEqual([['Rohr', null], ['Rohr DN 300', null], ['Rohr DN 500', null], ['Rohr', 'leitungen']]);
        expect(suchePalette(p, '  ')).toEqual([]);
    });

    it('eine Steinschüttung aus der Vorlage: IfcCourse/ARMOUR, Gewerk Wasserbau, Mengen der Klasse', async () => {
        const v = EINGEBAUTE_VORLAGEN.find(x => x.id === 'steinschuettung');
        const b = useBearbeitung(), ae = useAenderungen();
        const erg = await b.fuehreAus(k('platte-zeichnen', { neu: ['cde-ST'], werte: { name: 'Steinschüttung', hoehe: '', ...v.vorgaben, vorlage: v.id },
            eingaben: { umriss: [e(0, 0, 99), e(5, 0, 99), e(5, -2, 99), e(0, -2, 99)] } }));
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        const t = (await paketAus(ae)).bauteile.find(x => x.cdeId === 'cde-ST');
        expect([t.klasse, t.predefinedType]).toEqual(['IFCCOURSE', 'ARMOUR']);
        expect(t.mengen).toEqual({ thickness: 0.4, volume: expect.closeTo(4, 9) });
        expect(gewerkVon(ae.wirksamerStand('erzeugt').get('cde-ST')).gewerk).toBe('wasserbau');
    });
});
