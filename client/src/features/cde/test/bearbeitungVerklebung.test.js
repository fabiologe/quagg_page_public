/**
 * Die Verklebung zwischen Formular und Journal (Stufe 12.0c).
 *
 * Das Formular ist eine `.vue`, und dieses Feature führt kein
 * `@vue/test-utils` — auszuführen ist es hier also nicht. Genau in dieser
 * Lücke sassen zwei Fehler: `CdeToolbox.uebernehmen()` und
 * `CdeHudLayer.uebernehmen()` gaben `basis` und `modell` nicht mit (womit der
 * Drei-Wege-Vergleich für jeden Formular-Eintrag abgeschaltet war), und die
 * Rücknahme im Journal-Reiter erreichte das Modell überhaupt nicht.
 *
 * Ein Textwächter ist grob, aber er ist nicht nichts: er hält fest, DASS die
 * Angaben weitergereicht werden. Ob sie stimmen, prüft `bearbeitungKette`.
 * (Dasselbe Mittel benutzen `designTokens.test.js` und `regressionen.test.js`.)
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { join } from 'node:path';

const WURZEL = new URL('..', import.meta.url).pathname;
const lies = (rel) => fs.readFileSync(join(WURZEL, rel), 'utf8');

describe('EIN Formular, EIN Griff-Weg — beide reichen dasselbe weiter', () => {
    // Seit Teil XVI S6 steht das Formular nur noch in der Kontextleiste
    // (`IfcViewer.uebernehmeScharf`); der Griff legt über `useGriffe.ablegen`
    // ab. HUD und Toolbox rufen `ausfuehren` NICHT mehr — sie zeigten dasselbe
    // Formular ein zweites und drittes Mal (Fabio, PROD-Test 2026-09-08).
    for (const [datei, marke] of [['components/IfcViewer.vue', 'async function uebernehmeScharf'], ['composables/useGriffe.js', 'async function ablegen']]) {
        it(`${datei}`, () => {
            const text = lies(datei);
            const fn = text.indexOf(marke);
            expect(fn, `${datei} ohne ${marke}`).toBeGreaterThan(-1);
            const ab = text.indexOf('bearbeitung.ausfuehren(', fn);
            expect(ab, `${datei} ruft ausfuehren gar nicht`).toBeGreaterThan(-1);
            const block = text.slice(ab, text.indexOf('});', ab));
            for (const feld of ['wer:', 'modellSha:', 'basis:', 'modell:']) {
                expect(block, `${datei} ohne ${feld}`).toContain(feld);
            }
        });
    }
    it('HUD und Toolbox tragen kein Formular mehr', () => {
        for (const datei of ['CdeToolbox.vue', 'CdeHudLayer.vue']) {
            const text = lies(join('components', datei));
            expect(text, datei).not.toContain('<CdeBearbeitungForm');
            expect(text, datei).not.toContain('bearbeitung.ausfuehren(');
        }
    });
});

describe('Die Rücknahme erreicht das Modell', () => {
    it('der Journal-Reiter wendet den Gegeneintrag an', () => {
        // Vorher endete „zurück" am Journal: `@geaendert` rechnete nur
        // Kostengruppen und Flächen neu, die zurückgenommene Verschiebung
        // blieb bis zum nächsten F5 im Raum stehen.
        expect(lies('components/IfcAenderungenTab.vue')).toContain('wendeEintragAn');
    });
});

describe('Der Editor wird nirgends mehr am Modell gesucht', () => {
    it('kein `model.editor` im ganzen Feature', () => {
        // Der Fehler, an dem die ganze Bearbeitung hing. Er ist so leicht
        // wieder hineinzuschreiben, dass ein Wächter sich lohnt — die Typen
        // erlauben ihn nicht, aber JavaScript merkt es nicht.
        const treffer = [];
        const suche = (verz) => {
            for (const e of fs.readdirSync(verz, { withFileTypes: true })) {
                const pfad = join(verz, e.name);
                if (e.isDirectory()) { if (e.name !== 'test') suche(pfad); continue; }
                if (!/\.(js|vue)$/.test(e.name)) continue;
                for (const [i, zeile] of fs.readFileSync(pfad, 'utf8').split('\n').entries()) {
                    if (zeile.trimStart().startsWith('*') || zeile.trimStart().startsWith('//')) continue;
                    if (/\bmodel(l)?(\?)?\.editor\b/.test(zeile)) {
                        treffer.push(`${pfad.replace(WURZEL, '')}:${i + 1}`);
                    }
                }
            }
        };
        suche(WURZEL);
        expect(treffer, 'Der Editor gehört dem Manager: fragments.core.editor').toEqual([]);
    });
});

describe('Kein neuer Weg am Bearbeiten-Modus vorbei (Stufe 12.0d)', () => {
    /**
     * Wer ins Journal schreiben darf — und warum.
     *
     * Die Sperre sitzt in `useBearbeitung.starte`/`ausfuehren` und in
     * dem Werkzeug selbst. Jede WEITERE Stelle, die `eintragen` ruft, ist
     * ein Weg an ihr vorbei. Genau so entstanden die sieben ungesicherten
     * Einstiege, die diese Stufe eingesammelt hat.
     *
     * Diese Liste ist der Vertrag. Wer eine Stelle ergänzt, muss sie hier
     * eintragen — und dabei erklären, warum sie ohne Modus schreiben darf.
     */
    // SEIT TEIL XXIV (O6) schreiben Längsschnitt, Merkmalsfenster und Cockpit
    // nicht mehr selbst: sie setzen Kommandos über `useKommandoweg` ab, und der
    // prüft den Modus vor `fuehreAus` (geprüft unten). Gesucht wird seitdem
    // nach JEDEM Schreibweg des Journals, nicht nur nach `eintragen`.
    const ERLAUBT = {
        'stores/useBearbeitung.js': 'die Engstelle selbst — `ausfuehren` prüft den Modus davor; '
            + '`fuehreAus` ist der Weg ohne Oberfläche (Kommandos, Skripte), Fenster rufen ihn über `useKommandoweg`',
        'components/IfcPlanningCockpit.vue':
            'zwei einmalige Übernahmen von Altbestand beim Laden (kein Nutzereingriff, Systembeleg) '
            + '— die zwei Nutzerwege daneben gehen über den Kommandoweg',
        'stores/planJournal.js':
            'die einmalige Übernahme der alten Planinhalt-/Rotstiftliste beim Laden (Systembeleg) '
            + '— geschrieben wird seit R2 über `fuehreAus` mit Beleg; Blattinhalt stand nie '
            + 'unter dem Bearbeiten-Modus, sondern unter dem Plan-Werkzeugslot',
    };

    it('nur bekannte Stellen schreiben ins Journal', () => {
        const treffer = new Map();
        const suche = (verz) => {
            for (const e of fs.readdirSync(verz, { withFileTypes: true })) {
                const pfad = join(verz, e.name);
                if (e.isDirectory()) { if (e.name !== 'test') suche(pfad); continue; }
                if (!/\.(js|vue)$/.test(e.name)) continue;
                const text = fs.readFileSync(pfad, 'utf8');
                for (const [i, zeile] of text.split('\n').entries()) {
                    const roh = zeile.trimStart();
                    if (roh.startsWith('*') || roh.startsWith('//')) continue;
                    // `uebernimm` heisst auch die Übergabe der Plangesten — gezählt nur am Journal-Store.
                    if (/\.eintragen(Vorgang)?\(|\b(aenderungen|ae)\.uebernimm(Altbestand)?\(/.test(zeile)) {
                        const rel = pfad.replace(WURZEL, '');
                        if (!treffer.has(rel)) treffer.set(rel, []);
                        treffer.get(rel).push(i + 1);
                    }
                }
            }
        };
        suche(WURZEL);
        const unbekannt = [...treffer.keys()].filter(d => !(d in ERLAUBT));
        expect(unbekannt, 'Neue Schreibstelle: prüft sie den Bearbeiten-Modus?').toEqual([]);
        // … und die Liste ist nachgezogen: wer nicht mehr schreibt, steht nicht mehr darin.
        expect(Object.keys(ERLAUBT).filter(d => !treffer.has(d)), 'veralteter Eintrag').toEqual([]);
    });

    it('der Kommandoweg der Fenster prüft den Modus VOR dem Kommando', () => {
        const text = lies('composables/useKommandoweg.js');
        const sperre = text.indexOf('bearbeitung.modusAn');
        const schreibt = text.indexOf('bearbeitung.fuehreAus');
        expect(sperre).toBeGreaterThan(-1);
        expect(sperre).toBeLessThan(schreibt);
    });

    it('der Längsschnitt-Griff prüft den Modus VOR dem Anfassen', () => {
        // Die Allowlist oben ist keine Ausnahme, sondern ein Versprechen:
        // hier steht der Beleg, dass die Sperre wirklich existiert.
        const text = lies('components/LaengsschnittCanvas.vue');
        const ab = text.indexOf('function onZeigerAb');
        const griffSuche = text.indexOf('griffListe', ab);
        const sperre = text.indexOf('bearbeitung.modusAn', ab);
        expect(sperre).toBeGreaterThan(-1);
        expect(sperre).toBeLessThan(griffSuche);
    });

    it('der Merkmalssatz prüft den Modus VOR dem Eintragen', () => {
        // Lücke ⑧: die Sperre steht im HANDLER, vor dem Kommando — nicht in der
        // Darstellung. (Seit O6 schaltet sie den Modus ein, der Kommandoweg prüft ihn noch einmal.)
        const text = lies('components/IfcSemanticWindow.vue');
        const handler = text.indexOf('async function onAddPset');
        const sperre = text.indexOf('bearbeitung.modusAn', handler);
        const schreibt = text.indexOf('kommandoweg.absetzen', handler);
        expect(sperre).toBeGreaterThan(-1);
        expect(sperre).toBeLessThan(schreibt);
    });

    it('die Klassifikation im Cockpit prüft den Modus', () => {
        // Zwei Nutzerwege („KG von Hand", „DIN-277-Klasse") schrieben am
        // Editor vorbei. Gesperrt wird im HANDLER, nicht nur am Auswahlfeld —
        // eine Sperre in der Darstellung fällt beim nächsten Umbau weg.
        const text = lies('components/IfcPlanningCockpit.vue');
        for (const fn of ['onOverrideKg', 'onOverrideClass']) {
            const ab = text.indexOf(`function ${fn}`);
            expect(ab, `${fn} fehlt`).toBeGreaterThan(-1);
            expect(text.slice(ab, ab + 400)).toContain('bearbeitung.modusAn');
        }
    });
});
