/**
 * IfcAutor — die EINZIGE Stelle im Feature, die die Editor-API von
 * `@thatopen/fragments` anfasst (Stufe 9.2).
 *
 * Hausvertrag wie `IfcCamera` und `IfcSection`: ES-Klasse, ein Optionsobjekt,
 * Abhängigkeiten als Getter-Closures, `IfcEngine` behält 1:1-Delegationen. Der
 * Zweck dieser Bündelung ist handfest: dreht die Bibliothek ihre API, ist es
 * EINE Datei — und nicht zwanzig Aufrufstellen im Viewer.
 *
 * WAS DIE BIBLIOTHEK KANN (Fassung 3.3.6, nachgesehen in dist/index.d.ts):
 *   Element.getMeshes() / setMeshes()   ein Bauteil verschieben
 *   editor.createElements(...)          erzeugen
 *   editor.deleteElements(...)          löschen
 *   editor.applyChanges(...)            anwenden
 *   editor.save(modelId)                „exporting the model with the edits applied"
 *   model.getBuffer()                   bearbeitetes Modell als .frag
 *   EditUtils.newModel({raw})           ein leeres, eigenes Modell
 *
 * Der Befund aus Sprint U5 — „fragments kennt keine Per-Element-Transformation"
 * — galt der Hider/setColor-Schiene und ist überholt.
 *
 * ACHTUNG, hier stand einmal das Gegenteil: „`addPsetToElement` benutzt
 * `model.editor.edit(...)`; dieses Aufrufmuster wird hier fortgeführt." Das
 * Muster war falsch, und weil es hier empfohlen stand, wurde es kopiert. Der
 * Editor hängt am MANAGER (`fragments.core.editor`), nie am einzelnen Modell —
 * siehe `_editor()`. Wer `model.editor` schreibt, baut den Fehler nach.
 *
 * ANKER STATT VERSATZ: Die Lage eines Bauteils wird als Mitte seiner Hülle
 * geführt, absolut in Weltkoordinaten. Absolut, weil das Nachspielen
 * idempotent sein muss (siehe Nachspielen.js); Hüllenmitte, weil sie ohne
 * Annahmen über die Repräsentation aus `getBoxes` fällt. Nebenwirkung mit
 * Absicht: ändert der Planer die FORM eines Bauteils, wandert die Hüllenmitte
 * mit, und die Festlegung meldet Konflikt. Etwas übereifrig — aber auf der
 * sicheren Seite.
 *
 * PRÜFLAGE: Die reinen Teile (`ankerAusBox`, `zielVersatz`) sind hier getestet.
 * Die Editor-Aufrufe selbst brauchen ein geladenes Modell und sind es NICHT —
 * `getFragments` ist deshalb hereingereicht, damit eine Attrappe an ihre Stelle
 * treten kann.
 */

import * as THREE from 'three';
import { boxenAktuell } from './DeltaBoxen.js';
import * as FRAGS from '@thatopen/fragments';
import { BAUTEILFARBEN, farbeFuer, materialWerte } from './Bauteilfarben.js';
import { baueAusBauplan, baueMitAbleitung, geometrieAusTeil, istAbleitung, istAnzeigeform, istEigen, mengenVon, rezeptNach } from './Bauteilrezepte.js';
import { neuerAbleitungslauf } from './ableitung/Ableitungslauf.js';
import { verdraengteAnzeigen } from './ableitung/Bezuege.js';
import { verdeckteAus } from './CdeAchsen.js';

// ── Reine Helfer ────────────────────────────────────────────────────────────

/**
 * Der Anker einer Hülle: ihre Mitte, als schlichtes {x, y, z}.
 *
 * Bewusst kein `THREE.Vector3` — der Wert geht ins Journal und von dort in die
 * RepoFacade. Ein Vector3 überlebt `JSON.stringify` zwar, kommt aber als
 * nacktes Objekt zurück; dann läge dieselbe Größe in zwei Gestalten vor.
 */
export function ankerAusBox(box) {
    return huelleAusBox(box)?.anker ?? null;
}

/**
 * Anker UND Unterkante einer Hülle.
 *
 * Die Unterkante ist die Bezugshöhe, mit der im Tiefbau gearbeitet wird: die
 * Sohle eines Rohrs, die Sohle eines Schachts. Sie kommt aus der GEOMETRIE und
 * nicht aus einem Merkmal — genau das, was ein Bauteil ehrlich hergibt, ohne
 * dass jemand ein Pset gepflegt haben muss. (Bei einem Rohr mit Gefälle ist es
 * die Sohle am tiefen Ende; das ist eine Näherung und heißt deshalb
 * „Unterkante der Hülle" und nicht „Sohle".)
 */
export function huelleAusBox(box) {
    if (!box || typeof box.getCenter !== 'function') return null;
    if (typeof box.isEmpty === 'function' && box.isEmpty()) return null;
    const m = box.getCenter(new THREE.Vector3());
    return {
        anker: { x: m.x, y: m.y, z: m.z },
        unterkante: box.min?.y ?? m.y,
        oberkante: box.max?.y ?? m.y,
        // Die ganze Box (Teil XVI, S2): die Vorschau einer Lageänderung
        // zeichnet den Drahtkasten am neuen Ort — ohne zweiten Boxen-Aufruf.
        box: (box.min && box.max)
            ? { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } }
            : null,
    };
}

/** Der Weg von der jetzigen Lage zum Ziel. `null`, wenn eine Seite fehlt. */
export function zielVersatz(jetzt, ziel) {
    if (!jetzt || !ziel) return null;
    return {
        dx: (ziel.x ?? 0) - (jetzt.x ?? 0),
        dy: (ziel.y ?? 0) - (jetzt.y ?? 0),
        dz: (ziel.z ?? 0) - (jetzt.z ?? 0),
    };
}

/** Lohnt sich das Verschieben überhaupt? (Bautoleranz 0,1 mm) */
export function istNennenswert(versatz, toleranz = 1e-4) {
    if (!versatz) return false;
    return Math.abs(versatz.dx) > toleranz
        || Math.abs(versatz.dy) > toleranz
        || Math.abs(versatz.dz) > toleranz;
}

// ── Der Kanal ───────────────────────────────────────────────────────────────

export const CDE_MODELL_ID = 'cde-eigenbau';

/**
 * Ableitung → Vorgangstitel, aus den `vorgaenge`-Listen der Anzeige-Baupläne
 * (Stufe 1). Der Titel ist eine Entscheidung des Planers und steht deshalb
 * im Journal, nicht in einer Kennzahl.
 */
