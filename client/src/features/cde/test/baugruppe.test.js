// @vitest-environment jsdom
/**
 * Teil XXIX, G5 — die Baugruppe (Konzept § 6, Fabios E45): ein fertiges Bauwerk als Schnappschuss in der Bibliothek.
 *
 * Das Ablaufbauwerk des Retentionsteichs (§ 11.1, Elemente 18–22) über Einzelkommandos: Drosselschacht, Drossel,
 * Tauchwand, Wehrschwelle, Ablaufhaltung — die Haltung am Schacht angeschlossen (`anschluss`), dazu ein Bauwerk und
 * fünf Zuordnungen: 11 Kommandos. Als Baugruppe gesichert, an anderer Stelle um 90° gedreht gesetzt: 1 Kommando.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { ladeVorlagen, pruefeVorlage, speichereVorlage } from '../services/Bibliothek.js';
import { baugruppeAus } from '../services/rezept/Baugruppe.js';
import { verdeckteAus } from '../services/CdeAchsen.js';
import { facettenVon } from '../services/Facetten.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { palette } from '../services/Palette.js';
import { werkzeugKatalog } from '../services/Bearbeitungen.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { e, k } from './hilfen/kammerKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const ae = () => useAenderungen();
const stand = () => ae().wirksamerStand('erzeugt');
const TEILE = ['cde-SD', 'cde-DR', 'cde-TW', 'cde-WS', 'cde-AB'];
/** Das Ablaufbauwerk um (100 | −50), Sohle 97,50 — elf Kommandos. */
const ABLAUF = () => [
    k('schacht-zeichnen', { neu: ['cde-SD'], eingaben: { zug: [e(100, -50, 97.5), e(100, -50, 100)] },
        werte: { name: 'Drosselschacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1500, predefinedType: 'MANHOLE' } }),
    k('drossel-zeichnen', { neu: ['cde-DR'], eingaben: { zug: [e(100, -50.3, 97.5), e(100, -49.5, 97.5)] },
        werte: { name: 'Drossel', kategorie: 'IFCVALVE', hoehe: '', dn: 200 } }),
    k('tauchwand-zeichnen', { neu: ['cde-TW'], eingaben: { zug: [e(98.5, -51, 98.8), e(98.5, -49, 98.8)] },
        werte: { name: 'Tauchwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1 } }),
    k('ueberlaufschwelle-zeichnen', { neu: ['cde-WS'], eingaben: { zug: [e(99, -51, 99.5), e(99, -49, 99.5)] },
        werte: { name: 'Wehrschwelle', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5 } }),
    k('rohr-zeichnen', { neu: ['cde-AB'], eingaben: { zug: [{ knoten: 'cde-SD' }, e(110, -50, 97.4)] },
        werte: { name: 'Ablaufhaltung', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 } }),
    k('bauwerk-anlegen', { neu: ['cde-BW'], werte: { name: 'Ablaufbauwerk', art: 'anlage' } }),
    ...TEILE.map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-BW' } } })),
];

async function baueAblauf() {
    const b = useBearbeitung();
    for (const kom of ABLAUF()) {
        const r = await b.fuehreAus(kom);
        expect(r.ausgefuehrt, `${kom.werkzeug}: ${r.grund}`).toBe(true);
    }
    return b;
}

describe('Teil XXIX, G5 — die Baugruppe', () => {
    it('aus dem Bauwerk: Teile mit Punkten relativ zu „Mitte unten", der Anschluss als Rolle, nur Daten', async () => {
        await baueAblauf();
        const { baugruppe: bg, ausgelassen, grund } = baugruppeAus('cde-BW', { bauplaene: stand() });
        expect(grund).toBeNull();
        expect(ausgelassen).toEqual([]);
        expect(bg.teile.map(t => [t.rolle, t.rezept])).toEqual([['drosselschacht', 'schacht'], ['drossel', 'drossel'], ['tauchwand', 'tauchwand'],
                                                                ['wehrschwelle', 'ueberlaufschwelle'], ['ablaufhaltung', 'rohr']]);
        expect(bg.teile.find(t => t.rolle === 'ablaufhaltung').parameter.anschluss).toEqual({ anfang: { rolle: 'drosselschacht' } });
        // Bezug „Mitte unten": der Schacht steht im Grundriss um die Mitte, seine Sohle ist der tiefste Punkt.
        const schacht = bg.teile.find(t => t.rolle === 'drosselschacht').parameter.punkte;
        expect(Math.min(...bg.teile.flatMap(t => t.parameter.punkte.map(q => q[1])))).toBeCloseTo(0, 9);
        expect(schacht[0][1]).toBeLessThan(0.11);
        expect(bg.teile.every(t => t.parameter.teilVon === undefined)).toBe(true);
        expect([bg.art, bg.rezept, bg.werkzeug, bg.gewerk]).toEqual(['baugruppe', 'bauwerk', 'baugruppe-setzen', 'entwaesserung']);
        expect(pruefeVorlage({ ...bg, id: 'bg-test' })).toEqual({ ok: true, grund: null });
        // Das Schema nimmt nur Daten: ein unbekanntes Rezept, eine Ableitung, ein Verweis ins Leere fallen durch.
        expect(pruefeVorlage({ ...bg, teile: [{ ...bg.teile[0], rezept: 'gibtsnicht' }] }).ok).toBe(false);
        expect(pruefeVorlage({ ...bg, teile: [{ ...bg.teile[0], rezept: 'gelaendeschicht' }] }).ok).toBe(false);
        expect(pruefeVorlage({ ...bg, teile: bg.teile.slice(1) }).ok).toBe(false);   // die Haltung zeigt auf den fehlenden Schacht
    });

    it('gesichert in der Bibliothek, gesetzt mit EINEM Kommando — 11 → 1; um 90° gedreht; der Anschluss zeigt auf den neuen Schacht', async () => {
        const b = await baueAblauf();
        const { baugruppe } = baugruppeAus('cde-BW', { bauplaene: stand(), name: 'Drosselbauwerk' });
        expect((await speichereVorlage(repo, baugruppe, { ebene: 'projekt' })).ok).toBe(true);
        await b.ladeProfile();
        const bg = (await ladeVorlagen(repo)).find(v => v.art === 'baugruppe');
        expect(bg?.name).toBe('Drosselbauwerk');
        // In der Palette steht sie im Reiter ihres Gewerks, mit dem Werkzeug „Baugruppe setzen".
        const p = palette({ katalog: werkzeugKatalog(), vorlagen: await ladeVorlagen(repo) });
        expect(p.gewerke.find(g => g.id === 'entwaesserung').vorlagen.map(v => v.titel)).toContain('Drosselbauwerk');
        // … aber nicht als Vorlage zum „Tauschen" am Bauwerk (gleiches Rezept): sie legt ein ganzes Bauwerk an.
        const amBauwerk = subjektAusStand('cde-BW', { wirksamerStand: ae().wirksamerStand });
        expect(b.kandidatenVon('vorlage:gleichesRezept', amBauwerk)).toEqual([]);
        expect(b.kandidatenVon('vorlage:baugruppe', amBauwerk).map(x => x.titel)).toEqual(['Drosselbauwerk']);

        const vorher = ae().anzahl;
        const neu = ['cde-B2', 'cde-N1', 'cde-N2', 'cde-N3', 'cde-N4', 'cde-N5'];
        const erg = await b.fuehreAus(k('baugruppe-setzen', { neu, eingaben: { zug: [e(300, -200, 120)] },
            werte: { vorlage: bg.id, name: 'Ablauf 2', hoehe: '', drehung: 90 } }));
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        expect(ae().anzahl - vorher).toBe(6);                                                     // Bauwerk + 5 Teile, EIN Kommando
        expect(new Set(ae().eintraege.slice(vorher).map(x => x.vorgang)).size).toBe(1);
        const s = stand();
        expect(s.get('cde-B2').name).toBe('Ablauf 2');
        expect(s.get('cde-B2').parameter.vorlage).toBe(bg.id);
        expect(neu.slice(1).map(g => [s.get(g).name, s.get(g).parameter.teilVon])).toEqual(
            ['Drosselschacht', 'Drossel', 'Tauchwand', 'Wehrschwelle', 'Ablaufhaltung'].map(n => [n, 'cde-B2']));
        expect(s.get('cde-N5').parameter.anschluss).toEqual({ anfang: 'cde-N1' });
        // Geometrie: der neue Schacht steht dort, wohin „Mitte unten" + 90° ihn bringen — Abstand zur Mitte bleibt.
        const alt = s.get('cde-SD').parameter.punkte[0], neuS = s.get('cde-N1').parameter.punkte[0];
        const altR = s.get('cde-AB').parameter.punkte, neuR = s.get('cde-N5').parameter.punkte;
        const laenge = (pp) => Math.hypot(pp[1][0] - pp[0][0], pp[1][2] - pp[0][2]);
        expect(laenge(neuR)).toBeCloseTo(laenge(altR), 9);                                        // Längen bleiben
        const richtung = (pp) => Math.atan2(pp[1][2] - pp[0][2], pp[1][0] - pp[0][0]) * 180 / Math.PI;
        expect(((richtung(neuR) - richtung(altR)) % 360 + 360) % 360).toBeCloseTo(90, 6);         // um 90° gedreht
        expect(neuS[1] - 120).toBeCloseTo(alt[1] - Math.min(...TEILE.flatMap(g => s.get(g).parameter.punkte.map(q => q[1]))), 9);
        // Die Kopfzeile: „aus Baugruppe Drosselbauwerk".
        const f = facettenVon(subjektAusStand('cde-B2', { wirksamerStand: ae().wirksamerStand }),
            { bauplanVon: (g) => stand().get(g) ?? null, vorlagen: await ladeVorlagen(repo) });
        expect(f.vorlage).toMatchObject({ art: 'baugruppe', titel: 'Drosselbauwerk' });
        void verdeckteAus;
    });

    it('was nicht mitkommt, wird genannt: ein Verweis nach draussen, eine Ableitung', async () => {
        const b = await baueAblauf();
        // Eine Platte ausserhalb, die Drossel steht darauf; eine Öffnung in der Tauchwand (eine Ableitung).
        expect((await b.fuehreAus(k('platte-zeichnen', { neu: ['cde-PL'], eingaben: { umriss: [e(90, -60, 97), e(92, -60, 97), e(92, -62, 97)] },
            werte: { name: 'Fremd', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.2 } }))).ausgefuehrt).toBe(true);
        expect((await b.fuehreAus(k('auf-bauteil-stellen', { ziel: ['cde-DR'], werte: { bauteil: 'cde-PL', mass: 'oberkante', versatz: 0 } }))).ausgefuehrt).toBe(true);
        const oe = await b.fuehreAus(k('oeffnung-setzen', { ziel: ['cde-TW'], neu: ['cde-OE', 'op-OE'],
            werte: { form: 'rund', station: 1, unterkante: 0.2, durchmesser: 0.3, breite: '', hoehe: '' } }));
        expect(oe.ausgefuehrt, oe.grund).toBe(true);
        expect((await b.fuehreAus(k('bauwerk-zuordnen', { ziel: ['cde-OE'], eingaben: { auswahl: { bauwerk: 'cde-BW' } } }))).ausgefuehrt).toBe(true);
        const { baugruppe, ausgelassen } = baugruppeAus('cde-BW', { bauplaene: stand() });
        expect(baugruppe.teile).toHaveLength(5);
        expect(ausgelassen.map(a => a.grund)).toEqual(expect.arrayContaining([
            expect.stringMatching(/^Verweis hoeheVon nach draussen \(cde-PL\)/), expect.stringMatching(/Ableitung/)]));
        expect(baugruppe.teile.find(t => t.rolle === 'drossel').parameter.hoeheVon).toBeUndefined();
    });
});
