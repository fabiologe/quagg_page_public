/**
 * PedantApi — die einzige HTTP-Schicht des Features (Muster documentApi).
 * Läuft über die zentrale api-Instanz (Bearer-Token, 401→Login) gegen
 * /api/pedant/... und gibt immer response.data zurück.
 */
import api from '@/services/api';

export const PedantApi = {
  async status() {
    return (await api.get('/pedant/status')).data;
  },

  async kette() {
    return (await api.get('/pedant/kette')).data;
  },

  async konten() {
    return (await api.get('/pedant/konten')).data;
  },

  async buchungen(limit = 50) {
    return (await api.get('/pedant/buchungen', { params: { limit } })).data;
  },

  /** buchung: { buchungsdatum, belegdatum, sollkonto, habenkonto,
   *             betrag_cent, buchungstext, steuerschluessel?, belegreferenz? } */
  async buchungAnlegen(buchung) {
    return (await api.post('/pedant/buchungen', buchung)).data;
  },

  async storno(lfdNr, grund) {
    return (await api.post(`/pedant/buchungen/${lfdNr}/storno`, { grund })).data;
  },

  // ── Belege (Phase 2) ──────────────────────────────────────────────────────

  async belege(status = null, limit = 100) {
    const params = status ? { status, limit } : { limit };
    return (await api.get('/pedant/belege', { params })).data;
  },

  async beleg(id) {
    return (await api.get(`/pedant/belege/${id}`)).data;
  },

  async belegHochladen(file) {
    const formData = new FormData();
    formData.append('datei', file);
    // Content-Type setzt Axios selbst (multipart-Boundary).
    return (await api.post('/pedant/belege', formData)).data;
  },

  /** Original als Blob — Bearer-Token kommt vom Interceptor. */
  async belegDatei(id) {
    return (await api.get(`/pedant/belege/${id}/datei`, { responseType: 'blob' })).data;
  },

  async belegSpeichern(id, felder) {
    return (await api.put(`/pedant/belege/${id}`, felder)).data;
  },

  async belegFreigeben(id, eingabe) {
    return (await api.post(`/pedant/belege/${id}/freigeben`, eingabe)).data;
  },

  async belegVerwerfen(id, grund) {
    return (await api.post(`/pedant/belege/${id}/verwerfen`, { grund })).data;
  },

  // ── Stammdaten + Rechnungen (Phase 3) ─────────────────────────────────────

  async firmendaten() {
    return (await api.get('/pedant/firmendaten')).data;
  },

  async firmendatenSpeichern(felder) {
    return (await api.put('/pedant/firmendaten', felder)).data;
  },

  async auftraggeber(alle = false) {
    return (await api.get('/pedant/auftraggeber', { params: alle ? { alle: true } : {} })).data;
  },

  async auftraggeberAnlegen(felder) {
    return (await api.post('/pedant/auftraggeber', felder)).data;
  },

  async auftraggeberSpeichern(id, felder) {
    return (await api.put(`/pedant/auftraggeber/${id}`, felder)).data;
  },

  async rechnungen(status = null, limit = 100) {
    const params = status ? { status, limit } : { limit };
    return (await api.get('/pedant/rechnungen', { params })).data;
  },

  async rechnung(id) {
    return (await api.get(`/pedant/rechnungen/${id}`)).data;
  },

  async rechnungAnlegen(felder) {
    return (await api.post('/pedant/rechnungen', felder)).data;
  },

  async rechnungKopf(id, felder) {
    return (await api.put(`/pedant/rechnungen/${id}`, felder)).data;
  },

  async rechnungPositionen(id, positionen) {
    return (await api.put(`/pedant/rechnungen/${id}/positionen`, positionen)).data;
  },

  async rechnungVorpruefung(id, mitValidator = false) {
    return (await api.post(`/pedant/rechnungen/${id}/vorpruefung`, null,
      { params: mitValidator ? { validator: true } : {} })).data;
  },

  async rechnungStellen(id) {
    return (await api.post(`/pedant/rechnungen/${id}/stellen`)).data;
  },

  async rechnungVerwerfen(id, grund) {
    return (await api.post(`/pedant/rechnungen/${id}/verwerfen`, { grund })).data;
  },

  async rechnungVersand(id, weg) {
    return (await api.post(`/pedant/rechnungen/${id}/versand`, { weg })).data;
  },

  async rechnungBezahlt(id, bezahlt, bezahltAm = null) {
    return (await api.post(`/pedant/rechnungen/${id}/bezahlt`,
      { bezahlt, bezahlt_am: bezahltAm })).data;
  },

  async rechnungXml(id) {
    return (await api.get(`/pedant/rechnungen/${id}/xml`, { responseType: 'blob' })).data;
  },

  async rechnungBericht(id) {
    return (await api.get(`/pedant/rechnungen/${id}/bericht`, { responseType: 'blob' })).data;
  },

  // ── Geld-Sichten (Phase 4) ────────────────────────────────────────────────

  async geldSichten() {
    return (await api.get('/pedant/geld/sichten')).data;
  },

  async geldMonatsreihe(zurueck = 6, vor = 6) {
    return (await api.get('/pedant/geld/monatsreihe', { params: { zurueck, vor } })).data;
  },

  async erwartet(erledigte = false) {
    return (await api.get('/pedant/geld/erwartet',
      { params: erledigte ? { erledigte: true } : {} })).data;
  },

  async erwartetAnlegen(felder) {
    return (await api.post('/pedant/geld/erwartet', felder)).data;
  },

  async erwartetSpeichern(id, felder) {
    return (await api.put(`/pedant/geld/erwartet/${id}`, felder)).data;
  },

  // ── Bank (Phase 5) ────────────────────────────────────────────────────────

  async bankImport(file) {
    const formData = new FormData();
    formData.append('datei', file);
    return (await api.post('/pedant/bank/import', formData)).data;
  },

  async bank(status = null, limit = 200) {
    const params = status ? { status, limit } : { limit };
    return (await api.get('/pedant/bank', { params })).data;
  },

  async bankVorschlaege(id) {
    return (await api.get(`/pedant/bank/${id}/vorschlaege`)).data;
  },

  async bankZuordnen(id, eingabe) {
    return (await api.post(`/pedant/bank/${id}/zuordnen`, eingabe)).data;
  },

  async bankIgnorieren(id, grund) {
    return (await api.post(`/pedant/bank/${id}/ignorieren`, { grund })).data;
  },

  async bankLoesen(id, grund) {
    return (await api.post(`/pedant/bank/${id}/loesen`, { grund })).data;
  },

  async bankAutoAbgleich() {
    return (await api.post('/pedant/bank/auto-abgleich')).data;
  },

  // ── DATEV-Export (Phase 6) ────────────────────────────────────────────────

  async exportPruefliste(von, bis) {
    return (await api.get('/pedant/export/pruefliste', { params: { von, bis } })).data;
  },

  async exportExtf(von, bis) {
    return (await api.get('/pedant/export/extf',
      { params: { von, bis }, responseType: 'blob' })).data;
  },

  async exportBelege(von, bis) {
    return (await api.get('/pedant/export/belege',
      { params: { von, bis }, responseType: 'blob' })).data;
  },
};

export default PedantApi;
