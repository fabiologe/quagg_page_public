// @vitest-environment jsdom
// Pruefstand: die komplette Pedant-Oberflaeche rendert — beide Tabs, mit
// Daten und im Leerzustand. Faengt Template-Fehler (fehlende Imports,
// kaputte v-for-Nachbarn), die compileTemplate allein nicht meldet.
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('vue-pdf-embed', () => ({
  default: { name: 'VuePdfEmbed', template: '<div class="pdf-stub" />' },
}));

// chart.js braucht ein echtes Canvas — im jsdom stubben wir das Balkendiagramm.
vi.mock('vue-chartjs', () => ({
  Bar: { name: 'Bar', template: '<div class="chart-stub" />' },
}));

vi.mock('../services/PedantApi', () => ({
  default: {
    status: vi.fn(async () => ({
      umgebung: 'test', db_erreichbar: true,
      lfd_nr_letzte: 2, anzahl_buchungen: 2, anzahl_konten: 46,
    })),
    kette: vi.fn(async () => ({ ok: true, zeilen_geprueft: 2, bruch_bei_nr: null, grund: '' })),
    konten: vi.fn(async () => ([
      { kontonr: '1800', bezeichnung: 'Bank', kontoart: 'FINANZ' },
      { kontonr: '6815', bezeichnung: 'Buerobedarf', kontoart: 'AUFWAND' },
    ])),
    buchungen: vi.fn(async () => ([
      { lfd_nr: 2, buchungsdatum: '2027-01-16', belegdatum: '2027-01-16',
        sollkonto: '1800', habenkonto: '6815', betrag_cent: 1234,
        buchungstext: 'Storno zu Nr. 1: Test', belegreferenz: '', stornoreferenz: 1 },
      { lfd_nr: 1, buchungsdatum: '2027-01-15', belegdatum: '2027-01-15',
        sollkonto: '6815', habenkonto: '1800', betrag_cent: 1234,
        buchungstext: 'Buerobedarf', belegreferenz: '', stornoreferenz: null },
    ])),
    buchungAnlegen: vi.fn(), storno: vi.fn(),
    belege: vi.fn(async () => ([
      { id: 1, belegnummer: 'B-2027-0001', status: 'geprueft',
        lieferant: 'Baumarkt', belegdatum: '2027-01-15', erfasst_am: '2027-01-15',
        netto_cent: 30000, steuersatz: 19, brutto_cent: 35700,
        mime_typ: 'application/pdf', original_name: 'bon.pdf',
        buchung_lfd_nr: null, verworfen_grund: null },
    ])),
    belegDatei: vi.fn(async () => new Blob(['%PDF'], { type: 'application/pdf' })),
    belegHochladen: vi.fn(), belegSpeichern: vi.fn(),
    belegFreigeben: vi.fn(), belegVerwerfen: vi.fn(),
    firmendaten: vi.fn(async () => ({
      name: 'Quagg Engineering', strasse: 'Musterstrasse 12', plz: '56070',
      ort: 'Koblenz', ust_id: 'DE123456789', iban: 'DE89...', email: 'r@q.de',
      telefon: '1', ansprechpartner: 'F', fehlend: [],
    })),
    auftraggeber: vi.fn(async () => ([{
      id: 1, name: 'Stadtverwaltung Musterstadt', leitweg_id: '04011000-12345-03',
      portal: 'zre_rlp', strasse: 'Rathausplatz 1', plz: '55116', ort: 'Mainz',
      email: 'e@m.de', aktiv: true,
    }])),
    rechnungen: vi.fn(async () => ([
      { id: 5, rechnungsnummer: 'RE-2027-0001', status: 'gestellt',
        auftraggeber_id: 1, rechnungsdatum: '2027-02-01', faellig_am: '2027-03-03',
        leistung_von: '2027-01-01', leistung_bis: '2027-01-31',
        zahlungsziel_tage: 30, brutto_cent: 146311, netto_cent: 122950,
        steuer_cent: 23361, versand_weg: null, versand_am: null, bezahlt_am: null,
        auftrag_referenz: '', leitweg_id: '04011000-12345-03',
        positionen: [{ pos_nr: 1, bezeichnung: 'Planung', menge_tausendstel: 12500,
                       einheit: 'HUR', einzelpreis_cent: 9500, betrag_cent: 118750 }] },
    ])),
    rechnung: vi.fn(), rechnungAnlegen: vi.fn(), rechnungKopf: vi.fn(),
    rechnungPositionen: vi.fn(), rechnungVorpruefung: vi.fn(),
    rechnungStellen: vi.fn(), rechnungVerwerfen: vi.fn(),
    rechnungVersand: vi.fn(), rechnungBezahlt: vi.fn(),
    rechnungXml: vi.fn(), rechnungBericht: vi.fn(),
    geldSichten: vi.fn(async () => ({
      bezahlt: { summe_cent: 5000000, anzahl: 3 },
      offen: { summe_cent: 14631100, anzahl: 2, ueberfaellig_cent: 146311, ueberfaellig_anzahl: 1 },
      kommend: { summe_cent: 70000000, anzahl: 2 },
    })),
    geldMonatsreihe: vi.fn(async () => ([
      { monat: '2027-01', bezahlt_cent: 5000000, offen_cent: 0, kommend_cent: 0 },
      { monat: '2027-02', bezahlt_cent: 0, offen_cent: 14631100, kommend_cent: 0 },
    ])),
    erwartet: vi.fn(async () => ([
      { id: 1, bezeichnung: 'Vergabe Kanalplanung', erwartet_am: '2027-04-01',
        status: 'beauftragt', betrag_cent: 50000000, bereits_gestellt_cent: 0,
        offener_rest_cent: 50000000, notiz: '' },
    ])),
    erwartetAnlegen: vi.fn(), erwartetSpeichern: vi.fn(),
    bank: vi.fn(async () => ([
      { id: 1, status: 'unabgeglichen', betrag_cent: 146311,
        buchungsdatum: '2027-02-15', verwendungszweck: 'RE-2027-0001 Stadtverwaltung',
        gegen_name: 'Stadtkasse Musterstadt', gegen_iban: 'DE12',
        rechnung_id: null, beleg_id: null, buchung_lfd_nr: null, zuordnung_grund: '' },
      { id: 2, status: 'unabgeglichen', betrag_cent: -95000,
        buchungsdatum: '2027-02-16', verwendungszweck: 'Miete Februar',
        gegen_name: 'Vermieter GmbH', gegen_iban: 'DE98',
        rechnung_id: null, beleg_id: null, buchung_lfd_nr: null, zuordnung_grund: '' },
    ])),
    bankVorschlaege: vi.fn(async () => ([
      { art: 'rechnung', rechnung_id: 5, rechnungsnummer: 'RE-2027-0001',
        brutto_cent: 146311, konfidenz: 'sicher' },
    ])),
    bankImport: vi.fn(), bankZuordnen: vi.fn(), bankIgnorieren: vi.fn(),
    bankLoesen: vi.fn(), bankAutoAbgleich: vi.fn(),
  },
}));

