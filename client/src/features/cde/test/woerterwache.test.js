/**
 * Die Wörterwache (Fahrplan „Klare Abläufe", S2; Kassensturz 2026-09-12).
 *
 * Ein Begriff, ein Wort. Die Wörtertabelle des Fahrplans legt fest, welches
 * Wort gilt; diese Wache verbietet die ausgemusterten in allem, was man sieht:
 * Vorlagen der Komponenten (ohne Kommentare), Zeichenketten in deren Skripten
 * und die Textdienste, deren Sätze in der Oberfläche landen.
 *
 * Code-Namen bleiben: `beginneSitzung`, `commitSitzung`, der Schlüssel
 * `festlegung` — die Muster sind gross geschrieben und stehen an Wortgrenzen,
 * ein Bezeichner in camelCase trifft sie deshalb nicht.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = new URL('..', import.meta.url).pathname;

/** Ausgemustert → was stattdessen gilt. */
export const AUSGEMUSTERT = [
    // „Auftrag" heisst die Schüttung (IfcEarthworksFill) — für den Projektordner gilt „Projekt".
    { muster: /ganze[rs]? Auftrag|Auftrags-|Auftrag w(?:ä|ae)hlen|Auftrag gew(?:ä|ae)hlt|\bAufträge\b|diesem Auftrag|des Auftrags/, statt: 'Projekt' },
    { muster: /\bModellsatz(?:es)?\b|\bModellsätze\b/, statt: 'Satz' },
    { muster: /\bMerkmalsatz\b/, statt: 'Merkmale' },
    { muster: /\bFestlegung(?:en)?\b/, statt: 'Schritt' },
    { muster: /nur festgehalten/, statt: 'Forderung' },
    { muster: /\bSitzung(?:en)?\b/, statt: 'Bearbeitung' },
    { muster: /\bCommit(?:s|ten)?\b|Commit-Nachricht|\bcommitten\b/, statt: 'Sichern · Version' },
    { muster: /\bRevert\b|revertier/, statt: 'Rückgängig' },
    { muster: /\bAbschlie(?:ß|ss)en\b|\babschlie(?:ß|ss)en\b/, statt: 'Sichern' },
    { muster: /\bJournal(?:stand|s)?\b/, statt: 'Verlauf' },
    { muster: /Live-Stand|Stand der CDE|eigene Bauteile|cde-eigenbau/, statt: 'Eigenbau' },
    { muster: /\bVerbundmodell\b|Verbund erzeugen|Erdbau registrieren|neu registrieren|Erdbau neu erzeugen|zusammengeführt|zusammenführen/, statt: 'Ausgeben' },
    { muster: /\bPrüftor(?:s|es)?\b/, statt: 'Prüfen · Prüfbericht' },
    { muster: /BIM-Qualität/, statt: 'Schnellcheck' },
    { muster: /\bRebase\b|\bUmhängen\b|\bumhängen\b|\bKennung(?:en)?\b/, statt: 'Zuordnen' },
    { muster: /Ur-Gelände|\bWirt(?:e|s)?\b|Anzeigeform/, statt: 'Gelände' },
    { muster: /\bPlanerstand\b|\bLieferstand\b/, statt: 'Wert des Planers' },
    { muster: /\bentladen\b|\bEntladen\b/, statt: 'Schließen · Aus dem Satz nehmen' },
    { muster: /\bTransmittal\b/, statt: 'Übergabepaket' },
    // Kassensturz E5: Issues heissen Notizen; der Text zu einer Version heisst „Beschreibung".
    { muster: /\bIssues?\b|Issue-/, statt: 'Notiz' },
    // Kassensturz: „Ebenen" hiess Geschosse UND Kategorien.
    { muster: /\bEbenen\b|Ebene (?:aus|ein)blenden|gewählte Ebene/, statt: 'Geschosse · Kategorien' },
    // Kassensturz H1: Tafeln heissen nach dem, was man darin tut.
    { muster: /\bToolbox\b/, statt: 'Werkzeuge' },
    { muster: /Planungs-Cockpit/, statt: 'Mengen' },
];

/** Dienste, deren Sätze in der Oberfläche stehen. */
const TEXTDIENSTE = [
    'services/Nachspielen.js',
    'services/Herkunft.js',
    'services/StatusWorkflow.js',
    'services/Transmittal.js',
    'services/ViewModes.js',
    'composables/useModellAblage.js',
    'composables/useAnnotationen.js',
    'stores/usePanels.js',
    // Nach S2 gefunden: auch hier stehen Sätze, die man sieht — Titel im
    // Verlauf, die Nachspiel-Meldung, der Änderungsbericht, die Werkzeuge.
    'stores/useAenderungen.js',
    'composables/useNachspielen.js',
    'services/AenderungsberichtPdf.js',
    'services/Bearbeitungen.js',
    'services/Herleitung.js',
    'services/Pruefbericht.js',
    'services/EigenbauDiagnose.js',
    // Nach H2 gefunden: Chips der Vorschau, Befunde, Beziehungen, Import, Lage.
    'services/Vorschau.js',
    'services/Befunde.js',
    'services/Beziehungen.js',
    'services/ImportBefund.js',
    'services/Mengenzeile.js',
    'services/Hoehenbezug.js',
    'services/Georeferenz.js',
];

