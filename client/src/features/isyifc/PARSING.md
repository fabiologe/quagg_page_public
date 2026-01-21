# ISYBAU XML Parser Documentation (Technical Specification)

Diese Dokumentation beschreibt die **exakte Implementierungslogik** des `IsybauParser.worker.js`. Sie dient als Referenz für Entwickler und zur Validierung der Datenverarbeitung.

## 1. Architektur & Datenfluss

Der Parser folgt einer **"Flat 4-Type Strategy"**, um tief verschachteltes XML in flache JS-Objekte zu wandeln.

**Pipeline:**
1.  **Input:** XML String.
2.  **Parser Config (`fast-xml-parser`):**
    *   `removeNsp: true`: XML-Namespaces (z.B. `isy:`) werden **entfernt**.
    *   `isArray`: Erzwingt Arrays für `AbwassertechnischeAnlage`, `Punkt`, `Auftrag`, `Segment`.
3.  **Root-Suche:** Rekursive Suche nach `AbwassertechnischeAnlage` im gesamten Baum (Fallback für ungewöhnliche Kollektiv-Strukturen).
4.  **Verarbeitung:** Single-Pass-Iteration über alle Objekte.
5.  **Output:** `{ nodes: Array<FlatNode>, edges: Array<FlatEdge>, stats: Object }`.

---

## 2. Entscheidungstabelle (Kategorisierung)

Jedes Objekt wird strikt anhand von zwei Feldern klassifiziert. Die Reihenfolge der Prüfung ist relevant.

| Priorität | Kategorie | XML-Bedingung | JS-Implementierung |
| :--- | :--- | :--- | :--- |
| 1 | **Haltung (Edge)** | `Objektart == '1'` | `parseInt(obj.Objektart) === 1` |
| 2 | **Schacht** | `Objektart == '2'` AND `KnotenTyp == '0'` | `=== 2 && parseInt(Knoten.KnotenTyp) === 0` |
| 3 | **Anschlusspunkt** | `Objektart == '2'` AND `KnotenTyp == '1'` | `=== 2 && parseInt(Knoten.KnotenTyp) === 1` |
| 4 | **Bauwerk** | `Objektart == '2'` AND `KnotenTyp == '2'` | `=== 2 && parseInt(Knoten.KnotenTyp) === 2` |
| - | *Ignoriert* | Alles andere | Wird in `stats.Ignored` gezählt. |

---

## 3. Extraktions-Logik im Detail

### A. Globale Konventionen

*   **Float-Parsing (`parseGermanFloat`):**
    *   Tausendertrennzeichen werden entfernt.
    *   Dezimal-Komma `,` wird durch Punkt `.` ersetzt.
    *   `null` / `undefined` / `""` -> Returns `null`.
*   **Einheiten-Normalisierung (`normalizeUnit`):**
    *   Eingangswert wird geparst.
    *   **Heuristik:** Wenn `Math.abs(Value) > 50.0`, wird der Wert durch **1000.0** geteilt.
    *   *Annahme:* Rohre/Schächte sind selten > 50m groß, aber oft > 50mm.

### B. Typ: SCHACHT (KnotenTyp 0)

1.  **Punkt-Scan (`Geometrie.Geometriedaten.Knoten.Punkt`):**
    *   Array wird durchsucht nach `PunktattributAbwasser`.
    *   `DMP` (Deckelmesspunkt) -> Setzt `z_deckel`.
    *   `SMP` (Sohlmesspunkt) -> Setzt `z_sohle`.
    *   *Fallback:* Wenn kein `DMP`, nimm den **ersten** verfügbaren Punkt.
2.  **Höhen-Logik (Lückenfüllung):**
    *   `Tiefe` = `Knoten.Schacht.Schachttiefe`.
    *   Wenn `z_sohle` fehlt -> `z_sohle = z_deckel - Tiefe`.
    *   Wenn `z_deckel` fehlt (aber `Deckel.Punkthoehe` existiert) -> Nutze `Punkthoehe`.
    *   Wenn `z_deckel` fehlt (und keine `Punkthoehe`), aber `Tiefe` da -> `z_deckel = z_sohle + Tiefe`.
