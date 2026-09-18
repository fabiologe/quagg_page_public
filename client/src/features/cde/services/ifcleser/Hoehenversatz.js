/**
 * Höhenversatz — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Den Höhenversatz beim Laden messen: Platzierung aus der Datei gegen die
 * Platzierung in den Fragmenten.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */


/**
 * Wie viele Bauteile die Höhenmessung auswertet.
 *
 * Gesucht ist EINE Verschiebung des ganzen Modells, kein Wert je Bauteil —
 * mehr Bauteile machen die Antwort nicht genauer, nur das Laden langsamer.
 * Gemessen: 12 Bauteile kosten 15 ms.
 */
const STICHPROBE = 24;

/**
 * Alle Ladeversätze — als {x, y, z}, DIESELBE Form wie
 * `getCoordOffsetForModel`.
 *
 * Vorher stand hier `off.toArray()`, also `[x, y, z]`. Jeder Verbraucher
 * greift aber mit `.x`/`.y`/`.z` zu, und ein Array liefert darauf
 * `undefined` — ohne zu werfen. Zwei Accessoren, zwei Formen, kein Hinweis.
 *
 * Was daraus in Produktion wurde:
 *   DxfExporter          alle Koordinaten NaN (der Rückfall `?? {x:0,z:0}`
 *                        griff nicht — ein Array ist truthy)
 *   LaengsschnittBuilder heightOffsetY immer 0; die Achse ist „m NN"
 *                        beschriftet und zeigt Welt-Y
 *   UtmGrid              Gitterkreuze beschriften Weltkoordinaten als E/N
 *   AxisAnnotations      Achs-Polylinien NaN
 *
 * Die Tests konnten es nicht sehen, weil sie `{x, z}`-Objekte übergeben —
 * die Form, die die Engine gar nicht lieferte. Sie prüften eine
 * Schnittstelle, die es nicht gab. Der Guard in `koordinatenForm.test.js`
 * geht deshalb von der ECHTEN Ausgabe aus.
 */
/**
 * Den HÖHENVERSATZ messen, statt ihn aus `object.position` zu erraten.
 *
 * DER BEFUND: `-model.object.position` liefert x und z richtig, y aber 0 —
 * obwohl die Geometrie in der Höhe sehr wohl verschoben ist. Zwei
 * Mechanismen wirken übereinander: `COORDINATE_TO_ORIGIN` (web-ifc) backt
 * eine Höhenverschiebung in die Scheitelpunkte, `autoCoordinate`
 * (fragments) setzt die Objektlage aus der MapConversion — und deren
 * `OrthogonalHeight` ist in beiden ISYBAU-Dateien 0. Nur der zweite
 * landet in `object.position`.
 *
 * Sichtbar wurde es als „E und N stimmen, H ist noch die Three-Koordinate".
 *
 * Statt nachzubauen, was die Bibliothek tut — das wäre eine Annahme über
 * fremden Code —, wird DIESELBE Platzierung zweimal geholt: aus der Datei
 * und aus den Fragmenten. Die Differenz IST der Versatz. Der Median macht
 * es unempfindlich gegen einzelne Ausreisser, und die Streuung sagt, ob
 * man dem Ergebnis trauen darf.
 */
/**
 * Den Höhenversatz eines Modells bestimmen — HÜLLE gegen HÜLLE.
 *
 * Der erste Anlauf verglich die IFC-Platzierung mit `model.getPositions()`
 * und scheiterte, weil das zwei VERSCHIEDENE Punkte sind: `getPositions`
 * liefert die Mitte eines Bauteils, die Platzierung einen Bezugspunkt des
 * Autors. Am echten Netz sitzt der bei Schächten auf der Unterkante, bei
 * Haltungen am oberen Ende — die Differenz streute dadurch um 10,2 m, und
 * die Messung hat (richtig) nichts gesetzt.
 *
 * Eine Hülle beschreibt auf beiden Seiten DENSELBEN Körper. Damit gilt
 * für eine reine Verschiebung:
 *
 *     Versatz = DateiUnterkante − WeltUnterkante
 *             = DateiOberkante  − WeltOberkante
 *
 * Dass beide dasselbe ergeben, ist keine Nebensache, sondern der BEWEIS,
 * dass überhaupt nur verschoben und nicht skaliert wurde. Stimmen sie
 * nicht überein, wird nichts gesetzt und der Befund gemeldet — eine
 * erfundene Höhe wäre schlimmer als gar keine.
 */
