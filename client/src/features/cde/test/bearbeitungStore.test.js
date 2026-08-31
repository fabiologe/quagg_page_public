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
    it('belegt das Formular aus dem Stand des Bauteils vor', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...ROHR, stand: { kg: '322' } }, resolverEchteAchse);
        expect(b.starte('kg-setzen')).toBe(true);
        expect(b.werte).toEqual({ kg: '322' });
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
