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

describe('IfcLoader.load der Bibliothek — nachgebaut in IfcEngine._fragmenteLaden (2026-09-07)', () => {
    // Die CDE lädt Fragmentdateien aus der Ablage direkt über `core.load`
    // und ruft den Importer selbst, um seinen Puffer abzulegen. Das ist
    // Zeile für Zeile, was `IfcLoader.load` tut — und genau das hält dieser
    // Vertrag fest: ändert die Bibliothek den Weg, fällt es hier, nicht in
    // der Szene.
    const COMP = fileURLToPath(new URL('../../../../node_modules/@thatopen/components/dist/index.mjs', import.meta.url));
    const comp = fs.readFileSync(COMP, 'utf8');
    const ab = comp.indexOf('async load(data, coordinate, name, config) {');

    it('setzt autoCoordinate, importiert mit den Loader-Einstellungen und ruft core.load(bytes, {modelId})', () => {
        expect(ab).toBeGreaterThan(-1);
        const rumpf = comp.slice(ab, ab + 1200);
        expect(rumpf).toContain('fragments.core.settings.autoCoordinate = coordinate');
        expect(rumpf).toContain('new FRAGS.IfcImporter()');
        expect(rumpf).toContain('serializer.wasm.path = this.settings.wasm.path');
        expect(rumpf).toContain('serializer.webIfcSettings = this.settings.webIfc');
        expect(rumpf).toMatch(/serializer\.process\(\{[\s\S]{0,120}bytes: data/);
        expect(rumpf).toMatch(/fragments\.core\.load\(bytes, \{\s*modelId: name/);
    });

    it('IfcImporter trägt wasm, webIfcSettings und process; FragmentsModel hat object und dispose', () => {
        expect(quelle).toMatch(/class IfcImporter \{[\s\S]{0,3000}wasm: \{/);
        expect(quelle).toMatch(/class IfcImporter \{[\s\S]{0,3000}webIfcSettings: WEBIFC\.LoaderSettings/);
        expect(quelle).toMatch(/class IfcImporter \{[\s\S]{0,6000}process\(/);
        expect(quelle).toMatch(/class FragmentsModel \{[\s\S]{0,6000}object: THREE\.Object3D/);
        expect(quelle).toMatch(/class FragmentsModel \{[\s\S]{0,12000}dispose\(/);
    });
});

describe('Zeiger, Fang und Rahmen (Teil XVI, S1) — was die Engine am Modell ruft, gibt es', () => {
    // `probeTreffer` raycastet wahlweise gegen EIN Modell, `_bibliotheksFang`
    // fragt `raycastWithSnapping`, `rechteckAuswahl` `rectangleRaycast` — alle
    // drei am `FragmentsModel`, nicht am OBC-Manager (der kennt nur `raycast`).
    // `raycastAll` (Teil XXII): die Auswahl braucht JEDEN Treffer des
    // Mittelstrahls — der Erdkörper liegt 2 cm unter der deckenden Anzeige.
    for (const m of ['raycast', 'raycastWithSnapping', 'rectangleRaycast', 'raycastAll']) {
        it(`FragmentsModel.${m}`, () => expect(fuehrt(MODELL, m)).toBe(true));
    }

    it('die Normale im Treffer ist OPTIONAL — der Zeiger braucht einen Billboard-Rückfall', () => {
        const rumpf = quelle.slice(quelle.indexOf('export declare interface RaycastResult'));
        const ende = rumpf.slice(0, rumpf.indexOf('\n}'));
        expect(ende).toMatch(/^\s+normal\?: THREE\.Vector3;/m);
        expect(ende).toMatch(/^\s+point: THREE\.Vector3;/m);
        expect(ende).toMatch(/snappingClass: SnappingClass;/);
        expect(ende).toMatch(/snappedEdgeP1\?: THREE\.Vector3;/);
    });

    it('die Fangklassen heissen POINT, LINE, FACE — und sind zur Laufzeit da', async () => {
        const rumpf = quelle.slice(quelle.indexOf('export declare enum SnappingClass'));
        const ende = rumpf.slice(0, rumpf.indexOf('\n}'));
        for (const k of ['POINT', 'LINE', 'FACE']) expect(ende).toContain(k);
        const FRAGS = await import('@thatopen/fragments');
        expect(FRAGS.SnappingClass.POINT).toBe(0);
        expect(FRAGS.SnappingClass.LINE).toBe(1);
    });

    it('der Rahmen nimmt topLeft/bottomRight/fullyIncluded — Window gegen Crossing', () => {
        const rumpf = quelle.slice(quelle.indexOf('export declare interface RectangleRaycastData'));
        const ende = rumpf.slice(0, rumpf.indexOf('\n}'));
        for (const f of ['topLeft: THREE.Vector2', 'bottomRight: THREE.Vector2', 'fullyIncluded: boolean', 'dom: HTMLCanvasElement']) {
            expect(ende).toContain(f);
        }
        const antwort = quelle.slice(quelle.indexOf('export declare interface RectangleRaycastResult'));
        expect(antwort.slice(0, antwort.indexOf('\n}'))).toContain('localIds: number[]');
    });

    it('der Rahmen rechnet in CLIENT-Pixeln wie der Zeiger — beide über screenToCast', () => {
        // Sonst läge das Rechteck um den Canvas-Versatz daneben, und niemand
        // sähe es: der Rahmen träfe einfach andere Bauteile.
        const mjs = fs.readFileSync(MJS, 'utf8');
        expect(mjs).toMatch(/screenRectToFrustum\([^)]*\)\{return this\.screenToCast\(/);
    });
});

describe('Der Ladeversatz steht in baseCoordinates, nicht in object.position (2026-09-08)', () => {
    it('der Manager führt `baseCoordinates` und die Einstellung `autoCoordinate`', () => {
        expect(fuehrt(MANAGER, 'baseCoordinates')).toBe(true);
        expect(/baseCoordinates:\s*number\[\]\s*\|\s*null/.test(MANAGER)).toBe(true);
        expect(/autoCoordinate:\s*boolean/.test(MANAGER)).toBe(true);
    });

    it('das Modell nennt seinen Koordinationspunkt über `getCoordinates()`', () => {
        expect(/getCoordinates\(\):\s*Promise<number\[\]>/.test(MODELL)).toBe(true);
    });

    it('das ERSTE Modell wird beim Laden nicht bewegt — nur die Basis gesetzt (gebauter Rumpf)', () => {
        const mjs = fs.readFileSync(MJS, 'utf8');
        // `if (this.baseCoordinates === null) this.baseCoordinates = t; else … object.position.add(…)`
        expect(/null===this\.baseCoordinates\)this\.baseCoordinates=/.test(mjs)).toBe(true);
        expect(/object\.position\.add\(/.test(mjs)).toBe(true);
    });
});
