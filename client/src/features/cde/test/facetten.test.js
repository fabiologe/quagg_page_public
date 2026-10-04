// @vitest-environment jsdom
/**
 * Teil XXIX, G4 — die Kopfzeile mit Facetten und der Abschnitt „Vorlage" (Konzept § 5, § 6).
 *
 * Über Kommandos: eine Rechteckkammer aus der Vorlage (ein Kommando, sieben Teile). Dann:
 *   - das Bauwerk sagt „aus Vorlage Rechteckkammer", jedes Teil „Rolle … der Vorlage", mit Pfad zum Bauwerk;
 *   - die Rollentabelle: alle gesteuert → eine Wand von Hand dicker → „abweichend: dicke" → Angleichen JE ROLLE → gesteuert;
 *     ein gelöschtes Teil → „fehlt";
 *   - Lösen: ein Kommando, ein Vorgang; danach keine Vorlage mehr, die Teile unverändert und weiter Teil des Bauwerks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { facettenVon, rollenTabelle } from '../services/Facetten.js';
import { verdeckteAus } from '../services/CdeAchsen.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { passende, sichtbarInLeiste } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { KAMMER_AUS_VORLAGE, Speicher } from './hilfen/vorlagenKommandos.js';
import { k } from './hilfen/kammerKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const ae = () => useAenderungen();
const bauplanVon = (gid) => ae().wirksamerStand('erzeugt').get(gid) ?? null;
const subjekt = (gid) => subjektAusStand(gid, { wirksamerStand: ae().wirksamerStand });
const tabelle = () => rollenTabelle(bauplanVon('cde-KA'), bauplanVon, verdeckteAus(ae().wirksamerStand('geloescht')))
    .map(r => `${r.rolle}:${r.status}${r.felder.length ? `(${r.felder.join(',')})` : ''}`);

describe('Teil XXIX, G4 — Facetten und Vorlage am Bauwerk', () => {
    it('die Kopfzeile: das Bauwerk „aus Vorlage", das Teil „Rolle … der Vorlage" mit Pfad, Gewerk und Ausführung', async () => {
        const b = useBearbeitung();
        expect((await b.fuehreAus(KAMMER_AUS_VORLAGE())).ausgefuehrt).toBe(true);
        const bauwerk = facettenVon(subjekt('cde-KA'), { bauplanVon });
        expect(bauwerk.vorlage).toMatchObject({ art: 'bauwerk', id: 'rechteckkammer', titel: 'Rechteckkammer' });
        expect(bauwerk.behaelter).toBe(true);
        const wand = facettenVon(subjekt('cde-WN'), { bauplanVon });
        expect(wand.vorlage).toMatchObject({ art: 'rolle', rolle: 'laengswandNord', bauwerk: 'cde-KA', titel: 'Rechteckkammer', abweichend: [] });
        expect(wand.bauwerk.map(x => [x.globalId, x.name])).toEqual([['cde-KA', 'Kammer']]);
        expect(wand.gewerk).toMatchObject({ id: 'konstruktiv', quelle: 'rezept' });
        expect(wand.klasse).toMatchObject({ kategorie: 'IFCWALL', predefinedType: 'RETAININGWALL' });
        expect(wand.form).toMatchObject({ id: 'achse+profil' });
        // Ein Bauteil ohne Bauwerk und Vorlage: keine Vorlage, kein Pfad.
        expect((await b.fuehreAus(k('platte-zeichnen', { neu: ['cde-P'], eingaben: { umriss: [{ ost: 20, nord: 0, hoehe: 210 }, { ost: 24, nord: 0, hoehe: 210 }, { ost: 24, nord: -3, hoehe: 210 }] },
            werte: { name: 'P', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.2 } }))).ausgefuehrt).toBe(true);
        const platte = facettenVon(subjekt('cde-P'), { bauplanVon });
        expect([platte.vorlage, platte.bauwerk]).toEqual([null, []]);
    });

    it('die Rollentabelle: gesteuert → abweichend (Feld) → Angleichen JE ROLLE → gesteuert; gelöscht → fehlt', async () => {
        const b = useBearbeitung();
        await b.fuehreAus(KAMMER_AUS_VORLAGE());
        expect(tabelle()).toEqual(['bodenplatte:gesteuert', 'laengswandNord:gesteuert', 'laengswandSued:gesteuert', 'querwandWest:gesteuert',
                                   'querwandOst:gesteuert', 'decke:gesteuert', 'raum:gesteuert']);
        // Zwei Wände von Hand dicker — über das Formular (G2).
        for (const gid of ['cde-WN', 'cde-WS']) {
            expect((await b.fuehreAus(k('eigenschaften-setzen', { ziel: [gid], werte: { dicke: 0.45 } }))).ausgefuehrt).toBe(true);
        }
        expect(tabelle().slice(1, 3)).toEqual(['laengswandNord:abweichend(dicke)', 'laengswandSued:abweichend(dicke)']);
        expect(facettenVon(subjekt('cde-WN'), { bauplanVon }).vorlage.abweichend).toEqual(['dicke']);
        // Angleichen NUR die Nordwand — die Südwand bleibt abweichend.
        const n = ae().anzahl;
        expect((await b.fuehreAus(k('an-vorlage-angleichen', { ziel: ['cde-KA'], werte: { rolle: 'laengswandNord' } }))).ausgefuehrt).toBe(true);
        expect(tabelle().slice(1, 3)).toEqual(['laengswandNord:gesteuert', 'laengswandSued:abweichend(dicke)']);
        expect(new Set(ae().eintraege.slice(n).map(e => e.vorgang)).size).toBe(1);   // ein Vorgang
        // Ein gelöschtes Teil fehlt.
        expect((await b.fuehreAus(k('loeschen', { ziel: ['cde-DE'], werte: {} }))).ausgefuehrt).toBe(true);
        expect(tabelle()[5]).toBe('decke:fehlt');
    });

    it('Lösen: ein Kommando, ein Vorgang — danach keine Vorlage; die Teile bleiben, wie sie sind, und Teil des Bauwerks', async () => {
        const b = useBearbeitung();
        await b.fuehreAus(KAMMER_AUS_VORLAGE());
        const teileVorher = JSON.stringify(['cde-WN', 'cde-BP', 'cde-RA'].map(bauplanVon));
        const n = ae().anzahl;
        const erg = await b.fuehreAus(k('von-vorlage-loesen', { ziel: ['cde-KA'], werte: {} }));
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        expect(ae().anzahl - n).toBe(1);                                                // EIN Eintrag: der Bauplan des Bauwerks
        expect(bauplanVon('cde-KA').parameter.bauwerksvorlage).toBeUndefined();
        expect(JSON.stringify(['cde-WN', 'cde-BP', 'cde-RA'].map(bauplanVon))).toBe(teileVorher);
        expect(facettenVon(subjekt('cde-WN'), { bauplanVon })).toMatchObject({ vorlage: null, bauwerk: [{ globalId: 'cde-KA' }] });
        expect(tabelle()).toEqual([]);
        // Noch einmal lösen geht nicht — mit Grund.
        const nochmal = await b.fuehreAus(k('von-vorlage-loesen', { ziel: ['cde-KA'], werte: {} }));
        expect([nochmal.ausgefuehrt, nochmal.grund]).toEqual([false, expect.stringMatching(/aus keiner Vorlage/)]);
    });

    it('die Leiste: am Bauwerk stehen Werte, Angleichen und Lösen im Abschnitt „Vorlage", nicht als Knöpfe', () => {
        const amBauwerk = passende({ bauform: 'netz', guete: 'gemessen' }, { eigenes: true, rezept: rezeptNach('bauwerk') });
        const ids = ['vorlage-werte-setzen', 'an-vorlage-angleichen', 'von-vorlage-loesen'];
        expect(ids.every(id => amBauwerk.some(x => x.id === id))).toBe(true);                       // angeboten …
        expect(amBauwerk.filter(x => ids.includes(x.id) && sichtbarInLeiste(x))).toEqual([]);       // … aber nicht in der Leiste
        // Die Tafel zeigt den Abschnitt und startet genau diese Werkzeuge — und die Kopfzeile liest die Facetten.
        const tafel = fs.readFileSync(`${process.cwd()}/src/features/cde/components/CdeToolbox.vue`, 'utf8');
        for (const s of ["werkzeug('an-vorlage-angleichen', { rolle: r.rolle })", "werkzeug('vorlage-werte-setzen')", "werkzeug('von-vorlage-loesen')",
                         'facettenVon(', 'rollenTabelle(', 'api.waehleEigenes']) expect(tafel).toContain(s);
    });
});
