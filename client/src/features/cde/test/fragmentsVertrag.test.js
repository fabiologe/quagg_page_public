// Der Vertrag mit @thatopen/fragments — geprüft an der BIBLIOTHEK, nicht an
// unserer Vorstellung von ihr (Stufe 12.0c).
//
// WARUM ES DIESE DATEI GIBT
//
// Die ganze Bearbeitung lag monatelang tot, weil `IfcAutor` den Editor am
// falschen Objekt suchte: `model.editor` statt `fragments.core.editor`. Am
// `FragmentsModel` gibt es diese Eigenschaft nicht — die Bibliothek führt sie
// als `private readonly _editor` und stellt keinen Getter bereit. Jede
// Bearbeitung endete deshalb in `kein_editor`: das Journal füllte sich, das
// Modell rührte sich nie.
//
// Zwölf Tests liefen dabei grün. Sie mussten es, denn ihre Attrappen waren
// nach derselben falschen Vorstellung gebaut — `editor` am Modell, `core` mit
// nichts als `load`. Eine Attrappe kann eine Annahme nicht widerlegen; sie ist
// die Annahme. Das ist dieselbe Klasse, die dieses Feature schon dreimal
// getroffen hat (zuletzt `koordinatenForm.test.js`).
//
// Also prüft diese Datei die Bibliothek selbst. Sie liest deren
// Typdeklarationen und hält JEDE Annahme dagegen, die die CDE macht. Sie ist
// die einzige Testart, die den Fehler hätte fangen können — und sie schlägt
// beim nächsten Bibliothekssprung an, statt ihn stillschweigend zu erben.
//
// Warum die Deklarationen und nicht die Laufzeit: `editor` ist ein
// INSTANZFELD, kein Prototyp-Eintrag. Ohne geladenes Modell (und damit ohne
// WebGL und Worker) ist es zur Laufzeit gar nicht zu sehen. Die Deklaration
// ist der veröffentlichte Vertrag.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DTS = fileURLToPath(
    new URL('../../../../node_modules/@thatopen/fragments/dist/index.d.ts', import.meta.url));
const MJS = fileURLToPath(
    new URL('../../../../node_modules/@thatopen/fragments/dist/index.mjs', import.meta.url));

const quelle = fs.readFileSync(DTS, 'utf8');

/**
 * Den Rumpf einer Klassendeklaration herausschneiden.
 *
 * Verlässt sich darauf, dass die erzeugte .d.ts eine schliessende Klammer in
 * Spalte 0 setzt — bei allen vier hier geprüften Klassen der Fall. Findet der
 * Ausdruck nichts, fällt der Test mit einer Meldung, die sagt WAS fehlt; ein
 * stilles `undefined` wäre hier besonders bitter.
 */
function klassenRumpf(name) {
    const start = quelle.search(new RegExp(`^(export )?declare class ${name}(?:\\s|<)`, 'm'));
    expect(start, `Klasse ${name} steht nicht mehr in den Typdeklarationen`).toBeGreaterThan(-1);
    const ende = quelle.indexOf('\n}', start);
    expect(ende, `Rumpf von ${name} nicht abgegrenzt`).toBeGreaterThan(start);
    return quelle.slice(start, ende);
}

/** Führt die Klasse dieses Mitglied (Feld, Getter oder Methode)? */
function fuehrt(rumpf, name) {
    return new RegExp(`^\\s+(readonly\\s+|get\\s+|async\\s+|abstract\\s+)*${name}\\s*[(<:;?]`, 'm')
        .test(rumpf);
}

const MANAGER = klassenRumpf('FragmentsModels');
const MODELL  = klassenRumpf('FragmentsModel');
const EDITOR  = klassenRumpf('Editor');
const ELEMENT = klassenRumpf('Element_2');

describe('Der Editor gehört dem Manager, nicht dem Modell', () => {
    it('FragmentsModels führt `editor` öffentlich', () => {
        expect(fuehrt(MANAGER, 'editor')).toBe(true);
    });

    it('FragmentsModel führt KEINEN öffentlichen `editor`', () => {
        // Der eigentliche Wächter. Fiele diese Zusicherung weg, dürfte
        // `IfcAutor._editor` wieder ans Modell greifen — und genau das war der
        // Fehler. Sie hält auch in die andere Richtung: bietet die Bibliothek
        // eines Tages einen Getter an, schlägt der Test an und wir ENTSCHEIDEN,
        // statt es nebenbei zu erben.
        expect(/^\s+private readonly _editor;/m.test(MODELL)).toBe(true);
        expect(fuehrt(MODELL, 'editor')).toBe(false);
    });

    it('auch im gebauten Modul gibt es keinen `editor`-Getter am Modell', () => {
        // Doppelt geprüft, weil `private` in TypeScript nur beim Übersetzen
        // gilt. Wäre zur Laufzeit ein Getter da, wäre der alte Code richtig
        // gewesen — er war es nicht.
        expect(/get editor\(\)/.test(fs.readFileSync(MJS, 'utf8'))).toBe(false);
    });
});

