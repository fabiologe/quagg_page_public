// @vitest-environment jsdom
/**
 * Sohlhöhen je Ende und das Gefälle (Stufe 14.2).
 *
 * Bis hierher liess sich eine Haltung nur als GANZES heben und senken: die
 * Hülle ist eine Bounding-Box und weiss nicht, welches Ende oben liegt. Das
 * Gefälle — die tägliche Arbeit im Kanalbau — war damit unbearbeitbar, und
 * `gefaelle` gab es im Feature ausschliesslich als Anzeige.
 *
 * Zwei Dinge mussten dafür stimmen, und beide sind hier geprüft:
 *   1. eine ECHTE Achse mit Anfang und Ende (Stufe 14.1)
 *   2. ein Journal, das MEHRERE Masse je Bauteil hält — vorher überschrieb
 *      jede Festlegung alle übrigen, still.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus, AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { EINGEBAUTE_PROFILE, profilFuer } from '../services/bauform/Typprofile.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

/** Eine Haltung, wie sie aus `_einordnenMitHuelle` herauskommt. */
const HALTUNG = {
    modelId: 'm1', localId: 683, category: 'IFCPIPESEGMENT', globalId: '3xY',
    anker: { x: 0, y: 15, z: 0 }, bezugshoehe: 14, oberkante: 16,
    // Versatz aus der Höhenmessung: Welt 0 ist 300 m NN.
    hoehenversatz: 300,
    // Welt-Koordinaten; NN = welt.y + 300 ⇒ 318,40 und 302,50.
    achse: {
        anfang: { x: 0, y: 18.4, z: 0 },
        ende: { x: 100, y: 2.5, z: 0 },
        laenge: 133.504, gefaelle: 119.1, dn: 500, quelle: 'extrusion',
    },
};

const ECHTE_ACHSE = { bauform: 'achse+profil', guete: 'gemessen' };

/**
 * Resolver-Attrappe mit einer EXAKTEN Achse.
 *
 * `source: 'extrusion'` ist der Regelfall an echten Dateien — Fabios beide
 * Netze tragen null Axis-Repräsentationen. Beide Quellen gelten als
 * `gemessen` (siehe `ACHSE_GEMESSEN` in Bauformen.js), und genau davon hängt
 * ab, ob Sohlhöhen überhaupt angeboten werden.
 */
const resolverExtrusion = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{
                    polyline: [[0, 18.4, 0], [100, 2.5, 0]],
                    source: 'extrusion', warnings: [],
                }] };
            }
            if (form === 'solid') {
                return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
            }
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

describe('Die Rollen hängen am richtigen Ast', () => {
    it('jeder Fliessabschnitt erbt Sohle Anfang und Ende', () => {
        // An `IFCFLOWSEGMENT` gesetzt, nicht am Rohr: Kanal, Kabeltrasse und
        // jeder künftige Lauf bekommen sie über die Vererbung mit.
        for (const typ of ['IFCPIPESEGMENT', 'IFCDUCTSEGMENT', 'IFCCABLESEGMENT']) {
            const f = profilFuer(typ, EINGEBAUTE_PROFILE)?.felder ?? {};
            expect(f.sohlhoeheAnfang, typ).toBeTruthy();
            expect(f.sohlhoeheEnde, typ).toBeTruthy();
        }
    });

    it('am Rohr heissen sie, wie der Kanalbau sie nennt', () => {
        const f = profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE).felder;
        expect(f.sohlhoeheAnfang.label).toBe('Sohle oben');
        expect(f.sohlhoeheEnde.label).toBe('Sohle unten');
        expect(f.sohlhoeheAnfang.einheit).toBe('m NN');
    });

    it('der Schacht bekommt sie NICHT — er ist kein Lauf', () => {
        const f = profilFuer('IFCDISTRIBUTIONCHAMBERELEMENT', EINGEBAUTE_PROFILE)?.felder ?? {};
        expect(f.sohlhoeheAnfang).toBeUndefined();
    });
});

describe('Angeboten wird nur, wo es Sinn ergibt', () => {
    const profil = profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE);

    it('an einer Haltung mit echter Achse', () => {
        const ids = passende(ECHTE_ACHSE, { typprofil: profil }).map(b => b.id);
        expect(ids).toContain('sohlhoehen-setzen');
    });

    it('NICHT auf einer skelettierten Achse', () => {
        // Dort ist „Anfang" willkürlich — welches Ende zuerst kommt,
        // entscheidet der Algorithmus, nicht das Bauwerk. Sohlhöhen darauf zu
        // setzen hiesse, sie mit einer Münze zu verteilen.
        const ids = passende({ bauform: 'achse+profil', guete: 'geschaetzt' }, { typprofil: profil })
            .map(b => b.id);
        expect(ids).not.toContain('sohlhoehen-setzen');
        // Die Bezugshöhe bleibt — sie braucht nur die Hülle, keine Richtung.
        expect(ids).toContain('bezugshoehe-setzen');
    });

    it('NICHT an einem Bauteil, dem eine der beiden Rollen fehlt', () => {
        const halb = { bauform: 'achse+profil', felder: { sohlhoeheAnfang: { typ: 'zahl' } } };
        const ids = passende(ECHTE_ACHSE, { typprofil: halb }).map(b => b.id);
        expect(ids).not.toContain('sohlhoehen-setzen');
    });
});