export function vorgangstitelAus(schritte) {
    const out = new Map();
    for (const s of schritte ?? []) {
        if (s?.wert?.rezept !== 'anzeige') continue;
        for (const v of s.wert.parameter?.vorgaenge ?? []) {
            if (v?.ableitung && v?.titel && !out.has(v.ableitung)) out.set(v.ableitung, v.titel);
        }
    }
    return out;
}

/**
 * Wo lebt dieses Bauteil — im gelieferten Modell oder im CDE-eigenen?
 *
 * Der Journaleintrag braucht die Angabe, sonst sucht das Nachspielen ein
 * erzeugtes Bauteil im falschen Modell und meldet `keine_localId`. Die
 * Fallunterscheidung stand bisher als Zeichenkette im (inzwischen
 * entfernten) Zieh-Werkzeug und fehlte
 * in den beiden Formular-Aufrufern ganz — ein Vergleich an drei Stellen ist
 * einer zu viel, und die zwei fehlenden waren der Beweis.
 */
export function modellHerkunft(modelId) {
    return modelId === CDE_MODELL_ID ? 'cde' : 'geliefert';
}

/**
 * Der Text des Modell-Chips in der Leiste (Stufe 0, D6).
 *
 * Das Eigenbau-Modell stand dort als „cde-eigenbau" wie eine gelieferte
 * Datei — mit Entladen-Knopf, der nichts Sinnvolles tun kann: es ist kein
 * Dokument, sondern das, was aus dem Journal gebaut wird. Der Chip sagt
 * jetzt, was es ist und wieviel darin steht.
 */
export function modellTagText(modell, anzahlErzeugt = 0) {
    if (modellHerkunft(modell?.modelId) !== 'cde') return modell?.name ?? '';
    const n = Number(anzahlErzeugt) || 0;
    return `Eigenbau · ${n} ${n === 1 ? 'Bauteil' : 'Bauteile'}`;
}

/**
 * Arten, die dieser Kanal auf das Modell bringen kann.
 *
 * Bewusst eine Liste und kein `default:`-Zweig: kommt eine Art dazu und
 * niemand denkt hier daran, fällt sie in `nichtAngewandt` und wird GEMELDET,
 * statt still zu verschwinden.
 */
export const ANWENDBARE_ARTEN = new Set(['lage', 'erzeugt', 'geloescht', 'pset']);

export class IfcAutor {
    /**
     * @param {object} opts
     * @param {() => object|null} opts.getFragments  liefert den FragmentsManager
     *        (OBC). Getter-Closure statt kopiertem Wert — der Manager entsteht
     *        erst mit der Welt.
     * @param {() => object|null} [opts.getWelt]  liefert die Welt (Szene und
     *        Kamera). Wird gebraucht, um das CDE-eigene Modell SICHTBAR zu
     *        machen: `core.load` legt ein Modell an, hängt es aber nicht in die
     *        Szene — `loadIfc` tut das für geliefertes Material ausdrücklich,
     *        `eigenesModell` tat es nicht. Erzeugte Bauteile entstanden
     *        dadurch fehlerfrei und blieben unsichtbar.
     */
    constructor({ getFragments, getWelt, holeQuellraster, holeQuellForm, holeQuellBauform,
                  kernel, getHoehenversatz } = {}) {
        this._getFragments = getFragments ?? (() => null);
        this._getWelt = getWelt ?? (() => null);
        /** Stufe 15: Ableitung für Rezepte mit Bedarf (Gelände-Quellraster). */
        this._holeQuellraster = holeQuellraster ?? (async () => null);
        /**
         * Teil XIV: die Kernel-Form eines GELIEFERTEN Objekts (raster, mesh …)
         * für Ableitungen, der Geometrie-Kernel selbst und der Höhenversatz,
         * an dem die NN-Grenze der Rezepte hängt. Alles Getter-Closures — der
         * Autor holt sich nichts.
         */
        this._holeQuellForm = holeQuellForm ?? (async () => null);
        // Die BAUFORM eines gelieferten Bauteils — fürs Formpaar-Gate der
        // Ableitungen. Ohne sie bleibt das Gate ungeprüft und sagt es.
        this._holeQuellBauform = holeQuellBauform ?? null;
        this._kernel = kernel ?? null;
        this._getHoehenversatz = getHoehenversatz ?? (() => 0);
        /** Kennzahlen/Befunde/Teile je Ableitung aus dem LETZTEN Aufbau — im Speicher, nie im Journal. */
        this.ableitungen = new Map();
        /**
         * Welche Merkmalssätze DIESER LAUF schon geschrieben hat (Lücke ⑧).
         *
         * `schreibeMerkmalssatz` LEGT AN — die Bibliothek kennt kein „ersetze
         * den Satz gleichen Namens". Ein Satzwechsel spielt den vollen Stand
         * erneut nach, und ohne dieses Gedächtnis stünde derselbe Satz danach
         * doppelt am Bauteil. Der Schlüssel trägt die Werte mit: derselbe
         * Inhalt wird übersprungen, ein GEÄNDERTER wird geschrieben (der alte
         * Satz bleibt bis zum nächsten Laden sichtbar — gemeldet, nicht still).
         */
        this._geschriebeneMerkmale = new Map();
    }

    /** Das geladene Modell mit dieser Id, oder null. */
    _modell(modelId) {
        const fragments = this._getFragments();
        if (!fragments?.list) return null;
        return [...fragments.list.values()].find(m => m.modelId === modelId) ?? null;
    }

    /**
     * Der Editor — er gehört dem MANAGER, nicht dem einzelnen Modell.
     *
     * Das war der Fehler, an dem die ganze Bearbeitung hing: hier stand
     * `this._modell(modelId)?.editor`. Am `FragmentsModel` gibt es diese
     * Eigenschaft nicht — die Bibliothek führt sie als
     * `private readonly _editor` und stellt keinen Getter bereit (im gebauten
     * `index.mjs` nachgesehen, nicht nur in den Typen). `undefined` also,
     * immer. Damit war `istBearbeitbar` dauerhaft false und JEDE Bearbeitung
     * endete in `kein_editor`: das Journal füllte sich, das Modell rührte sich
     * nie. Sichtbar wurde es als „Der Wert galt schon" — denn beim zweiten
     * Versuch stand der Zielwert schon im Journal, während das Bauteil
     * unverändert dastand.
     *
     * Öffentlich ist `FragmentsModels.editor`, also `fragments.core.editor`.
     * Dass der Editor für ALLE Modelle einer ist, sieht man seiner Bauart an:
     * jede seiner Methoden nimmt `modelId` als erstes Argument.
     *
     * Das Modell wird trotzdem verlangt — sonst meldete `istBearbeitbar` für
     * eine erfundene Id wahr, und der Fehler fiele erst zwei Schritte später
     * auf.
     *
     * Wirft NICHT, sondern gibt null — Bearbeiten ist eine Zusatzfähigkeit, und
     * ein Viewer ohne sie soll anzeigen können, statt abzustürzen. Die Aufrufer
     * melden es nach oben.
     */
    _editor(modelId) {
        if (!this._modell(modelId)) return null;
        return this._getFragments()?.core?.editor ?? null;
    }