export async function _hoehenversatzMessen(engine, model, quelle, modelOff) {
    const merke = (b) => { engine._hoehenBefund.set(model.modelId, b); return b; };
    // Was die Bibliothek sagt (`baseCoordinates`, seit 2026-09-08) — die
    // Messung bleibt das Mass, die Bibliothek ist die Gegenprobe.
    const ausBibliothek = Number.isFinite(modelOff?.y) ? modelOff.y : null;
    if (!quelle?.lebt?.()) return merke({ art: 'ohne-quelle', text: 'keine IFC-Quelle' });
    try {
        // Eine Stichprobe genügt: gesucht ist EINE Verschiebung, nicht ein
        // Wert je Bauteil. Die Geometrie auszuwerten kostet, deshalb wenige.
        const stichprobe = quelle.ids('IFCELEMENT', { untertypen: true }).slice(0, STICHPROBE);
        if (!stichprobe.length) return merke({ art: 'keine-bauteile', text: 'keine Bauteile in der Datei' });

        const datei = quelle.hoehenHuellen(stichprobe);
        // NUR die Bauteile, für die BEIDE Seiten etwas liefern — sonst
        // deckten die zwei Hüllen verschiedene Körper ab und die Differenz
        // wäre die Auswahl, nicht der Versatz.
        const ids = stichprobe.filter(id => datei.has(id));
        if (ids.length < 2) return merke({ art: 'keine-geometrie', text: 'Geometrie in der Datei nicht auswertbar' });

        const welt = await model.getMergedBox(ids);
        if (!welt || welt.isEmpty?.() || !Number.isFinite(welt.min?.y)) {
            return merke({ art: 'keine-weltlage', text: 'Weltlage nicht lesbar' });
        }

        let dMin = Infinity, dMax = -Infinity;
        for (const id of ids) {
            const h = datei.get(id);
            if (h.min < dMin) dMin = h.min;
            if (h.max > dMax) dMax = h.max;
        }

        const vonUnten = dMin - welt.min.y;
        const vonOben  = dMax - welt.max.y;
        const abweichung = Math.abs(vonUnten - vonOben);
        if (abweichung > 0.01) {
            return merke({
                art: 'uneinheitlich', spanne: abweichung, unten: vonUnten, oben: vonOben,
                text: `Unter- und Oberkante ergeben ${vonUnten.toFixed(2)} m bzw. `
                    + `${vonOben.toFixed(2)} m — das ist keine reine Verschiebung, nicht gesetzt`,
            });
        }

        const versatz = (vonUnten + vonOben) / 2;
        if (ausBibliothek !== null && Math.abs(versatz - ausBibliothek) > 0.01) {
            console.warn(`cde: Höhenversatz gemessen ${versatz.toFixed(3)} m, Bibliothek sagt `
                + `${ausBibliothek.toFixed(3)} m — die Messung gilt`);
        }
        modelOff.y = versatz;
        engine._coordOffsets.set(model.modelId, modelOff);
        if (engine._coordOffsets.size === 1) engine._coordinationOffset.copy(modelOff);
        // Beide Räume mitgeben. Zeigt die Koordinatenleiste eine Höhe, die
        // in KEINEN von beiden passt, liegt der Fehler nicht am Versatz —
        // und das sieht man dann sofort, statt es zu erraten.
        return merke({
            art: 'gemessen', wert: versatz, spanne: abweichung, n: ids.length,
            datei: { min: dMin, max: dMax },
            welt:  { min: welt.min.y, max: welt.max.y },
            text: `über ${ids.length} Bauteile, Unter- und Oberkante stimmen auf `
                + `${(abweichung * 1000).toFixed(1)} mm überein`,
        });
    } catch (fehler) {
        return merke({ art: 'fehler', text: String(fehler?.message ?? fehler) });
    }
}
