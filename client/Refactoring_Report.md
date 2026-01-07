# Deep Dive Audit: Codebase Refactoring Report

## 1. Zusammenfassung
**Gesamtnote: 3- (Befriedigend mit Abzügen)**

Das Projekt basiert auf einem **modernen Tech-Stack** (Vue 3, Vite, Pinia), was eine solide Basis darstellt. Besonders positiv ist der Einsatz von WebAssembly (WASM) für den Rechenkern ("Solver"), was eine hohe Performance verspricht.

Allerdings leidet die Wartbarkeit unter einer **stark gewachsenen Struktur** im Bereich `features/isybau`. Es gibt architektonische Inkonsistenzen (z.B. zwei Store-Ordner), "God-Klassen" (riesige Funktionen, die alles tun) und eine Vermischung von Verantwortlichkeiten (UI-Code enthält komplexe Business-Logik). Ohne Refactoring wird die Weiterentwicklung zunehmend fehleranfälliger und langsamer.

---

## 2. Top 3 Prioritäten (High Impact)

Diese drei Maßnahmen bringen den größten Mehrwert bei minimalem Risiko:

1.  **Refactoring des `SwmmInputGenerator.js` (Kritisch):**
    Die Methode `generateInp` ist ein riesiger Monolith (>500 Zeilen). Sie muss dringend in kleinere, logische Einheiten zerlegt werden (z.B. `generateNodes`, `generateConduits`), um testbar und wartbar zu sein.

2.  **Bereinigung der "Store"-Duplizierung (Hoch):**
    Es existieren die Ordner `src/store` und `src/stores`. Dies verwirrt Entwickler und führt zu Spaghetti-Code. Alle Stores sollten nach `src/stores` (Standard-Konvention) migriert und modularisiert werden.

3.  **Entschlackung der `IsybauView.vue` (Mittel):**
    Diese Datei ist zu groß (>800 Zeilen) und enthält Logik (Daten-Parsing, Simulations-Aufrufe), die in Composables (z.B. `useSimulation`) oder Services ausgelagert werden muss.

---

## 3. Detaillierte Befunde

| Datei / Modul | Problem | Lösungsvorschlag | Schweregrad |
| :--- | :--- | :--- | :--- |
| **`src/features/isybau`** | **Architektur / Monolith:** Dieses Modul ist riesig (119 Dateien, inkl. Solver) und wirkt wie ein eigenes Projekt im Projekt. | Unterteilen in `features/simulation`, `features/reporting` und `features/editor`. Shared Logic in `src/core` oder `src/shared`. | Hoch |
| **`src/store` vs `src/stores`** | **Struktur:** Doppelte Ordner für State Management. Unklar, was wo liegt. | Konsolidierung auf `src/stores` (Pinia Standard). Löschen von `src/store`. | Mittel |
| **`SwmmInputGenerator.js`** | **Clean Code / Lesbarkeit:** Die Methode `generateInp` ist 500 Zeilen lang. Enthält Formatting, Validierung und Logik wild gemischt. | Zerlegen in private Methoden: `#writeHeader`, `#writeJunctions`, `#writeConduits`. | **Kritisch** |
| **`SwmmInputGenerator.js`** | **Magic Numbers:** Zahlen wie `2, 3, 4, 12, 13` (für Schacht-Typen) sind hartkodiert und schwer verständlich. | Konstanten definieren: `const NODE_TYPE_STORAGE = [2, 3, 4];`. Mappings aus `mappings.js` importieren. | Hoch |
| **`xmlParser.js`** | **DRY / Redundanz:** Ständige Wiederholung von `obj.getElementsByTagName("...")[0]?.textContent`. | Helper-Funktion `getText(xmlNode, tagName, fallback)` erstellen. | Mittel |
| **`xmlParser.js`** | **Separation of Concerns:** `interpolateZ` (komplexe Logik) ist fest im Parser verbaut. Läuft im "Main Thread". | Logik in einen `NetworkProcessor.js` oder Worker auslagern. Parser sollte nur parsen. | Mittel |
| **`IsybauView.vue`** | **God Component:** Verwaltet UI, Datei-Upload, Simulations-Logik und Charts gleichzeitig. | Logik in Composable `useHydraulicSimulation()` auslagern. UI-Teile (Sidebar) in `SimulationSidebar.vue` extrahieren. | Mittel |

