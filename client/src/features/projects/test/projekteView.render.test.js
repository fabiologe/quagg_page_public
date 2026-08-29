// @vitest-environment jsdom
// Prüfstand: Portfolio und Akte rendern mit Daten und im Leerzustand.
// Fängt Template-Fehler (fehlende Imports, kaputte v-for-Nachbarn), die
// compileTemplate allein nicht meldet. Teleport-Inhalte gegen document.body prüfen.
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/useAuthStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(), defaults: { baseURL: '/api' } },
}));
vi.mock('@/features/documents/components/DocReader.vue', () => ({
  default: { name: 'DocReader', template: '<div class="docreader-stub" />' },
}));
vi.mock('@/components/layout/InternLayout.vue', () => ({
  default: { name: 'InternLayout', template: '<div class="layout-stub"><slot /></div>' },
}));

const AKTE = {
  id: 1338, name: 'Kanal Musterhausen', kurzname: 'Kanal MH', ordnername: '1338_Kanal_MH',
  phase: '00_Angebote', ordner_vorhanden: true, honorarmodell: 'hoai', leistungsbild: null,
  stundensatz_cent: null, budget_stunden: null, auftraggeber_id: null, notiz: '',
  naechster_termin: '2027-03-01',
  beteiligte: [{ id: 1, rolle: 'bauherr', name: 'Stadt Musterhausen', kontakt: 'bau@muster.de' }],
  meilensteine: [{ id: 5, art: 'bindefrist', bezeichnung: 'Angebot gilt bis', faellig_am: '2027-03-01', erledigt_am: null }],
  abschnitte: [
    { id: 11, nr: 1, lph: 1, bezeichnung: 'LPH 1 Grundlagenermittlung', art: 'grund', honorar_cent: 200000, beauftragt: true, fortschritt_prozent: 100, status: 'fertig' },
    { id: 12, nr: 2, lph: 2, bezeichnung: 'LPH 2 Vorplanung', art: 'grund', honorar_cent: 2000000, beauftragt: true, fortschritt_prozent: 50, status: 'laufend' },
    { id: 13, nr: 3, lph: 3, bezeichnung: 'LPH 3 Entwurfsplanung', art: 'grund', honorar_cent: 2500000, beauftragt: false, fortschritt_prozent: 0, status: 'offen' },
  ],
  fortschritt: { honorar_gesamt_cent: 4700000, honorar_beauftragt_cent: 2200000, leistung_cent: 1200000, prozent: 54.5 },
  honorar_historie: [{ id: 1, abschnitt_id: 12, abschnitt: 'LPH 2 Vorplanung', alt_cent: 0, neu_cent: 2000000, grund: 'Vorlage § 43 (20 %)', akteur: 'fabio', am: '2026-08-25T10:00:00+00:00' }],
  vorschlaege: [{ id: 7, art: 'termin', nutzlast: { art: 'bindefrist', bezeichnung: 'Angebot gilt bis', faellig_am: '2027-03-01' },
    begruendung: 'laut Angebotsschreiben', von: 'mcp', status: 'offen', angelegt_am: '2026-08-25T10:00:00+00:00' }],
  vorschlaege_offen: 1,
  auftraggeber_id: 3,
  aufgaben: [{ id: 21, titel: 'Bauamt anrufen', status: 'offen', faellig_am: '2026-01-01', abschnitt_id: 12, quelle: 'ki' }],
  zeit: { minuten_gesamt: 150, minuten_abrechenbar: 120, minuten_unabgerechnet: 120, je_abschnitt: [{ abschnitt_id: 12, minuten: 150 }], je_monat: [{ monat: '2027-02', minuten: 150 }] },
  geld: { gestellt_netto_cent: 500000, bezahlt_netto_cent: 200000, entwurf_netto_cent: 0, fremdkosten_brutto_cent: 119000, unabgerechnet_cent: 700000, offen_netto_cent: 300000 },
};
const GELD = {
  summen: AKTE.geld,
  rechnungen: [{ id: 9, rechnungsnummer: 'RE-2027-0001', status: 'gestellt', rechnungsdatum: '2027-02-01', netto_cent: 500000, brutto_cent: 595000 }],
  belege: [{ id: 4, belegnummer: 'B-2027-0002', status: 'gebucht', lieferant: 'Vermessung GmbH', belegdatum: '2027-01-20', brutto_cent: 119000 }],
  planzeile: { id: 1, bezeichnung: '#P1338 Kanal', betrag_cent: 2618000, bereits_gestellt_cent: 595000, erwartet_am: '2027-06-01', status: 'teilweise_gestellt' },
};

