/**
 * useProjekteStore ('projekte') — Portfolio (Liste, Kennzahlen, Abgleich) und
 * die gerade geöffnete Akte. Jede Schreibaktion bekommt die frische Akte vom
 * Server zurück und ersetzt den lokalen Stand — es gibt keinen zweiten Wahrheitsort.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import ProjekteApi from '../services/ProjekteApi';

export const useProjekteStore = defineStore('projekte', () => {
  const projekte = ref([]);
  const kennzahlen = ref(null);
  const abgleich = ref({ ordner_ohne_akte: [], akte_ohne_ordner: [] });
  const akte = ref(null);
  const leistungsbilder = ref([]);
  const auftraggeber = ref([]);
  const geld = ref(null);            // Stand der geöffneten Akte (Summen, Rechnungen, Belege, Planzeile)
  const zeiten = ref(null);          // { buchungen, summen } der geöffneten Akte
  const timer = ref(null);           // laufender Timer des Nutzers (projektübergreifend)
  const laedt = ref(false);
  const fehler = ref('');

  const jePhase = computed(() => {
    const gruppen = {};
    for (const p of projekte.value) {
      const schluessel = p.phase || 'ohne';
      (gruppen[schluessel] ||= []).push(p);
    }
    return gruppen;
  });

  function _melde(quelle, error) {
    const detail = error?.response?.data?.detail;
    fehler.value = (typeof detail === 'string' && detail) || `${quelle} fehlgeschlagen`;
    console.warn(`projekte: ${quelle}:`, error);
  }

  async function ladePortfolio() {
    laedt.value = true;
    fehler.value = '';
    try {
      [projekte.value, kennzahlen.value, abgleich.value] = await Promise.all([
        ProjekteApi.liste(), ProjekteApi.kennzahlen(), ProjekteApi.abgleich(),
      ]);
    } catch (error) {
      _melde('Portfolio laden', error);
    } finally {
      laedt.value = false;
    }
  }

  async function ladeAkte(id) {
    laedt.value = true;
    fehler.value = '';
    try {
      akte.value = await ProjekteApi.lesen(id);
    } catch (error) {
      akte.value = null;
      _melde('Akte laden', error);
    } finally {
      laedt.value = false;
    }
    return akte.value;
  }

  /** Führt eine Schreibaktion aus, übernimmt die zurückgegebene Akte. */
  async function _schreibe(quelle, aufruf) {
    fehler.value = '';
    try {
      const neu = await aufruf();
      akte.value = neu;
      const i = projekte.value.findIndex((p) => p.id === neu.id);
      const offeneAufgaben = (neu.aufgaben || []).filter((a) => a.status !== 'erledigt');
      const kurz = { ...neu, beteiligte: undefined, meilensteine: undefined, termine: undefined, abschnitte: undefined,
        honorar_historie: undefined, vorschlaege: undefined, vorschlaege_offen: (neu.vorschlaege || []).length,
        zeit: undefined, minuten: neu.zeit?.minuten_gesamt ?? 0,
        aufgaben: { offen: offeneAufgaben.length,
          ueberfaellig: offeneAufgaben.filter((a) => a.faellig_am && a.faellig_am < new Date().toISOString().slice(0, 10)).length } };
      if (i >= 0) projekte.value.splice(i, 1, { ...projekte.value[i], ...kurz });
      return neu;
    } catch (error) {
      _melde(quelle, error);
      return null;
    }
  }

  async function legeAn(felder) {
    const neu = await _schreibe('Projekt anlegen', () => ProjekteApi.anlegen(felder));
    if (neu) await ladePortfolio();
    return neu;
  }

  async function uebernimm(id, felder) {
    const neu = await _schreibe('Ordner übernehmen', () => ProjekteApi.uebernehmen(id, felder));
    if (neu) await ladePortfolio();
    return neu;
  }

  const aendere = (id, felder) => _schreibe('Speichern', () => ProjekteApi.aendern(id, felder));
  const verschiebe = (id, phase) => _schreibe('Verschieben', () => ProjekteApi.verschieben(id, phase));
  const beteiligterAnlegen = (id, f) => _schreibe('Beteiligten anlegen', () => ProjekteApi.beteiligterAnlegen(id, f));
  const beteiligterAendern = (id, bid, f) => _schreibe('Beteiligten ändern', () => ProjekteApi.beteiligterAendern(id, bid, f));
  const beteiligterLoeschen = (id, bid) => _schreibe('Beteiligten entfernen', () => ProjekteApi.beteiligterLoeschen(id, bid));
  const meilensteinAnlegen = (id, f) => _schreibe('Termin anlegen', () => ProjekteApi.meilensteinAnlegen(id, f));
  const meilensteinAendern = (id, mid, f) => _schreibe('Termin ändern', () => ProjekteApi.meilensteinAendern(id, mid, f));
  const meilensteinLoeschen = (id, mid) => _schreibe('Termin entfernen', () => ProjekteApi.meilensteinLoeschen(id, mid));

  // ── Leistung (Stufe 2) ────────────────────────────────────────────────────
  async function ladeLeistungsbilder() {
    if (leistungsbilder.value.length) return leistungsbilder.value;
    try {
      leistungsbilder.value = await ProjekteApi.leistungsbilder();
    } catch (error) {
      _melde('Leistungsbilder laden', error);
    }
    return leistungsbilder.value;
  }
  const abschnittAnlegen = (id, f) => _schreibe('Abschnitt anlegen', () => ProjekteApi.abschnittAnlegen(id, f));
  const abschnittAendern = (id, aid, f) => _schreibe('Abschnitt ändern', () => ProjekteApi.abschnittAendern(id, aid, f));
  const abschnittLoeschen = (id, aid) => _schreibe('Abschnitt entfernen', () => ProjekteApi.abschnittLoeschen(id, aid));
  const vorlageAnwenden = (id, f) => _schreibe('Leistungsbild anwenden', () => ProjekteApi.vorlageAnwenden(id, f));
  const vorschlagEntscheiden = (id, vid, e) => _schreibe('Vorschlag entscheiden', () => ProjekteApi.vorschlagEntscheiden(id, vid, e));

  // ── Geld (Stufe 4) ────────────────────────────────────────────────────────
  async function ladeAuftraggeber() {
    if (auftraggeber.value.length) return auftraggeber.value;
    try {
      auftraggeber.value = await ProjekteApi.auftraggeber();
    } catch (error) {
      _melde('Auftraggeber laden', error);
    }
    return auftraggeber.value;
  }
  async function ladeGeld(id) {
    fehler.value = '';
    try {
      geld.value = await ProjekteApi.geld(id);
    } catch (error) {
      geld.value = null;
      _melde('Geldstand laden', error);
    }
    return geld.value;
  }
  async function abschlagAnlegen(id, felder) {
    fehler.value = '';
    try {
      const ergebnis = await ProjekteApi.abschlagAnlegen(id, felder);
      await Promise.all([ladeGeld(id), ladeAkte(id)]);
      return ergebnis;
    } catch (error) {
      _melde('Abschlag anlegen', error);
      return null;
    }
  }
  async function schlussrechnungAnlegen(id, felder) {
    fehler.value = '';
    try {
      const ergebnis = await ProjekteApi.schlussrechnungAnlegen(id, felder);
      await Promise.all([ladeGeld(id), ladeAkte(id)]);
      return ergebnis;
    } catch (error) {
      _melde('Schlussrechnung anlegen', error);
      return null;
    }
  }
  async function _geldSchreibe(quelle, aufruf) {
    fehler.value = '';
    try {
      geld.value = await aufruf();
      return geld.value;
    } catch (error) {
      _melde(quelle, error);
      return null;
    }
  }
  const belegZuordnen = (id, belegId) => _geldSchreibe('Beleg zuordnen', () => ProjekteApi.belegZuordnen(id, belegId));
  const belegLoesen = (id, belegId) => _geldSchreibe('Beleg lösen', () => ProjekteApi.belegLoesen(id, belegId));

  // ── Kalender-Termine (mit Uhrzeit, Teilnehmern, Einladungen) ──────────────
  const terminAnlegen = (id, f) => _schreibe('Kalendertermin anlegen', () => ProjekteApi.terminAnlegen(id, f));
  const terminAendern = (id, tid, f) => _schreibe('Kalendertermin ändern', () => ProjekteApi.terminAendern(id, tid, f));
  const terminEntfernen = (id, tid) => _schreibe('Kalendertermin entfernen', () => ProjekteApi.terminEntfernen(id, tid));
  const terminEinladen = (id, tid, o) => _schreibe('Einladung senden', () => ProjekteApi.terminEinladen(id, tid, o));

  // ── Aufgaben + Zeit (Stufe 3) ─────────────────────────────────────────────
  const aufgabeAnlegen = (id, f) => _schreibe('Aufgabe anlegen', () => ProjekteApi.aufgabeAnlegen(id, f));
  const aufgabeAendern = (id, aid, f) => _schreibe('Aufgabe ändern', () => ProjekteApi.aufgabeAendern(id, aid, f));
  const aufgabeLoeschen = (id, aid) => _schreibe('Aufgabe entfernen', () => ProjekteApi.aufgabeLoeschen(id, aid));

  async function ladeZeiten(id, von = null, bis = null) {
    fehler.value = '';
    try {
      zeiten.value = await ProjekteApi.zeiten(id, von, bis);
    } catch (error) {
      zeiten.value = null;
      _melde('Zeiten laden', error);
    }
    return zeiten.value;
  }
  /** Zeit-Schreibaktion: Akte übernehmen UND Zeitliste neu laden. */
  async function _zeitSchreibe(quelle, id, aufruf) {
    const neu = await _schreibe(quelle, aufruf);
    if (neu) await ladeZeiten(id);
    return neu;
  }
  const zeitBuchen = (id, f) => _zeitSchreibe('Zeit buchen', id, () => ProjekteApi.zeitBuchen(id, f));
  const zeitAendern = (id, bid, f) => _zeitSchreibe('Zeit ändern', id, () => ProjekteApi.zeitAendern(id, bid, f));
  const zeitLoeschen = (id, bid) => _zeitSchreibe('Zeit entfernen', id, () => ProjekteApi.zeitLoeschen(id, bid));

  async function ladeTimer() {
    try {
      timer.value = await ProjekteApi.timer();
    } catch (error) {
      _melde('Timer laden', error);
    }
    return timer.value;
  }
  async function timerStart(id, felder = {}) {
    fehler.value = '';
    try {
      timer.value = await ProjekteApi.timerStart(id, felder);
    } catch (error) {
      _melde('Timer starten', error);
    }
    return timer.value;
  }
  async function timerStop(felder = {}) {
    fehler.value = '';
    try {
      const buchung = await ProjekteApi.timerStop(felder);
      timer.value = null;
      if (buchung && akte.value?.id === buchung.projekt_id) {
        await Promise.all([ladeZeiten(buchung.projekt_id), ladeAkte(buchung.projekt_id)]);
      }
      return buchung;
    } catch (error) {
      _melde('Timer stoppen', error);
      return null;
    }
  }
  async function timerVerwerfen() {
    try {
      await ProjekteApi.timerVerwerfen();
      timer.value = null;
    } catch (error) {
      _melde('Timer verwerfen', error);
    }
  }
  async function stundenrechnungAnlegen(id, felder) {
    fehler.value = '';
    try {
      const ergebnis = await ProjekteApi.stundenrechnungAnlegen(id, felder);
      await Promise.all([ladeZeiten(id), ladeAkte(id)]);
      return ergebnis;
    } catch (error) {
      _melde('Stundenrechnung anlegen', error);
      return null;
    }
  }

  return {
    projekte, kennzahlen, abgleich, akte, leistungsbilder, auftraggeber, geld, zeiten, timer, laedt, fehler, jePhase,
    ladePortfolio, ladeAkte, legeAn, uebernimm, aendere, verschiebe,
    beteiligterAnlegen, beteiligterAendern, beteiligterLoeschen,
    meilensteinAnlegen, meilensteinAendern, meilensteinLoeschen,
    ladeLeistungsbilder, abschnittAnlegen, abschnittAendern, abschnittLoeschen, vorlageAnwenden,
    vorschlagEntscheiden,
    ladeAuftraggeber, ladeGeld, abschlagAnlegen, schlussrechnungAnlegen, belegZuordnen, belegLoesen,
    aufgabeAnlegen, aufgabeAendern, aufgabeLoeschen, ladeZeiten, zeitBuchen, zeitAendern, zeitLoeschen,
    ladeTimer, timerStart, timerStop, timerVerwerfen, stundenrechnungAnlegen,
    terminAnlegen, terminAendern, terminEntfernen, terminEinladen,
  };
});