    /**
     * Das Bild auffrischen, nachdem Geometrie verändert wurde.
     *
     * Jede andere Mutation im Haus tut das (`IfcEngine` ruft `core.update(true)`
     * nach Laden, Färben, Sichtbarkeit) — diese Datei tat es als einzige nicht.
     * Ohne den Aufruf steht die verschobene Haltung in den Daten, aber nicht
     * auf dem Schirm, bis irgendetwas anderes ein Neuzeichnen auslöst. Das
     * sieht genauso aus wie „hat nicht funktioniert".
     *
     * ABSICHTLICH NICHT in `erzeuge()`: die wird von `baueErzeugte` in einer
     * Schleife gerufen, und ein Neuzeichnen je Bauteil kostete bei hundert
     * Linien hundertmal. Dort steht der Aufruf einmal am Ende.
     */
    async _neuZeichnen() {
        try { await this._getFragments()?.core?.update?.(true); } catch { /* Anzeige, nicht Fachlogik */ }
    }

    /** Kann dieses Modell überhaupt bearbeitet werden? */
    istBearbeitbar(modelId) {
        return !!this._editor(modelId);
    }

    /**
     * Die Anker mehrerer Bauteile lesen.
     *
     * Wird beim Laden EINMAL gerufen, bevor irgendeine Festlegung angewandt
     * wird — das Ergebnis ist der Lieferstand und damit der feste Bezugspunkt
     * des Nachspielens. Läse man ihn später, verschöbe er sich mit jeder
     * Anwendung, und der zweite Lauf wäre ein anderer als der erste.
     *
     * @returns {Promise<Map<number, {x,y,z}>>}
     */
    async ankerVon(modelId, localIds) {
        const out = new Map();
        for (const [id, h] of await this.huellenVon(modelId, localIds)) out.set(id, h.anker);
        return out;
    }

    /** Die AKTUELLEN Boxen — Delta-Box vor Basis-Box (siehe `DeltaBoxen.js`). */
    async _boxenAktuell(modell, ids) {
        return boxenAktuell(modell, ids, (id) => this._modell(id));
    }

    /**
     * Anker, Unter- und Oberkante mehrerer Bauteile — EIN Lesevorgang.
     *
     * `ankerVon` leitet sich hieraus ab, statt die Boxen ein zweites Mal zu
     * holen. Zwei Lesewege auf dieselbe Größe wären zwei Wahrheiten, und
     * `getBoxes` ist nicht gratis.
     *
     * @returns {Promise<Map<number, {anker, unterkante, oberkante}>>}
     */
    async huellenVon(modelId, localIds) {
        const modell = this._modell(modelId);
        const ids = [...(localIds ?? [])];
        const out = new Map();
        if (!modell || !ids.length) return out;
        let boxen = null;
        try {
            boxen = await this._boxenAktuell(modell, ids);
        } catch (fehler) {
            console.warn('cde: huellen lesen', fehler?.message ?? fehler);
            return out;
        }
        for (let i = 0; i < ids.length; i++) {
            const h = huelleAusBox(boxen?.[i]);
            if (h) out.set(ids[i], h);
        }
        return out;
    }

    /** Die Bounding-Boxen (min/max in Welt) — für die Kandidatensuche der Kollisionsprüfung (G7). */
    async boxenVon(modelId, localIds) {
        const modell = this._modell(modelId);
        const ids = [...(localIds ?? [])];
        const out = new Map();
        if (!modell || !ids.length) return out;
        let boxen = null;
        try { boxen = await this._boxenAktuell(modell, ids); } catch { return out; }
        for (let i = 0; i < ids.length; i++) {
            const b = boxen?.[i];
            if (!b?.min || !b?.max || (typeof b.isEmpty === 'function' && b.isEmpty())) continue;
            out.set(ids[i], { min: { x: b.min.x, y: b.min.y, z: b.min.z }, max: { x: b.max.x, y: b.max.y, z: b.max.z } });
        }
        return out;
    }

    /**
     * Ein Bauteil so verschieben, dass sein Anker auf `ziel` liegt.
     *
     * Der Weg ist der von der Bibliothek vorgesehene: die Netze des Bauteils
     * holen, verschieben, zurückgeben, anwenden.
     *
     * @returns {Promise<{ok: boolean, grund?: string, versatz?: object}>}
     */
    async setzeAnker(modelId, localId, ziel) {
        const editor = this._editor(modelId);
        if (!editor) return { ok: false, grund: 'kein_editor' };

        const jetzt = (await this.ankerVon(modelId, [localId])).get(localId);
        if (!jetzt) return { ok: false, grund: 'bauteil_ohne_huelle' };

        const versatz = zielVersatz(jetzt, ziel);
        // Ein Zug unterhalb der Bautoleranz ist keiner. Ihn trotzdem
        // auszuführen kostet ein Neuzeichnen des Modells für nichts.
        if (!istNennenswert(versatz)) return { ok: true, versatz: null };

        try {
            const [element] = await editor.getElements(modelId, [localId]);
            if (!element) return { ok: false, grund: 'bauteil_nicht_gefunden' };

            const netze = await element.getMeshes();
            netze.position.add(new THREE.Vector3(versatz.dx, versatz.dy, versatz.dz));
            netze.updateMatrixWorld(true);
            await element.setMeshes(netze);
            await editor.applyChanges(modelId, [element]);
            await this._neuZeichnen();
            return { ok: true, versatz };
        } catch (fehler) {
            return { ok: false, grund: `editor_fehler: ${fehler?.message ?? fehler}` };
        }
    }