vi.mock('../services/ProjekteApi', () => ({
  default: {
    liste: vi.fn(async () => [AKTE, { ...AKTE, id: 1339, name: 'Ohne Ordner', phase: null, ordner_vorhanden: false }]),
    kennzahlen: vi.fn(async () => ({ gesamt: 2, je_phase: { '00_Angebote': 1 }, ohne_ordner: 1,
      ordner_ohne_akte: 1, faellig: 1, faellig_horizont_tage: 14 })),
    abgleich: vi.fn(async () => ({
      ordner_ohne_akte: [{ id: 8000, ordnername: '8000_Bestand', phase: '01_Laufend' }],
      akte_ohne_ordner: [{ id: 1339, name: 'Ohne Ordner', ordnername: '1339_x' }],
    })),
    lesen: vi.fn(async () => AKTE),
    leistungsbilder: vi.fn(async () => ([{ paragraf: '43', jahrgang: 2021, titel: 'Ingenieurbauwerke',
      phasen: [{ lph: 1, bezeichnung: 'Grundlagenermittlung', prozent: 2 }, { lph: 2, bezeichnung: 'Vorplanung', prozent: 98 }] }])),
    abschnittAnlegen: vi.fn(), abschnittAendern: vi.fn(), abschnittLoeschen: vi.fn(), vorlageAnwenden: vi.fn(),
    dossier: vi.fn(async () => '# Projektakte #P1338 — Kanal Musterhausen\n\n## Stammdaten'),
    geld: vi.fn(async () => GELD), abschlagVorschau: vi.fn(async () => ({ nummer: 2, summe_netto_cent: 700000,
      positionen: [{ abschnitt_id: 12, bezeichnung: 'LPH 2 Vorplanung — Leistungsstand 50 %', einzelpreis_cent: 700000 }] })),
    abschlagAnlegen: vi.fn(async () => ({ rechnung_id: 10, status: 'entwurf', netto_cent: 700000, positionen: 1 })),
    belegeFrei: vi.fn(async () => []), belegZuordnen: vi.fn(), belegLoesen: vi.fn(),
    schlussrechnungVorschau: vi.fn(async () => ({ positionen: [{ abschnitt_id: 12, bezeichnung: 'LPH 2', einzelpreis_cent: 2000000 }],
      vorrechnungen: [{ id: 9, rechnungsnummer: 'RE-2027-0001', rechnungsdatum: '2027-02-01', brutto_cent: 595000 }],
      summe_netto_cent: 2000000, summe_brutto_cent: 2380000, vorab_cent: 595000, zahlbar_cent: 1785000 })),
    schlussrechnungAnlegen: vi.fn(),
    auftraggeber: vi.fn(async () => [{ id: 3, name: 'Stadt Musterhausen' }]),
    aufgabeAnlegen: vi.fn(async () => AKTE), aufgabeAendern: vi.fn(async () => AKTE), aufgabeLoeschen: vi.fn(async () => AKTE),
    zeiten: vi.fn(async () => ({ summen: AKTE.zeit, buchungen: [
      { id: 31, datum: '2027-02-01', taetigkeit: 'Vermessung auswerten', abschnitt_id: 12, dauer_min: 90, abrechenbar: true, rechnung_id: null },
      { id: 32, datum: '2027-02-02', taetigkeit: 'Telefonat', abschnitt_id: null, dauer_min: 60, abrechenbar: true, rechnung_id: 9 }] })),
    zeitBuchen: vi.fn(async () => AKTE), zeitAendern: vi.fn(async () => AKTE), zeitLoeschen: vi.fn(async () => AKTE),
    timer: vi.fn(async () => null), zeitraum: vi.fn(async () => ([{ projekt_id: 1338, projekt: 'Kanal Musterhausen', dauer_min: 90 }, { projekt_id: 1338, projekt: 'Kanal Musterhausen', dauer_min: 30 }])), timerStart: vi.fn(async () => ({ projekt_id: 1338, projekt: 'Kanal', taetigkeit: 'Entwurf', gestartet_am: new Date().toISOString(), laeuft_min: 0 })),
    timerStop: vi.fn(async () => ({ projekt_id: 1338, dauer_min: 1 })), timerVerwerfen: vi.fn(),
    stundenrechnungVorschau: vi.fn(async () => ({ stundensatz_cent: 9500, buchungen: [31], summe_netto_cent: 14250,
      positionen: [{ abschnitt_id: 12, bezeichnung: 'Stunden LPH 2 Vorplanung (90 min)', betrag_cent: 14250, minuten: 90 }] })),
    stundenrechnungAnlegen: vi.fn(),
    konfiguration: vi.fn(async () => ({ webdav_url: 'https://u1.your-storagebox.de/1_Projekte', office_online: true })),
    vorlagen: vi.fn(async () => ([{ id: 'anschreiben', titel: 'Anschreiben (Word)', typ: 'docx' }, { id: 'stundennachweis', titel: 'Stundennachweis (Excel)', typ: 'xlsx' }])),
    vorlageErzeugen: vi.fn(async () => ({ vorlage: 'anschreiben', pfad: '03_Schriftverkehr/Anschreiben_2026-08-26.docx' })),
    suche: vi.fn(async (id, q) => ({ index: { eintraege: 3 }, treffer: q === 'zz' ? [] : [
      { pfad: '01_Grundlagen/notiz.md', titel: 'notiz.md', snippet: 'Das [Bodengutachten] zeigt', rang: 1, typ: 'datei' }] })),
    indexAktualisieren: vi.fn(async () => ({ neu: 1, entfernt: 0, mails_neu: 0, eintraege: 3, dauer_s: 0.1 })),
    officeLink: vi.fn(async () => ({ schema: 'ms-word', uri: 'ms-word:ofe|u|https://u1.your-storagebox.de/1_Projekte/00_Angebote/1338_Kanal_MH/03_Schriftverkehr/Anschreiben_2026-08-26.docx' })),
    wopiSession: vi.fn(), dateiBlob: vi.fn(async () => new Blob(['Hallo'], { type: 'text/plain' })),
    cde: vi.fn(async () => ({ status: ['WIP', 'Shared', 'Published', 'Archived'], arten: ['modell', 'plan'], viewer_url: '/cde?projekt=1338',
      stammdaten: { nummer: '1338', name: 'Kanal Musterhausen', bauherr: 'Stadt Musterhausen', lph: '2' },
      dokumente: [{ sha256: 'abc', datei: 'Kanal_R01.ifc', basisname: 'Kanal', art: 'modell', revision: 1, status: 'WIP', groesse: 2400000, hochgeladen_am: '2026-08-25T10:00:00+00:00', von: 'fabio', vorhanden: true, pfad: 'CDE/Kanal_R01.ifc' }] })),
    cdeHochladen: vi.fn(), cdeStatus: vi.fn(async () => ({})),
    portalNutzer: vi.fn(async () => ([{ username: 'kunde' }])), freigaben: vi.fn(async () => ([])),
    freigeben: vi.fn(async () => ([{ username: 'kunde', von: 'fabio', angelegt_am: '2026-08-26T10:00:00+00:00' }])), freigabeEntziehen: vi.fn(),
    mails: vi.fn(async () => ([{ id: 5, subject: 'Bauzeitenplan RRB', sender: 'bauamt@muster.de', received_at: '2026-08-20T09:15:00', has_quarantined_files: false }])),
    vorschlaegeOffen: vi.fn(async () => []), vorschlagEntscheiden: vi.fn(async () => ({ ...AKTE, vorschlaege: [] })),
    anlegen: vi.fn(), aendern: vi.fn(), verschieben: vi.fn(), uebernehmen: vi.fn(),
    beteiligterAnlegen: vi.fn(), beteiligterAendern: vi.fn(), beteiligterLoeschen: vi.fn(),
    meilensteinAnlegen: vi.fn(), meilensteinAendern: vi.fn(), meilensteinLoeschen: vi.fn(),
  },
}));

