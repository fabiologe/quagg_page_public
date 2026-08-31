/**
 * useZiehen — ein Bauteil am Griff verschieben (Stufe 9.3).
 *
 * Hausstil wie `useSchnitt`/`useMessen`: Datei und Export englisch, Inhalt
 * deutsch, ein Optionsobjekt hinein, ein flaches Objekt aus Refs und Handlern
 * heraus.
 *
 * WAS HIER NICHT GEBAUT WIRD: kein eigenes Zwangs-System. Fabio: *„erstmal das
 * Bearbeiten durchbauen und dann als Abstraktionslayer entwerfen — bringt nix,
 * das jetzt zu bauen und dann 20 Iterationen zu spezifizieren."* Richtig, und
 * es wird auch grösstenteils nicht gebraucht: `TransformControls` bringt
 * `showX/Y/Z`, `space: 'local'` (lokales X IST die Rohrachse) und
 * `translationSnap` mit. Das Werkzeug steht seit Sprint B im Haus und treibt
 * den Schnittebenen-Gizmo (`IfcSection.js:98`) — samt Orbit-Sperre.
 *
 * DREI DINGE, DIE DIESE DATEI RICHTIG MACHEN MUSS:
 *
 * 1. EIN Journaleintrag je Zug, beim Loslassen — nicht einer je Mausbewegung.
 *    Sonst füllt sich das Journal mit hunderten Schritten, und „zurück" braucht
 *    hunderte Klicks für einen sichtbaren Effekt.
 *
 * 2. `basis` ist der Anker im GELIEFERTEN Modell, nicht die aktuelle Lage.
 *    Nähme man die aktuelle, wäre `basis` nach dem ersten Zug gleich `nachher`,
 *    und der Drei-Wege-Vergleich vergliche gegen sich selbst: jeder Konflikt
 *    fiele still durch. Deshalb reicht `useNachspielen` den eingefrorenen
 *    Lieferstand heraus, und was dort fehlt, wird VOR dem ersten Zug gelesen
 *    und gemerkt.
 *
 * 3. Der Gizmo hängt an einem PIVOT, nicht am Bauteil. Fragments-Objekte
 *    gehören der Bibliothek; ein TransformControls direkt darauf würde ihre
 *    Matrix hinter ihrem Rücken ändern. Der Pivot ist ein leeres Object3D, aus
 *    dessen Bewegung der Zielanker abgeleitet wird — das Verschieben selbst tut
 *    `IfcAutor` über die Editor-API.
 */

import { ref, shallowRef } from 'vue';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { darfZiehen, freiheitsgradeFuer, grundOhneZiehen } from '../services/Freiheitsgrade.js';
import { istNennenswert } from '../services/IfcAutor.js';

/**
 * @param {object} opts
 * @param {() => object|null} opts.getAuswahl    das gewählte Bauteil
 * @param {() => string|null} opts.getModellSha  Kennung des geladenen Modells
 *
 * Abhängigkeiten als GETTER-CLOSURES, nicht als Refs oder Stores (Hausvertrag,
 * siehe IfcCamera). Die erste Fassung nahm `ifc` entgegen und las
 * `ifc.value.selectedElement` — `ifc` ist im Viewer aber der Pinia-STORE, kein
 * Ref. `.value` war damit immer undefined, und das Werkzeug meldete ewig
 * „Erst ein Bauteil wählen". Ein Getter kann man nicht falsch herum anfassen.
 */
