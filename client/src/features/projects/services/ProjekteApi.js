/**
 * ProjekteApi — die einzige HTTP-Schicht des Cockpits (Muster PedantApi).
 * Läuft über die zentrale api-Instanz (Bearer-Token, 401→Login) gegen
 * /api/projekte/... und gibt immer response.data zurück.
 */
import api from '@/services/api';

export const ProjekteApi = {
  async liste() {
    return (await api.get('/projekte')).data;
  },
  async kennzahlen() {
    return (await api.get('/projekte/kennzahlen')).data;
  },
  async abgleich() {
    return (await api.get('/projekte/abgleich')).data;
  },
  async lesen(id) {
    return (await api.get(`/projekte/${id}`)).data;
  },
  /** felder: { name, honorarmodell, phase?, kurzname?, leistungsbild?, stundensatz_cent?,
   *            budget_stunden?, auftraggeber_id?, notiz?, lph? } */
  async anlegen(felder) {
    return (await api.post('/projekte', felder)).data;
  },
  async uebernehmen(id, felder) {
    return (await api.post('/projekte/uebernehmen', { id, ...felder })).data;
  },
  async aendern(id, felder) {
    return (await api.put(`/projekte/${id}`, felder)).data;
  },
  async verschieben(id, phase) {
    return (await api.post(`/projekte/${id}/verschieben`, { phase })).data;
  },
  async beteiligterAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/beteiligte`, felder)).data;
  },
  async beteiligterAendern(id, beteiligterId, felder) {
    return (await api.put(`/projekte/${id}/beteiligte/${beteiligterId}`, felder)).data;
  },
  async beteiligterLoeschen(id, beteiligterId) {
    return (await api.delete(`/projekte/${id}/beteiligte/${beteiligterId}`)).data;
  },
  async meilensteinAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/meilensteine`, felder)).data;
  },
  async meilensteinAendern(id, meilensteinId, felder) {
    return (await api.put(`/projekte/${id}/meilensteine/${meilensteinId}`, felder)).data;
  },
  async meilensteinLoeschen(id, meilensteinId) {
    return (await api.delete(`/projekte/${id}/meilensteine/${meilensteinId}`)).data;
  },

  // ── Leistung (Stufe 2) — jede Antwort ist die frische Akte ────────────────
  async leistungsbilder() {
    return (await api.get('/projekte/leistungsbilder')).data;
  },
  async abschnittAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/abschnitte`, felder)).data;
  },
  /** felder: { paragraf, honorar_cent, beauftragt: [lph…] } */
  async vorlageAnwenden(id, felder) {
    return (await api.post(`/projekte/${id}/abschnitte/vorlage`, felder)).data;
  },
  async abschnittAendern(id, abschnittId, felder) {
    return (await api.put(`/projekte/${id}/abschnitte/${abschnittId}`, felder)).data;
  },
  async abschnittLoeschen(id, abschnittId) {
    return (await api.delete(`/projekte/${id}/abschnitte/${abschnittId}`)).data;
  },

  // ── Dossier + Vorschläge (Stufe 7a) ───────────────────────────────────────
  async dossier(id) {
    return (await api.get(`/projekte/${id}/dossier`, { responseType: 'text' })).data;
  },
  async vorschlaegeOffen() {
    return (await api.get('/projekte/vorschlaege')).data;
  },
  /** entscheidung: 'uebernehmen' | 'verwerfen' — Antwort ist die frische Akte */
  async vorschlagEntscheiden(id, vorschlagId, entscheidung) {
    return (await api.post(`/projekte/${id}/vorschlaege/${vorschlagId}/entscheiden`, { entscheidung })).data;
  },

  // ── Geld (Stufe 4) — Pedant-Verzahnung ────────────────────────────────────
  async geld(id) {
    return (await api.get(`/projekte/${id}/geld`)).data;
  },
  async abschlagVorschau(id) {
    return (await api.get(`/projekte/${id}/abschlag`)).data;
  },
  /** felder: { leistung_von, leistung_bis? } → { rechnung_id, status, netto_cent, positionen } */
  async abschlagAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/abschlag`, felder)).data;
  },
  async schlussrechnungVorschau(id) {
    return (await api.get(`/projekte/${id}/schlussrechnung`)).data;
  },
  async schlussrechnungAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/schlussrechnung`, felder)).data;
  },
  async belegeFrei(id) {
    return (await api.get(`/projekte/${id}/belege/frei`)).data;
  },
  async belegZuordnen(id, belegId) {
    return (await api.post(`/projekte/${id}/belege`, { beleg_id: belegId })).data;
  },
  async belegLoesen(id, belegId) {
    return (await api.delete(`/projekte/${id}/belege/${belegId}`)).data;
  },
  /** Pedant-Auftraggeber (Stammdaten) für das Projekt-Formular */
  async auftraggeber() {
    return (await api.get('/pedant/auftraggeber')).data;
  },

  // ── Aufgaben + Zeit (Stufe 3) — Antworten sind die frische Akte ───────────
  // ── Kalender-Termine (Antwort ist die frische Akte; Routen liegen unter /kalender) ──
  async terminAnlegen(id, felder) {
    return (await api.post(`/kalender/projekte/${id}/termine`, felder)).data;
  },
  async terminAendern(id, terminId, felder) {
    return (await api.put(`/kalender/projekte/${id}/termine/${terminId}`, felder)).data;
  },
  async terminEntfernen(id, terminId) {
    return (await api.delete(`/kalender/projekte/${id}/termine/${terminId}`)).data;
  },
  async terminEinladen(id, terminId, optionen = {}) {
    return (await api.post(`/kalender/projekte/${id}/termine/${terminId}/einladen`, optionen)).data;
  },
  async aufgabeAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/aufgaben`, felder)).data;
  },
  async aufgabeAendern(id, aufgabeId, felder) {
    return (await api.put(`/projekte/${id}/aufgaben/${aufgabeId}`, felder)).data;
  },
  async aufgabeLoeschen(id, aufgabeId) {
    return (await api.delete(`/projekte/${id}/aufgaben/${aufgabeId}`)).data;
  },
  async zeiten(id, von = null, bis = null) {
    const params = {};
    if (von) params.von = von;
    if (bis) params.bis = bis;
    return (await api.get(`/projekte/${id}/zeiten`, { params })).data;
  },
  async zeitBuchen(id, felder) {
    return (await api.post(`/projekte/${id}/zeiten`, felder)).data;
  },
  async zeitAendern(id, buchungId, felder) {
    return (await api.put(`/projekte/${id}/zeiten/${buchungId}`, felder)).data;
  },
  async zeitLoeschen(id, buchungId) {
    return (await api.delete(`/projekte/${id}/zeiten/${buchungId}`)).data;
  },
  async zeitraum(von, bis) {
    return (await api.get('/projekte/zeiten', { params: { von, bis } })).data;
  },
  async timer() {
    return (await api.get('/projekte/timer')).data;
  },
  async timerStart(id, felder = {}) {
    return (await api.post(`/projekte/${id}/timer`, felder)).data;
  },
  async timerStop(felder = {}) {
    return (await api.post('/projekte/timer/stop', felder)).data;
  },
  async timerVerwerfen() {
    return (await api.delete('/projekte/timer')).data;
  },
  async stundenrechnungVorschau(id) {
    return (await api.get(`/projekte/${id}/stundenrechnung`)).data;
  },
  async stundenrechnungAnlegen(id, felder) {
    return (await api.post(`/projekte/${id}/stundenrechnung`, felder)).data;
  },

  // ── Dokumente, Office, Volltext (Stufe 5) ─────────────────────────────────
  async konfiguration() {
    return (await api.get('/projekte/konfiguration')).data;
  },
  async vorlagen() {
    return (await api.get('/projekte/vorlagen')).data;
  },
  async vorlageErzeugen(id, vorlageId, name = null) {
    return (await api.post(`/projekte/${id}/vorlagen/${vorlageId}`, { name })).data;
  },
  async suche(id, q, limit = 20) {
    return (await api.get(`/projekte/${id}/suche`, { params: { q, limit } })).data;
  },
  async indexAktualisieren(id) {
    return (await api.post(`/projekte/${id}/index`)).data;
  },
  async officeLink(id, pfad) {
    return (await api.get(`/projekte/${id}/office-link`, { params: { pfad } })).data;
  },
  async wopiSession(id, pfad) {
    return (await api.get(`/projekte/${id}/wopi-session`, { params: { pfad } })).data;
  },
  /** Datei aus dem Projektordner als Blob (Vorschau) — Pfad relativ zu 1_Projekte */
  async dateiBlob(pfad) {
    return (await api.get('/projects/file', { params: { path: pfad }, responseType: 'blob' })).data;
  },

  // ── CDE (Stufe 6) + Kommunikation (Stufe 8) ───────────────────────────────
  async cde(id) {
    return (await api.get(`/projekte/${id}/cde`)).data;
  },
  async cdeHochladen(id, datei, { art = null, status = 'WIP' } = {}) {
    const form = new FormData();
    form.append('datei', datei, datei.name);
    const params = { status };
    if (art) params.art = art;
    return (await api.post(`/projekte/${id}/cde/upload`, form, { params })).data;
  },
  async cdeStatus(id, sha256, status) {
    return (await api.put(`/projekte/${id}/cde/${sha256}/status`, { status })).data;
  },
  // ── Kundenportal (Stufe 8) ────────────────────────────────────────────────
  async portalNutzer() {
    return (await api.get('/projekte/portal-nutzer')).data;
  },
  async freigaben(id) {
    return (await api.get(`/projekte/${id}/freigaben`)).data;
  },
  async freigeben(id, username) {
    return (await api.post(`/projekte/${id}/freigaben`, { username })).data;
  },
  async freigabeEntziehen(id, username) {
    return (await api.delete(`/projekte/${id}/freigaben/${encodeURIComponent(username)}`)).data;
  },
  async mails(id, limit = 100) {
    return (await api.get(`/emails/projects/${id}/emails`, { params: { limit } })).data;
  },
};

export default ProjekteApi;