function vueDateien(ordner) {
    return readdirSync(join(WURZEL, ordner))
        .filter(n => n.endsWith('.vue'))
        .map(n => `${ordner}/${n}`);
}

/** Kommentare durch Leerzeichen ersetzen — die Zeilennummern bleiben stimmen. */
function ohneHtmlKommentare(text) {
    return text.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
}

/**
 * Zeichenketten eines Skripts, Kommentare übersprungen. Ein kleiner Automat
 * statt einer Regex — `'http://…'` ist kein Kommentar, `// 'x'` keine Kette.
 */
export function zeichenketten(code, startZeile = 1) {
    const aus = [];
    let i = 0, zeile = startZeile;
    const n = code.length;
    while (i < n) {
        const c = code[i], d = code[i + 1];
        if (c === '\n') { zeile++; i++; continue; }
        if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') {
            const e = code.indexOf('*/', i + 2);
            const ende = e < 0 ? n : e + 2;
            zeile += (code.slice(i, ende).match(/\n/g) ?? []).length;
            i = ende; continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            const beginn = zeile;
            let j = i + 1, s = '';
            while (j < n && code[j] !== c) {
                if (code[j] === '\\') { s += code[j + 1] ?? ''; j += 2; continue; }
                if (code[j] === '\n') zeile++;
                s += code[j]; j++;
            }
            aus.push({ text: s, zeile: beginn });
            i = j + 1; continue;
        }
        i++;
    }
    return aus;
}

/** Was in einer Datei zu lesen ist — als Zeilen mit Nummer. */
export function sichtbareTexte(datei, text) {
    const zeilen = [];
    if (datei.endsWith('.vue')) {
        const a = text.indexOf('<template>');
        const e = text.lastIndexOf('</template>');
        if (a >= 0 && e > a) {
            const vor = text.slice(0, a).split('\n').length;
            ohneHtmlKommentare(text.slice(a, e)).split('\n')
                .forEach((z, k) => zeilen.push({ text: z, zeile: vor + k }));
        }
        const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(text);
        if (m) {
            const vor = text.slice(0, m.index).split('\n').length;
            zeilen.push(...zeichenketten(m[1], vor));
        }
    } else {
        zeilen.push(...zeichenketten(text));
    }
    return zeilen;
}

export function fundstellenIn(datei, text) {
    const aus = [];
    for (const { text: z, zeile } of sichtbareTexte(datei, text)) {
        // Protokollzeilen liest nur, wer die Konsole öffnet.
        if (/^\s*\[?cde[\]:]/i.test(z)) continue;
        // Modulpfade sind keine Sätze: '../services/Transmittal.js'.
        if (/^(?:\.{1,2}\/|@\/)\S+$/.test(z)) continue;
        // Kleingeschriebene Schlüssel ohne Leerzeichen sind Code: 'cde-eigenbau'.
        if (/^[a-z][a-z0-9-]*$/.test(z)) continue;
        for (const { muster, statt } of AUSGEMUSTERT) {
            const m = muster.exec(z);
            if (m) aus.push({ datei, zeile, wort: m[0], statt });
        }
    }
    return aus;
}

function alleFundstellen() {
    const dateien = [
        ...vueDateien('views'), ...vueDateien('components'), ...vueDateien('components/ui'),
        ...TEXTDIENSTE,
    ];
    return dateien.flatMap(d => fundstellenIn(d, readFileSync(join(WURZEL, d), 'utf8')));
}

describe('Wörterwache', () => {
    it('kein ausgemustertes Wort in dem, was man sieht', () => {
        const f = alleFundstellen().map(x => `${x.datei}:${x.zeile}  „${x.wort}" → ${x.statt}`);
        expect(f).toEqual([]);
    });

    it('sieht Text und Tooltip, übergeht Kommentar und Bezeichner', () => {
        const vorlage = [
            '<template>',
            '  <!-- die Sitzung endet hier -->',
            '  <button title="Sitzung abschließen" @click="beginneSitzung()">Weiter</button>',
            '</template>',
            '<script setup>',
            '// Journal im Kommentar',
            "const t = 'Das Journal ist leer';",
            'const url = \'http://x/y\'; const k = aenderungen.sitzungSchritte;',
            '</script>',
        ].join('\n');
        const f = fundstellenIn('x.vue', vorlage);
        expect(f.map(x => `${x.zeile}:${x.wort}`)).toEqual(['3:Sitzung', '3:abschließen', '7:Journal']);
    });

    it('lässt die Schüttung „Auftrag" stehen und fängt den Projektordner', () => {
        expect(fundstellenIn('x.js', "const a = 'Aushub und Auftrag je Vorgang';")).toEqual([]);
        expect(fundstellenIn('x.js', "if (id === 'cde-eigenbau') {}")).toEqual([]);
        expect(fundstellenIn('x.js', "const t = 'cde-eigenbau · lokal';").map(x => x.statt)).toEqual(['Eigenbau']);
        expect(fundstellenIn('x.js', "const a = '— ganzer Auftrag —';").map(x => x.statt)).toEqual(['Projekt']);
    });
});