    /**
     * Ein leeres, CDE-eigenes Modell anlegen — dort landet alles Erzeugte.
     *
     * Getrennt vom gelieferten Modell, weil damit die HERKUNFT strukturell
     * wird: was hier liegt, ist in der CDE entstanden; das gelieferte IFC
     * bleibt Bit für Bit unberührt. Fragments zeichnet ohnehin N Modelle —
     * es entsteht KEIN zweiter Renderpfad.
     */
    async eigenesModell(modelId = CDE_MODELL_ID) {
        const fragments = this._getFragments();
        const kern = fragments?.core ?? null;
        if (!kern?.load) return { ok: false, grund: 'kein_fragments_kern' };
        if (this._modell(modelId)) return { ok: true, modelId, neu: false };
        try {
            const puffer = FRAGS.EditUtils.newModel({ raw: true });
            const modell = await kern.load(puffer, { modelId, raw: true });
            // SICHTBAR MACHEN. Dieselben drei Handgriffe wie in `loadIfc`:
            // in die Szene hängen, an die Kamera binden (sonst greifen
            // Sichtbarkeitsprüfung und Detailstufe nicht), und ein Bild
            // anfordern. Ohne den ersten entsteht das Bauteil fehlerfrei und
            // ist trotzdem nicht da — der teuerste aller Fälle, weil nichts
            // auf einen Fehler hindeutet.
            const welt = this._getWelt();
            if (modell?.object && welt?.scene?.three) {
                welt.scene.three.add(modell.object);
                if (welt.camera?.three && modell.useCamera) modell.useCamera(welt.camera.three);
            }
            // Wie geliefertes Material: volle Geometrie unabhängig vom Abstand.
            // Ohne das entscheidet die Detailstufe, ob eine gezeichnete Linie
            // zu sehen ist — bei einer Handvoll Bauteilen kostet es nichts.
            try { await modell?.setLodMode?.(FRAGS.LodMode.ALL_VISIBLE); } catch { /* Anzeige */ }
            return { ok: true, modelId, neu: true };
        } catch (fehler) {
            return { ok: false, grund: `anlegen_fehlgeschlagen: ${fehler?.message ?? fehler}` };
        }
    }

    /**
     * WELT → MODELLRAHMEN: die eine Umrechnung an der Editor-Grenze.
     *
     * DER BEFUND (2026-09-09, am Browser gemessen). Die CDE baut ihre
     * Geometrie durchgehend in WELTKOORDINATEN — der Lageplan, die Griffe,
     * das Fachmodell und jedes Rezept rechnen darin. Die Bibliothek legt auf
     * alles, was durch den Editor geht, ihren Koordinationspunkt obendrauf:
     * `core.baseCoordinates`, gesetzt beim ersten geladenen Modell. Gemessen
     * am ENQUIER-Netz mit dem Test-Erdkörper:
     *
     *     Ur-Gelände (Welt)      -216 /  -26 /    -15
     *     erzeugtes DGM      -2577744 / -341 / 5465698
     *     Differenz          -2577528 / -315 / 5465713  ==  baseCoordinates
     *
     * Jedes erzeugte Bauteil lag also 2,5 Millionen Meter neben der Szene.
     * Es war fehlerfrei da — auffindbar, auswählbar, mit Hülle und Griffen —
     * nur eben nicht im Bild. Aufgefallen ist es nie, weil alles, was die CDE
     * über eigene Bauteile WEISS, aus dem Bauplan kommt (Journal, Lageplan,
     * Massen, Griffe) und damit richtig lag; falsch war allein, was die
     * Bibliothek daraus zeichnet.
     *
     * Die Umrechnung gehört an GENAU DIESE Grenze und nirgends sonst: die
     * Rezepte bleiben rein und weltbezogen, und wer eine zweite Stelle
     * einführt, hat wieder zwei Wahrheiten (Gesetz 7).
     *
     * @returns {THREE.Matrix4} Verschiebung um −baseCoordinates (Einheit, wenn
     *   die Bibliothek keinen Koordinationspunkt führt)
     */
    _weltNachModell() {
        const base = this._getFragments()?.core?.baseCoordinates ?? null;
        if (!Array.isArray(base) || base.length < 3) return new THREE.Matrix4();
        const [x, y, z] = base;
        if (![x, y, z].every(Number.isFinite)) return new THREE.Matrix4();
        return new THREE.Matrix4().makeTranslation(-x, -y, -z);
    }

    /**
     * Das Material zu einem IFC-Typ — aus dem Farbkatalog (`Bauteilfarben`).
     *
     * Kennt der Katalog den Typ nicht, bleibt es beim Standard der
     * Bibliothek: lieber neutral als eine erfundene Farbe.
     *
     * `depthWrite` fällt bei durchscheinendem Material weg — sonst
     * verdeckt der Aushubkörper das Rohr in seinem Inneren, obwohl man
     * hindurchsieht; das ist der klassische Fehler bei transparenten
     * Volumen und genau der Fall, für den er gebaut ist.
     */
    _materialFuer(kategorie) {
        const werte = materialWerte(farbeFuer(kategorie, this._farbsatz ?? BAUTEILFARBEN));
        if (!werte) return new THREE.MeshLambertMaterial();
        return new THREE.MeshLambertMaterial({
            color: werte.color,
            opacity: werte.opacity,
            transparent: werte.transparent,
            depthWrite: !werte.transparent,
        });
    }

    /** Einen eigenen Farbsatz setzen (Büro-Ebene, Vorrang vor dem eingebauten). */
    setzeFarbsatz(satz) { this._farbsatz = satz ?? null; }

    /**
     * Ein Bauteil erzeugen.
     *
     * @param {object} bauteil { kategorie, name?, geometrie: THREE.BufferGeometry,
     *                           platzierung?: THREE.Matrix4, material? }
     */
    async erzeuge(modelId, bauteil) {
        const editor = this._editor(modelId);
        if (!editor) return { ok: false, grund: 'kein_editor' };
        if (!bauteil?.geometrie) return { ok: false, grund: 'ohne_geometrie' };
        try {
            const elemente = await editor.createElements(modelId, [{
                // DIE FORM STAMMT AUS DER BIBLIOTHEK, nicht aus der Anschauung.
                // `itemDataToRawItemData` liest `_category` und wirft sonst
                // „Category is required"; alles ohne führenden Unterstrich wird
                // zum Attribut. Hier stand `{ category, data: {...} }` — die
                // Form eines `edit`-Auftrags, nicht die eines neuen Bauteils.
                // Der Aufruf warf damit JEDES Mal, der try/catch fing es ab,
                // und Zeichnen ergab nie etwas. Festgehalten in
                // `test/fragmentsVertrag.test.js`.
                //
                // `_guid` ist der Grund, warum ein erzeugtes Bauteil hinterher
                // auffindbar ist: die CDE vergibt eine eigene GlobalId, und die
                // landet damit im GUID-Index der Bibliothek — derselbe Weg wie
                // bei geliefertem Material, kein Sonderfall.
                attributes: {
                    _category: { value: bauteil.kategorie ?? 'IFCBUILDINGELEMENTPROXY' },
                    ...(bauteil.globalId ? { _guid: { value: bauteil.globalId } } : {}),
                    Name: { value: bauteil.name ?? '' },
                    // Der PredefinedType (TRENCH, TERRAIN …) steht als gewöhnliches
                    // Attribut — alles ohne Unterstrich übernimmt fragments.
                    ...(bauteil.predefinedType ? { PredefinedType: { value: bauteil.predefinedType } } : {}),
                },
                // Die Platzierung des Aufrufers WELTBEZOGEN, danach in den
                // Modellrahmen gehoben (`_weltNachModell`). Reihenfolge zählt:
                // erst platzieren, dann umrechnen.
                globalTransform: this._weltNachModell()
                    .multiply(bauteil.platzierung ?? new THREE.Matrix4()),
                samples: [{
                    localTransform: new THREE.Matrix4(),
                    representation: bauteil.geometrie,
                    // DIE FARBE GEHÖRT DEM BAUTEIL, nicht der Ansicht.
                    //
                    // Sie kommt hier ins Material und damit in die
                    // Fragmentdatei — ein Aushub ist also auch nach dem
                    // Export braun und durchscheinend, und niemand muss eine
                    // Einfärbung nachziehen. Ein Aufrufer, der ein eigenes
                    // Material mitbringt, behält es (`bauteil.material`).
                    material: bauteil.material ?? this._materialFuer(bauteil.kategorie),
                }],
            }]);
            const element = elemente?.[0] ?? null;
            if (!element) return { ok: false, grund: 'nichts_erzeugt' };
            await editor.applyChanges(modelId, [element]);
            return { ok: true, localId: element.localId };
        } catch (fehler) {
            return { ok: false, grund: `editor_fehler: ${fehler?.message ?? fehler}` };
        }
    }

