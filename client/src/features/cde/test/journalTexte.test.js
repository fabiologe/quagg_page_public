/**
 * Stufe 7 — die Texttabelle im Journal (die 4-MB-Grenze des Servers).
 * Wiederholte lange Texte unter den Textfeldern stehen einmal in `texte`;
 * Kennungen, Quellen und Modellsummen bleiben, wie sie sind (der Server liest sie).
 */
import { describe, expect, it } from 'vitest';
import { TEXT_AB, texteAuslagern, texteEinlagern } from '../services/JournalFormat.js';

const H = 'dInnen: annahme — Schaft innen 450 mm (übliche Betonteile; DIN 4052 nicht im Bestand)';
const SHA = 'a'.repeat(64);
const schritt = (gid) => ({ id: `s-${gid}`, art: 'erzeugt', globalId: gid, modellSha: SHA, vorgangTitel: 'BIMFY: netz_2026.xml',
    nachher: { rezept: 'schachtring', parameter: { teilVon: 'cde-S1', quellen: { bauteil: SHA }, herleitung: { dInnen: { art: 'annahme', text: H } } } } });

describe('Texttabelle', () => {
    it('legt Wiederholtes aus, lässt Kennungen und Summen stehen, und bekommt alles zurück', () => {
        const nutzlast = { commits: [{ id: 'c1', schritte: [schritt('cde-R1'), schritt('cde-R2'), schritt('cde-R3')] }], sitzung: null };
        const { wert, texte } = texteAuslagern(nutzlast);
        expect(texte.sort()).toEqual(['BIMFY: netz_2026.xml', H].sort());
        const s0 = wert.commits[0].schritte[0];
        expect(s0.nachher.parameter.herleitung.dInnen.text).toEqual({ '§': expect.any(Number) });
        expect(s0.globalId).toBe('cde-R1');
        expect(s0.modellSha).toBe(SHA);                                   // nicht unter einem Textfeld
        expect(s0.nachher.parameter.quellen.bauteil).toBe(SHA);
        expect(JSON.stringify({ wert, texte }).length).toBeLessThan(JSON.stringify(nutzlast).length);
        const { wert: zurueck, fehlend } = texteEinlagern(wert, texte);
        expect(fehlend).toEqual([]);
        expect(zurueck).toEqual(nutzlast);
    });
    it('Einmaliges und Kurzes bleibt; ohne Wiederholung ist der Wert unverändert', () => {
        const kurz = { commits: [{ schritte: [{ vorgangTitel: 'x'.repeat(TEXT_AB - 1) }, { vorgangTitel: 'x'.repeat(TEXT_AB - 1) }] }] };
        expect(texteAuslagern(kurz)).toEqual({ wert: kurz, texte: [] });
    });
    it('ein Verweis ohne Text ist ein Befund, kein stiller Ersatz', () => {
        const { fehlend } = texteEinlagern({ a: { herleitung: { '§': 5 } } }, ['nur einer']);
        expect(fehlend).toEqual([5]);
    });
});
