/**
 * Einheiten-Umrechnung im Worker (2026-09-03).
 *
 * WARUM ÜBERHAUPT EIN WORKER: `IfcAPI.SaveModel` schreibt die ganze Datei neu,
 * und davor läuft ein Durchgang über jede Zeile. An der 2-MB-Datei sind das
 * rund eine Sekunde, an der 9-MB-ProVI-Datei entsprechend mehr — im
 * Hauptthread heisst das: das Bild friert ein, der Ladeschleier dreht sich
 * nicht mehr, und der Nutzer hält es für einen Absturz. Der Rechenweg ist
 * derselbe wie inline; nur der Thread ist ein anderer.
 *
 * KEINE EIGENE LOGIK. Der Worker ruft `inMeterUmrechnen` aus `Einheiten.js` —
 * dieselbe Funktion, die auch der Rückfallweg nimmt. Ein zweiter Konverter
 * hier wäre die zweite Antwort auf dieselbe Frage, und die läuft
 * auseinander (im Haus mehrfach passiert: Dokumentregister, Wasserzeichen,
 * Geländekategorien).
 *
 * `web-ifc` wird DYNAMISCH geladen, wie in `IfcQuelle`: so hängt die
 * Bibliothek am Auswertungspfad dieses Workers und nicht an dem jedes Moduls,
 * das ihn erbt.
 */
import { inMeterUmrechnen } from './Einheiten.js';

self.onmessage = async (ev) => {
    const { id, bytes, faktor, wasmPfad = '/', absolut = true } = ev.data ?? {};
    try {
        const WebIFC = await import('web-ifc');
        const r = await inMeterUmrechnen(WebIFC, bytes, { faktor, wasmPfad, absolut });
        if (!r?.bytes) {
            self.postMessage({ id, grund: r?.grund ?? 'ohne Ergebnis' });
            return;
        }
        // Das ERGEBNIS wird übertragen, nicht kopiert: es gehört ab jetzt dem
        // Hauptthread, und eine 9-MB-Kopie wäre reine Verschwendung. Die
        // EINGABE kam bewusst als Kopie (siehe EinheitenWorker.js).
        self.postMessage({ id, bytes: r.bytes, bericht: r.bericht }, [r.bytes.buffer]);
    } catch (fehler) {
        self.postMessage({ id, grund: fehler?.message ?? String(fehler) });
    }
};