describe('Vorbelegung aus der Achse, in m NN', () => {
    it('nimmt Anfang und Ende getrennt und rechnet sie um', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        expect(b.starte('sohlhoehen-setzen')).toBe(true);
        // Die Achse kommt aus der EXTRUSION — sie liegt in der Rohrmitte. Seit
        // Teil XXIV (K4, Empfehlung O7) steht im Feld „Sohle" die SOHLE, DN/2
        // darunter (DN 500: 0,25 m); vorher stand dort die Mittenhöhe.
        expect(b.werte.anfang).toBeCloseTo(318.4 - 0.25, 3);
        expect(b.werte.ende).toBeCloseTo(302.5 - 0.25, 3);
    });

    it('eine bereits getroffene Festlegung schlägt die Datei', async () => {
        const ae = useAenderungen();
        await ae.eintragen({
            art: 'parametrik', globalId: HALTUNG.globalId,
            nachher: { sohlhoeheAnfang: 318.0, sohlhoeheEnde: 301.0 },
        });
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        b.starte('sohlhoehen-setzen');
        expect(b.werte.anfang).toBeCloseTo(318.0, 3);
        expect(b.werte.ende).toBeCloseTo(301.0, 3);
    });

    it('ohne Achse steht 0 statt einer erfundenen Höhe', () => {
        const ohne = nachId('sohlhoehen-setzen').vorbelegung({ hoehenversatz: 300 });
        expect(ohne).toEqual({ anfang: 0, ende: 0 });
    });
});

describe('Der Eintrag trägt beide Höhen', () => {
    it('schreibt eine Karte Rolle → Wert', () => {
        const b = nachId('sohlhoehen-setzen');
        expect(b.anwenden({ globalId: 'H12' }, { anfang: 318.4, ende: 302.5 })).toEqual({
            art: 'parametrik', globalId: 'H12',
            nachher: { sohlhoeheAnfang: 318.4, sohlhoeheEnde: 302.5 },
        });
    });

    it('gibt null statt Unsinn, wenn ein Wert keine Zahl ist', () => {
        expect(nachId('sohlhoehen-setzen').anwenden({ globalId: 'H12' }, { anfang: 318.4 })).toBeNull();
    });

    it('ist eine FESTLEGUNG — das gelieferte Modell bleibt unberührt', () => {
        // Zwei verschiedene Sohlhöhen ändern die Gestalt des Rohres. Das
        // Autorenmodell gehört dem Planer; die Forderung geht in den
        // Änderungsbericht.
        expect(nachId('sohlhoehen-setzen').nurFestlegung).toBe(true);
    });
});

describe('Mehrere Masse gelten NEBENEINANDER', () => {
    it('eine zweite Festlegung löscht die erste nicht mehr', async () => {
        // DER FEHLER, DEN 14.2 MITNIMMT: `parametrik` faltete je Bauteil.
        // Wer erst die Nennweite und dann die Sohlhöhen festlegte, verlor die
        // Nennweite — und sah es nicht, weil ja ein Wert dastand.
        const ae = useAenderungen();
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: { profilGroesse: 500 } });
        await ae.eintragen({
            art: 'parametrik', globalId: 'H12',
            nachher: { sohlhoeheAnfang: 318.4, sohlhoeheEnde: 302.5 },
        });

        expect(standAus(ae.eintraege, 'parametrik').get('H12')).toEqual({
            profilGroesse: 500, sohlhoeheAnfang: 318.4, sohlhoeheEnde: 302.5,
        });
    });

    it('dieselbe Rolle noch einmal überschreibt sie sehr wohl', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: { profilGroesse: 500 } });
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: { profilGroesse: 300 } });
        expect(standAus(ae.eintraege, 'parametrik').get('H12')).toEqual({ profilGroesse: 300 });
    });

    it('versteht die ALTE Form `{rolle, wert}` aus bestehenden Journalen', async () => {
        // Fabios Journal trägt Einträge von vor Stufe 14.2. Ohne diese
        // Übersetzung verlöre er sie still — als Karte gelesen ergäbe
        // `{rolle:'x', wert:1}` zwei sinnlose Schlüssel.
        const ae = useAenderungen();
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: { rolle: 'profilGroesse', wert: 400 } });
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: { dicke: 0.3 } });
        expect(standAus(ae.eintraege, 'parametrik').get('H12')).toEqual({ profilGroesse: 400, dicke: 0.3 });
    });

    it('ein Gegeneintrag räumt weiterhin ganz ab', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: { profilGroesse: 500 } });
        await ae.eintragen({ art: 'parametrik', globalId: 'H12', nachher: null });
        expect(standAus(ae.eintraege, 'parametrik').has('H12')).toBe(false);
    });

    it('andere Arten falten weiter „letzter gewinnt"', async () => {
        // Die eigene Faltung ist die AUSNAHME, nicht die neue Regel.
        expect(AENDERUNGS_ARTEN.kg.falte).toBeUndefined();
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'H12', nachher: '322' });
        await ae.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });
        expect(standAus(ae.eintraege, 'kg').get('H12')).toBe('331');
    });
});

describe('Der ganze Weg: Auswahl → Formular → Journal', () => {
    it('trägt beide Höhen ein und meldet die Festlegung', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        b.starte('sohlhoehen-setzen');
        b.setzeWert('anfang', 318.4);
        b.setzeWert('ende', 301.0);          // 1,5 m steiler als geliefert

        const eintrag = await b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
        expect(eintrag.art).toBe('parametrik');
        expect(eintrag.nachher).toEqual({ sohlhoeheAnfang: 318.4, sohlhoeheEnde: 301 });
    });

    it('derselbe Wert zweimal ergibt keinen zweiten Eintrag', async () => {
        const b = useBearbeitung();
        for (let i = 0; i < 2; i++) {
            await b.einordne({ ...HALTUNG }, resolverExtrusion);
            b.starte('sohlhoehen-setzen');
            b.setzeWert('anfang', 318.4);
            b.setzeWert('ende', 302.5);
            await b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
        }
        expect(useAenderungen().eintraege).toHaveLength(1);
    });
});