import ProjekteApi from '../services/ProjekteApi';
import ProjectsView from '@/views/intern/ProjectsView.vue';
import ProjektAkteView from '../views/ProjektAkteView.vue';

function mitRouter(Komponente, pfad) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/intern/projects', component: { template: '<div />' } },
      { path: '/intern/projects/:id', component: { template: '<div />' } },
    ],
  });
  router.push(pfad);
  // Der Geld-Tab ist nur für ADMIN sichtbar — die Tests laufen als Admin
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth({ access_token: 'test', user: { username: 'admin', rolle: 'ADMIN' } });
  return router.isReady().then(() => mount(Komponente, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  }));
}

describe('Portfolio (ProjectsView)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('zeigt echte Kennzahlen, Kacheln und die Abgleich-Karte', async () => {
    const w = await mitRouter(ProjectsView, '/intern/projects');
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Kanal Musterhausen');
    expect(text).toContain('#P1338');
    expect(w.findAll('.prj-mini').length).toBe(2);
    expect(text).toContain('Ordner fehlt auf der StorageBox');
    expect(text).toContain('8000_Bestand');
    expect(text).toContain('Akte anlegen');
    expect(w.findAll('.prj-kennzahl').length).toBeGreaterThanOrEqual(6);
    expect(ProjekteApi.zeitraum).toHaveBeenCalled();
    expect(w.text()).toContain('2:00 h');                              // Wochen-Karte
    expect(text).not.toContain('12'); // die alten Dummy-Zahlen sind weg
    w.unmount();
  });

  it('öffnet den Anlage-Dialog per Teleport', async () => {
    const w = await mitRouter(ProjectsView, '/intern/projects');
    await flushPromises();
    await w.find('button.prj-knopf-primaer').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Neues Projekt');
    expect(document.body.textContent).toContain('Leistungsphasen (Ordner unter 02_Planung)');
    w.unmount();
  });

  it('filtert die Kacheln über die Kennzahl-Karten', async () => {
    const w = await mitRouter(ProjectsView, '/intern/projects');
    await flushPromises();
    expect(w.findAll('.prj-kachel')).toHaveLength(2);
    const angebote = w.findAll('.prj-kennzahl').find((k) => k.text().includes('Angebot'));
    await angebote.trigger('click');
    expect(w.findAll('.prj-kachel')).toHaveLength(1);
    w.unmount();
  });
});

