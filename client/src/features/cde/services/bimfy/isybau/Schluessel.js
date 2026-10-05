/**
 * ISYBAU · Schlüssellisten (Referenzlisten Stammdaten), wie sie die
 * Arbeitshilfen Abwasser (Stand 12/2015, Anhang A-7.8.2, XML-Format 2013)
 * nennen. Nur, was dort gelesen ist; eine Liste, die das Feature „isyifc"
 * anders führt, ist dort zu berichtigen, nicht hier zu übernehmen.
 *
 * Rein: Daten.
 */

/** G102 Material (Tab. A-7-186). */
export const G102_MATERIAL = Object.freeze({
    AZ: 'Asbestzement', B: 'Beton', BS: 'Betonsegmente', CNS: 'Edelstahl', EIS: 'Eisen und Stahl (nicht identifiziert)',
    FZ: 'Faserzement', GFK: 'glasfaserverstärkter Kunststoff', GG: 'Grauguss', GGG: 'duktiles Gusseisen',
    KST: 'Kunststoff (nicht identifiziert)', MA: 'Mauerwerk', OB: 'Ortbeton', P: 'Porosit', PC: 'Polymerbeton',
    PCC: 'polymermodifizierter Zementbeton', PE: 'Polyethylen', PEHD: 'Polyethylen hoher Dichte', PH: 'Polyesterharz',
    PHB: 'Polyesterharzbeton', PP: 'Polypropylen', PVC: 'Polyvinylchlorid', PVCU: 'Polyvinylchlorid hart',
    SFB: 'Stahlfaserbeton', SPB: 'Spannbeton', SB: 'Stahlbeton', ST: 'Stahl', STZ: 'Steinzeug', SZB: 'Spritzbeton',
    W: 'nicht identifizierter Werkstoff', ZG: 'Ziegelwerk', MIX: 'unterschiedliche Werkstoffe',
    BOD: 'anstehender Boden', RAS: 'Rasen', PFL: 'Pflaster',
});

/** G205 Profilart (Tab. A-7-205) — die Liste endet in AH15 bei 13. */
export const G205_PROFILART = Object.freeze({
    0: 'Kreisprofil', 1: 'Eiprofil (H/B = 3/2)', 2: 'Maulprofil (H/B = 1,66/2)', 3: 'Rechteckprofil (geschlossen)',
    4: 'Kreisprofil (doppelwandig)', 5: 'Rechteckprofil (offen)', 6: 'Eiprofil (H/B ungleich 3/2)',
    7: 'Maulprofil (H/B ungleich 1,66/2)', 8: 'Trapezprofil', 9: 'Doppeltrapezprofil', 10: 'U-förmig',
    11: 'Bogenförmig', 12: 'oval', 13: 'andere Profilart',
});

/** G300 Knotentyp (Tab. A-7-208). */
export const G300_KNOTENTYP = Object.freeze({ 0: 'Schacht', 1: 'Anschlusspunkt', 2: 'Bauwerk' });

/** G301 Schachtfunktion (Tab. A-7-209). */
export const G301_SCHACHTFUNKTION = Object.freeze({
    1: 'Schacht', 2: 'Sonderschacht', 3: 'Kontrollschacht', 4: 'Drosselschacht', 5: 'Lampenschacht',
    6: 'Probenahmeschacht', 7: 'Hausrevisionsschacht', 8: 'Verbindungsschacht', 9: 'Schacht mit Notüberlauf',
    10: 'Inspektionsöffnung', 11: 'Reinigungsöffnung', 12: 'Probenahmeöffnung',
});

/** G302 Deckelform (Tab. A-7-210). */
export const G302_DECKELFORM = Object.freeze({
    R: 'rund', RV: 'rund, verschraubt', E: 'rechteckig', EV: 'rechteckig, verschraubt', Z: 'andere Form',
});

/** G303 Deckeltyp (Tab. A-7-211) — die Lüftung steckt hier. */
export const G303_DECKELTYP = Object.freeze({ 1: 'mit Belüftungsöffnung', 2: 'ohne Belüftungsöffnung' });

/** G304 Abdeckungsklasse (Tab. A-7-212), „gem. DIN 1229" — die Klassen der DIN EN 124. */
export const G304_ABDECKUNGSKLASSE = Object.freeze({
    A: 'A 15', B: 'B 125', C: 'C 250', D: 'D 400', E: 'E 600', F: 'F 900', Z: 'sonstige/unbekannt',
});

/** G305 Aufbauform (Tab. A-7-213), G308 Unterteilform (Tab. A-7-216, auch untere Schachtzone). */
export const G305_AUFBAUFORM = Object.freeze({ R: 'rund', E: 'eckig', Z: 'andere Form' });
export const G308_UNTERTEILFORM = Object.freeze({ R: 'rund', E: 'eckig', O: 'ohne Schachtunterteil', Z: 'andere Form' });

/** G306 Art der Steighilfen (Tab. A-7-214), G307 Material der Steighilfen (Tab. A-7-215). */
export const G306_STEIGHILFE = Object.freeze({
    1: 'einläufiger Steigeisengang', 2: 'zweiläufiger Steigeisengang', 3: 'Leiter', 4: 'Steigkästen', 5: 'nicht vorhanden',
});
export const G307_MATERIAL_STEIGHILFE = Object.freeze({
    1: 'Eisen', 2: 'galvanisiertes Eisen', 3: 'nichtrostender Stahl', 4: 'Aluminium', 5: 'kunststoffummanteltes Metall', 6: 'Kunststoff',
});

/** G309 Gerinneform (Tab. A-7-217). */
export const G309_GERINNEFORM = Object.freeze({
    0: 'Kreis bis Kämpfer', 1: 'Kreis bis Scheitel', 2: 'Rechteck bis Kämpfer', 3: 'Rechteck bis Scheitel',
    4: 'geschlossenes Gerinne', 5: 'Schussrinne', 6: 'Kaskade', 9: 'sonstige',
});

/** G105 Status (Tab. A-7-189). */
export const G105_STATUS = Object.freeze({
    0: 'vorhanden', 1: 'geplant', 2: 'fiktiv', 3: 'außer Betrieb', 4: 'verdämmt/verfüllt', 5: 'sonstige', 6: 'rückgebaut',
});

/** V106 Punktattribut Abwasser (Tab. A-7-268) — die für die Geometrie tragenden. */
export const V106 = Object.freeze({
    DMP: 'Schachtdeckelmittelpunkt', SMP: 'Schachtmittelpunkt', HP: 'Höhenpunkt allgemein', SBW: 'Bauwerksrandpunkt',
    KMP: 'Kreismittelpunkt', LHP: 'Leitungs-/Haltungspunkt', RAP: 'Rohranschlusspunkt', KOP: 'Koordinatenbezugspunkt',
});

/** Werkstoffe, deren Rohre auf den AUSSENdurchmesser bezogen benannt sind (DN/OD) — Kunststoff. */
export const DN_OD_WERKSTOFFE = Object.freeze(new Set(['PVC', 'PVCU', 'PP', 'PE', 'PEHD']));