    /** Ein Bauteil löschen. */
    async loesche(modelId, localId) {
        const editor = this._editor(modelId);
        if (!editor) return { ok: false, grund: 'kein_editor' };
        try {
            const elemente = await editor.getElements(modelId, [localId]);
            if (!elemente?.length) return { ok: false, grund: 'bauteil_nicht_gefunden' };
            editor.deleteElements(modelId, elemente);
            await editor.applyChanges(modelId);
            await this._neuZeichnen();
            return { ok: true };
        } catch (fehler) {
            return { ok: false, grund: `editor_fehler: ${fehler?.message ?? fehler}` };
        }
    }

    /**
     * Das bearbeitete Modell als .frag-Puffer — der Ausgang ins Dokumentregister.
     */
    async alsPuffer(modelId) {
        const modell = this._modell(modelId);
        if (!modell?.getBuffer) return null;
        try {
            return await modell.getBuffer(false);
        } catch (fehler) {
            console.warn('cde: puffer holen', fehler?.message ?? fehler);
            return null;
        }
    }

    /**
     * Das CDE-eigene Modell wegwerfen.
     *
     * Wird vor JEDEM Aufbau gerufen — siehe `baueErzeugte`. Ein Modell, das
     * nicht da ist, ist kein Fehler: der erste Aufbau eines Auftrags findet
     * nichts vor.
     */
    async verwirfEigenesModell(modelId = CDE_MODELL_ID) {
        const kern = this._getFragments()?.core ?? null;
        const modell = this._modell(modelId);
        if (!kern?.disposeModel || !modell) return false;
        try {
            // Erst aus der Szene nehmen, dann entsorgen — sonst bliebe ein
            // Objekt in der Szene, dessen Modell es nicht mehr gibt. Dieselbe
            // Fehlerklasse wie der Szenen-Rest beim Ziehen-Griff (a499dbb).
            const welt = this._getWelt();
            if (modell.object && welt?.scene?.three) welt.scene.three.remove(modell.object);
            await kern.disposeModel(modelId);
            return true;
        } catch (fehler) {
            console.warn('cde: eigenes modell verwerfen', fehler?.message ?? fehler);
            return false;
        }
    }

    /**
     * Das CDE-eigene Modell aus Bauplänen NEU AUFBAUEN (Stufe 9.4).
     *
     * Neu aufbauen, nicht fortschreiben — und das ist die ganze Pointe. Ein
     * Rohr, das in „Variante Nord" angelegt wurde, darf in „Süd" nicht im Raum
     * stehen; das CDE-Modell ist aber EINES. Würde es fortgeschrieben, müsste
     * beim Satzwechsel gezielt gelöscht werden, und jede vergessene Löschung
     * hinterliesse ein Bauteil, das zu keiner Variante gehört.
     *
     * Stattdessen: verwerfen, dann aus dem Journal des aktiven Satzes neu
     * bauen. Damit entscheidet der Satz allein durch seinen Journalinhalt, was
     * dasteht — und der Aufbau ist idempotent, dieselbe Eigenschaft, auf der
     * schon das Nachspielen ruht.
     *
     * DIE LEERE LISTE IST EIN FALL, KEIN NICHTSTUN: ein Satz ohne erzeugte
     * Bauteile muss das Modell LEEREN, sonst blieben die des vorigen Satzes
     * stehen. Deshalb wird auch dann verworfen.
     *
     * @param {Array<{globalId, wert}>} schritte  aus `planeNachspielen`
     * @returns {Promise<{karte: Map<string, number>, misserfolge: Array}>}
     *   `karte` ist globalId → localId der frisch gebauten Bauteile. Ohne sie
     *   fände ein `lage`-Eintrag auf ein erzeugtes Bauteil sein Ziel nicht:
     *   die localId entsteht erst hier und steht in keiner Zuordnung des
     *   gelieferten Modells.
     */
    /** EIN Ableitungslauf je Durchgang (Teil XIV) — für den Raum wie für den Export. */
    _neuerLauf(schritte, historie = null) {
        const stand = new Map((schritte ?? []).map(s => [s.globalId, s.wert]));
        return neuerAbleitungslauf({
            // `historie` nur für die Kette zum Ur (Fahrplan Erdbau-Container, Stufe 1).
            stand, rezeptNach, historie,
            holeQuellForm: this._holeQuellForm,
            holeQuellBauform: this._holeQuellBauform,
            kernel: this._kernel,
            hoehenversatz: this._getHoehenversatz() ?? 0,
        });
    }

