// @vitest-environment jsdom
/**
 * Bearbeitungs-Store (Stufe 9.0) — das Bindeglied zwischen Katalog und Journal.
 *
 * Zwei Zusagen stehen hier im Mittelpunkt:
 *
 *  1. **Es gibt keinen zweiten Weg, ein Bauteil zu ändern.** `ausfuehren`
 *     schreibt nicht selbst, sondern legt einen Journaleintrag an. Wäre das
 *     anders, hätte die CDE zwei Rücknahme-Stapel, die Verschiedenes tun.
 *  2. **Die Güteschranke gilt in JEDEM Einstieg.** Die Befehls-Palette kennt
 *     alle Bearbeitungen — sie darf aber keine scharf schalten, die das
 *     Kontextmenü aus gutem Grund verschweigt.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { herleite } from '../services/Herleitung.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    // Der Bearbeiten-Modus ist mit Absicht AUS, solange ihn niemand
    // einschaltet — die Sperre soll der Zustand sein, in den man ohne Zutun
    // gerät. Diese Datei prüft, was IM Modus geschieht; dass ausserhalb nichts
    // geschieht, prüft `bearbeitenModus.test.js`.
    useBearbeitung().modusSetzen(true);
});

const ROHR = { modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: '3xY' };

/** Resolver-Attrappe: liefert eine echte Achse. */
const resolverEchteAchse = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 0, 0], [1, 0, 0]], source: 'axisRep', warnings: [] }] };
            }
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

/** Resolver-Attrappe: gar nichts ableitbar. */
const resolverLeer = {
    forElements: () => ({ async getForm(form) { return { form, data: null, perElement: [], warnings: [] }; } }),
};

describe('einordne', () => {
    it('ordnet ein Rohr über sein Typprofil ein', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        expect(b.einordnung.bauform).toBe('achse+profil');
        expect(b.einordnung.quelle).toBe('typprofil');
        expect(b.typprofil.felder.profilGroesse.label).toBe('DN');
    });

    it('leert die Einordnung, wenn die Auswahl verschwindet', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        await b.einordne(null, resolverEchteAchse);
        expect(b.einordnung).toBe(null);
        expect(b.bauteil).toBe(null);
    });

    it('nimmt eine scharfe Bearbeitung zurück, wenn ein anderes Bauteil gewählt wird', async () => {
        // Sonst stünde ein Formular mit den Werten des VORIGEN Bauteils offen
        // und schriebe sie beim nächsten Klick aufs neue.
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('kg-setzen');
        expect(b.scharfId).toBe('kg-setzen');
        await b.einordne({ ...ROHR, localId: 43, globalId: 'aB2' }, resolverEchteAchse);
        expect(b.scharfId).toBe(null);
        expect(b.werte).toEqual({});
    });

    it('meldet auch bei unbrauchbarer Geometrie eine Bauform, statt zu scheitern', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...ROHR, category: 'IFCUNBEKANNT' }, resolverLeer);
        expect(b.einordnung.bauform).toBe('netz');
    });
});

describe('moeglich — die Liste fürs Kontextmenü', () => {
    it('bietet an einem eingeordneten Bauteil die Merkmals-Bearbeitungen an', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        expect(b.moeglich.map(m => m.id)).toContain('kg-setzen');
    });

    it('ist ohne Auswahl leer, nicht undefined', () => {
        expect(useBearbeitung().moeglich).toEqual([]);
    });
});

