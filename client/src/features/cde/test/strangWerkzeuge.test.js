// @vitest-environment jsdom
/**
 * Die Werkzeuge, die erst mit Achse und Netz möglich wurden (Stufe 14.6).
 *
 *   · Deckelhöhe am Schacht — die zweite Höhe, ohne die es keine Schachttiefe gibt
 *   · Fliessrichtung umkehren — im Kanalbau keine Kleinigkeit: sie entscheidet
 *     über Zulauf und Ablauf, über „DN nimmt nicht ab" und über jeden
 *     Gefälle-Befund
 *   · Sohlhöhen über den STRANG — das erste Werkzeug der Sorte „Kette": n
 *     Bauteile, n Einträge, EIN Vorgang
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { befundeFuer } from '../services/Befunde.js';
import { EINGEBAUTE_PROFILE, profilFuer } from '../services/bauform/Typprofile.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const resolver = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 18, 0], [100, 2, 0]], source: 'extrusion', warnings: [] }] };
            }
            if (form === 'solid') return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

/** Welt-Y plus 300 ergibt m NN. */
const VERSATZ = 300;
const HALTUNG = {
    modelId: 'm1', localId: 1, category: 'IFCPIPESEGMENT', globalId: 'H1',
    anker: { x: 50, y: 10, z: 0 }, bezugshoehe: 2, oberkante: 18, hoehenversatz: VERSATZ,
    achse: { anfang: { x: 0, y: 18, z: 0 }, ende: { x: 100, y: 2, z: 0 },
             laenge: 100, gefaelle: 160, dn: 500, quelle: 'extrusion' },
};

/** Drei Haltungen, verschieden lang — die Verteilung muss der LÄNGE folgen. */
const STRANG = [
    { localId: 1, globalId: 'H1', laenge: 100, anfang: { x: 0, y: 18, z: 0 }, ende: { x: 100, y: 14, z: 0 } },
    { localId: 2, globalId: 'H2', laenge: 50, anfang: { x: 100, y: 14, z: 0 }, ende: { x: 150, y: 12, z: 0 } },
    { localId: 3, globalId: 'H3', laenge: 50, anfang: { x: 150, y: 12, z: 0 }, ende: { x: 200, y: 10, z: 0 } },
];

describe('Deckelhöhe am Schacht', () => {
    const schacht = {
        globalId: 'S1', category: 'IFCDISTRIBUTIONCHAMBERELEMENT',
        anker: { x: 0, y: 5, z: 0 }, bezugshoehe: 2, oberkante: 8, hoehenversatz: VERSATZ,
    };

    it('wird angeboten, wo der Typ die Rolle kennt', () => {
        const ids = passende({ bauform: 'koerper', guete: 'gemessen' }, {
            typprofil: profilFuer('IFCDISTRIBUTIONCHAMBERELEMENT', EINGEBAUTE_PROFILE),
        }).map(b => b.id);
        expect(ids).toContain('deckelhoehe-setzen');
        // Die Haltung kennt sie nicht — sie hat keinen Deckel.
        expect(passende({ bauform: 'achse+profil', guete: 'gemessen' }, {
            typprofil: profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE),
        }).map(b => b.id)).not.toContain('deckelhoehe-setzen');
    });

    it('ist mit der Oberkante der Hülle vorbelegt — in m NN', () => {
        expect(nachId('deckelhoehe-setzen').vorbelegung(schacht).deckel).toBeCloseTo(308, 3);
    });

    it('schreibt die Rolle als Karte', () => {
        expect(nachId('deckelhoehe-setzen').anwenden(schacht, { deckel: 307.5 }))
            .toEqual({ art: 'parametrik', globalId: 'S1', nachher: { deckelhoehe: 307.5 } });
    });
});

describe('Fliessrichtung', () => {
    it('ist mit „wie geliefert" vorbelegt und bleibt idempotent', () => {
        // Ein Auswahlfeld statt eines Umschalt-Knopfes: zweimal „umgekehrt"
        // ist einmal umgekehrt, nicht wieder zurück. Sonst hinge das Ergebnis
        // daran, wie oft jemand geklickt hat.
        const b = nachId('fliessrichtung-setzen');
        expect(b.vorbelegung(HALTUNG).richtung).toBe('wie_geliefert');
        expect(b.vorbelegung({ ...HALTUNG, stand: { fliessrichtung: 'umgekehrt' } }).richtung)
            .toBe('umgekehrt');
        expect(b.anwenden(HALTUNG, { richtung: 'umgekehrt' }).nachher)
            .toEqual({ fliessrichtung: 'umgekehrt' });
    });

    it('macht den Gegengefälle-Befund verschwinden — der Klick WIRKT', () => {
        // Sonst wäre die Festlegung eine Behauptung ohne Folgen. Die Geometrie
        // bleibt unberührt; getauscht wird nur, was als Anfang gilt.
        const bergauf = {
            globalId: 'H1', kategorie: 'IFCPIPESEGMENT',
            achse: { anfang: { x: 0, y: 9, z: 0 }, ende: { x: 50, y: 10, z: 0 }, laenge: 50, dn: 300 },
            typprofil: profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE),
        };
        expect(befundeFuer(bergauf).map(b => b.regel)).toContain('gefaelle_gegen');
        expect(befundeFuer({ ...bergauf, umgekehrt: true }).map(b => b.regel))
            .not.toContain('gefaelle_gegen');
    });

    it('braucht eine ECHTE Achse — auf einer geschätzten ist „Anfang" willkürlich', () => {
        const profil = profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE);
        expect(passende({ bauform: 'achse+profil', guete: 'geschaetzt' }, { typprofil: profil })
            .map(b => b.id)).not.toContain('fliessrichtung-setzen');
    });
});