    /**
     * EINEN Journalschritt bauen — Geometrie in WELTkoordinaten, noch ohne Editor.
     *
     * Der eine Weg für `baueErzeugte` (Raum) und `eigenbauGeometrien`
     * (IFC-Export). Zwei Wege zur selben Geometrie liefen auseinander, und dann
     * zeigte die CDE etwas anderes, als sie exportiert (Gesetz 7).
     *
     * @returns {{ok: true, geometrie, kategorie, name, predefinedType, geschlossen}
     *          | {ok: false, fehler: string[], leer?: true}}
     */
    async _baueSchritt(lauf, schritt) {
        const rezept = rezeptNach(schritt.wert?.rezept);
        if (istAbleitung(rezept)) {
            const r = await lauf.baue(schritt.globalId);
            if (!r.ok) return { ok: false, fehler: r.fehler };
            if (r.leer) return { ok: false, leer: true, fehler: [] };
            const geometrie = geometrieAusTeil(r.teil);
            if (!geometrie) return { ok: false, fehler: ['Teil ohne Geometrie'] };
            return {
                ok: true, geometrie, kategorie: schritt.wert.kategorie, name: schritt.wert.name,
                predefinedType: schritt.wert.predefinedType ?? null,
                // Ein Raster ist eine OFFENE Fläche; ein Körper sagt es selbst
                // (das meshVolume-Attest aus dem Kernel), statt dass wir raten.
                geschlossen: r.teil?.form === 'raster' ? false : (r.teil?.daten?.closed ?? null),
            };
        }
        const gebaut = rezept?.braucht === 'quellraster'
            ? await baueMitAbleitung(schritt.wert ?? {}, this._holeQuellraster)
            : baueAusBauplan(schritt.wert ?? {});
        if (!gebaut.ok) return gebaut;
        return {
            ...gebaut,
            predefinedType: gebaut.predefinedType ?? schritt.wert?.predefinedType ?? null,
            // Rohr und Schacht sind Sweeps MIT Kappen, Linie und Fläche sind
            // flach, ein Höhenfeld ist offen.
            geschlossen: ({ koerper: true, 'achse+profil': true, linie: false, flaeche: false, hoehenfeld: false })[
                rezept?.bauform] ?? null,
        };
    }

    /**
     * Die Geometrie jedes erzeugten Bauteils — für den IFC-Export, OHNE den
     * Raum anzufassen.
     *
     * NEU GERECHNET, NICHT GESPEICHERT (Gesetz 5): der Export baut dieselben
     * Baupläne auf demselben Weg wie der Raum (`_baueSchritt`). Die Geometrie
     * aus dem fragments-Modell zu holen, wäre der schlechtere Weg — dort liegt
     * sie seit `_weltNachModell` im MODELLRAHMEN, nicht in der Welt.
     *
     * ANZEIGEFORMEN (Stufe 1) kommen NICHT mit: die geformte Fläche ist kein
     * Bauteil — in IFC ist der Aushub ein `IfcEarthworksCut` am Ur-Gelände,
     * ein zweites TERRAIN wäre eine Dopplung. Sie stehen in `anzeigeformen`.
     * Jedes Bauteil einer Ableitung trägt die KENNZAHLEN seines Aufbaus, die
     * MENGEN, die das Rezept daraus deklariert (Paket v2 → Qto), und — wenn
     * es ein Erdbau-Vorgang ist — seinen VORGANG (Klammer, Art, Reihe im
     * Stapel, Titel aus der Anzeige) samt der Füllungen früherer Vorgänge,
     * durch die sein Cut schneidet.
     *
     * @returns {Promise<{bauteile: Array<{globalId, wert, positionen, index, kategorie,
     *           name, predefinedType, geschlossen, kennzahlen, mengen, fachmodell,
     *           vorgang, schneidetAuffuellung}>, misserfolge, leer, verborgen, anzeigeformen}>}
     */
    async eigenbauGeometrien(schritte, { verdeckt = new Set(), historie = null } = {}) {
        const lauf = this._neuerLauf(schritte, historie);
        const bauteile = [], misserfolge = [], leer = [], verborgen = [], anzeigeformen = [];
        const titel = vorgangstitelAus(schritte);
        for (const schritt of schritte ?? []) {
            if (verdeckt.has(schritt.globalId)) { verborgen.push(schritt.globalId); continue; }
            if (istAnzeigeform(schritt.wert)) { anzeigeformen.push(schritt.globalId); continue; }
            const g = await this._baueSchritt(lauf, schritt);
            if (g.leer) { leer.push(schritt.globalId); continue; }
            if (!g.ok) { misserfolge.push({ globalId: schritt.globalId, grund: (g.fehler ?? []).join(' · ') }); continue; }
            const pos = g.geometrie.getAttribute('position');
            const ableitung = schritt.wert?.ableitung ?? null;
            const a = ableitung ? (lauf.ableitungen.get(ableitung) ?? null) : null;
            // Ein ERDBAU-Vorgang (das Rezept sagt es) wird im IFC eine
            // Vorgangsgruppe im Fachmodell „Erdbau"; alles andere — auch eine
            // Aussparung, obwohl sie eine Ableitung ist — bleibt Eigenbau.
            const erdbau = !!rezeptNach(schritt.wert?.rezept)?.erdbau;
            bauteile.push({
                globalId: schritt.globalId, wert: schritt.wert,
                positionen: pos.array, index: g.geometrie.index?.array ?? null,
                kategorie: g.kategorie, name: g.name, predefinedType: g.predefinedType ?? null,
                geschlossen: g.geschlossen ?? null,
                kennzahlen: a?.kennzahlen ?? null,
                mengen: mengenVon(schritt.wert, a?.kennzahlen),
                fachmodell: erdbau ? 'erdbau' : 'cde',
                vorgang: erdbau && ableitung ? { ableitung, art: schritt.wert?.rezept ?? null,
                                                 reihe: a?.kennzahlen?.reihe ?? null, titel: titel.get(ableitung) ?? null } : null,
                schneidetAuffuellung: [],
            });
            g.geometrie.dispose?.();
        }
        // DURCH WELCHE FÜLLUNG schneidet ein Cut? Der Lauf nennt VORGÄNGE; ins
        // Paket gehören deren Füllungen — und nur die, die auch exportiert
        // werden (eine leere oder verborgene Füllung ist kein Bauteil).
        const fuellungen = new Map();
        for (const b of bauteile) {
            if (b.kategorie !== 'IFCEARTHWORKSFILL' || !b.vorgang) continue;
            if (!fuellungen.has(b.vorgang.ableitung)) fuellungen.set(b.vorgang.ableitung, []);
            fuellungen.get(b.vorgang.ableitung).push(b.globalId);
        }
        for (const b of bauteile) {
            if (b.kategorie !== 'IFCEARTHWORKSCUT') continue;
            b.schneidetAuffuellung = (b.kennzahlen?.schneidetAuffuellung ?? []).flatMap(id => fuellungen.get(id) ?? []);
        }
        return { bauteile, misserfolge, leer, verborgen, anzeigeformen };
    }

