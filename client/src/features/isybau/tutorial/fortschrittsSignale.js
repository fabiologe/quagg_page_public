/**
 * Woran die Übung merkt, dass sich etwas getan hat.
 *
 * Der Watcher im Maskottchen liest diese Liste bei jeder Store-Änderung; kommt
 * ein anderer Wert heraus, wird der aktuelle Schritt neu geprüft. Beobachtet
 * die Liste ein Feld NICHT, das ein `check` abfragt, bleibt der zugehörige
 * Schritt stumm hängen — im UI sieht das aus wie eine kaputte Prüfung.
 *
 * Zwei Gruppen: Änderungen am NETZ und Änderungen an der OBERFLÄCHE.
 * Fürs Netz genügt `undoStack.length` als Sammelmelder — jede mutierende
 * Store-Aktion ruft saveHistory(). Ohne ihn fiele z.B. ein geänderter
 * Abflussbeiwert gar nicht auf, weil `areas.length` dabei gleich bleibt.
 * Die UI-Flags laufen NICHT über die History und stehen deshalb einzeln hier.
 *
 * Bewusst schmal und explizit statt eines Deep-Watch über den ganzen Store:
 * `terrain` und `rain.kostraData` gehen nur als Boolean ein, weil beide gross
 * sind und allein interessant ist, ob sie vorliegen. Ein `$subscribe` würde
 * das Höhenraster bei jeder Mutation mit durchlaufen.
 *
 * Diese Datei liegt bewusst NEBEN der Komponente statt in ihr: so kann der
 * Wächtertest die Liste importieren und gegen die Prüfungen der Schritte
 * halten (test/fortschrittsSignale.test.js), statt die .vue als Text
 * aufzuschneiden.
 */
export function leseFortschrittsSignale(store) {
    return [
        // Netz
        store.areas.length, store.nodes.size, store.edges.size,
        store.history.undoStack.length,
        !!store.terrain,
        // Oberfläche: Dialoge, die einen Schritt weiterschalten
        store.ui.demImportPanelOpen,
        store.ui.showElementModal,
        store.ui.elementModal.mode,
        store.ui.showPreprocessingModal,
        // Auswahl und Massenbearbeitung der Datenmaske: der Auslass-Schritt
        // schaltet weiter, sobald zwei Zeilen angehakt sind.
        store.ui.preprocessingSelection,
        store.ui.preprocessingBulkOpen,
        store.ui.preprocessingDirty,
        store.ui.showKostraModal,
        store.ui.showRainModal,
        // Regen und Berechnung
        store.rain.activeModelRain?.metadata?.source ?? null,
        store.rain.activeModelRain?.type ?? null,
        store.rain.activeModelRain?.series?.length ?? 0,
        !!store.rain.kostraData,
        // Nur die Kennung des Modellregens, nicht das Objekt: die Reihe hat je
        // nach Dauer und Intervall hunderte Punkte, und interessant ist allein,
        // DASS ein anderer Regen drinsteht.
        store.rain.activeModelRain?.id ?? store.rain.activeModelRain?.series?.length ?? 0,
        store.simulation.status,
        store.simulation.error,
        store.simulation.preSolveWarnings.length,
    ];
}