export function useZiehen({ engine, getAuswahl, getModellSha, aenderungen, bearbeitung, nachspielen, cde } = {}) {
    const aktiv = ref(false);
    /** Warum es gerade nicht geht — für den Hinweis am Bauteil. */
    const grund = ref('');
    /** Läuft gerade ein Zug? Sperrt Auswahl und Kamera. */
    const zieht = ref(false);
    const gizmo = shallowRef(null);

    let _pivot = null;
    let _helper = null;
    let _bauteil = null;          // { modelId, localId, globalId }
    let _startAnker = null;       // Lage beim Anfassen — für den Weg des Pivots

    function _welt() { return engine?.value?._getWorld?.() ?? null; }

    function _aufraeumen() {
        const welt = _welt();
        if (gizmo.value) {
            gizmo.value.removeEventListener('dragging-changed', _aufZiehen);
            gizmo.value.detach();
            gizmo.value.dispose?.();
        }
        if (_helper && welt?.scene?.three) welt.scene.three.remove(_helper);
        if (_pivot && welt?.scene?.three) welt.scene.three.remove(_pivot);
        gizmo.value = null; _helper = null; _pivot = null;
        _bauteil = null; _startAnker = null;
        zieht.value = false;
    }

    /**
     * Kamera anhalten, solange gezogen wird — und beim Loslassen den Zug
     * eintragen.
     *
     * `dragging-changed` ist das eine Ereignis, das beide Flanken liefert;
     * `mouseDown`/`mouseUp` gäbe es auch, aber dann läge die Sperre an einer
     * anderen Stelle als der Eintrag, und eine der beiden ginge irgendwann
     * verloren.
     */
    async function _aufZiehen(ereignis) {
        const welt = _welt();
        if (welt?.camera?.controls) welt.camera.controls.enabled = !ereignis.value;
        zieht.value = !!ereignis.value;
        if (ereignis.value) return;          // Anfang: nichts einzutragen
        await _eintragen();
    }

    /** Der Zielanker aus der Pivot-Bewegung — ein Eintrag, beim Loslassen. */
    async function _eintragen() {
        if (!_bauteil?.globalId || !_pivot || !_startAnker) return null;

        // Ein Klick auf den Griff OHNE Bewegung ist kein Zug. Ohne diese
        // Prüfung schriebe er trotzdem einen Eintrag: `eintragen` vergleicht
        // mit dem JOURNALSTAND (anfangs leer), nicht mit der Bewegung — der
        // Anker wäre dann ein „neuer" Wert, obwohl sich nichts gerührt hat.
        const weg = { dx: _pivot.position.x, dy: _pivot.position.y, dz: _pivot.position.z };
        if (!istNennenswert(weg)) { _pivotZuruecksetzen(); return null; }

        const ziel = {
            x: _startAnker.x + _pivot.position.x,
            y: _startAnker.y + _pivot.position.y,
            z: _startAnker.z + _pivot.position.z,
        };
        // `basis` ist der LIEFERSTAND, nicht die Lage beim Anfassen.
        const basis = nachspielen?.lieferstandVon?.(_bauteil.globalId) ?? _startAnker;

        const eintrag = await aenderungen?.eintragen?.({
            art: 'lage',
            globalId: _bauteil.globalId,
            nachher: ziel,
            basis,
            modell: _bauteil.modelId === 'cde-eigenbau' ? 'cde' : 'geliefert',
            wer: cde?.bearbeiter || '',
            modellSha: getModellSha?.() ?? null,
        });
        // Erst eintragen, dann bewegen: scheitert der Eintrag (gleicher Wert),
        // soll auch nichts am Modell passieren.
        if (!eintrag) { _pivotZuruecksetzen(); return null; }

        const r = await engine?.value?.setzeAnker?.(_bauteil.modelId, _bauteil.localId, ziel);
        if (!r?.ok) {
            grund.value = `Verschieben fehlgeschlagen: ${r?.grund ?? 'unbekannt'}`;
            // Der Journaleintrag bleibt stehen — er ist die Absicht, und das
            // Nachspielen versucht es beim nächsten Laden erneut. Ihn zu
            // löschen hiesse, die Festlegung stillschweigend zu verlieren.
        }
        _startAnker = ziel;
        _pivotZuruecksetzen();
        return eintrag;
    }

    function _pivotZuruecksetzen() {
        if (_pivot) _pivot.position.set(0, 0, 0);
    }

    /**
     * Den Griff an die aktuelle Auswahl hängen.
     *
     * @param {{modelId, localId, globalId}} bauteil
     * @param {{bauform, guete}} einordnung
     */
    async function anhaengen(bauteil, einordnung) {
        _aufraeumen();
        grund.value = '';
        if (!bauteil?.globalId || !engine?.value) { aktiv.value = false; return false; }

        if (!darfZiehen(einordnung)) {
            grund.value = grundOhneZiehen(einordnung);
            aktiv.value = false;
            return false;
        }
        const fg = freiheitsgradeFuer(einordnung);
        const welt = _welt();
        if (!welt?.scene?.three || !welt?.camera?.three) { aktiv.value = false; return false; }

        // Lage beim Anfassen lesen — und als Lieferstand merken, FALLS das
        // Journal dieses Bauteil beim Laden nicht nannte. `merkeLieferstand`
        // überschreibt nicht: der erste gelesene Wert ist der gelieferte.
        const anker = (await engine.value.ankerVon(bauteil.modelId, [bauteil.localId])).get(bauteil.localId);
        if (!anker) { grund.value = 'Bauteil ohne Hülle — kein Griff möglich.'; aktiv.value = false; return false; }
        nachspielen?.merkeLieferstand?.(bauteil.globalId, anker);

        _bauteil = bauteil;
        _startAnker = anker;

        _pivot = new THREE.Object3D();
        _pivot.position.set(0, 0, 0);
        // Der Pivot sitzt im Ursprung und wird über die Gruppe an den Anker
        // gesetzt — so ist `_pivot.position` direkt der WEG, nicht der Ort.
        const traeger = new THREE.Group();
        traeger.position.set(anker.x, anker.y, anker.z);
        traeger.add(_pivot);
        welt.scene.three.add(traeger);
        _helper = traeger;

        const tc = new TransformControls(welt.camera.three, welt.renderer.three.domElement);
        tc.attach(_pivot);
        tc.setMode('translate');
        tc.setSpace(fg.space);
        tc.showX = fg.x; tc.showY = fg.y; tc.showZ = fg.z;
        tc.translationSnap = fg.raster;
        // Grösser als die Vorgabe: die Griffe sind für die Maus gemacht, und
        // auf dem Finger trifft man sie sonst nicht.
        tc.setSize(1.4);
        tc.addEventListener('dragging-changed', _aufZiehen);

        const helfer = tc.getHelper?.() ?? tc;
        welt.scene.three.add(helfer);
        _helper = helfer;
        traeger.add(_pivot);

        gizmo.value = tc;
        aktiv.value = true;
        grund.value = '';
        return true;
    }

    function loesen() {
        _aufraeumen();
        aktiv.value = false;
        grund.value = '';
    }

    /** Umschalten — der Werkzeugknopf. */
    async function umschalten() {
        if (aktiv.value) { loesen(); return false; }
        const el = getAuswahl?.() ?? null;
        if (!el?.globalId) { grund.value = 'Erst ein Bauteil wählen.'; return false; }
        return anhaengen(
            { modelId: el.modelId, localId: el.localId, globalId: el.globalId },
            bearbeitung?.einordnung ?? null,
        );
    }

    return { aktiv, zieht, grund, gizmo, anhaengen, loesen, umschalten };
}