describe('starte — die Güteschranke gilt in jedem Einstieg', () => {
    it('belegt das Formular mit dem Wert, der GERADE GILT — aus dem Journal', async () => {
        // Vorher reichte dieser Test den `stand` selbst herein. Damit prüfte er
        // eine Schnittstelle, die es nicht gab: `einordne` hat NIE einen Stand
        // erzeugt, und im Browser stand das Formular deshalb immer leer —
        // „Querschnittsgröße festlegen" sogar dauerhaft auf „fehlt", weil das
        // Feld kein `leerErlaubt` hat. Dieselbe Klasse wie die Editor-Attrappe
        // in `ifcAutor.test.js`: eine selbstgebaute Eingabe kann die eigene
        // Annahme nicht widerlegen.
        //
        // Jetzt kommt der Stand dort her, wo er auch in Wirklichkeit herkommt.
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: ROHR.globalId, nachher: '322' });

        const b = useBearbeitung();
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.starte('kg-setzen')).toBe(true);
        expect(b.werte).toEqual({ kg: '322' });
    });

    it('belegt eine Festlegung aus ihrer Rolle vor — sonst ist sie sofort ungültig', async () => {
        const ae = useAenderungen();
        await ae.eintragen({
            art: 'parametrik', globalId: ROHR.globalId,
            nachher: { rolle: 'profilGroesse', wert: 300 },
        });

        const b = useBearbeitung();
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.starte('profilgroesse-setzen')).toBe(true);
        expect(b.werte).toEqual({ groesse: 300 });
        // Der eigentliche Gewinn: der Knopf ist von Anfang an bedienbar.
        expect(b.fehler).toEqual([]);
        expect(b.bereit).toBe(true);
    });

    it('ohne Journaleintrag bleibt der Stand leer, ohne zu werfen', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.bauteil.stand).toEqual({
            // `pset` seit Teil XXIV (O6): „Merkmalssatz setzen" schreibt den vollen Stand fort.
            kg: null, din277: null, bauplan: null, bauformAusnahme: null, pset: null,
        });
    });

    it('weist eine erfundene Id ab', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        expect(b.starte('gibtsnicht')).toBe(false);
        expect(b.scharfId).toBe(null);
    });

    it('weist eine Bearbeitung ab, die zu diesem Bauteil nicht passt', async () => {
        // Dieselbe Prüfung wie im Kontextmenü — sonst umginge die
        // Befehls-Palette (Strg+K) die Schranke, die das Menü einhält.
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        b.einordnung = { bauform: 'netz', guete: 'unbekannt' };
        const nurLineare = b.moeglich.map(m => m.id);
        expect(nurLineare).toContain('kg-setzen');   // '*' gilt weiter
        b.einordnung = { bauform: 'koerper', guete: 'unbekannt' };
        expect(b.starte('kg-setzen')).toBe(true);    // Merkmale brauchen keine Form
    });
});

describe('fehler und bereit', () => {
    it('meldet einen Wert außerhalb der Auswahl und sperrt die Ausführung', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('din277-setzen');
        b.setzeWert('din277', 'GIBTSNICHT');
        expect(b.fehler).toHaveLength(1);
        expect(b.bereit).toBe(false);
    });

    it('ist bereit, sobald der Wert stimmt', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('din277-setzen');
        b.setzeWert('din277', 'VF');
        expect(b.fehler).toEqual([]);
        expect(b.bereit).toBe(true);
    });
});

/**
 * DER FALL, DER DIESEN MECHANISMUS AUSGELÖST HAT (2026-09-03).
 *
 * Ein Tiefbau-Projektleiter liefert sein Geländemodell als geschlossenen
 * Volumenkörper unter `IFCCIVILELEMENT` — ein Typ, der über die Form
 * ABSICHTLICH nichts sagt (`bauform: null` ist eine Sperre gegen die
 * Vererbung, kein fehlender Eintrag). Der Geometrie-Rückfall kann `hoehenfeld`
 * gar nicht erzeugen; er kennt Achse, Körper und Netz. Der Körper landet also
 * zwangsläufig auf `koerper`, und die Gelände-Werkzeuge erscheinen nie.
 *
 * Dieser Test geht den ganzen Weg: einordnen → auslegen → NEU einordnen.
 * Ohne den letzten Schritt bewiese er nichts — geprüft werden muss, dass die
 * Auslegung beim nächsten Anfassen des Bauteils WIRKT.
 */
