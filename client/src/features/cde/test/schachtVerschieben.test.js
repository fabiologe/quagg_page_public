// @vitest-environment jsdom
/**
 * Schacht verschieben — und was mit den Anschlüssen geschieht (Stufe 14.8).
 *
 * DIE FRAGE, an der diese Bearbeitung hängt: Die angeschlossenen Haltungen
 * können sich nicht starr mitbewegen. Bei einer Haltung wandert nur EIN Ende,
 * das andere bleibt am Nachbarschacht — das ist eine FORMänderung. Und
 * Formänderungen am gelieferten Modell sind Forderungen, keine Eingriffe.
 *
 * Deshalb ein Regler statt einer stillen Annahme. Diese Datei prüft beide
 * Stellungen und vor allem, dass die Verkettung in der einen erhalten bleibt
 * und in der anderen ehrlich zerreisst.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { baueNetz } from '../services/Netztopologie.js';
import { EINGEBAUTE_PROFILE, profilFuer } from '../services/bauform/Typprofile.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

/**
 * Ein Schacht bei Welt (0/0), an dem zwei Haltungen hängen: eine kommt von
 * links an, eine geht nach rechts ab. Der Ladeversatz ist so gewählt, dass
 * Welt (0/0) den Projektkoordinaten (2577000 / 5465000) entspricht.
 */
const VERSATZ = { x: 2577000, y: 300, z: -5465000 };
const SCHACHT = {
    modelId: 'm1', localId: 7, category: 'IFCDISTRIBUTIONCHAMBERELEMENT', globalId: 'S1',
    name: 'FK003', anker: { x: 0, y: 5, z: 0 }, bezugshoehe: 2, oberkante: 8,
    hoehenversatz: 300,
    versatz: VERSATZ,
    lageUmkehrbar: true,
    lage: { ost: 2577000, nord: 5465000, hoehe: 305 },
    anschluesse: [
        { localId: 1, globalId: 'ZU', name: 'H1', kategorie: 'IFCPIPESEGMENT', ende: 'ende',
          anfang: { x: -50, y: 8, z: 0 }, ende_: { x: 0, y: 6, z: 0 }, laenge: 50, dn: 300 },
        { localId: 2, globalId: 'AB', name: 'H2', kategorie: 'IFCPIPESEGMENT', ende: 'anfang',
          anfang: { x: 0, y: 6, z: 0 }, ende_: { x: 50, y: 4, z: 0 }, laenge: 50, dn: 300 },
    ],
};

const resolverKoerper = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'solid') return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

describe('Angeboten wird es am Bauwerk, nicht an der Haltung', () => {
    it('am Schacht, weil der die Rolle „deckelhoehe" kennt', () => {
        const ids = passende({ bauform: 'koerper', guete: 'gemessen' }, {
            typprofil: profilFuer('IFCDISTRIBUTIONCHAMBERELEMENT', EINGEBAUTE_PROFILE),
        }).map(b => b.id);
        expect(ids).toContain('schacht-verschieben');
    });

    it('nicht an der Haltung — die hat keinen Deckel', () => {
        const ids = passende({ bauform: 'achse+profil', guete: 'gemessen' }, {
            typprofil: profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE),
        }).map(b => b.id);
        expect(ids).not.toContain('schacht-verschieben');
    });
});

describe('Die Eingabe ist absolut, in Projektkoordinaten', () => {
    it('ist mit der jetzigen Lage vorbelegt', () => {
        const v = nachId('schacht-verschieben').vorbelegung(SCHACHT);
        expect(v.ost).toBe(2577000);
        expect(v.nord).toBe(5465000);
        expect(v.mitfuehren).toBe('forderung');
    });

    it('rechnet den Rechts-/Hochwert richtig in die Welt zurück', () => {
        // Die Umkehrung von `nachProjekt`: ost = welt.x + versatz.x und
        // nord = −(welt.z + versatz.z).
        const [schacht] = nachId('schacht-verschieben')
            .anwenden(SCHACHT, { ost: 2577010, nord: 5465020, mitfuehren: 'forderung' });
        expect(schacht.nachher.x).toBeCloseTo(10, 6);
        expect(schacht.nachher.z).toBeCloseTo(-20, 6);
        expect(schacht.nachher.y).toBe(5);          // die Höhe bleibt
    });

    it('DIESELBE Eingabe zweimal verschiebt nicht doppelt', () => {
        // Der Grund für absolute Werte statt eines Zuwachses. Ein „1,20 m nach
        // Osten" verschöbe beim zweiten Klick um 2,40 — und das Journal ruht
        // auf absoluten Werten.
        const b = nachId('schacht-verschieben');
        const [erst] = b.anwenden(SCHACHT, { ost: 2577010, nord: 5465000, mitfuehren: 'forderung' });
        const verschoben = { ...SCHACHT, anker: { ...erst.nachher } };
        expect(b.anwenden(verschoben, { ost: 2577010, nord: 5465000, mitfuehren: 'forderung' }))
            .toBeNull();
    });

    it('verweigert, wenn eine MapConversion gilt — dann ist die Formel falsch', () => {
        // Mit Drehung ist die Umkehrung nicht mehr diese Formel. Lieber gar
        // nichts als eine Verschiebung an die falsche Stelle.
        expect(nachId('schacht-verschieben').anwenden(
            { ...SCHACHT, lageUmkehrbar: false },
            { ost: 2577010, nord: 5465000, mitfuehren: 'forderung' },
        )).toBeNull();
    });
});

