/**
 * Client-seitige Buchungsvalidierung — dieselben Regeln, die der Server
 * durchsetzt (core/journal.py::_validiere), nur als sofortiges Feedback.
 * Die Wahrheit bleibt der Server; hier geht es um kurze Wege im Formular.
 */
import { computed, toValue } from 'vue';

/** Reine Prüffunktion — testbar ohne Vue. Gibt {feldname: meldung} zurück. */
export function pruefeBuchung(form) {
  const fehler = {};
  if (!form.buchungsdatum) fehler.buchungsdatum = 'Buchungsdatum fehlt';
  if (!form.belegdatum) fehler.belegdatum = 'Belegdatum fehlt';
  if (!form.sollkonto) fehler.sollkonto = 'Sollkonto fehlt';
  if (!form.habenkonto) fehler.habenkonto = 'Habenkonto fehlt';
  if (form.sollkonto && form.sollkonto === form.habenkonto) {
    fehler.habenkonto = 'Soll- und Habenkonto müssen verschieden sein';
  }
  if (!Number.isInteger(form.betrag_cent)) {
    fehler.betrag = 'Betrag ist nicht lesbar (z. B. 1.234,56)';
  } else if (form.betrag_cent <= 0) {
    fehler.betrag = 'Betrag muss größer als 0 sein';
  }
  if (!String(form.buchungstext || '').trim()) {
    fehler.buchungstext = 'Buchungstext fehlt';
  }
  return fehler;
}

/** form ist reactive, ref oder computed; zurück kommen fehler + gueltig. */
export function useBuchungValidierung(form) {
  const fehler = computed(() => pruefeBuchung(toValue(form)));
  const gueltig = computed(() => Object.keys(fehler.value).length === 0);
  return { fehler, gueltig };
}
