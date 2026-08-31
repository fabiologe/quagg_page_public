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
 * — galt der Hider/setColor-Schiene und ist überholt. `addPsetToElement` in
 * `IfcEngine` benutzt `model.editor.edit(...)` im Haus bereits; dieses
 * Aufrufmuster wird hier fortgeführt.
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
import * as FRAGS from '@thatopen/fragments';
import { baueAusBauplan } from './Bauteilrezepte.js';

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
 * Arten, die dieser Kanal auf das Modell bringen kann.
 *
 * Bewusst eine Liste und kein `default:`-Zweig: kommt eine Art dazu und
 * niemand denkt hier daran, fällt sie in `nichtAngewandt` und wird GEMELDET,
 * statt still zu verschwinden.
 */
export const ANWENDBARE_ARTEN = new Set(['lage', 'erzeugt']);

export class IfcAutor {
    /**
     * @param {object} opts
     * @param {() => object|null} opts.getFragments  liefert den FragmentsManager
     *        (OBC). Getter-Closure statt kopiertem Wert — der Manager entsteht
     *        erst mit der Welt.
     */
    constructor({ getFragments } = {}) {
        this._getFragments = getFragments ?? (() => null);
    }

    /** Das geladene Modell mit dieser Id, oder null. */
    _modell(modelId) {
        const fragments = this._getFragments();
        if (!fragments?.list) return null;
        return [...fragments.list.values()].find(m => m.modelId === modelId) ?? null;
    }

    /**
     * Der Editor eines Modells.
     *
     * Wirft NICHT, sondern gibt null — Bearbeiten ist eine Zusatzfähigkeit, und
     * ein Viewer ohne sie soll anzeigen können, statt abzustürzen. Die Aufrufer
     * melden es nach oben.
     */
    _editor(modelId) {
        return this._modell(modelId)?.editor ?? null;
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
            boxen = await modell.getBoxes(ids);
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
            await kern.load(puffer, { modelId, raw: true });
            return { ok: true, modelId, neu: true };
        } catch (fehler) {
            return { ok: false, grund: `anlegen_fehlgeschlagen: ${fehler?.message ?? fehler}` };
        }
    }

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
                attributes: {
                    category: bauteil.kategorie ?? 'IFCBUILDINGELEMENTPROXY',
                    data: { Name: { value: bauteil.name ?? '' } },
                },
                globalTransform: bauteil.platzierung ?? new THREE.Matrix4(),
                samples: [{
                    localTransform: new THREE.Matrix4(),
                    representation: bauteil.geometrie,
                    material: bauteil.material ?? new THREE.MeshLambertMaterial(),
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
        if (!kern?.disposeModel || !this._modell(modelId)) return false;
        try {
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
    async baueErzeugte(schritte, modelId = CDE_MODELL_ID) {
        const karte = new Map();
        const misserfolge = [];
        await this.verwirfEigenesModell(modelId);
        if (!schritte?.length) return { karte, misserfolge };

        const angelegt = await this.eigenesModell(modelId);
        if (!angelegt.ok) {
            return { karte, misserfolge: schritte.map(s => ({ ...s, grund: angelegt.grund })) };
        }

        for (const schritt of schritte) {
            // Der Bauplan steht im Journal, die Geometrie entsteht hier. Ein
            // Netz ins Journal zu legen, hätte genau diesen Neuaufbau unmöglich
            // gemacht — siehe Kopf von Bauteilrezepte.js.
            const gebaut = baueAusBauplan(schritt.wert ?? {});
            if (!gebaut.ok) {
                misserfolge.push({ ...schritt, grund: gebaut.fehler.join(' · ') });
                continue;
            }
            const r = await this.erzeuge(modelId, {
                kategorie: gebaut.kategorie, name: gebaut.name, geometrie: gebaut.geometrie,
            });
            if (r.ok) karte.set(schritt.globalId, r.localId);
            else misserfolge.push({ ...schritt, grund: r.grund });
        }
        return { karte, misserfolge };
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
    async wendeAn(plan, { globalIdZuLocalId } = {}) {
        const misserfolge = [];
        const schritte = plan?.anzuwenden ?? [];

        const { karte: erzeugte, misserfolge: bauFehler } = await this.baueErzeugte(
            schritte.filter(s => s.art === 'erzeugt'),
        );
        misserfolge.push(...bauFehler);

        // Was diese Datei AUF DAS MODELL bringen kann. Alles andere ist keine
        // Panne, aber es darf auch nicht als „angewandt" mitgezählt werden —
        // sonst meldete der Ladevorgang Erfolg für eine Festlegung, die
        // nirgends zu sehen ist. `parametrik` ist der Regelfall: eine
        // Querschnittsgröße ist eine FORDERUNG an den Planer (ISO 19650), kein
        // Eingriff ins Autorenmodell.
        const nichtAngewandt = schritte.filter(s => !ANWENDBARE_ARTEN.has(s.art));

        for (const schritt of schritte) {
            if (schritt.art !== 'lage') continue;
            const ausCde = schritt.modell === 'cde';
            const localId = ausCde
                ? erzeugte.get(schritt.globalId)
                : globalIdZuLocalId?.get(schritt.globalId);
            if (localId === undefined) {
                misserfolge.push({ ...schritt, grund: 'keine_localId' });
                continue;
            }
            const r = await this.setzeAnker(ausCde ? CDE_MODELL_ID : plan.modelId, localId, schritt.wert);
            if (!r.ok) misserfolge.push({ ...schritt, grund: r.grund });
        }
        return { misserfolge, erzeugte, nichtAngewandt };
    }
}