3.  **Form (`Aufbauform` oder `Deckelform`):**
    *   Enthält String "E" oder "Q" -> Shape `Box`.
    *   Sonst -> Shape `Cylinder` (Default 'R').
4.  **Dimensionen:**
    *   `LA` = `Aufbau.LaengeAufbau` (Normalisiert).
    *   `BA` = `Aufbau.BreiteAufbau` (Normalisiert).
    *   Fallback: Wenn Dimension fehlt -> Default `1.0m`.

### C. Typ: HALTUNG (Objektart 1)

1.  **Topologie (Verbindung):**
    *   **Primär:** `Kante.KnotenZulauf` (Source) -> `Kante.KnotenAblauf` (Target).
    *   **Sekundär (Fallback):** `Verlauf.Anfangsknoten` -> `Verlauf.Endknoten`.
2.  **Profil-Geometrie (`Kante.Profil`):**
    *   `Profilart` (Code) wird gemappt:
        *   `0` (Kreis), `1` (Ei), `2` (Maul), `4` -> **Circle** (Vereinfachung).
        *   `3` (Rechteck), `5` (Rechteck offen) -> **Rect**.
        *   `8` (Trapez), `9` (Doppeltrapez) -> **Trapez**.
    *   `Profilbreite`, `Profilhoehe` werden strikt normalisiert (siehe A).
    *   Verhältnis: Bei `Circle` wird `Dim2` (Höhe) = `Dim1` (Breite) gesetzt, falls Höhe fehlt.

### D. Typ: BAUWERK (KnotenTyp 2)

Da Bauwerke polymorph sind, führt der Parser einen **Deep-Scan** auf dem `Knoten.Bauwerk`-Objekt durch. Er prüft nacheinander spezifische Unter-Tags basierend auf dem `Bauwerkstyp` (Code G400):

| Code | Unter-Tag | Gelesene Felder (Max) |
| :--- | :--- | :--- |
| **1** | `Pumpwerk` | `MaxLaenge`, `MaxBreite` |
| **2** | `Becken` | `MaxLaenge`, `MaxBreite` |
| **5** | `Auslaufbauwerk` | `Laenge`, `Breite` |
| **7** | `Wehr_Ueberlauf` | `Oeffnungsweite` (als Länge & Breite) |
| **12** | `Versickerungsanlage.MuldeTeich` | `Laenge`, `Breite` |
| **Default** | - | `5.0m x 5.0m` |

*   Die Geometrie wird immer als **Bounding Box** (`BoxGeometry`) vom Typ `Structure` angelegt.
*   Z-Position: Erster Punkt im Geometrie-Array. Tiefe Default: 3m (falls `Sohle` nicht berechenbar).

### E. Typ: ANSCHLUSSPUNKT (KnotenTyp 1)

*   **Geometrie:** Nimmt Koordinate des ersten Punktes.
*   **Visualisierung:** Feste Größe `0.2m x 0.2m x 0.2m` Box.
*   **Metadaten:** `Punktkennung` (z.B. `RR`, `SE`, `GA`) wird extrahiert, um im Frontend spezifische Icons (Regenrohr vs. Straßeneinlauf) zu laden.

---

## 4. Mapping in den Store (`FixData.js`)

Der Worker liefert rohe "FlatNodes". `FixData.js` überführt diese in das App-Schema:

*   **`INode.pos`:**
    *   `x`: `Rechtswert` (Easting).
    *   `y`: `z_sohle` (Elevation/Höhe).
    *   `z`: `-Hochwert` (Northing invertiert für Three.js LHS).
*   **`INode.geometry`:**
    *   `height`: `Math.abs(z_deckel - z_sohle)`. Default `2.5m`.
    *   `shape`: Übernimmt `Cylinder`/`Box` vom Worker.
*   **`IEdge`:**
    *   Prüft, ob `sourceId` und `targetId` in der Node-Map existieren. Wenn nein -> Kante wird verworfen (Dangling Edge prevention).