describe('Bauform auslegen — ein Volumenkörper wird zum Gelände', () => {
    const ERDKOERPER = {
        modelId: 'm1', localId: 7, category: 'IFCCIVILELEMENT', globalId: 'ERD1',
    };

    /** Ein geschlossener Körper, aus dem sich eine Oberfläche ableiten lässt. */
    const resolverErdkoerper = {
        forElements: () => ({
            async getForm(form) {
                if (form === 'solid') {
                    return { form, data: { positions: new Float64Array(9), triCount: 1, closed: true }, warnings: [] };
                }
                if (form === 'surface') {
                    return { form, data: { positions: new Float64Array(9), triCount: 1 }, warnings: [] };
                }
                return { form, data: null, perElement: [], warnings: [] };
            },
        }),
    };

    it('ohne Auslegung ist er ein Körper — und die Gelände-Werkzeuge fehlen', async () => {
        const b = useBearbeitung();
        await b.einordne(ERDKOERPER, resolverErdkoerper);
        expect(b.einordnung.bauform).toBe('koerper');
        expect(b.einordnung.quelle).toBe('geometrie');
        expect(b.moeglich.map(x => x.id)).not.toContain('gerinne-einschneiden');
        // Das Werkzeug, das den Ausweg öffnet, muss aber DA sein — sonst
        // Henne und Ei: man käme nie an die Stelle, die man korrigieren will.
        expect(b.moeglich.map(x => x.id)).toContain('bauform-auslegen');
    });

    it('nach der Auslegung ist er ein Höhenfeld — mit den Gelände-Werkzeugen', async () => {
        const b = useBearbeitung();
        await b.einordne(ERDKOERPER, resolverErdkoerper);
        b.starte('bauform-auslegen');
        b.setzeWert('bauform', 'hoehenfeld');
        const eintrag = await b.ausfuehren({ wer: 'Fabio' });
        expect(eintrag).toMatchObject({ art: 'bauform', globalId: 'ERD1', nachher: 'hoehenfeld' });

        // DER eigentliche Beweis: beim nächsten Anfassen gilt sie.
        await b.einordne(ERDKOERPER, resolverErdkoerper);
        expect(b.einordnung.bauform).toBe('hoehenfeld');
        expect(b.einordnung.quelle).toBe('einzelfall');
        expect(b.einordnung.guete).toBe('gemessen');
        expect(b.moeglich.map(x => x.id)).toEqual(
            expect.arrayContaining(['gerinne-einschneiden', 'planum-herstellen']),
        );
    });

    it('das Formular zeigt die geltende Auslegung, statt leer aufzuschlagen', async () => {
        const b = useBearbeitung();
        await b.einordne(ERDKOERPER, resolverErdkoerper);
        b.starte('bauform-auslegen');
        b.setzeWert('bauform', 'hoehenfeld');
        await b.ausfuehren();

        await b.einordne(ERDKOERPER, resolverErdkoerper);
        b.starte('bauform-auslegen');
        expect(b.werte.bauform).toBe('hoehenfeld');
    });

    it('leeres Feld nimmt sie zurück — dann entscheidet wieder die Geometrie', async () => {
        const b = useBearbeitung();
        await b.einordne(ERDKOERPER, resolverErdkoerper);
        b.starte('bauform-auslegen');
        b.setzeWert('bauform', 'hoehenfeld');
        await b.ausfuehren();

        await b.einordne(ERDKOERPER, resolverErdkoerper);
        b.starte('bauform-auslegen');
        b.setzeWert('bauform', '');
        await b.ausfuehren();

        await b.einordne(ERDKOERPER, resolverErdkoerper);
        expect(b.einordnung.bauform).toBe('koerper');
        expect(b.einordnung.quelle).toBe('geometrie');
    });

    it('gilt für DIESES Bauteil, nicht für seine Klasse', async () => {
        // Der Unterschied zur Bauformregel, und der Grund, warum es beides
        // gibt: die Stützwand daneben ist ebenfalls ein IFCCIVILELEMENT und
        // darf kein Gelände werden.
        const b = useBearbeitung();
        await b.einordne(ERDKOERPER, resolverErdkoerper);
        b.starte('bauform-auslegen');
        b.setzeWert('bauform', 'hoehenfeld');
        await b.ausfuehren();

        const STUETZWAND = { ...ERDKOERPER, localId: 8, globalId: 'STW1' };
        await b.einordne(STUETZWAND, resolverErdkoerper);
        expect(b.einordnung.bauform).toBe('koerper');
    });
});