import PedantView from '../views/PedantView.vue';

function frischMontiert() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }],
  });
  return mount(PedantView, {
    global: { plugins: [createPinia(), router] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PedantView', () => {
  it('rendert den Journal-Tab mit Buchungen und Formular', async () => {
    const ansicht = frischMontiert();
    await flushPromises();
    expect(ansicht.text()).toContain('Buchhaltung');
    expect(ansicht.text()).toContain('Journal');
    expect(ansicht.text()).toContain('Buerobedarf');
    expect(ansicht.text()).toContain('Storno zu Nr. 1');
    expect(ansicht.text()).toContain('Neue Buchung');
    expect(ansicht.html()).toContain('1.234'); // GeldBetrag formatiert Cent
  });

  it('wechselt auf den Belege-Tab, zeigt die Liste und oeffnet die Pruefung', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const ansicht = frischMontiert();
    await flushPromises();
    const belegeTab = ansicht.findAll('.ped-tab')
      .find((knopf) => knopf.text().includes('Belege'));
    await belegeTab.trigger('click');
    await flushPromises();
    expect(ansicht.text()).toContain('Belegeingang');
    expect(ansicht.text()).toContain('B-2027-0001');
    expect(ansicht.text()).toContain('Baumarkt');
    // Zeile anklicken -> Pruefungsmaske mit Vorschlag und Freigabe-Karte
    await ansicht.find('.ped-belegzeile').trigger('click');
    await flushPromises();
    expect(ansicht.text()).toContain('Beleg B-2027-0001');
    expect(ansicht.text()).toContain('Anlageverzeichnis');   // GWG bei 300 € netto
    expect(ansicht.text()).toContain('Freigeben und buchen');
  });

  it('wechselt auf den Rechnungen-Tab: Liste, Stammdaten, Formular', async () => {
    const ansicht = frischMontiert();
    await flushPromises();
    const tab = ansicht.findAll('.ped-tab').find((knopf) => knopf.text().includes('Rechnungen'));
    await tab.trigger('click');
    await flushPromises();
    expect(ansicht.text()).toContain('Eigene Firmendaten');
    expect(ansicht.text()).toContain('Stadtverwaltung Musterstadt');
    expect(ansicht.text()).toContain('RE-2027-0001');
    // Zeile oeffnen -> Formular (gestellt: read-only + Aktionsleiste)
    await ansicht.find('.ped-zeile').trigger('click');
    await flushPromises();
    expect(ansicht.text()).toContain('Rechnung RE-2027-0001');
    expect(ansicht.text()).toContain('Gestellt — RE-2027-0001');
    expect(ansicht.text()).toContain('XRechnung (XML)');
    expect(ansicht.html()).toContain('1.187,50'); // Positionsbetrag aus Cent
  });

  it('wechselt auf den Geld-Tab: Kacheln, Chart, erwartetes Geld', async () => {
    const ansicht = frischMontiert();
    await flushPromises();
    const tab = ansicht.findAll('.ped-tab').find((knopf) => knopf.text() === 'Geld');
    await tab.trigger('click');
    await flushPromises();
    expect(ansicht.text()).toContain('Bezahlt');
    expect(ansicht.text()).toContain('Gestellt, offen');
    expect(ansicht.text()).toContain('Kommend, nicht gestellt');
    expect(ansicht.text()).toContain('davon überfällig: 1');
    expect(ansicht.find('.chart-stub').exists()).toBe(true);
    expect(ansicht.text()).toContain('Vergabe Kanalplanung');
    // Tabellen-Ansicht der Monatsreihe (Barrierefreiheit)
    const tabelleKnopf = ansicht.findAll('.ped-wahl')
      .find((knopf) => knopf.text().includes('Tabelle'));
    await tabelleKnopf.trigger('click');
    expect(ansicht.text()).toMatch(/Jan.*27/);
  });

  it('wechselt auf den Bank-Tab: Liste und Klaerdialog', async () => {
    const ansicht = frischMontiert();
    await flushPromises();
    const tab = ansicht.findAll('.ped-tab').find((knopf) => knopf.text() === 'Bank');
    await tab.trigger('click');
    await flushPromises();
    expect(ansicht.text()).toContain('Kontoabgleich');
    expect(ansicht.text()).toContain('Stadtkasse Musterstadt');
    expect(ansicht.text()).toContain('Miete Februar');
    // Bewegung oeffnen -> Klaerdialog (PedantModal teleportiert unter <body>,
    // deshalb gegen document.body pruefen)
    await ansicht.find('.ped-bank-zeile').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Vorschläge');
    expect(document.body.textContent).toContain('RE-2027-0001');
    expect(document.body.textContent).toContain('sicher');
  });

  it('wechselt auf den Status-Tab und zeigt Kette und Kennzahlen', async () => {
    const ansicht = frischMontiert();
    await flushPromises();
    const statusTab = ansicht.findAll('.ped-tab')
      .find((knopf) => knopf.text().includes('Status'));
    await statusTab.trigger('click');
    expect(ansicht.text()).toContain('Systemzustand');
    expect(ansicht.text()).toContain('Kette intakt');
    expect(ansicht.text()).toContain('Letzte Buchungen');
  });
});