    async baueErzeugte(schritte, modelId = CDE_MODELL_ID, { verdeckt = new Set(), historie = null } = {}) {
        const karte = new Map();
        const misserfolge = [];
        await this.verwirfEigenesModell(modelId);
        if (!schritte?.length) { this.ableitungen = new Map(); return { karte, misserfolge, ableitungen: new Map(), leer: [], verborgen: [], verdraengt: [] }; }

        const angelegt = await this.eigenesModell(modelId);
        if (!angelegt.ok) {
            return { karte, misserfolge: schritte.map(s => ({ ...s, grund: angelegt.grund })) };
        }

        // EIN Ableitungslauf für den ganzen Aufbau (Teil XIV): Quellen lösen
        // sich lazy auf, `leite` läuft einmal je Ableitung, der Cache stirbt
        // mit diesem Durchlauf.
        const lauf = this._neuerLauf(schritte, historie);
        const leer = [];
        const verborgen = [];
        // EINE ANZEIGE JE GELÄNDE (Fahrplan Erdbau-Container, Stufe 1): wird eine
        // zweite über die Historie wieder ableitbar, stünde sie deckungsgleich
        // neben der wirksamen im Raum. Sie wird nicht gebaut — und genannt.
        const verdraengtVon = verdraengteAnzeigen(new Map(schritte.map(s => [s.globalId, s.wert])), { rezeptNach, historie });
        const verdraengt = [];

        for (const schritt of schritte) {
            if (verdraengtVon.has(schritt.globalId)) { verdraengt.push(schritt.globalId); continue; }
            // VERBORGEN, nicht gebaut (G6): ein eigenes DGM, das Quelle eines
            // Kanalgrabens wurde, bleibt im Stand — der Lauf löst seine Form
            // auf, sobald der Graben sie braucht —, kommt aber nicht in den
            // Raum. `geloescht` heisst bei Eigenem also „nicht zeigen", bei
            // Geliefertem „ausblenden" — beides ohne Löschen.
            if (verdeckt.has(schritt.globalId)) { verborgen.push(schritt.globalId); continue; }
            // Der Bauplan steht im Journal, die Geometrie entsteht hier. Ein
            // Netz ins Journal zu legen, hätte genau diesen Neuaufbau unmöglich
            // gemacht — siehe Kopf von Bauteilrezepte.js.
            const gebaut = await this._baueSchritt(lauf, schritt);
            // Ein leeres Teil (kein Auftrag beim reinen Gerinne) ist kein
            // Fehler: es entsteht kein Bauteil, die Kennzahl sagt null.
            if (gebaut.leer) { leer.push(schritt.globalId); continue; }
            if (!gebaut.ok) {
                misserfolge.push({ ...schritt, grund: gebaut.fehler.join(' · ') });
                continue;
            }
            const r = await this.erzeuge(modelId, {
                kategorie: gebaut.kategorie, name: gebaut.name, geometrie: gebaut.geometrie,
                predefinedType: gebaut.predefinedType ?? null,
                // Die im Journal vergebene Kennung mitgeben — dann findet auch
                // `getLocalIdsByGuids` das erzeugte Bauteil, nicht nur die
                // Karte aus diesem einen Lauf.
                globalId: schritt.globalId,
            });
            if (r.ok) karte.set(schritt.globalId, r.localId);
            else misserfolge.push({ ...schritt, grund: r.grund });
        }
        this.ableitungen = lauf.ableitungen;
        await this._neuZeichnen();
        return { karte, misserfolge, ableitungen: lauf.ableitungen, leer, verborgen, verdraengt };
    }

    /**
     * Einen Merkmalssatz an ein Bauteil schreiben (Lücke ⑧, 2026-09-02).
     *
     * HIERHER gezogen aus `IfcEngine.addPsetToElement` — der Autorenkanal ist
     * die einzige Stelle, die den Editor anfasst, und der Merkmals-Schreiber
     * war der letzte, der daneben lebte. Er hing außerdem an der AUSWAHL
     * (`_selectedItems`) und war damit fürs Nachspielen unbrauchbar: nach F5
     * ist nichts ausgewählt.
     *
     * @param {string} modelId
     * @param {number} localId
     * @param {string} psetName
     * @param {Array<{name, value}>} props
     * @returns {Promise<{ok: boolean, grund?: string}>}
     */
    async schreibeMerkmalssatz(modelId, localId, psetName, props = []) {
        const editor = this._editor(modelId);
        if (!editor) return { ok: false, grund: 'kein_editor' };

        const schluessel = `${modelId}|${localId}|${psetName}`;
        const inhalt = JSON.stringify(props);
        if (this._geschriebeneMerkmale.get(schluessel) === inhalt) {
            return { ok: true, grund: 'galt_schon' };
        }

        // Die Auftragsart aus der AUFZÄHLUNG der Bibliothek, nicht als Zahl —
        // eine handgeschriebene 6 hieß hier einmal „UPDATE_ITEM" und war in
        // Wirklichkeit `CREATE_RELATION`.
        const NEUES_OBJEKT = FRAGS.EditRequestType.CREATE_ITEM;
        const propIds = await editor.edit(modelId, props.map(p => ({
            type: NEUES_OBJEKT,
            data: {
                category: 'IFCPROPERTYSINGLEVALUE',
                data: { Name: { value: p.name }, NominalValue: { value: p.value ?? '' } },
            },
        })));
        const [psetId] = await editor.edit(modelId, [{
            type: NEUES_OBJEKT,
            data: { category: 'IFCPROPERTYSET', data: { Name: { value: psetName } } },
        }]);
        // Beziehungen über `relate`, nicht über selbstgebaute Aufträge:
        // `HasProperties` und `IsDefinedBy` SIND Beziehungen.
        await editor.relate(modelId, psetId, 'HasProperties', propIds);
        await editor.relate(modelId, localId, 'IsDefinedBy', [psetId]);
        await editor.applyChanges(modelId);
        this._geschriebeneMerkmale.set(schluessel, inhalt);
        return { ok: true };
    }

