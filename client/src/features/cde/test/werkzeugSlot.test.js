// @vitest-environment jsdom
/**
 * DER EINE WERKZEUG-SLOT (Teil XI, U1).
 *
 * Fabios Befund: mehrere Stellen aktivieren Bearbeitung, kein einziger
 * Modus. Der Slot ist die Antwort: genau EIN aktives Werkzeug, Exklusivität
 * als Eigenschaft des Mechanismus statt als Vereinbarung zwischen zwölf
 * Settern. Hier steht der Vertrag — inklusive des Belegs, dass Messen und
 * Notiz sich jetzt WIRKLICH ausschliessen (vorher nur ein Kommentar) und
 * dass das Ziehen restlos verschwunden ist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useMessen } from '../composables/useMessen.js';
import { useAnnotationen } from '../composables/useAnnotationen.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe('Der Slot-Mechanismus', () => {
    it('das nächste Werkzeug räumt den Vorgänger über dessen Ausschalter', () => {
        const b = useBearbeitung();
        const ausA = vi.fn();
        b.belegeWerkzeug('a', ausA);
        expect(b.werkzeug).toBe('a');
        b.belegeWerkzeug('b');
        expect(ausA).toHaveBeenCalledTimes(1);
        expect(b.werkzeug).toBe('b');
    });

    it('nur der Besitzer gibt frei — ein Fremder mit falscher Kennung nicht', () => {
        const b = useBearbeitung();
        b.belegeWerkzeug('a');
        b.gebeWerkzeugFrei('x');
        expect(b.werkzeug).toBe('a');
        b.gebeWerkzeugFrei('a');
        expect(b.werkzeug).toBeNull();
    });

    it('erneutes Belegen desselben Werkzeugs ruft den Ausschalter NICHT', () => {
        const b = useBearbeitung();
        const aus = vi.fn();
        b.belegeWerkzeug('a', aus);
        b.belegeWerkzeug('a', aus);
        expect(aus).not.toHaveBeenCalled();
    });
});

describe('Die scharfe Bearbeitung hängt am Slot', () => {
    it('starte belegt, abbrechen gibt frei, Modus-Aus räumt beides', () => {
        const b = useBearbeitung();
        b.modusSetzen(true);
        expect(b.starte('kg-setzen')).toBe(true);
        expect(b.werkzeug).toBe('bearbeitung:kg-setzen');
        b.abbrechen();
        expect(b.werkzeug).toBeNull();

        b.starte('kg-setzen');
        b.modusSetzen(false);                     // ruft abbrechen
        expect(b.werkzeug).toBeNull();
    });

    it('ein 3D-Werkzeug im Slot verdrängt die scharfe Bearbeitung — und umgekehrt', () => {
        const b = useBearbeitung();
        b.modusSetzen(true);
        b.starte('kg-setzen');
        b.belegeWerkzeug('messen', () => {});
        expect(b.scharfId).toBeNull();            // abbrechen lief
        expect(b.werkzeug).toBe('messen');
    });
});

describe('Messen und Notiz schliessen sich WIRKLICH aus', () => {
    function baue() {
        const b = useBearbeitung();
        const slot = { belege: b.belegeWerkzeug, frei: b.gebeWerkzeugFrei };
        const engine = ref({
            enableMeasureMode: vi.fn(), disableMeasureMode: vi.fn(),
            enableAnnotationMode: vi.fn(), disableAnnotationMode: vi.fn(),
            addMeasurePoint: vi.fn(async () => ({ phase: 'no-hit' })),
            clearMeasurements: vi.fn(), updateMeasureHover: vi.fn(),
        });
        const selection = () => ({ setMode: vi.fn() });
        const aktiv = ref(false);
        const messen = useMessen({ engine, ifc: { annotations: [] }, selection, slot });
        const notizen = useAnnotationen({
            engine, ifc: { annotations: [] }, cde: {}, selection, messen,
            viewpoint: () => null, aktiv, slot,
        });
        return { b, messen, notizen, aktiv };
    }

    it('Notiz an schaltet Messen aus — über den Slot, nicht per Absprache', () => {
        const t = baue();
        t.messen.umschalten();
        expect(t.messen.aktiv.value).toBe(true);
        t.notizen.umschalten();
        expect(t.messen.aktiv.value).toBe(false);  // vorher: beide konnten an sein
        expect(t.aktiv.value).toBe(true);
        expect(t.b.werkzeug).toBe('notiz');
    });

    it('und zurück: Messen an räumt die Notiz', () => {
        const t = baue();
        t.notizen.umschalten();
        t.messen.umschalten();
        expect(t.aktiv.value).toBe(false);
        expect(t.b.werkzeug).toBe('messen');
    });
});

describe('Das Ziehen ist restlos verschwunden', () => {
    it('keine Datei, kein Import, kein Toolbar-Eintrag', () => {
        expect(existsSync(join(WURZEL, 'composables/useZiehen.js'))).toBe(false);
        expect(existsSync(join(WURZEL, 'services/Freiheitsgrade.js'))).toBe(false);
        const treffer = [];
        const suche = (verz) => {
            for (const name of readdirSync(verz)) {
                const pfad = join(verz, name);
                if (statSync(pfad).isDirectory()) { if (name !== 'test') suche(pfad); continue; }
                if (!/\.(js|vue)$/.test(name)) continue;
                const text = readFileSync(pfad, 'utf8');
                if (/useZiehen|Freiheitsgrade\.js|freiheitsgradeFuer|darfZiehen/.test(text)) {
                    treffer.push(pfad.replace(WURZEL, ''));
                }
            }
        };
        suche(WURZEL);
        expect(treffer).toEqual([]);
    });
});

describe('Die Kreuz-Löscherei ist dem Slot gewichen (Textwächter)', () => {
    it('die Canvas-Setter sind reine Setter', () => {
        const canvas = readFileSync(join(WURZEL, 'components/IfcPlanCanvas.vue'), 'utf8');
        const expose = canvas.slice(canvas.indexOf('defineExpose({'));
        // Kein Setter schaltet mehr einen NACHBARN aus.
        expect(expose).not.toMatch(/setzeModus:[^,]*messenUmschalten/s);
        expect(expose).not.toMatch(/setzeStift:[\s\S]{0,200}setzModus\.value = null/);
    });

    it('jeder CdeView-Setter geht über belegeWerkzeug/gebeWerkzeugFrei', () => {
        const view = readFileSync(join(WURZEL, 'views/CdeView.vue'), 'utf8');
        for (const kennung of ['plan:stift', 'plan:setzen', 'plan:zeichnen', 'plan:bemassung']) {
            expect(view).toContain(`belegeWerkzeug('${kennung}'`);
            expect(view).toContain(`gebeWerkzeugFrei('${kennung}'`);
        }
        // Esc im Canvas zieht Spiegel UND Slot nach.
        expect(view).toContain('planWerkzeugBeendet');
    });
});
