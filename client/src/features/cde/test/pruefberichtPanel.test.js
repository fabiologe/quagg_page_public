// @vitest-environment jsdom
/**
 * Das Berichtspanel an einem ECHTEN Bericht (Fahrplan IFC-Konsistenz, Stufe 6).
 *
 * Fixture: backend/app/ifc/tests/daten/bericht_pruefe.json — geschrieben vom
 * Unterprozess des Prüftors (Modus pruefe) am Vergleichsmodell, von
 * backend/app/ifc/tests/test_bericht.py gegen einen frischen Lauf gehalten.
 * Muster: ifcKopf.test.js ↔ kopf_faelle.json. Der Bericht enthält jede Stufe,
 * jede Schwere und jedes Urteil (true, false, ungeprüft) — test_bericht.py
 * verlangt das, sonst wäre diese Probe billig.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PruefberichtPanel from '../components/PruefberichtPanel.vue';
import { BEFUND_FELDER, STUFEN, ampel, gruppiere, istOffen, zaehle } from '../services/Pruefbericht.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const BERICHT = JSON.parse(fs.readFileSync(
    path.resolve(hier, '../../../../../backend/app/ifc/tests/daten/bericht_pruefe.json'), 'utf8'));

const montiert = (props = {}) => mount(PruefberichtPanel, {
    props: { befunde: BERICHT.befunde, kopf: BERICHT, ...props },
    global: { stubs: { CdeIcon: { template: '<i />' } } },
});

describe('Der Client liest den Bericht wie das Prüftor', () => {
    it('jedes Feld eines Befunds ist bekannt — kommt eins dazu, fällt dieser Test', () => {
        const felder = new Set(BERICHT.befunde.flatMap(b => Object.keys(b)));
        expect([...felder].sort()).toEqual([...BEFUND_FELDER].sort());
    });

    it('sperrend zählt wie pruefe.offen — dieselbe Zahl wie `verstoesse`', () => {
        expect(BERICHT.befunde.filter(istOffen)).toHaveLength(BERICHT.verstoesse);
        expect(zaehle(BERICHT.befunde).sperrend).toBe(BERICHT.verstoesse);
    });

    it('die Gruppen folgen den Stufen des Prüftors, kein Befund fällt heraus', () => {
        const g = gruppiere(BERICHT.befunde);
        expect(g.map(x => x.stufe)).toEqual(STUFEN.map(s => s.stufe));
        expect(g.reduce((n, x) => n + x.befunde.length, 0)).toBe(BERICHT.befunde.length);
    });
});

describe('PruefberichtPanel', () => {
    it('eine Zeile je Befund, in Gruppen nach Stufe', () => {
        const w = montiert();
        expect(w.findAll('.pb-befund')).toHaveLength(BERICHT.befunde.length);
        expect(w.findAll('.pb-stufe').map(s => s.attributes('data-stufe'))).toEqual(STUFEN.map(s => s.stufe));
        w.unmount();
    });

    it('jede Zeile trägt die Ampel aus ampel() — alle vier kommen vor', () => {
        const w = montiert();
        const gezeigt = w.findAll('.pb-befund').map(z => z.classes().find(k => k.startsWith('pb--')));
        const soll = gruppiere(BERICHT.befunde).flatMap(g => g.befunde).map(b => `pb--${ampel(b)}`);
        expect(gezeigt).toEqual(soll);
        expect(new Set(gezeigt)).toEqual(new Set(['pb--ok', 'pb--fehler', 'pb--warnung', 'pb--hinweis']));
        w.unmount();
    });

    it('Sperrendes steht offen da; der Rest klappt auf Klick auf — mit Text und Beispielen', async () => {
        const w = montiert();
        expect(w.findAll('.pb-rumpf')).toHaveLength(BERICHT.befunde.filter(istOffen).length);
        const mitBeispiel = BERICHT.befunde.find(b => !istOffen(b) && b.beispiele.length);
        const zeile = w.findAll('.pb-befund').find(z => z.find('.pb-id').text() === mitBeispiel.id);
        await zeile.find('.pb-kopf').trigger('click');
        expect(zeile.find('.pb-sagt').text()).toBe(mitBeispiel.sagt.trim());
        expect(zeile.findAll('.pb-beispiele code').map(c => c.text())).toEqual(mitBeispiel.beispiele);
        w.unmount();
    });

    it('Herunterladen meldet sich beim Aufrufer; ohne Freigabe gibt es den Knopf nicht', async () => {
        expect(montiert().find('.pb-laden').exists()).toBe(false);
        const w = montiert({ herunterladbar: true });
        await w.find('.pb-laden').trigger('click');
        expect(w.emitted('herunterladen')).toHaveLength(1);
        w.unmount();
    });
});
