/**
 * Beleg-Plausibilitaet und Buchungsvorschlag — EXAKT die Backend-Regeln aus
 * backend/app/api/pedant/core/belege.py (gleiche Grenzwerte, gleiche Rundung).
 * Der Server bleibt die Wahrheit; hier geht es um sofortiges Feedback.
 */
import { computed, toValue } from 'vue';

export const GRENZE_SOFORT = 25000;   // 250 € netto in Cent
export const GRENZE_GWG = 80000;      // 800 € netto in Cent

/** Netto + Steuer = Brutto, kaufmaennisch gerundet, ±1 Cent Toleranz. */
export function pruefePlausibilitaet(nettoCent, steuersatz, bruttoCent) {
  if (!Number.isInteger(nettoCent) || !Number.isInteger(bruttoCent)
    || ![0, 7, 19].includes(steuersatz)) {
    return { ok: false, erwartetBrutto: null, abweichung: null,
             grund: 'Netto, Steuersatz und Brutto müssen gefüllt sein' };
  }
  const steuer = Math.floor((nettoCent * steuersatz + 50) / 100);
  const erwartet = nettoCent + steuer;
  const abweichung = bruttoCent - erwartet;
  if (Math.abs(abweichung) <= 1) {
    return { ok: true, erwartetBrutto: erwartet, abweichung, grund: '' };
  }
  const vorzeichen = abweichung > 0 ? '+' : '';
  return { ok: false, erwartetBrutto: erwartet, abweichung,
           grund: `Brutto weicht ${vorzeichen}${abweichung} Cent vom erwarteten Wert ab` };
}

/** GWG-Stufen nach Nettobetrag — ein Vorschlag, kein Automatismus. */
export function belegVorschlag(nettoCent) {
  if (!Number.isInteger(nettoCent)) {
    return { stufe: null, kontoVorschlag: null, hinweis: '' };
  }
  if (nettoCent < GRENZE_SOFORT) {
    return { stufe: 'sofortaufwand', kontoVorschlag: null,
             hinweis: 'Unter 250 € netto: direkt als Aufwand buchen.' };
  }
  if (nettoCent <= GRENZE_GWG) {
    return { stufe: 'gwg', kontoVorschlag: '6260',
             hinweis: '250–800 € netto: Sofortabschreibung GWG (6260) — '
               + 'Pflicht zur Aufnahme ins Anlageverzeichnis.' };
  }
  return { stufe: 'aktivierung', kontoVorschlag: null,
           hinweis: 'Über 800 € netto: aktivieren (z. B. 0650 Büroeinrichtung, '
             + '0135 Software) und über die Nutzungsdauer abschreiben.' };
}

/** felder: reactive/ref/computed mit {netto_cent, steuersatz, brutto_cent}. */
export function useBelegPlausibilitaet(felder) {
  const befund = computed(() => {
    const wert = toValue(felder);
    return pruefePlausibilitaet(wert.netto_cent, wert.steuersatz, wert.brutto_cent);
  });
  const vorschlag = computed(() => belegVorschlag(toValue(felder).netto_cent));
  return { befund, vorschlag };
}