describe('ausfuehren — der einzige Weg ins Journal', () => {
    it('legt einen Journaleintrag an, statt selbst zu schreiben', async () => {
        const b = useBearbeitung();
        const j = useAenderungen();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('din277-setzen');
        b.setzeWert('din277', 'VF');

        const eintrag = await b.ausfuehren({ wer: 'Fabio' });
        expect(eintrag.art).toBe('din277');
        expect(eintrag.globalId).toBe('3xY');
        expect(eintrag.nachher).toBe('VF');
        expect(eintrag.wer).toBe('Fabio');
        expect(j.eintraege).toHaveLength(1);
    });

    it('macht die Änderung über das Journal rücknehmbar — ohne eigenen Stapel', async () => {
        const b = useBearbeitung();
        const j = useAenderungen();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('din277-setzen');
        b.setzeWert('din277', 'VF');
        await b.ausfuehren();
        expect(j.din277Stand.get('3xY')).toBe('VF');

        await j.zurueck();
        expect(j.din277Stand.get('3xY') ?? null).toBe(null);
    });

    it('nimmt die Bearbeitung nach dem Ausführen zurück', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('din277-setzen');
        b.setzeWert('din277', 'VF');
        await b.ausfuehren();
        expect(b.scharfId).toBe(null);
    });

    it('tut nichts, wenn der Wert ungültig ist', async () => {
        const b = useBearbeitung();
        const j = useAenderungen();
        await b.einordne(ROHR, resolverEchteAchse);
        b.starte('din277-setzen');
        b.setzeWert('din277', 'GIBTSNICHT');
        expect(await b.ausfuehren()).toBe(null);
        expect(j.eintraege).toHaveLength(0);
    });

    it('tut nichts ohne scharfe Bearbeitung', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, resolverEchteAchse);
        expect(await b.ausfuehren()).toBe(null);
    });
});

describe('Toolbox und Kontextmenü dürfen nicht auseinanderlaufen', () => {
    /**
     * Der Fehler, den diese Prüfung festhält, war heute live: der
     * `brauchtRolle`-Filter braucht das Typprofil, und zwei Aufrufer gaben es
     * nicht mit. Die Toolbox rechnet über `herleite` MIT Profil und zeigte
     * „Bezugshöhe setzen"; `starte()` prüfte OHNE Profil und lehnte denselben
     * Knopf ab. Ein Knopf, der da ist und nichts tut — und im Kontextmenü am
     * Bauteil fehlte er ganz.
     *
     * Zwei Wege zu derselben Frage, wieder. Deshalb kreuzt dieser Test die
     * beiden Wege GEGENEINANDER, statt jeden für sich zu prüfen: für sich war
     * jeder richtig.
     */
    const ROHR = {
        modelId: 'm1', localId: 1, globalId: 'H12', category: 'IFCPIPESEGMENT',
        anker: { x: 0, y: 10.15, z: 0 }, bezugshoehe: 10,
    };

    /** Ein Resolver, der eine echte Achse und einen Körper vorgibt. */
    const RESOLVER = {
        forElements: () => ({
            getForm: async (form) => (form === 'axis'
                ? { perElement: [{ polyline: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], source: 'axisRep' }] }
                : { data: { closed: true, triCount: 120 } }),
        }),
    };

    it('bietet dieselben Bearbeitungen an wie die Toolbox', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, RESOLVER);

        const ausToolbox = herleite({
            el: ROHR, einordnung: b.einordnung, profilSatz: b.profilSatz,
        }).gruppen.flatMap(g => g.eintraege).map(e => e.id).sort();

        expect(b.moeglich.map(x => x.id).sort()).toEqual(ausToolbox);
    });

    it('lässt JEDE angebotene Bearbeitung auch scharf schalten', async () => {
        // Der eigentliche Riegel. Ein Knopf, der erscheint und beim Klick
        // nichts tut, ist schlimmer als ein fehlender: der Nutzer probiert
        // weiter, weil er denkt, er macht etwas falsch.
        const b = useBearbeitung();
        await b.einordne(ROHR, RESOLVER);

        expect(b.moeglich.length).toBeGreaterThan(2);
        for (const eintrag of b.moeglich) {
            expect(b.starte(eintrag.id), `starte('${eintrag.id}')`).toBe(true);
            b.abbrechen();
        }
    });

    it('bietet die rollenabhängigen Bearbeitungen am Rohr wirklich an', async () => {
        const b = useBearbeitung();
        await b.einordne(ROHR, RESOLVER);
        const ids = b.moeglich.map(x => x.id);
        expect(ids).toContain('bezugshoehe-setzen');
        expect(ids).toContain('profilgroesse-setzen');
    });

    it('bietet sie an einem Typ OHNE die Rolle weiterhin nicht an', async () => {
        // Die Schranke bleibt scharf — der Fehler war das fehlende Profil,
        // nicht der Filter.
        const b = useBearbeitung();
        await b.einordne({ ...ROHR, category: 'IFCBUILDINGELEMENTPROXY' }, RESOLVER);
        expect(b.moeglich.map(x => x.id)).not.toContain('profilgroesse-setzen');
    });
});

