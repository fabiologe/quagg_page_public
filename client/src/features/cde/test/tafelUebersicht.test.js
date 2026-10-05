// @vitest-environment jsdom
/**
 * Die Tafel „Bauteil", übersichtlicher (Teil XXX, Fabio 2026-10-05: „Bauteil und Eigenschaftsfenster bisschen
 * übersichtlicher").
 *
 * Gemessen vorher (10001, Rohr „Zulaufhaltung DN 600"): 33 Werkzeuge über ≈ 1 200 px, jede Zeile mit ihren Feldnamen,
 * einer mit elf Zeilen Text; Gruppen nach Herkunft („Weil achse+profil"); Sohle/Länge erst darunter, Mengen nur am
 * Erdbau und ganz unten; im Eigenschaftsfenster `_localId`, `_guid` und die GlobalId doppelt.
 *
 * Jetzt: Kopf mit lesbarer Klasse und kleinem „Mehrere"-Schalter · Kennwerte (für jedes eigene Bauteil) · Werkzeuge
 * nach AUFGABE (Maße, Lage, …) aufklappbar, eine Zeile je Werkzeug, Felder im Tooltip, Suche · Merkmale ohne Interna.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import CdeToolbox from '../components/CdeToolbox.vue';
import IfcSidebar from '../components/IfcSidebar.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { kennwerteVon } from '../services/Mengenzeile.js';
import { erzeugtEintrag } from '../services/Bauteilrezepte.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';

const STUBS = { CdeIcon: { template: '<i />' }, IfcSidebar: { template: '<div class="sidebar-attrappe" />' } };
let pinia;
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); });
afterEach(() => { vi.restoreAllMocks(); });

function tafel(api = {}) {
  const Huelle = { setup() { provideViewerApi(api); return () => h(CdeToolbox); } };
  return mount(Huelle, { global: { plugins: [pinia], stubs: STUBS } });
}

/** Ein eigenes Rohr im Journal, gewählt wie über den Viewer. */
async function eigenesRohr() {
  const ae = useAenderungen();
  const e = erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'Zulauf',
                             parameter: { punkte: [[0, 100, 0], [21, 99.8, 0]], dn: 600 } });
  await ae.eintragen({ art: 'erzeugt', globalId: 'cde-R', nachher: e.nachher, modell: 'cde' });
  useIfcStore().modelList.push({ modelId: CDE_MODELL_ID, name: 'Eigenbau' });
  const b = useBearbeitung();
  await b.einordne({ modelId: CDE_MODELL_ID, localId: 7, category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT',
                     globalId: 'cde-R', name: 'Zulauf', hoehenversatz: 0 }, null);
  return b;
}

