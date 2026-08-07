// Benannte Anzeige-Schwellen der Ergebnisdarstellung. Vorher steckten
// dieselben Zahlen als nackte Literale in GrundrissPanel, Raum3DPanel und
// useFieldCache — wer eine Schwelle ändern wollte, musste sie an sieben
// Stellen finden, und unter 1 cm Tiefe war Wasser schlicht unsichtbar.
//
// Die Kette der Sichtbarkeit ist jetzt:
//   h <= TIEFE_TROCKEN                    trocken (Rauschfilter)
//   TIEFE_TROCKEN < h <= TIEFE_BENETZT    "Benetzung": heller Film, kein Raster
//   h > TIEFE_BENETZT                     volles Farbraster / Pfeile / Linien

// Phasenanteil, ab dem eine Rasterzelle als Wasser gilt (Farbskalen-Bereich,
// Pfeile, Stromlinien-Saat, Punktabfrage). Die Wasseroberflaeche in 3D nutzt
// denselben Wert als Vorgabe, ist dort aber per Regler verstellbar.
export const ALPHA_NASS = 0.5

// Unterhalb dieser Tiefe gilt eine Saeule als trocken. Faengt Restfeuchte
// aus dem Resampling ab (Zellmittelung erzeugt mm-Bruchteile), ohne echte
// duenne Filme zu verschlucken.
export const TIEFE_TROCKEN = 0.001   // m

// Bis zu dieser Tiefe wird eine Saeule als "benetzt" gezeichnet statt mit
// dem Farbraster: die Werte sind dort vom Darstellungsraster dominiert
// (eine Vertikalzelle ist meist groesser als die Tiefe selbst).
export const TIEFE_BENETZT = 0.01    // m
