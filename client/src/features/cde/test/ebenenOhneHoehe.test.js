/**
 * Ebenen ohne Höhe (31.08.2026) — der Absturz, der wie zwanzig aussah.
 *
 * `IfcStoreyNav` rief `s.elevation.toFixed(2)`. In `IfcStoreys.getStoreyList`
 * ist `elevation` aber ausdrücklich `null`, wenn die Entität keine Höhe führt —
 * die Sortierung dort fängt das mit `?? -Infinity` schon ab, die Anzeige nicht.
 * Fabios Kanalplanung (PROJECT → Element → SITE, keine Geschosse) brachte damit
 * den GANZEN Renderlauf zum Absturz:
 *
 *     IfcStoreyNav.vue:38  Cannot read properties of null (reading 'toFixed')
 *
 * Alles danach im Protokoll — „Cannot set properties of null (setting
 * '__vnode')", „emitsOptions of null", dutzendfach — war Folgeschaden eines
 * abgebrochenen Patch-Laufs. Deshalb ist die ERSTE Zeile die interessante.
 *
 * WARUM KEIN WÄCHTER DAS FING, und das ist die eigentliche Lehre:
 *   lintUndef            unbekannte Bezeichner im Skript
 *   vorlagenBezeichner   nicht auflösbare Namen in der Vorlage
 *   refsInVorlagen       Refs ohne .value
 * Alle drei fragen „lässt es sich übersetzen?". Keiner fragt „läuft es mit
 * echten Daten?". `s.elevation` ist ein gültiger, korrekt aufgelöster
 * Bezeichner — er ist nur zur Laufzeit null.
 *
 * Die Kur ist deshalb nicht bloss ein `?.`: die Formatierung wohnt jetzt in der
 * REINEN Ebenen-Logik und ist hier ohne Rendern prüfbar. Bei einer
 * Zahlformatierung, an der ein ganzer Viewer hängt, ist das den Umweg wert.
 */
import { describe, expect, it } from 'vitest';
import { hoeheText, nachHoehe } from '../services/StoreyModes.js';

describe('hoeheText', () => {
    it('schreibt eine vorhandene Höhe mit zwei Nachkommastellen', () => {
        expect(hoeheText(3.25)).toBe('3.25 m');
        expect(hoeheText(0)).toBe('0.00 m');
        expect(hoeheText(-2.5)).toBe('-2.50 m');
    });

    it('gibt einen STRICH, wenn es keine Höhe gibt — keine erfundene Null', () => {
        // „0,00 m" sähe aus wie eine gemessene Höhe auf Geländeniveau.
        expect(hoeheText(null)).toBe('—');
        expect(hoeheText(undefined)).toBe('—');
    });

    it('stürzt bei Unsinn nicht ab, sondern sagt „keine Höhe"', () => {
        expect(hoeheText(NaN)).toBe('—');
        expect(hoeheText('drei')).toBe('—');
        expect(hoeheText(Infinity)).toBe('—');
    });
});

describe('nachHoehe', () => {
    const e = (name, elevation) => ({ name, elevation, modelId: 'm', localId: name });

    it('sortiert von unten nach oben', () => {
        expect(nachHoehe([e('OG', 3), e('EG', 0), e('UG', -3)]).map(x => x.name))
            .toEqual(['UG', 'EG', 'OG']);
    });

    it('stellt Ebenen OHNE Höhe zuunterst, statt die Reihenfolge zu zerwürfeln', () => {
        // `a.elevation - b.elevation` ergab mit null NaN — kein Absturz, aber
        // eine Reihenfolge, die von der Eingabe abhing.
        expect(nachHoehe([e('OG', 3), e('OHNE', null), e('EG', 0)]).map(x => x.name))
            .toEqual(['OHNE', 'EG', 'OG']);
    });

    it('lässt die Eingabe unangetastet — sie kommt aus einem Prop', () => {
        const eingabe = [e('OG', 3), e('EG', 0)];
        nachHoehe(eingabe);
        expect(eingabe.map(x => x.name)).toEqual(['OG', 'EG']);
    });

    it('erträgt eine leere Liste', () => {
        expect(nachHoehe(null)).toEqual([]);
    });
});