describe('kennwerteVon — die Mengen jedes eigenen Bauteils, lesbar', () => {
  it('eine Schicht: Volumen und Dicke mit Einheit, deutsch — was die Qto-Vorlage ihrer Klasse kennt', () => {
    const plan = { rezept: 'gelaendeschicht', rolle: 'schicht', kategorie: 'IFCCOURSE', parameter: {} };
    expect(kennwerteVon(plan, { volumen: 412.345, flaeche: 1650.5, dicke: 0.25 }))
      .toEqual([{ feld: 'volume', titel: 'Volumen', wert: '412 m³' }, { feld: 'thickness', titel: 'Dicke', wert: '0,25 m' }]);
  });

  it('ein gewöhnliches Bauteil (Rohr): die Mengen aus seinem Körper', () => {
    const r = { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', parameter: { punkte: [[0, 100, 0], [21, 99.8, 0]], dn: 600 } };
    expect(kennwerteVon(r)).toEqual([{ feld: 'length', titel: 'Länge', wert: '21,00 m' }]);
  });

  it('ein Raum in der Mulde: netto gleich brutto steht EINMAL', () => {
    const plan = { rezept: 'muldenraum', rolle: 'raum', kategorie: 'IFCSPACE', parameter: {} };
    const z = kennwerteVon(plan, { volumen: 992, wasserflaeche: 900, tiefe: 1 });
    expect(z.filter(x => /Volumen/.test(x.titel))).toHaveLength(1);
  });

  it('ein Erdbau-Teil: dazu die Gegenprobe; ohne Bauplan nichts', () => {
    const plan = { rezept: 'erdbau', rolle: 'aushub', kategorie: 'IFCEARTHWORKSCUT', parameter: {} };
    const z = kennwerteVon(plan, { aushubRaster: 120, gegenprobeAushub: 0.004 });
    expect(z.map(x => x.titel)).toEqual(['Aushub (gewachsen)', 'Gegenprobe Körper ↔ Raster']);
    expect(kennwerteVon(null)).toEqual([]);
  });
});

describe('die Tafel an einem eigenen Rohr', () => {
  it('Kopf: Name, lesbare Klasse, „Mehrere" klein im Kopf — und die Kennwerte VOR den Werkzeugen', async () => {
    await eigenesRohr();
    const w = tafel({ mehrereWaehlen: vi.fn(), mehrereAn: () => false });
    await flushPromises();
    expect(w.find('.tb-titel strong').text()).toBe('Zulauf');
    expect(w.find('.tb-klasse').text()).toBe('Rohr · IfcPipeSegment');
    expect(w.find('.tb-titel .tb-mehrere').exists()).toBe(true);
    expect(w.find('.tb-kennwerte').text()).toMatch(/Länge\s*21,00 m/);
    const html = w.html();
    expect(html.indexOf('tb-kennwerte')).toBeLessThan(html.indexOf('tb-aufgabe'));
    expect(html.indexOf('tb-aufgabe')).toBeLessThan(html.indexOf('tb-merkmale'));
    w.unmount();
  });

  it('Werkzeuge nach Aufgabe — Maße offen, die übrigen zu; jede Zeile nur der Titel, die Felder im Tooltip', async () => {
    await eigenesRohr();
    const w = tafel();
    await flushPromises();
    const gruppen = w.findAll('.tb-aufgabe');
    const titel = gruppen.map(g => g.find('summary').text());
    expect(titel[0]).toMatch(/^Maße \d+$/);
    expect(titel.some(t => /^Lage \d+$/.test(t))).toBe(true);
    expect(titel.some(t => /Weil|Immer/.test(t))).toBe(false);                 // keine Herkunft mehr als Überschrift
    // Offen: Maße und Allgemein (Eigenschaften, Umbenennen, Löschen); Lage und Gelände zu.
    const offen = gruppen.filter(g => g.attributes('open') !== undefined).map(g => g.find('summary').text().replace(/ \d+$/, ''));
    expect(offen).toEqual(['Maße', 'Allgemein']);
    expect(titel.some(t => /^Merkmale/.test(t))).toBe(false);              // „Merkmale" ist der Abschnitt darunter
    const allgemein = gruppen.find(g => /^Allgemein/.test(g.find('summary').text())).findAll('.tb-btn').map(b => b.text());
    expect(allgemein).toEqual(expect.arrayContaining(['Eigenschaften', 'Umbenennen', 'Löschen']));
    const knopf = w.findAll('.tb-aufgabe .tb-btn').find(b => b.text() === 'Drehen');
    expect(knopf).toBeTruthy();
    expect(knopf.find('em').exists()).toBe(false);                             // vorher: „Winkel" in der Zeile
    expect(knopf.attributes('title')).toMatch(/setzt: Winkel/);
    w.unmount();
  });

  it('die Suche findet über alle Aufgaben — auch nach dem Feldnamen', async () => {
    await eigenesRohr();
    const w = tafel();
    await flushPromises();
    const suche = w.find('.tb-werkzeugsuche');
    expect(suche.exists()).toBe(true);                                         // mehr als 10 Werkzeuge
    await suche.setValue('dreh');
    expect(w.findAll('.tb-aufgabe .tb-btn').map(b => b.text())).toEqual(['Drehen']);
    expect(w.findAll('.tb-aufgabe').every(g => g.attributes('open') !== undefined)).toBe(true);
    await suche.setValue('winkel');                                            // „Drehen" heisst nicht so — sein Feld schon
    expect(w.findAll('.tb-aufgabe .tb-btn').map(b => b.text())).toContain('Drehen');
    await suche.setValue('gibt es nicht');
    expect(w.findAll('.tb-aufgabe')).toHaveLength(0);
    expect(w.text()).toContain('Kein Werkzeug');
    w.unmount();
  });
});

describe('das Eigenschaftsfenster ohne Interna', () => {
  it('`_localId` und `_guid` stehen nicht da; die GlobalId einmal', () => {
    const element = { type: 'IFCPIPESEGMENT', name: 'Zulauf', globalId: 'cde-R', psets: [], quantities: [],
                      attrs: [{ name: '_localId', value: 67 }, { name: '_guid', value: 'cde-R' }, { name: 'ObjectType', value: 'Kanal' }] };
    const w = mount(IfcSidebar, { props: { element }, global: { plugins: [pinia], stubs: { PsetBrowser: true } } });
    const zeilen = w.findAll('.kv-label').map(x => x.text());
    expect(zeilen).not.toContain('_localId');
    expect(zeilen).not.toContain('_guid');
    expect(zeilen).toContain('ObjectType');
    expect(w.text().match(/cde-R/g)).toHaveLength(1);
    w.unmount();
  });
});
