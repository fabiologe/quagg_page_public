// @vitest-environment jsdom
/**
 * Stufe 4 des Aushub-Fachmodells, Lücke L6 — AN WELCHEM MODELL hängt ein Commit?
 *
 * Bis hierher nannte jeder Journaleintrag `api.getLoadedModelSha()` — die sha
 * des ZUERST geladenen Modells. Live an 1337 gemessen: ein Erdbau-Commit trug
 * die sha des Kanalnetzes (ENQUIER), obwohl er das Testgelände formte. Jede
 * Revisionsfrage („hängt dieses Journal an R01?") bekäme darauf die falsche
 * Antwort.
 *
 * Die Kur hat drei Stellen, und jede misst hier dieselbe Größe — die sha der
 * Datei, deren Bauteil bearbeitet wurde:
 *   1. Erdbau-Schritte tragen die sha der Datei ihres UR-Geländes — auch wenn
 *      das Subjekt ein Rohr aus einer anderen Lieferung ist (Kanalgraben).
 *   2. `ausfuehren` nimmt, was die Bearbeitung sagt, sonst das Subjekt, und
 *      erst dann den Aufrufer.
 *   3. `commitSitzung` nennt das Modell seiner Schritte, nicht das des Dialogs.
 * Die sha selbst hängt der Viewer beim Einordnen an (`_mitModellSha`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const UR = {
    modelId: 'm-gelaende', localId: 7, category: 'IFCGEOGRAPHICELEMENT', globalId: 'DGM1', name: 'Urgelände',
    hoehenversatz: 300, quellmass: { pruefmass: { triCount: 800 }, cell: 0.5 },
};
const ROHR = {
    modelId: 'm-kanal', localId: 3, globalId: 'H1', name: 'H-001', hoehenversatz: 300,
    achse: { dn: 300, anfang: { x: 5, y: 297.5, z: 20 }, ende: { x: 35, y: 297.2, z: 20 } },
    quellmass: { pruefmass: { triCount: 48 } },
    gelaendeQuellen: [{ globalId: 'DGM1', name: 'Urgelände', herkunft: 'geliefert', pruefmass: { triCount: 800 }, cell: 0.5,
                        modelId: 'm-gelaende', modellSha: 'sha-gelaende' }],
};

describe('1 · Erdbau-Schritte hängen an der Datei ihres Ur-Geländes', () => {
    it('Kanalgraben: das Subjekt ist ein Rohr aus dem Kanalnetz — jeder Schritt nennt trotzdem das Gelände', () => {
        const s = nachId('kanalgraben-ableiten').anwenden({ ...ROHR, modellSha: 'sha-kanal' },
            { gelaende: 'DGM1', dn: 300, umfang: 'haltung', wandform: 'verbau', bettung: 0.1 });
        expect(s.length).toBeGreaterThan(2);
        expect(s.map(x => x.modellSha)).toEqual(s.map(() => 'sha-gelaende'));
    });

    it('Gelände formen: am Ur die Datei des Ur — und ohne bekannte sha bleibt es beim Aufrufer (kein Feld)', () => {
        const zug = [{ x: 0, z: 10 }, { x: 20, z: 10 }];
        const werte = { sohleAnfang: 8, sohleEnde: 6, sohlbreite: 2, boeschung: 1 };
        const mit = nachId('gerinne-einschneiden').anwenden({ ...UR, modellSha: 'sha-gelaende' }, werte, { zug });
        expect(new Set(mit.map(x => x.modellSha))).toEqual(new Set(['sha-gelaende']));
        const ohne = nachId('gerinne-einschneiden').anwenden(UR, werte, { zug });
        expect(ohne.some(x => 'modellSha' in x)).toBe(false);
    });
});

describe('2 + 3 · ausfuehren und commitSitzung', () => {
    const resolverEchteAchse = {
        forElements: () => ({
            async getForm(form) {
                if (form === 'axis') return { form, perElement: [{ polyline: [[0, 0, 0], [1, 0, 0]], source: 'axisRep', warnings: [] }] };
                return { form, data: null, perElement: [], warnings: [] };
            },
        }),
    };
    const ROHR_IM_RAUM = {
        modelId: 'm-kanal', localId: 42, category: 'IFCPIPESEGMENT', globalId: '3xY',
        anker: { x: 100, y: 15, z: 200 }, bezugshoehe: 14, oberkante: 16, hoehenversatz: 286,
    };

    async function bezugshoehe(el, aufrufer = 'sha-zuerst-geladen') {
        const b = useBearbeitung();
        await b.einordne({ ...el }, resolverEchteAchse);
        expect(b.starte('bezugshoehe-setzen')).toBe(true);
        b.setzeWert('hoehe', 305);
        return b.ausfuehren({ wer: 'pruefer', modellSha: aufrufer, basis: { x: 100, y: 15, z: 200 }, modell: 'geliefert' });
    }

    it('das Subjekt kennt seine Datei: der Eintrag nennt SIE, nicht das zuerst geladene Modell', async () => {
        const e = await bezugshoehe({ ...ROHR_IM_RAUM, modellSha: 'sha-kanal' });
        expect(e.modellSha).toBe('sha-kanal');
    });

    it('ohne Wissen des Subjekts bleibt es beim Aufrufer — nichts wird erfunden', async () => {
        const e = await bezugshoehe(ROHR_IM_RAUM);
        expect(e.modellSha).toBe('sha-zuerst-geladen');
    });

    it('der Commit nennt das Modell seiner Schritte, nicht das des Commit-Dialogs', async () => {
        await bezugshoehe({ ...ROHR_IM_RAUM, modellSha: 'sha-kanal' });
        const c = await useAenderungen().commitSitzung('Bezugshöhe', { wer: 'pruefer', modellSha: 'sha-zuerst-geladen' });
        expect(c.modellSha).toBe('sha-kanal');
    });

    it('Reihenfolge, als Wächter am Quelltext: Bearbeitung vor Subjekt vor Aufrufer', () => {
        // Unter jsdom ist `import.meta.url` keine Datei-URL — der Pfad kommt aus dem Arbeitsordner (client/).
        const text = readFileSync(resolve(process.cwd(), 'src/features/cde/stores/useBearbeitung.js'), 'utf8');
        // Seit Teil XXIV (O6) steht dazwischen, was der Aufrufer JE EINTRAG weiss
        // (`jeEintrag`, Längsschnitt am gemischten Knoten) — spezifischer als das
        // Hauptsubjekt, unspezifischer als die Bearbeitung selbst.
        expect(text).toMatch(/modellSha: beschreibung\.modellSha \?\? je\.modellSha \?\? gegenstand\?\.modellSha \?\? modellSha/);
    });
});
