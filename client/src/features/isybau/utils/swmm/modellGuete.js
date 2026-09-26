/**
 * Modellgüte eines Laufs in Stufen statt einer Punktzahl (P1.8). Die alte Zahl
 * („100 Exzellent") zog nur Systembilanz und Nicht-Konvergenz ab — Knoten mit
 * 26 % Kontinuitätsfehler (9161_IGBWEST) blieben unsichtbar, und eine Zahl wie
 * „87" täuschte eine Genauigkeit vor, die es nicht gibt.
 *
 * Schwellen: Systembilanz wie die Kachel „Kontinuitätsfehler" (getContinuityClass:
 * > 1 % gelb, > 5 % rot; 5 % = Grenze der Überstau-Automatik, RM-II 3.4),
 * Knotenfehler wie die Warnung im Ergebnis (CONTINUITY_ERROR_WARN_PCT = 10 %).
 */
import { BILANZ_GRENZE_PCT } from './ueberstauWahl.js';
import { CONTINUITY_ERROR_WARN_PCT } from './ResultsAssembler.js';

export const STUFEN = {
    gut: { titel: 'Gut', text: 'Massenbilanz geschlossen, keine auffälligen Knoten.' },
    pruefen: { titel: 'Prüfen', text: 'Ergebnisse brauchbar, einzelne Auffälligkeiten — Gründe beachten.' },
    kritisch: { titel: 'Kritisch', text: 'Massenbilanz nicht geschlossen oder Rechnung nicht konvergiert — Ergebnisse nicht belastbar.' },
};

/**
 * @param {object} systemStats  RptParser/ResultsAssembler
 * @returns {{stufe:'gut'|'pruefen'|'kritisch', titel:string, text:string, gruende:string[]}}
 */
export function modellGuete(systemStats = {}) {
    const gruende = [];
    let stufe = 'gut';
    const hoch = (s) => { if (s === 'kritisch' || stufe === 'gut') stufe = s; };
    const fmt = (v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });

    const sys = Math.abs(systemStats?.flow?.error ?? 0);
    if (sys > BILANZ_GRENZE_PCT) { hoch('kritisch'); gruende.push(`Systembilanz ${fmt(sys)} % (> ${BILANZ_GRENZE_PCT} %)`); }
    else if (sys > 1) { hoch('pruefen'); gruende.push(`Systembilanz ${fmt(sys)} % (> 1 %)`); }

    const nk = systemStats?.routingTimeStep?.notConverging ?? 0;
    if (nk > 10) { hoch('kritisch'); gruende.push(`${fmt(nk)} % der Zeitschritte nicht konvergiert`); }
    else if (nk > 1) { hoch('pruefen'); gruende.push(`${fmt(nk)} % der Zeitschritte nicht konvergiert`); }

    const knoten = (systemStats?.continuityErrors || []).filter(k => Math.abs(k.error) >= CONTINUITY_ERROR_WARN_PCT);
    if (knoten.length) {
        hoch('pruefen');
        const liste = knoten.slice(0, 3).map(k => `${k.id} (${fmt(k.error)} %)`).join(', ');
        gruende.push(`${knoten.length} Knoten mit Kontinuitätsfehler ≥ ${CONTINUITY_ERROR_WARN_PCT} %: ${liste}${knoten.length > 3 ? ' …' : ''}`);
    }
    return { stufe, ...STUFEN[stufe], gruende };
}