describe('Regler „als Forderung" — die Herkunft bleibt unangetastet', () => {
    const e = () => nachId('schacht-verschieben')
        .anwenden(SCHACHT, { ost: 2577010, nord: 5465000, mitfuehren: 'forderung' });

    it('bewegt den Schacht und schreibt je Haltung einen Anschlusspunkt', () => {
        const r = e();
        expect(r.map(x => x.art)).toEqual(['lage', 'parametrik', 'parametrik']);
        expect(r[1].globalId).toBe('ZU');
        expect(r[1].nachher.anschlusspunkt).toEqual({ ende: 'ende', ost: 2577010, nord: 5465000 });
        expect(r[2].nachher.anschlusspunkt.ende).toBe('anfang');
    });

    it('löscht KEINE Haltung — nichts wandert ins CDE-Modell', () => {
        expect(e().some(x => x.art === 'geloescht' || x.art === 'erzeugt')).toBe(false);
    });
});

describe('Regler „wirklich mitführen" — die Haltungen folgen sichtbar', () => {
    const e = () => nachId('schacht-verschieben')
        .anwenden(SCHACHT, { ost: 2577010, nord: 5465020, mitfuehren: 'wirklich' });

    it('baut jede angeschlossene Haltung neu — löschen und erzeugen', () => {
        const r = e();
        expect(r.map(x => x.art)).toEqual([
            'lage', 'geloescht', 'erzeugt', 'geloescht', 'erzeugt',
        ]);
    });

    it('bewegt NUR das Ende am Schacht — das andere bleibt am Nachbarn', () => {
        // Der ganze Grund, warum es keine starre Verschiebung sein kann.
        const [, , zuNeu, , abNeu] = e();
        const zu = zuNeu.nachher.parameter.punkte;
        const ab = abNeu.nachher.parameter.punkte;
        // Seit Stufe 4 (Teil XXIV, K4b, ausgeliefert 2026-09-19) speichert eine neue Kante ihre SOHLE
        // (`achsbezug: 'sohle'`): die Achse hier sagt ihren Bezug nicht (Rohrmitte) — also y − DN/2.
        expect(zu[0]).toEqual([-50, 7.85, 0]);       // Nachbarschacht, unberührt (Mitte 8, DN 300)
        expect(zu[1]).toEqual([10, 5.85, -20]);      // wandert mit
        expect(ab[0]).toEqual([10, 5.85, -20]);      // wandert mit
        expect(ab[1]).toEqual([50, 3.85, 0]);        // Nachbarschacht, unberührt
    });

    it('DAS NETZ BLEIBT GESCHLOSSEN — beide Haltungen treffen den Schacht wieder', () => {
        // Die eigentliche Zusage dieser Reglerstellung. Geprüft wird sie mit
        // derselben Topologie, die auch im Betrieb rechnet.
        const [schacht, , zuNeu, , abNeu] = e();
        const netz = baueNetz({
            knoten: [
                { id: 'S1', punkt: schacht.nachher },
                { id: 'NACHBAR_A', punkt: { x: -50, y: 8, z: 0 } },
                { id: 'NACHBAR_B', punkt: { x: 50, y: 4, z: 0 } },
            ],
            kanten: [zuNeu, abNeu].map((x, i) => ({
                id: `K${i}`,
                anfang: { x: x.nachher.parameter.punkte[0][0], y: 0, z: x.nachher.parameter.punkte[0][2] },
                ende: { x: x.nachher.parameter.punkte[1][0], y: 0, z: x.nachher.parameter.punkte[1][2] },
            })),
        });
        expect(netz.loseEnden).toEqual([]);
        expect(netz.knoten.get('S1').kantenAn).toHaveLength(1);
        expect(netz.knoten.get('S1').kantenAb).toHaveLength(1);
    });

    it('die neuen Haltungen behalten Name, Typ und Nennweite', () => {
        const [, , zuNeu] = e();
        expect(zuNeu.nachher.name).toBe('H1');
        expect(zuNeu.nachher.kategorie).toBe('IFCPIPESEGMENT');
        expect(zuNeu.nachher.parameter.dn).toBe(300);
        // Und sie liegen im CDE-Modell — die Herkunft ist strukturell.
        expect(zuNeu.modell).toBe('cde');
    });
});

describe('Ein Schacht ohne Anschlüsse', () => {
    it('lässt sich verschieben, ohne dass etwas Weiteres passiert', () => {
        const allein = { ...SCHACHT, anschluesse: [] };
        const r = nachId('schacht-verschieben')
            .anwenden(allein, { ost: 2577010, nord: 5465000, mitfuehren: 'wirklich' });
        expect(r).toHaveLength(1);
        expect(r[0].art).toBe('lage');
    });
});

describe('Der ganze Weg', () => {
    it('schreibt alles unter EINEM Vorgang und nimmt es gemeinsam zurück', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        await b.einordne({ ...SCHACHT }, resolverKoerper);
        expect(b.starte('schacht-verschieben')).toBe(true);
        b.setzeWert('ost', 2577010);
        b.setzeWert('mitfuehren', 'wirklich');

        const eintraege = await b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
        expect(eintraege).toHaveLength(5);
        expect(new Set(eintraege.map(x => x.vorgang)).size).toBe(1);
        expect(eintraege[0].vorgangTitel).toBe('Schacht verschieben');

        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(2);
        await ae.zurueck('Fabio');
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(0);
        expect(standAus(ae.eintraege, 'lage').size).toBe(0);
    });
});