describe('Sohlhöhen über den Strang', () => {
    const mitStrang = { ...HALTUNG, strang: STRANG };

    it('ist mit den Enden der KETTE vorbelegt, nicht mit denen der Haltung', () => {
        const v = nachId('strang-gefaelle-setzen').vorbelegung(mitStrang);
        expect(v.anfang).toBeCloseTo(318, 3);        // Anfang von H1
        expect(v.ende).toBeCloseTo(310, 3);          // Ende von H3
    });

    it('verteilt das Gefälle nach LÄNGE, nicht nach Anzahl', () => {
        // Zwei kurze und eine lange Haltung bekämen sonst dasselbe Drittel,
        // und der Strang knickte an jedem Schacht.
        const e = nachId('strang-gefaelle-setzen').anwenden(mitStrang, { anfang: 320, ende: 300 });
        expect(e).toHaveLength(3);
        // 200 m Gesamtlänge, 20 m Fall ⇒ 0,1 m je Meter.
        expect(e[0].nachher).toEqual({ sohlhoeheAnfang: 320, sohlhoeheEnde: 310 });   // 100 m
        expect(e[1].nachher).toEqual({ sohlhoeheAnfang: 310, sohlhoeheEnde: 305 });   // 50 m
        expect(e[2].nachher).toEqual({ sohlhoeheAnfang: 305, sohlhoeheEnde: 300 });   // 50 m
    });

    it('die Stücke stossen lückenlos aneinander', () => {
        const e = nachId('strang-gefaelle-setzen').anwenden(mitStrang, { anfang: 318.4, ende: 301.2 });
        for (let i = 0; i + 1 < e.length; i++) {
            expect(e[i].nachher.sohlhoeheEnde).toBeCloseTo(e[i + 1].nachher.sohlhoeheAnfang, 6);
        }
    });

    it('jeder Eintrag trifft SEIN Bauteil', () => {
        const e = nachId('strang-gefaelle-setzen').anwenden(mitStrang, { anfang: 320, ende: 300 });
        expect(e.map(x => x.globalId)).toEqual(['H1', 'H2', 'H3']);
    });

    it('gibt null statt Unsinn ohne Strang oder ohne Länge', () => {
        const b = nachId('strang-gefaelle-setzen');
        expect(b.anwenden(HALTUNG, { anfang: 320, ende: 300 })).toBeNull();
        expect(b.anwenden({ ...HALTUNG, strang: [{ globalId: 'X', laenge: 0, anfang: {}, ende: {} }] },
            { anfang: 320, ende: 300 })).toBeNull();
    });

    it('schreibt n Einträge unter EINEM Vorgang', async () => {
        const b = useBearbeitung();
        await b.einordne(mitStrang, resolver);
        expect(b.starte('strang-gefaelle-setzen')).toBe(true);
        b.setzeWert('anfang', 320);
        b.setzeWert('ende', 300);

        const eintraege = await b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
        expect(eintraege).toHaveLength(3);
        expect(new Set(eintraege.map(e => e.vorgang)).size).toBe(1);
        expect(eintraege[0].vorgangTitel).toBe('Sohlhöhen über den Strang');

        const stand = standAus(useAenderungen().eintraege, 'parametrik');
        expect(stand.get('H2')).toEqual({ sohlhoeheAnfang: 310, sohlhoeheEnde: 305 });
    });

    it('„zurück" nimmt den ganzen Strang zurück, nicht eine Haltung davon', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        await b.einordne(mitStrang, resolver);
        b.starte('strang-gefaelle-setzen');
        b.setzeWert('anfang', 320);
        b.setzeWert('ende', 300);
        await b.ausfuehren({ wer: 'Fabio' });

        expect(standAus(ae.eintraege, 'parametrik').size).toBe(3);
        await ae.zurueck('Fabio');
        expect(standAus(ae.eintraege, 'parametrik').size).toBe(0);
    });

    it('lässt eine ANDERE Festlegung am selben Bauteil stehen', async () => {
        // Die Faltung je Rolle (Stufe 14.2) trägt auch hier: eine Nennweite
        // überlebt das Setzen der Sohlhöhen.
        const ae = useAenderungen();
        await ae.eintragen({ art: 'parametrik', globalId: 'H2', nachher: { profilGroesse: 400 } });

        const b = useBearbeitung();
        await b.einordne(mitStrang, resolver);
        b.starte('strang-gefaelle-setzen');
        b.setzeWert('anfang', 320);
        b.setzeWert('ende', 300);
        await b.ausfuehren({ wer: 'Fabio' });

        expect(standAus(ae.eintraege, 'parametrik').get('H2')).toEqual({
            profilGroesse: 400, sohlhoeheAnfang: 310, sohlhoeheEnde: 305,
        });
    });
});