---

## 4. Konkretes Code-Beispiel (Refactoring)

Hier ist ein Beispiel, wie man die monolithische `SwmmInputGenerator.js` lesbarer und wartbarer macht.

### Vorher (Aktueller Zustand)
*Alles in einer riesigen Funktion, schwer zu testen.*
```javascript
// SwmmInputGenerator.js
export class SwmmInputGenerator {
    static generateInp(nodesMap, edgesMap, areasList = [], options = {}) {
        const sections = [];
        // ... 50 Zeilen Header Setup ...

        // ... 100 Zeilen Nodes Logic und Loops ...
        for (const node of nodesMap.values()) {
            if ([2, 3, 4, 12, 13].includes(node.type) && this.safeFloat(node.volume) > 0) {
                 storageUnits.push(node);
            } else {
                 junctions.push(node);
            }
        }
        
        // ... 200 Zeilen String Concatenation für jede Section ...
        let junctionsSection = '[JUNCTIONS]\n;;Name Elevation ...\n';
        for (const node of junctions) {
            junctionsSection += `${node.id.padEnd(16)} ...\n`;
        }
        sections.push(junctionsSection);
        
        // ... noch mehr Code ...
        return sections.join('\n');
    }
}
```

### Nachher (Refactored)
*Klare Struktur, sprechende Namen, keine Magic Numbers.*

```javascript
// SwmmInputGenerator.js
const NODE_TYPES = {
    STORAGE: [2, 3, 4, 12, 13],
    OUTFALL: [5]
};

export class SwmmInputGenerator {
    
    // Public API: Übersichtlich und orchestrativ
    static generateInp(networkData, options = {}) {
        const { nodes, edges, areas } = networkData;
        const builder = new InpBuilder(); // Helper Klasse für String-Building

        this.#addHeaderSection(builder, options);
        this.#addNodesSection(builder, nodes);
        this.#addLinksSection(builder, edges);
        this.#addSubcatchmentsSection(builder, areas);
        
        return builder.build();
    }

    // Private Sub-Methoden mit einer Verantwortung
    static #addNodesSection(builder, nodes) {
        const junctions = [];
        const storageUnits = [];

        nodes.forEach(node => {
            if (this.#isStorageNode(node)) {
                storageUnits.push(node);
            } else {
                junctions.push(node);
            }
        });

        this.#formatJunctions(builder, junctions);
        this.#formatStorageUnits(builder, storageUnits);
    }

    // Kapselung von Logik (keine Magic Numbers im Loop)
    static #isStorageNode(node) {
        return NODE_TYPES.STORAGE.includes(node.type) && node.volume > 0;
    }

    // Explizite Formatierungsmethode
    static #formatJunctions(builder, junctions) {
        builder.writeSectionHeader('JUNCTIONS', ['Name', 'Elevation', 'MaxDepth', 'InitDepth', 'SurDepth', 'Aponded']);
        junctions.forEach(node => {
            builder.writeLine([
                node.id, 
                node.elevation.toFixed(3), 
                node.maxDepth.toFixed(3), 
                '0', 
                '0', 
                '0'
            ]);
        });
    }
}
```
**Vorteile:**
1.  **Lesbarkeit:** Man sieht sofort, was `generateInp` macht.
2.  **Testbarkeit:** Man kann `isStorageNode` oder `#formatJunctions` isoliert testen.
3.  **Wartbarkeit:** Wenn sich das Format für "Junctions" ändert, muss man nur *eine* kleine Methode anfassen.