    /**
     * Einen Plan aus `planeNachspielen` anwenden.
     *
     * Gibt zurück, was NICHT ging — still scheitern wäre hier besonders
     * schlimm: der Nutzer sähe ein Modell, das seine Festlegungen scheinbar
     * verloren hat, ohne dass irgendwo stünde, warum.
     *
     * REIHENFOLGE: erst erzeugen, dann verschieben. Ein `lage`-Eintrag auf ein
     * erzeugtes Bauteil braucht dessen localId, und die entsteht erst beim
     * Bauen. Andersherum liefe die Verschiebung ins Leere und meldete
     * „keine_localId" für etwas, das eine Zeile später existiert.
     */
    async wendeAn(plan, { globalIdZuLocalId, historie = null } = {}) {
        const misserfolge = [];
        const schritte = plan?.anzuwenden ?? [];

        // NUR neu aufbauen, wenn es dabei um Erzeugtes geht.
        //
        // `baueErzeugte` ist mit Absicht TOTAL: sie verwirft das CDE-Modell und
        // baut genau das, was sie bekommt — darauf ruht die Idempotenz des
        // Nachspielens. Genau deshalb darf sie nicht bei jedem Aufruf laufen:
        // ein Ein-Schritt-Plan aus `planFuerEintrag` (eine Bezugshöhe etwa)
        // trägt keinen `erzeugt`-Schritt, und der Neuaufbau räumte dann alles
        // Gezeichnete aus dem Raum. Wer eine Höhe setzte, verlor seine Linien.
        //
        // Die Unterscheidung wird ANGESAGT, nicht erraten: `planeNachspielen`
        // setzt `vollstaendig`, weil es den ganzen Stand kennt und Erzeugtes
        // auch dann abräumen muss, wenn nichts mehr übrig ist.
        const erzeugtSchritte = schritte.filter(s => s.art === 'erzeugt');
        // Eigene Bauteile, die der Stand als `geloescht` führt, werden gebaut
        // aber nicht gezeigt (G6, siehe baueErzeugte). Die Faltung „verdeckt"
        // lebt in CdeAchsen — hier stand bis Stufe 0 eine zweite, die auf
        // `modell === 'cde'` bestand und ein eigenes DGM ohne die Angabe
        // sichtbar liess.
        const verdeckt = verdeckteAus(schritte, { nur: 'cde' });
        let erzeugte = new Map();
        if (plan?.vollstaendig || erzeugtSchritte.length) {
            const gebaut = await this.baueErzeugte(erzeugtSchritte, CDE_MODELL_ID, { verdeckt, historie });
            erzeugte = gebaut.karte;
            misserfolge.push(...gebaut.misserfolge);
        }

        // Was diese Datei AUF DAS MODELL bringen kann. Alles andere ist keine
        // Panne, aber es darf auch nicht als „angewandt" mitgezählt werden —
        // sonst meldete der Ladevorgang Erfolg für eine Festlegung, die
        // nirgends zu sehen ist. `parametrik` ist der Regelfall: eine
        // Querschnittsgröße ist eine FORDERUNG an den Planer (ISO 19650), kein
        // Eingriff ins Autorenmodell.
        const nichtAngewandt = schritte.filter(s => !ANWENDBARE_ARTEN.has(s.art));

        // GELÖSCHT HEISST AUSGEBLENDET, nicht entfernt (Stufe 14.3).
        //
        // Drei Gründe, und der dritte allein genügt:
        //  1. Das gelieferte Modell gehört dem Planer. „Weg damit" ist eine
        //     Forderung an ihn, kein Eingriff.
        //  2. Der Ausgang der CDE ist ein Änderungsbericht, ein DXF oder ein
        //     `.frag` — nirgends wird die IFC zurückgeschrieben.
        //  3. `editor.deleteElements` ist NICHT zurücknehmbar. Die Rücknahme
        //     müsste das Bauteil aus dem Nichts neu bauen; ausgeblendet
        //     einblenden kann sie dagegen jederzeit.
        //
        // Erzeugtes braucht das gar nicht: es fällt beim Neuaufbau einfach aus
        // dem Stand heraus.
        const auszublenden = [];
        const einzublenden = [];
        for (const schritt of schritte) {
            // `istEigen` statt `modell === 'cde'`: ein Plan aus einem Journal von
            // vor Stufe 0 traegt an eigenen Teilen keine Aussage — und lief hier
            // in `keine_localId`, weil er im gelieferten Modell gesucht wurde.
            if (schritt.art !== 'geloescht' || istEigen(schritt)) continue;
            const localId = globalIdZuLocalId?.get(schritt.globalId);
            if (localId === undefined) {
                misserfolge.push({ ...schritt, grund: 'keine_localId' });
                continue;
            }
            // `wert` null heisst „Rücknahme" — dann wieder zeigen.
            (schritt.wert ? auszublenden : einzublenden)
                .push({ modelId: plan.modelId, localId });
        }

        for (const schritt of schritte) {
            if (schritt.art !== 'lage') continue;
            const ausCde = istEigen(schritt);
            // Erst im Ergebnis DIESES Laufs nachsehen, dann in der Karte.
            //
            // Die Karte kennt erzeugte Bauteile inzwischen ebenfalls: sie
            // tragen ihre CDE-Kennung als `_guid` ins Modell, und
            // `getLocalIdsByGuids` findet sie damit wie geliefertes Material.
            // Ohne diesen Rückfall scheiterte eine Höhenfestlegung auf ein
            // selbst gezeichnetes Bauteil immer — die localId stand nur in der
            // Karte des Erzeugungslaufs, und der läuft bei einem
            // Ein-Schritt-Plan gar nicht.
            const localId = (ausCde ? erzeugte.get(schritt.globalId) : undefined)
                ?? globalIdZuLocalId?.get(schritt.globalId);
            if (localId === undefined) {
                misserfolge.push({ ...schritt, grund: 'keine_localId' });
                continue;
            }
            const r = await this.setzeAnker(ausCde ? CDE_MODELL_ID : plan.modelId, localId, schritt.wert);
            if (!r.ok) misserfolge.push({ ...schritt, grund: r.grund });
        }

        // MERKMALSSÄTZE (Lücke ⑧). Der Wert ist eine KARTE Name → Felder —
        // absolute Zielzustände wie überall: jeder Eintrag trägt ALLE von der
        // CDE gesetzten Sätze dieses Bauteils, die Faltung bleibt „letzter
        // gewinnt". Eine Rücknahme (wert null) kann das Modell nicht leeren —
        // die Bibliothek kennt kein Entfernen; der nächste Ladevorgang zeigt
        // den Stand ohne den Satz. Gemeldet statt angewandt, nie still.
        for (const schritt of schritte) {
            if (schritt.art !== 'pset') continue;
            if (!schritt.wert || typeof schritt.wert !== 'object') {
                nichtAngewandt.push(schritt);
                continue;
            }
            const ausCde = istEigen(schritt);
            const localId = (ausCde ? erzeugte.get(schritt.globalId) : undefined)
                ?? globalIdZuLocalId?.get(schritt.globalId);
            if (localId === undefined) {
                misserfolge.push({ ...schritt, grund: 'keine_localId' });
                continue;
            }
            for (const [name, props] of Object.entries(schritt.wert)) {
                const r = await this.schreibeMerkmalssatz(
                    ausCde ? CDE_MODELL_ID : plan.modelId, localId, name, props);
                if (!r.ok) misserfolge.push({ ...schritt, grund: r.grund });
            }
        }
        return { misserfolge, erzeugte, nichtAngewandt, auszublenden, einzublenden };
    }
}
