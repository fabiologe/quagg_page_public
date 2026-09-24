// @vitest-environment jsdom
/**
 * Der Abschnitt „Gelände" der Tafel (Kur K4, Fabio 2026-09-20).
 *
 * „Was das Bearbeiten echt schwierig macht, ist, dass man immer das
 * Planungsgelände auswählt — eigentlich sollte das am besten gar nicht
 * auswählbar sein oder nur über Bauformen als Button (Geländeoperation)."
 *
 * Seit K3 fängt der Klick das Gelände nicht mehr. Damit es trotzdem formbar
 * bleibt, steht es hier als Knopf. Der Knopf WÄHLT die Fläche wirklich (ohne
 * Klick, ohne Kamerafahrt) und schaltet dann das Werkzeug scharf — ein still
 * zusammengebautes Subjekt am Store vorbei wäre der Fehler von „H" in neuer
 * Form: der Store sagte „gewählt", die Engine wüsste nichts davon.
 *
 * Geprüft wird an der GEMOUNTETEN Tafel mit dem echten Katalog; nur die
 * Viewer-Fassade ist eine Attrappe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import CdeToolbox from '../components/CdeToolbox.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { ausGruppe, vorbelegtesGelaende } from '../services/Bearbeitungen.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

const UR = { globalId: 'gUr', name: 'Urgelaende', herkunft: 'geliefert', modelId: 'm1', localId: 47 };
const ANZEIGE = { globalId: 'gAnz', name: 'Urgelaende (Anzeige)', herkunft: 'cde', modelId: 'cde-eigenbau', localId: 3 };

let pinia = null;
let fehler = [];
beforeEach(() => {
  localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); fehler = [];
  vi.spyOn(console, 'warn').mockImplementation((...a) => { fehler.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a) => { fehler.push(a.map(String).join(' ')); });
});
afterEach(() => { vi.restoreAllMocks(); });

function montiert({ gelaende = [UR] } = {}) {
  const api = {
    gelaendeListe: vi.fn(async () => gelaende),
    gelaendeWerkzeugStarten: vi.fn(async () => true),
    waehleOhneFahrt: vi.fn(async () => true),
    zeichnenStarten: vi.fn(() => true),
    werkzeugStarten: vi.fn(() => true),
  };
  const voll = new Proxy(api, { get(t, k) { if (typeof k === 'symbol') return undefined; if (!(k in t)) t[k] = vi.fn(() => undefined); return t[k]; } });
  const Huelle = { setup() { provideViewerApi(voll); return () => h(CdeToolbox); } };
  const w = mount(Huelle, { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' } } } });
  return { w, api };
}

describe('Ein Weg, ohne Klick zu wählen (K4)', () => {
    // Es gab zwei: `zoomToLocalId` (Baum, Befehlspalette) hob nur im Bild
    // hervor — die Tafel zeigte weiter das zuletzt Angeklickte, im Browser
    // sichtbar als „Geländekanten blau, Tafel sagt Schacht". `waehleBauteil`
    // (nur das Cockpit) machte es vollständig.
    const viewer = readFileSync(join(WURZEL, 'components/IfcViewer.vue'), 'utf8');

    it('Baum, Palette und Cockpit gehen alle durch waehleOrtVoll', () => {
        expect(viewer).toMatch(/async function waehleOrtVoll\(modelId, localId, \{ fahrt = true \} = \{\}\)/);
        // zoomToLocalId (Baum/Palette) — mit Fahrt, aber voller Auswahl
        expect(viewer).toMatch(/zoomToLocalId:\s+async[\s\S]{0,600}?waehleOrtVoll\(mid, localId, \{ fahrt: true \}\)/);
        // waehleBauteil (Cockpit, Prüfliste) — derselbe Weg
        expect(viewer).toMatch(/waehleBauteil: \(modelId, localId\) => waehleOrtVoll\(modelId, localId, \{ fahrt: true \}\)/);
        // die Tafel „Gelände" — ohne Fahrt
        expect(viewer).toMatch(/waehleOhneFahrt: \(modelId, localId\) => waehleOrtVoll\(modelId, localId, \{ fahrt: false \}\)/);
        // und keiner zoomt mehr an der Auswahl vorbei
        expect(viewer).not.toMatch(/zoomToLocalId:[\s\S]{0,300}?await engine\.value\?\.zoomToElement\(mid, localId\)/);
    });

    it('die Geländeknöpfe wählen das Gelände WIRKLICH — kein stilles Subjekt am Store vorbei', () => {
        const fn = viewer.slice(viewer.indexOf('async function gelaendeWerkzeugStarten'));
        expect(fn).toMatch(/bearbeitenEin\(\)/);            // Modus zuerst
        expect(fn).toMatch(/waehleOrtVoll\([\s\S]{0,80}?fahrt: false/);
        expect(fn).toMatch(/zeichnenStarten\(id\)/);        // dann das Werkzeug
    });
});

describe('Tafel „Gelände" ohne Auswahl', () => {
  it('zeigt je Geländewerkzeug des Katalogs einen Knopf — und nennt keine Operation selbst', async () => {
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    const { w, api } = montiert();
    await flushPromises();

    expect(api.gelaendeListe).toHaveBeenCalled();
    const erwartet = ausGruppe('gelaende').filter(b => b.operation);
    expect(erwartet.length).toBeGreaterThan(0);
    const text = w.text();
    expect(text).toContain('Gelände');
    for (const b of erwartet) expect(text, b.id).toContain(b.titel);
    expect(fehler.filter(f => /TypeError|ReferenceError|\[Vue warn\]/.test(f))).toEqual([]);
    w.unmount();
  });

  it('ein Klick startet das Werkzeug über den EINEN Weg — mit der vorbelegten Fläche', async () => {
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    const { w, api } = montiert({ gelaende: [ANZEIGE, UR] });
    await flushPromises();

    const erstes = ausGruppe('gelaende').filter(b => b.operation)[0];
    const knopf = w.findAll('button').find(b => b.text().includes(erstes.titel));
    expect(knopf, erstes.titel).toBeTruthy();
    await knopf.trigger('click');
    await flushPromises();

    // Vorbelegt ist das erste GELIEFERTE — dieselbe Regel wie im Katalog.
    expect(vorbelegtesGelaende({ gelaendeQuellen: [ANZEIGE, UR] })).toBe('gUr');
    expect(api.gelaendeWerkzeugStarten).toHaveBeenCalledWith(erstes.id, 'gUr');
    // Nicht über den Zeichenweg: der verlangt ein schon gewähltes Subjekt.
    expect(api.zeichnenStarten).not.toHaveBeenCalled();
    w.unmount();
  });

  it('bei mehreren Flächen steht eine Auswahl da; die Wahl geht an den Start', async () => {
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    const { w, api } = montiert({ gelaende: [ANZEIGE, UR] });
    await flushPromises();

    const wahl = w.find('.tb-gelaende-wahl select');
    expect(wahl.exists()).toBe(true);
    expect(wahl.findAll('option')).toHaveLength(2);
    await wahl.setValue('gAnz');

    const erstes = ausGruppe('gelaende').filter(b => b.operation)[0];
    await w.findAll('button').find(b => b.text().includes(erstes.titel)).trigger('click');
    await flushPromises();
    expect(api.gelaendeWerkzeugStarten).toHaveBeenCalledWith(erstes.id, 'gAnz');
    w.unmount();
  });

  it('EINE Fläche: keine Auswahlliste, aber ein Weg zu ihren Eigenschaften ohne Kamerasprung', async () => {
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    const { w, api } = montiert({ gelaende: [UR] });
    await flushPromises();
    expect(w.find('.tb-gelaende-wahl').exists()).toBe(false);

    await w.findAll('button').find(b => b.text().includes('Eigenschaften')).trigger('click');
    expect(api.waehleOhneFahrt).toHaveBeenCalledWith('m1', 47);
    w.unmount();
  });

  it('ohne geladenes Gelände sagt die Tafel das, statt leere Knöpfe zu zeigen', async () => {
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    const { w } = montiert({ gelaende: [] });
    await flushPromises();
    expect(w.text()).toContain('Kein Gelände geladen');
    const erstes = ausGruppe('gelaende').filter(b => b.operation)[0];
    expect(w.findAll('button').some(b => b.text().includes(erstes.titel))).toBe(false);
    w.unmount();
  });

  it('ein Sperrgrund grämt die Knöpfe aus und steht daneben — wie bei „Erzeugen"', async () => {
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    const erstes = ausGruppe('gelaende').filter(x => x.operation)[0];
    const knopfVon = (w) => w.findAll('button').find(x => x.text().includes(erstes.titel));

    // Ein Millimeter-Modell sperrt die Bearbeitung (IfcViewer.bearbeitenSperrgrund).
    const GRUND = 'Modell in Millimetern — Bearbeitung gesperrt.';
    const gesperrt = montiert();
    gesperrt.api.bearbeitenSperrgrund = vi.fn(() => GRUND);
    const w1 = mount({ setup() { provideViewerApi(gesperrt.api); return () => h(CdeToolbox); } },
                     { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' } } } });
    await flushPromises();
    expect(w1.text()).toContain(GRUND);
    expect(knopfVon(w1).attributes('disabled')).toBeDefined();
    gesperrt.w.unmount(); w1.unmount();

    // GEGENPROBE ohne Sperrgrund: derselbe Knopf ist offen.
    const frei = montiert();
    await flushPromises();
    expect(knopfVon(frei.w).attributes('disabled')).toBeUndefined();
    frei.w.unmount();
  });
});

describe('Die Serie und ihre Rückmeldung (K5)', () => {
  const viewer = readFileSync(join(WURZEL, 'components/IfcViewer.vue'), 'utf8');
  const leiste = readFileSync(join(WURZEL, 'components/CdeKontextleiste.vue'), 'utf8');
  const griffe = readFileSync(join(WURZEL, 'composables/useGriffe.js'), 'utf8');

  it('Formular, Zeichnen UND Griffe gehen durch EINEN Rückmeldeweg', () => {
    // Bis 2026-09-20 reichte der Griffweg nur `wendeEintragAn` durch: nach
    // einem Eckzug am Aushub stand die neue Kubatur (354 → 519 m³) nirgends.
    expect(viewer.match(/nachBauen: \([^)]*\) => nachBauenMitMeldung\(/g) ?? []).toHaveLength(2);
    expect(viewer).toMatch(/async function nachBauenMitMeldung\(eintraege, werkzeugId = null\)/);
    expect(viewer).toMatch(/_melderueck\(_mitMengen\(text, eintraege\)/);
    // Und der Griff reicht sein Werkzeug mit — sonst stünde der falsche Name dran.
    expect(griffe).toMatch(/await nachBauen\?\.\(eintraege, griff\.werkzeug\)/);
  });

  it('die Serie setzt der VIEWER fort — nach Neubau und Neu-Einordnung', () => {
    // Im Griff selbst verlor sie das Rennen gegen das `abbrechen()`, mit dem
    // `einordne` beginnt (im Browser gemessen: das Werkzeug war danach stumpf).
    expect(griffe).not.toMatch(/_wiederScharf/);
    const fn = viewer.slice(viewer.indexOf('function _serieFortsetzen'));
    expect(fn).toMatch(/GRIFF_WERKZEUGE\.includes\(werkzeugId\)/);   // nur Werkzeuge mit Griff
    expect(fn).toMatch(/if \(bearbeitung\.scharfId \|\| !bearbeitung\.modusAn\) return;/);
    expect(fn).toMatch(/if \(gid && subjekt\?\.globalId !== gid\) return;/);  // ersetztes Bauteil: nein
    // Sie läuft NACH dem Anwenden — und einen Tick später, weil `ablegen` sein
    // Werkzeug erst im `finally` abräumt (im Browser gemessen).
    const anwenden = viewer.indexOf('const r = await wendeEintragAn(eintraege);');
    expect(viewer.indexOf('nextTick(() => _serieFortsetzen(werkzeugId, gid));')).toBeGreaterThan(anwenden);
  });

  it('und die Rückmeldung steht in der Werkzeugkarte — sonst sähe sie in der Serie niemand', () => {
    expect(leiste).toMatch(/const serienmeldung = computed/);
    expect(leiste).toMatch(/rueckmeldung\.werkzeugId === bearbeitung\.scharfId/);
    expect(leiste).toMatch(/class="kl-serie"/);
    // Sie löscht sich nur bei einem ANDEREN Werkzeug.
    expect(viewer).toMatch(/if \(id && id !== rueckmeldung\.value\?\.werkzeugId\) rueckmeldung\.value = null;/);
  });
});
