// @vitest-environment jsdom
/**
 * Teil XXIX, G2 — das Eigenschaftsformular (Konzept § 7 W1): alles Setzbare in EINEM Formular,
 * Übernehmen = EIN Kommando, EIN Vorgang; geschrieben wird nur, was sich ändert.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { felderFuer, nachId } from '../services/Bearbeitungen.js';
import { gewerkVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { e, k } from './hilfen/kammerKommandos.js';
import { TEICH, wand } from './hilfen/teichKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); b = useBearbeitung(); ae = useAenderungen(); });
afterEach(() => repo.setBackend(null));
const fuehre = async (kom) => { const erg = await b.fuehreAus(kom); expect(erg.ausgefuehrt, `${kom.werkzeug}: ${erg.grund}`).toBe(true); return erg; };
const plan = (g) => ae.wirksamerStand('erzeugt').get(g);
const setze = (gid, werte) => k('eigenschaften-setzen', { ziel: [gid], werte });

describe('Teil XXIX, G2 — das Eigenschaftsformular', () => {
    it('Name, Gewerk, Kostengruppe und zwei Maße: EIN Kommando, EIN Vorgang, drei Einträge — ein Rückgängig nimmt alles zurück', async () => {
        await fuehre(wand('IFCWALL', 'RETAININGWALL'));
        const vorher = JSON.stringify([...ae.wirksamerStand('erzeugt')]);
        const erg = await fuehre(setze('cde-X', { name: 'Stirnwand Einlauf', gewerk: 'wasserbau', kg: '331', dicke: 0.4, wandhoehe: 2 }));
        expect(erg.eintraege.map(x => x.art).sort()).toEqual(['bezeichnung', 'erzeugt', 'kg']);
        expect(new Set(erg.eintraege.map(x => x.vorgang)).size).toBe(1);
        expect(plan('cde-X').parameter).toMatchObject({ dicke: 0.4, wandhoehe: 2, gewerk: 'wasserbau' });
        expect(gewerkVon(plan('cde-X'))).toEqual({ gewerk: 'wasserbau', quelle: 'bauplan' });
        await ae.zurueck();
        expect(JSON.stringify([...ae.wirksamerStand('erzeugt')])).toBe(vorher);
    });

    it('die Vorbelegung ist der Stand — unverändert übernommen heisst: nichts zu tun', async () => {
        await fuehre(wand('IFCWALL', 'RETAININGWALL'));
        const el = subjektAusStand('cde-X', { wirksamerStand: ae.wirksamerStand });
        const v = nachId('eigenschaften-setzen').vorbelegung(el);
        expect(v).toMatchObject({ dicke: 0.05, wandhoehe: 1.2, predefinedType: 'RETAININGWALL', gewerk: '', bauwerk: '' });
        const erg = await b.fuehreAus(setze('cde-X', v));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/Nichts geändert/);
    });

    it('leer heisst „Vorgabe", wo das Rezept es erlaubt, sonst „unverändert"', async () => {
        await fuehre(wand('IFCWALL', 'RETAININGWALL'));
        await fuehre(k('wand-aussen-setzen', { ziel: ['cde-X'], werte: { aussen: 'nein' } }));
        await fuehre(setze('cde-X', { aussen: '', dicke: '' }));
        expect('aussen' in plan('cde-X').parameter).toBe(false);              // leer erlaubt → Vorgabe
        expect(plan('cde-X').parameter.dicke).toBe(0.05);                   // Pflichtfeld → unverändert
    });

    it('das Bauwerk: zuordnen, lösen — eines, das es nicht gibt, wird abgelehnt', async () => {
        await fuehre(wand('IFCWALL', 'RETAININGWALL'));
        await fuehre(k('bauwerk-anlegen', { neu: ['cde-BW'], werte: { name: 'Teich', art: 'anlage' } }));
        await fuehre(setze('cde-X', { bauwerk: 'cde-BW' }));
        expect(plan('cde-X').parameter.teilVon).toBe('cde-BW');
        await fuehre(setze('cde-X', { bauwerk: '' }));
        expect('teilVon' in plan('cde-X').parameter).toBe(false);
        expect((await b.fuehreAus(setze('cde-X', { bauwerk: 'cde-GIBTSNICHT' }))).ausgefuehrt).toBe(false);
        // Auch am Werkzeug selbst, nicht nur in der Formularprüfung: ein Bauwerk, das kein Kandidat ist, schreibt nichts.
        const el = subjektAusStand('cde-X', { wirksamerStand: ae.wirksamerStand });
        expect(nachId('eigenschaften-setzen').anwenden(el, { bauwerk: 'cde-GIBTSNICHT' }, { kandidatenVon: () => [] })).toBeNull();
    });

    it('die Felder richten sich nach dem Bauteil: ein geliefertes hat nur Name und Merkmale, ein eigenes dazu Gewerk, Bauwerk und sein Rezept', async () => {
        const geliefert = { globalId: '2abc', name: 'Haltung 7', category: 'IFCPIPESEGMENT', stand: {} };
        expect(felderFuer(nachId('eigenschaften-setzen'), null, geliefert).map(f => f.name)).toEqual(['name', 'kg', 'din277', 'massnahme']);
        await fuehre(wand('IFCWALL', 'RETAININGWALL'));
        const el = subjektAusStand('cde-X', { wirksamerStand: ae.wirksamerStand });
        const namen = felderFuer(nachId('eigenschaften-setzen'), null, el).map(f => f.name);
        expect(namen.slice(0, 6)).toEqual(['name', 'gewerk', 'bauwerk', 'kg', 'din277', 'massnahme']);
        expect(namen.slice(6).sort()).toEqual(rezeptNach('wand').felder.filter(f => f.setzbar).map(f => f.name).sort());
    });

    it('eine ALTE Haltung (Achse in Rohrmitte): grösseres DN, die Sohle bleibt — wie beim einzelnen Setzer (K4)', async () => {
        await fuehre(k('rohr-zeichnen', { neu: ['cde-R'], eingaben: { zug: [e(0, 0, 98), e(10, 0, 97.9)] },
                                          werte: { name: 'R', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 } }));
        // Wie ein Journal von vor K4b: die Punkte sind die Rohrmitte (eine neue Haltung speichert ihre Sohle,
        // dort ändert ein DN die Sohle ohnehin nicht).
        const alt = plan('cde-R');
        await ae.eintragenVorgang([{ art: 'erzeugt', globalId: 'cde-R', modell: 'cde', wer: 'test',
            nachher: { ...alt, parameter: { ...alt.parameter, achsbezug: 'mitte' } } }], { vorgang: 'alt' });
        const sohle = (p) => rezeptNach('rohr').sohlen.lies(p.parameter);
        const vor = sohle(plan('cde-R'));
        await fuehre(setze('cde-R', { dn: 600 }));
        expect(plan('cde-R').parameter.dn).toBe(600);
        expect(sohle(plan('cde-R'))).toEqual(vor);
    });

    it('G1 aufgelöst: Oberboden und die Stirnwand des Einlaufs bekommen ihr Gewerk über das Formular', async () => {
        for (const [nr, , , kom, soll] of TEICH.filter(t => t[0] === 8 || t[0] === 15)) {
            repo.setBackend(new Speicher()); setActivePinia(createPinia()); b = useBearbeitung(); ae = useAenderungen();
            await fuehre(kom);
            await fuehre(setze('cde-X', { gewerk: soll }));
            expect(gewerkVon(plan('cde-X')).gewerk, String(nr)).toBe(soll);
        }
    });
});