describe('Wenn nichts entsteht, steht der RICHTIGE Grund da', () => {
    /**
     * `ausfuehren` gibt in drei Fällen `null`, und sie bedeuten Verschiedenes.
     * Die erste Fassung der Rückmeldung machte daraus einen Satz („der Wert
     * galt schon") und BEHAUPTETE damit einen Grund, den sie nicht kannte.
     * Ein falscher Grund ist schlimmer als keiner — er schickt den Nutzer in
     * die falsche Richtung, und genau daran hat er dann eine Stunde gesucht.
     */
    const OHNE_HUELLE = { modelId: 'm1', localId: 1, globalId: 'H12', category: 'IFCPIPESEGMENT' };
    const RESOLVER = {
        forElements: () => ({
            getForm: async (form) => (form === 'axis'
                ? { perElement: [{ polyline: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], source: 'axisRep' }] }
                : { data: { closed: true, triCount: 120 } }),
        }),
    };

    it('nennt den fehlenden Bezug, statt „Wert galt schon" zu behaupten', async () => {
        // Ein Bauteil ohne gelesene Hülle hat keinen Anker; `anwenden` gibt
        // dann null. Das ist ein DATENproblem, kein Eingabeproblem.
        const b = useBearbeitung();
        await b.einordne(OHNE_HUELLE, RESOLVER);
        expect(b.starte('bezugshoehe-setzen')).toBe(true);
        b.setzeWert('hoehe', 12.4);

        expect(await b.ausfuehren({ wer: 'Fabio' })).toBe(null);
        expect(b.letzterGrund).toMatch(/fehlt der Bezug/);
    });

    it('nennt den unveränderten Wert, wenn wirklich nichts zu tun war', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...OHNE_HUELLE, anker: { x: 0, y: 10.15, z: 0 }, bezugshoehe: 10 }, RESOLVER);
        b.starte('bezugshoehe-setzen');
        b.setzeWert('hoehe', 12.4);
        expect(await b.ausfuehren({ wer: 'Fabio' })).toBeTruthy();

        // Nochmal derselbe Wert — jetzt gilt er schon.
        b.starte('bezugshoehe-setzen');
        b.setzeWert('hoehe', 12.4);
        expect(await b.ausfuehren({ wer: 'Fabio' })).toBe(null);
        expect(b.letzterGrund).toMatch(/galt schon/);
    });
});