describe('Akte (ProjektAkteView)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('rendert Kopf, Stammdaten, Beteiligte und Termine', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    expect(ProjekteApi.lesen).toHaveBeenCalledWith(1338);
    const text = w.text();
    expect(text).toContain('Kanal Musterhausen');
    expect(text).toContain('1_Projekte/00_Angebote/1338_Kanal_MH');
    expect(text).toContain('Stadt Musterhausen');
    expect(text).toContain('Angebot gilt bis');
    expect(text).toContain('01.03.2027');
    expect(w.find('input[type="text"]').element.value).toBe('Kanal Musterhausen');
    expect(w.text()).toContain('Kundenportal');
    const sel = w.findAll('select').find((s) => s.text().includes('Portal-Nutzer'));
    await sel.setValue('kunde');
    await sel.element.form.dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(ProjekteApi.freigeben).toHaveBeenCalledWith(1338, 'kunde');
    w.unmount();
  });

  it('zeigt den Leistungsstand als Balken und den Tab Leistung mit Abschnitten', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    expect(w.findAll('.prj-seg')).toHaveLength(3);
    expect(w.findAll('.prj-seg-nicht')).toHaveLength(1);
    expect(w.text()).toContain('54.5 %');
    const tab = w.findAll('.prj-tab').find((t) => t.text().includes('Leistung'));
    await tab.trigger('click');
    await flushPromises();
    expect(ProjekteApi.leistungsbilder).toHaveBeenCalled();
    expect(w.findAll('tr.prj-abschnitt')).toHaveLength(3);
    expect(w.text()).toContain('Vorlage § 43 (20 %)');
    expect(w.text()).toContain('22.000,00');
    await w.findAll('input[type="range"]')[1].setValue(75);
    expect(ProjekteApi.abschnittAendern).toHaveBeenCalledWith(1338, 12, { fortschritt_prozent: 75 });
    w.unmount();
  });

  it('wechselt auf den Dokumente-Tab und zeigt den Ordner-Browser', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    const tab = w.findAll('.prj-tab').find((t) => t.text().includes('Dokumente'));
    await tab.trigger('click');
    await flushPromises();
    expect(w.find('.file-explorer').exists()).toBe(true);
    w.unmount();
  });

  it('zeigt KI-Vorschläge mit Übernehmen/Verwerfen und den Dossier-Tab', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    expect(w.text()).toContain('Vorschläge der KI');
    expect(w.text()).toContain('Angebot gilt bis am 01.03.2027');
    const uebernehmen = w.findAll('button').find((b) => b.text().includes('Übernehmen'));
    await uebernehmen.trigger('click');
    await flushPromises();
    expect(ProjekteApi.vorschlagEntscheiden).toHaveBeenCalledWith(1338, 7, 'uebernehmen');
    const tab = w.findAll('.prj-tab').find((t) => t.text().includes('Dossier'));
    await tab.trigger('click');
    await flushPromises();
    expect(ProjekteApi.dossier).toHaveBeenCalledWith(1338);
    expect(w.find('pre.prj-dossier').text()).toContain('## Stammdaten');
    w.unmount();
  });

  it('zeigt den Geld-Tab mit Schichten, Abschlag-Vorschau und Pedant-Link', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    expect(w.findAll('.prj-marker')).toHaveLength(2);               // abgerechnet + bezahlt auf der Übersicht
    const tab = w.findAll('.prj-tab').find((t) => t.text().includes('Geld'));
    await tab.trigger('click');
    await flushPromises();
    expect(ProjekteApi.geld).toHaveBeenCalledWith(1338);
    const text = w.text();
    expect(text).toContain('7.000,00');                              // unabgerechnet
    expect(text).toContain('RE-2027-0001');
    expect(text).toContain('Vermessung GmbH');
    expect(text).toContain('2. Abschlag');
    expect(text).toContain('Abschlag RE-2027-0001');                 // Schlussrechnungs-Karte
    await w.find('input[type="date"]').setValue('2027-01-01');
    await w.find('form.prj-zeile').trigger('submit');
    await flushPromises();
    expect(ProjekteApi.abschlagAnlegen).toHaveBeenCalledWith(1338, { leistung_von: '2027-01-01', leistung_bis: null });
    expect(w.find('.prj-erfolg').text()).toContain('Im Pedanten prüfen und stellen');
    expect(w.find('.prj-erfolg a').attributes('href')).toContain('rechnung=10');
    w.unmount();
  });

  it('Dokumente: Suche, Vorlagen und Datei-Dialog mit Office-Link', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    const tab = w.findAll('.prj-tab').find((t) => t.text().includes('Dokumente'));
    await tab.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('P:\\00_Angebote\\1338_Kanal_MH');
    await w.find('.prj-suche input').setValue('Boden');
    await w.find('form.prj-suche').trigger('submit');
    await flushPromises();
    expect(ProjekteApi.suche).toHaveBeenCalledWith(1338, 'Boden');
    expect(w.find('mark').text()).toBe('Bodengutachten');
    const vorlage = w.findAll('button').find((b) => b.text().includes('Anschreiben (Word)'));
    await vorlage.trigger('click');
    await flushPromises();
    expect(ProjekteApi.vorlageErzeugen).toHaveBeenCalledWith(1338, 'anschreiben');
    expect(w.text()).toContain('03_Schriftverkehr/Anschreiben_2026-08-26.docx');
    const oeffnen = w.findAll('button').find((b) => b.text() === 'öffnen');
    await oeffnen.trigger('click');
    await flushPromises();
    expect(ProjekteApi.officeLink).toHaveBeenCalledWith(1338, '03_Schriftverkehr/Anschreiben_2026-08-26.docx');
    const link = document.body.querySelector('a[href^="ms-word:ofe|u|"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('In Word öffnen');
    const office = [...document.body.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').startsWith('/office?projekt=1338'));
    expect(office).toBeDefined();
    expect(office.getAttribute('target')).toBe('_blank');
    expect(decodeURIComponent(office.getAttribute('href'))).toContain('03_Schriftverkehr/Anschreiben_2026-08-26.docx');
    expect(w.find('a[href="/cde?projekt=1338"]').attributes('target')).toBe('_blank');
    w.unmount();
  });

  it('Modelle: CDE-Register mit Viewer-Deep-Link; Kommunikation: Mails', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    let tab = w.findAll('.prj-tab').find((t) => t.text().includes('Modelle'));
    await tab.trigger('click');
    await flushPromises();
    expect(ProjekteApi.cde).toHaveBeenCalledWith(1338);
    expect(w.text()).toContain('Kanal_R01.ifc');
    const link = w.findAll('a').find((a) => (a.attributes('href') || '').startsWith('/cde?projekt=1338&datei='));
    expect(link).toBeDefined();
    expect(decodeURIComponent(link.attributes('href'))).toContain('CDE/Kanal_R01.ifc');
    await w.find('.prj-tabelle select').setValue('Shared');
    expect(ProjekteApi.cdeStatus).toHaveBeenCalledWith(1338, 'abc', 'Shared');
    tab = w.findAll('.prj-tab').find((t) => t.text().includes('Kommunikation'));
    await tab.trigger('click');
    await flushPromises();
    expect(ProjekteApi.mails).toHaveBeenCalledWith(1338);
    expect(w.text()).toContain('Bauzeitenplan RRB');
    w.unmount();
  });

  it('zeigt Aufgaben und Zeiten mit Timer, Liste und Auswertung', async () => {
    const w = await mitRouter(ProjektAkteView, '/intern/projects/1338');
    await flushPromises();
    let tab = w.findAll('.prj-tab').find((t) => t.text().includes('Aufgaben'));
    await tab.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Bauamt anrufen');
    expect(w.find('.prj-termin-ueberfaellig').exists()).toBe(true);
    await w.find('.prj-liste input[type="checkbox"]').setValue(true);
    expect(ProjekteApi.aufgabeAendern).toHaveBeenCalledWith(1338, 21, { status: 'erledigt' });

    tab = w.findAll('.prj-tab').find((t) => t.text().includes('Zeiten'));
    await tab.trigger('click');
    await flushPromises();
    expect(ProjekteApi.zeiten).toHaveBeenCalledWith(1338, null, null);
    expect(ProjekteApi.timer).toHaveBeenCalled();
    const text = w.text();
    expect(text).toContain('Vermessung auswerten');
    expect(text).toContain('2:30 h');                                // Gesamt
    expect(text).toContain('Start');
    await w.find('form.prj-timer-start').trigger('submit');
    await flushPromises();
    expect(ProjekteApi.timerStart).toHaveBeenCalledWith(1338, { taetigkeit: '', abschnitt_id: null });
    expect(w.text()).toContain('Stoppen und buchen');
    w.unmount();
  });

  it('zeigt den Leerzustand, wenn die Akte fehlt', async () => {
    ProjekteApi.lesen.mockRejectedValueOnce({ response: { status: 404, data: { detail: 'unbekannt: 7' } } });
    const w = await mitRouter(ProjektAkteView, '/intern/projects/7');
    await flushPromises();
    expect(w.text()).toContain('Es gibt keine Akte #P7');
    w.unmount();
  });
});
