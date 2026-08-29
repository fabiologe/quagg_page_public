/**
 * Geld.js — Cent-Arithmetik und -Formatierung, die EINE Stelle dafür.
 *
 * Beträge sind im gesamten Pedanten ganzzahlige Cent (wie in der DB: BIGINT).
 * Floats kommen nur ein einziges Mal vor: bei der Division durch 100 zur
 * ANZEIGE — nie beim Rechnen, nie beim Senden.
 */

const FORMAT = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

/** 123456 → "1.234,56 €" */
export function centAlsEuro(cent) {
  if (!Number.isInteger(cent)) return '—';
  return FORMAT.format(cent / 100);
}

/**
 * Nutzereingabe → Cent (Integer) oder null bei Unlesbarem.
 * Versteht "1.234,56", "1234,56", "1234.56", "1234" und Weißraum/€-Zeichen.
 */
export function euroZuCent(text) {
  if (typeof text !== 'string') return null;
  let roh = text.replace(/[€\s]/g, '');
  if (!roh) return null;
  // Deutsches Muster: Punkt = Tausender, Komma = Dezimal. Enthält die Eingabe
  // ein Komma, fliegen alle Punkte raus; sonst gilt ein einzelner Punkt mit
  // 1-2 Nachkommastellen als Dezimalpunkt (Copy-Paste aus englischen Quellen).
  if (roh.includes(',')) {
    roh = roh.replace(/\./g, '').replace(',', '.');
  } else if (/^\-?\d+\.\d{3}$/.test(roh)) {
    roh = roh.replace('.', ''); // "1.234" ist ein Tausenderpunkt
  }
  if (!/^\-?\d+(\.\d{1,2})?$/.test(roh)) return null;
  const [euro, nachkomma = ''] = roh.replace('-', '').split('.');
  const cent = Number(euro) * 100 + Number(nachkomma.padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cent)) return null;
  return roh.startsWith('-') ? -cent : cent;
}

/** Summe einer Cent-Liste — Integer rein, Integer raus. */
export function summe(centListe) {
  return centListe.reduce((acc, wert) => {
    if (!Number.isInteger(wert)) throw new Error('summe: nur ganze Cent');
    return acc + wert;
  }, 0);
}