describe('Was IfcAutor am Editor aufruft, gibt es auch', () => {
    // Jede dieser Methoden steht in services/IfcAutor.js bzw. IfcEngine.js.
    for (const m of ['getElements', 'createElements', 'deleteElements', 'applyChanges', 'edit']) {
        it(`Editor.${m}`, () => expect(fuehrt(EDITOR, m)).toBe(true));
    }

    it('jede nimmt die modelId zuerst — daran erkennt man den einen Editor für alle', () => {
        for (const m of ['getElements', 'createElements', 'deleteElements', 'applyChanges', 'edit']) {
            const zeile = EDITOR.match(new RegExp(`^\\s+${m}\\(([^)]*)`, 'm'));
            expect(zeile, `${m} nicht gefunden`).toBeTruthy();
            expect(zeile[1].trim().startsWith('modelId'), `${m}(${zeile[1]})`).toBe(true);
        }
    });
});

describe('Was IfcAutor am Bauteil aufruft, gibt es auch', () => {
    for (const m of ['getMeshes', 'setMeshes', 'localId']) {
        it(`Element.${m}`, () => expect(fuehrt(ELEMENT, m)).toBe(true));
    }
});

describe('Die Form eines NEUEN Bauteils', () => {
    it('createElements erwartet `_category` — sonst wirft es', () => {
        // Nicht in den Typen zu sehen (`ItemData` ist eine offene Karte),
        // sondern erst im Rumpf: `itemDataToRawItemData` liest `_category` und
        // wirft „Category is required". Hier stand `{ category, data: {...} }`
        // — die Form eines `edit`-Auftrags. Der Aufruf warf damit JEDES Mal,
        // der try/catch schluckte es, und Zeichnen ergab nie ein Bauteil.
        const mjs = fs.readFileSync(MJS, 'utf8');
        expect(mjs).toContain('Category is required');
        expect(/itemDataToRawItemData.{0,120}_category/s.test(mjs)).toBe(true);
        // Und: alles ohne führenden Unterstrich wird zum Attribut, `_guid`
        // wird als Kennung übernommen. Darauf beruht, dass ein erzeugtes
        // Bauteil im GUID-Index auffindbar ist.
        expect(/itemDataToRawItemData.{0,240}_guid/s.test(mjs)).toBe(true);
    });
});

describe('Auftragsarten kommen aus der Aufzählung, nicht aus dem Kopf', () => {
    it('CREATE_ITEM ist 5 und UPDATE_ITEM ist 12', async () => {
        // In `addPsetToElement` stand `type: 6` für das, was „UPDATE_ITEM"
        // heissen sollte — 6 ist aber `CREATE_RELATION`. Verschiebt sich die
        // Aufzählung, fällt dieser Test, statt dass still etwas anderes
        // passiert.
        const FRAGS = await import('@thatopen/fragments');
        expect(FRAGS.EditRequestType.CREATE_ITEM).toBe(5);
        expect(FRAGS.EditRequestType.CREATE_RELATION).toBe(6);
        expect(FRAGS.EditRequestType.UPDATE_ITEM).toBe(12);
    });

    it('für Beziehungen gibt es `relate` — von Hand gebaute Aufträge braucht es nicht', () => {
        const zeile = EDITOR.match(/^\s+relate\(([^)]*)/m);
        expect(zeile, 'Editor.relate fehlt').toBeTruthy();
        expect(zeile[1]).toContain('modelId');
        expect(zeile[1]).toContain('relationName');
    });
});

describe('Was die Engine am Modell liest, gibt es auch', () => {
    // `getMergedBox` und `getBoxes` tragen die Höhenmessung (Stufe 13.3),
    // `getBuffer` den Ausgang ins Dokumentregister.
    for (const m of ['getBoxes', 'getMergedBox', 'getPositions', 'getBuffer', 'getCoordinationMatrix']) {
        it(`FragmentsModel.${m}`, () => expect(fuehrt(MODELL, m)).toBe(true));
    }

    it('die GlobalId kommt aus dem GUID-Index, nicht aus den Attributen', () => {
        // `parseItemData` liest `item['GlobalId']` — und das ist leer, weil der
        // IfcLoader von Haus aus nur einen schmalen Attributsatz importiert.
        // Die GlobalId führt die Bibliothek getrennt. Ohne sie verwirft
        // `eintragen` jeden Journaleintrag: sie ist das Einzige an einem
        // Bauteil, das eine Modellrevision überlebt.
        expect(fuehrt(MODELL, 'getGuidsByLocalIds')).toBe(true);
        expect(fuehrt(MODELL, 'getLocalIdsByGuids')).toBe(true);
    });

    it('der Manager führt `list` und `core`-Verhalten, das die CDE benutzt', () => {
        for (const m of ['load', 'disposeModel', 'update']) {
            expect(fuehrt(MANAGER, m), `FragmentsModels.${m}`).toBe(true);
        }
    });
});

describe('Die Prüfung prüft wirklich etwas', () => {
    // Gegenprobe: ohne sie könnte `fuehrt` immer false liefern und die
    // Zusicherung „kein öffentlicher editor" wäre wertlos.
    it('erkennt ein vorhandenes Mitglied und ein erfundenes', () => {
        expect(fuehrt(MODELL, 'modelId')).toBe(true);
        expect(fuehrt(MODELL, 'gibtEsNicht')).toBe(false);
    });
});
