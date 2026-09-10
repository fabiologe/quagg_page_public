/**
 * Die Modellbindung ALLER Wege (Stufe 4 des Aushub-Fachmodells, nachgereicht).
 *
 * Stufe 4 hatte `ausfuehren` und `commitSitzung` korrigiert — die übrigen
 * Journalwege (Cockpit KG/DIN 277, Längsschnitt, Merkmale, Plan-Griffe)
 * schrieben weiter die sha des ZUERST geladenen Modells, und das Wasserzeichen
 * las nur dessen Status. Zwei Arten Zusage stehen hier:
 *   - das Wasserzeichen einer Modellmenge nimmt den UNREIFSTEN Status;
 *   - ein Wächter am Quelltext: kein Journalweg nennt das erste Modell, ohne
 *     vorher die Datei SEINES Bauteils zu fragen (`modellShaVon`). Die zwei
 *     Ausnahmen sind begründet und stehen beim Namen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { resolveWatermarkText } from '../stores/useCdeStore.js';

const WURZEL = resolve(process.cwd(), 'src/features/cde');

function dateien(ordner) {
    const aus = [];
    for (const name of readdirSync(ordner)) {
        const pfad = join(ordner, name);
        if (statSync(pfad).isDirectory()) { if (name !== 'test') aus.push(...dateien(pfad)); }
        else if (/\.(js|vue)$/.test(name)) aus.push(pfad);
    }
    return aus;
}

describe('Das Wasserzeichen einer Modellmenge', () => {
    const doks = [
        { sha256: 'p', status: 'Published' }, { sha256: 's', status: 'Shared' },
        { sha256: 'w', status: 'WIP' }, { sha256: 'a', status: 'Archived' },
    ];
    it('der unreifste Status gilt — ein freigegebenes und ein WIP-Modell ergeben einen Vorabzug', () => {
        expect(resolveWatermarkText(doks, ['p', 'w'])).toBe('VORABZUG');
        expect(resolveWatermarkText(doks, ['p', 's'])).toBe('ZUR PRÜFUNG');
        expect(resolveWatermarkText(doks, ['p', 'a'])).toBe('ARCHIVIERT');
        expect(resolveWatermarkText(doks, ['p'])).toBeNull();
        expect(resolveWatermarkText(doks, ['p', 'unbekannt'])).toBe('VORABZUG');   // nicht im Register = WIP
    });
    it('eine einzelne sha verhält sich wie bisher; keine gar nicht', () => {
        expect(resolveWatermarkText(doks, 's')).toBe('ZUR PRÜFUNG');
        expect(resolveWatermarkText(doks, [])).toBeNull();
        expect(resolveWatermarkText(doks, null)).toBeNull();
    });
});

describe('Wächter: kein Journalweg nennt ungefragt das erste Modell', () => {
    // BEGRÜNDETE Ausnahmen:
    //   CommitDialog      — `commitSitzung` nimmt das Modell seiner SCHRITTE; der Wert ist nur Rückfall.
    //   useZeichnen/Eingabe-Fabriken (`getModellSha:`) — was neu gezeichnet wird, hat noch keine
    //                        Datei; `ausfuehren` nimmt vorher das Subjekt, wo es eins gibt.
    const AUSNAHMEN = new Set(['components/CommitDialog.vue']);

    it('jede `modellSha: api.getLoadedModelSha…` fragt vorher `modellShaVon` — oder steht bei den Ausnahmen', () => {
        const ungefragt = [];
        for (const pfad of dateien(WURZEL)) {
            const text = readFileSync(pfad, 'utf8');
            for (const m of text.matchAll(/modellSha:\s*([^,\n]*getLoadedModelSha[^,\n]*)/g)) {
                const rel = relative(WURZEL, pfad);
                if (!/modellShaVon/.test(m[1]) && !AUSNAHMEN.has(rel)) ungefragt.push(`${rel}: ${m[1].trim()}`);
            }
        }
        expect(ungefragt).toEqual([]);
    });
});
