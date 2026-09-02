/**
 * T2 — die Verklebung: IfcPlanCanvas und die zwei Maschinen.
 *
 * Die Gestenmaschine und das EingabeRouting sind für sich geprüft; was
 * bleibt, ist die Verdrahtung — und dort sassen die drei Löcher, die T2
 * gestopft hat. Textwächter nach dem Muster von bearbeitungVerklebung:
 * jede Zusage ist eine, deren stiller Verlust erst am Gerät auffiele.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const quelle = readFileSync(
    new URL('../components/IfcPlanCanvas.vue', import.meta.url), 'utf8');

describe('Die Verklebung von Routing und Geste', () => {
    it('JEDER Zeiger läuft zuerst durchs EingabeRouting — nicht nur der Rotstift', () => {
        // Vorher stand eingabe.pointerDown hinter `if (stiftModus.value)`.
        const ab = quelle.slice(quelle.indexOf('function onZeigerAb'));
        const ersteEntscheidung = ab.search(/stiftModus|setzModus|zeichnen\.aktiv|messen\.value/);
        const routing = ab.indexOf('eingabe.pointerDown');
        expect(routing).toBeGreaterThan(-1);
        expect(routing).toBeLessThan(ersteEntscheidung);
    });

    it('pointerMove wird gerufen — dort härtet das Karenzfenster', () => {
        expect(quelle).toContain('eingabe.pointerMove');
    });

    it('die Pinch-Umwandlung verwirft den nassen Strich, statt einen zweiten zu beginnen', () => {
        const block = quelle.slice(
            quelle.indexOf("'pinch-umwandlung'"),
            quelle.indexOf('gesten.uebernimm'),
        );
        expect(block).toContain('nasserStrich.value = null');
    });

    it('der Strich wird begangen, wenn SEIN Zeiger endet — nicht irgendeiner', () => {
        // addStrich darf nur hinter einer Ziel-Prüfung stehen; ein Nav-Finger,
        // der loslässt, beging vorher den laufenden Stiftstrich.
        const auf = quelle.slice(quelle.indexOf('function onZeigerAuf'));
        const ziel = auf.indexOf("ziel === 'tinte'");
        const commit = auf.indexOf('rotstift.addStrich');
        expect(ziel).toBeGreaterThan(-1);
        expect(commit).toBeGreaterThan(ziel);
    });

    it('der Stift-Hover hält die Handballen-Sperre frisch', () => {
        expect(quelle).toContain('eingabe.stiftNaehe');
    });

    it('der Finger-Tipp fällt beim LOSLASSEN, über warTipp der Gestenmaschine', () => {
        expect(quelle).toContain('warTipp');
        // … und Maus/Stift wirken weiterhin beim Aufsetzen:
        expect(quelle).toMatch(/!== 'touch'\)? && tippAktion\(ev\)/);
    });

    it('die Fläche gehört dem Plan: touch-action none in JEDEM Zustand', () => {
        expect(quelle).toMatch(/\.plan-canvas\s*\{\s*touch-action:\s*none;\s*\}/);
    });

    it('die alte Pan-Mechanik ist WEG — es gibt nur einen Weg zu schwenken', () => {
        // Zwei Schwenkwege wären dieselbe Fehlerklasse wie zwei Register.
        expect(quelle).not.toMatch(/\bzugStart\b/);
        expect(quelle).not.toMatch(/\blet zieht\b/);
    });
});
