// @vitest-environment jsdom
/**
 * Der Merkmals-Weg über die Sitzung (Lücke ⑧, 2026-09-02).
 *
 * `addPsetToElement` war der LETZTE Weg, ein Bauteil zu ändern, der am
 * Journal vorbeiging: keine Spur, kein Zurück, nach F5 weg — und er kam am
 * Bearbeiten-Modus vorbei. Jetzt ist ein Merkmalssatz ein `pset`-Eintrag
 * (Karte Satzname → Felder, ABSOLUTER Zielzustand), und die Anwendung läuft
 * über `IfcAutor.wendeAn` wie jede andere Festlegung.
 *
 * Die zwei Fallen, die hier festgenagelt werden:
 *  - Die Faltung bleibt „letzter gewinnt" — ein `falte`-Merge wie bei
 *    `parametrik` ließe die Rücknahme eines NEU eingeführten Satzes in der
 *    Vereinigung stehen.
 *  - Der Schreiber LEGT AN (die Bibliothek kennt kein Ersetzen) — ein
 *    Satzwechsel spielt den Stand erneut nach, und ohne Gedächtnis stünde
 *    derselbe Satz danach doppelt am Bauteil.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { IfcAutor, ANWENDBARE_ARTEN } from '../services/IfcAutor.js';
import { anwendungsweg, planFuerEintrag } from '../services/Nachspielen.js';
import { useAenderungen, AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

// ── Die Art nimmt am Anwendungsweg teil ─────────────────────────────────────

describe('pset ist eine anwendbare Art', () => {
    it('berührt das Modell, wird einzeln angewandt und baut einen Plan', () => {
        expect(AENDERUNGS_ARTEN.pset.beruehrtModell).toBe(true);
        expect(ANWENDBARE_ARTEN.has('pset')).toBe(true);
        const eintrag = { art: 'pset', globalId: 'G1', nachher: { Meins: [{ name: 'a', value: 1 }] } };
        expect(anwendungsweg(eintrag)).toBe('einzeln');
        const plan = planFuerEintrag(eintrag, 'm1');
        expect(plan.anzuwenden[0]).toMatchObject({ art: 'pset', globalId: 'G1' });
    });

    it('KEIN falte-Merge: die Rücknahme eines neuen Satzes verschwindet wirklich', async () => {
        setActivePinia(createPinia());
        localStorage.clear();
        const ae = useAenderungen();
        const e1 = await ae.eintragen({ art: 'pset', globalId: 'G1',
            nachher: { SatzA: [{ name: 'x', value: 1 }] } });
        expect(e1).toBeTruthy();
        // Zweiter Satz: der Eintrag trägt den VOLLEN Stand (absolut).
        const bisher = new Map(ae.wirksamerStand('pset')).get('G1');
        await ae.eintragen({ art: 'pset', globalId: 'G1',
            nachher: { ...bisher, SatzB: [{ name: 'y', value: 2 }] } });
        expect(Object.keys(new Map(ae.wirksamerStand('pset')).get('G1')).sort())
            .toEqual(['SatzA', 'SatzB']);
        // Rücknahme des zweiten Schritts (Unstage in der offenen Sitzung):
        // SatzB muss WEG sein, nicht in einer Vereinigung überleben.
        await ae.zurueck('pset');
        expect(new Map(ae.wirksamerStand('pset')).get('G1')).toEqual(
            { SatzA: [{ name: 'x', value: 1 }] });
    });
});

// ── Die Anwendung am (echten) Autor ─────────────────────────────────────────

function fakeFragments({ modelId = 'm1' } = {}) {
    let naechsteId = 100;
    const editor = {
        edit: vi.fn(async (_mid, reqs) => reqs.map(() => naechsteId++)),
        relate: vi.fn(async () => {}),
        applyChanges: vi.fn(async () => []),
    };
    return {
        manager: {
            list: new Map([[modelId, { modelId }]]),
            core: { editor, update: vi.fn(async () => {}) },
        },
        editor,
    };
}

describe('IfcAutor.schreibeMerkmalssatz + wendeAn', () => {
    let f, autor;
    beforeEach(() => {
        f = fakeFragments();
        autor = new IfcAutor({ getFragments: () => f.manager });
    });

    const PROPS = [{ name: 'Material', value: 'GG' }];

    it('legt Werte, Satz und beide Beziehungen an', async () => {
        const r = await autor.schreibeMerkmalssatz('m1', 7, 'QG_Pruefung', PROPS);
        expect(r.ok).toBe(true);
        // 1. Aufruf: die Einzelwerte · 2. Aufruf: der Satz
        expect(f.editor.edit).toHaveBeenCalledTimes(2);
        expect(f.editor.relate).toHaveBeenCalledWith('m1', 101, 'HasProperties', [100]);
        expect(f.editor.relate).toHaveBeenCalledWith('m1', 7, 'IsDefinedBy', [101]);
        expect(f.editor.applyChanges).toHaveBeenCalledWith('m1');
    });

    it('IDEMPOTENT im Lauf: derselbe Inhalt wird nicht doppelt angelegt', async () => {
        await autor.schreibeMerkmalssatz('m1', 7, 'QG_Pruefung', PROPS);
        const r2 = await autor.schreibeMerkmalssatz('m1', 7, 'QG_Pruefung', PROPS);
        expect(r2).toEqual({ ok: true, grund: 'galt_schon' });
        expect(f.editor.edit).toHaveBeenCalledTimes(2);   // unverändert
        // GEÄNDERTER Inhalt wird geschrieben.
        await autor.schreibeMerkmalssatz('m1', 7, 'QG_Pruefung', [{ name: 'Material', value: 'PE' }]);
        expect(f.editor.edit).toHaveBeenCalledTimes(4);
    });

    it('wendeAn schreibt jeden Satz der Karte — und meldet fehlende localIds', async () => {
        const plan = {
            modelId: 'm1',
            anzuwenden: [
                { art: 'pset', globalId: 'G1', modell: 'geliefert',
                  wert: { SatzA: PROPS, SatzB: [{ name: 'Baujahr', value: 1988 }] } },
                { art: 'pset', globalId: 'OHNE', modell: 'geliefert', wert: { SatzC: PROPS } },
            ],
        };
        const r = await autor.wendeAn(plan, { globalIdZuLocalId: new Map([['G1', 7]]) });
        // SatzA: Wert 100 + Satz 101 · SatzB: Wert 102 + Satz 103
        expect(f.editor.relate).toHaveBeenCalledWith('m1', 7, 'IsDefinedBy', [101]);
        expect(f.editor.relate).toHaveBeenCalledWith('m1', 7, 'IsDefinedBy', [103]);
        expect(r.misserfolge).toEqual([expect.objectContaining({ globalId: 'OHNE', grund: 'keine_localId' })]);
    });

    it('eine Rücknahme (wert null) kann das Modell nicht leeren — gemeldet, nie still', async () => {
        const plan = {
            modelId: 'm1',
            anzuwenden: [{ art: 'pset', globalId: 'G1', modell: 'geliefert', wert: null }],
        };
        const r = await autor.wendeAn(plan, { globalIdZuLocalId: new Map([['G1', 7]]) });
        expect(f.editor.edit).not.toHaveBeenCalled();
        expect(r.nichtAngewandt).toHaveLength(1);
        expect(r.misserfolge).toEqual([]);
    });
});

// ── Der Einstieg läuft über die Sitzung (Textwächter) ───────────────────────

describe('IfcSemanticWindow schreibt über den EINEN Weg', () => {
    const quelle = fs.readFileSync(`${WURZEL}components/IfcSemanticWindow.vue`, 'utf8');

    it('onAddPset: Modus-Sperre, Journaleintrag, wendeEintragAn — kein Direktschreiber', () => {
        const handler = quelle.slice(quelle.indexOf('async function onAddPset'));
        expect(handler).toContain('bearbeitung.modusAn');
        expect(handler).toContain('aenderungen.eintragen');
        expect(handler).toContain("art: 'pset'");
        expect(handler).toContain('api.wendeEintragAn');
        expect(quelle).not.toContain('addPsetToElement');
    });

    it('auch Engine und viewerApi führen keinen zweiten Merkmals-Schreibweg mehr', () => {
        const engine = fs.readFileSync(`${WURZEL}services/IfcEngine.js`, 'utf8');
        expect(engine).not.toContain('async addPsetToElement');
        const viewer = fs.readFileSync(`${WURZEL}components/IfcViewer.vue`, 'utf8');
        expect(viewer).not.toContain('addPsetToElement:');
    });
});
