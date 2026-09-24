# Fahrplan Stufe C — Ergebnisse ehrlich machen (flood-3D)

Stand 2026-09-24, nach Stufe A (PROTOKOLL_A) und B (PROTOKOLL_B). Grundlage: Gesamtaudit F4/F5,
Wehr-Nachlauf (C_d 0,54, nicht bestanden) und die Verbraucherkarte des Clients vom 24.09.
Protokoll: `PROTOKOLL_C.md`. Leitplanke wie in A/B: jede Änderung mit Zahl vorher/nachher,
Harness-Probe grün; wo sich ein Ergebnis ändern DARF (neue Definition), steht es im Protokoll.

## 0 · Befund, auf dem der Sprint aufbaut

1. **Querschnitt ≠ Ablauf.** Beim Wehr misst `discharge_qs_ow` (Schnittebene, interpoliert,
   `weightedAreaIntegrate α·U`) im Beharrungszustand 0,110 m³/s, der Ablauf 0,116 — 5 % Lücke
   zwischen zwei Messstellen desselben Stroms. C_d hängt direkt daran.
2. **Voxel ≠ Rechnung.** Das Anzeige-Raster (base_cell horizontal, ungewichtetes Binning)
   verliert 34–100 % Wasservolumen (viz-Selbsttest der echten Läufe). Daraus rechnet der Client
   Tiefe, Wasserspiegel, Froude, Energiehöhe, Laubkarten.
3. **Zwei Definitionen je Kennwert.** WSP: Server = Oberkante der obersten nassen Voxelzelle,
   Client = Subzellen-Interpolation. v: Server = ungewichtetes 3D-|U|, Client = α·dz-gewichtet,
   horizontal. Froude nur im Client, mit zwei Schwellen (planFields hMin vs. Längsschnitt).
4. **Verbraucherkarte (24.09.):** Grundriss, Längsschnitt, Hülle, Laubkarten und die
   Säulenwerte der Punktabfrage brauchen **nur 2D-Planraster je Zeitpunkt** (Tiefe, WSP,
   Oberflächen- und tiefengemittelte Geschwindigkeit, Froude, Sohlschub). Echtes 3D brauchen
   nur Raum3D-Wasseroberfläche, Schnittebenen, Pfeile, Stromlinien, Volumenkörper.
5. **Tracer am Ablauf flächen- statt durchflussgewichtet** (`weightedAverage` mit α): Rest
   von 8,8 % Tracer-Verlust (PROTOKOLL_A, A3).

## 1 · Reihenfolge

```
C0 Messlatte ─► C1 Querschnitt exakt ─► C2 Planraster aus echten Zellen ─► C4 Kennwerte eine Definition
                                     └► C3 Wasseroberfläche als VTP (Raum3D)             └► C5 Wehr neu
```
C1 zuerst (klein, klärt die Wehr-Lücke). C2 ist der große Schritt (Server + drei Panels).
C3 unabhängig von C2. C4 braucht C1 + C2. Aufwand ≈ 6–8 Arbeitstage.

## C0 · Messlatte (½ Tag)

Fall K (a5b_k-Stand) und Wehr (a7_wehr): Q Querschnitt vs. Ablauf vs. Zufluss im
Beharrungszustand; viz-Volumenfehler; WSP/v/Fr am Pegel nach Server- und Client-Definition;
Tracer-Verlust. Ergänzung in `probe_lauf.py` (Planraster-Vergleich), Tabelle ins Protokoll.

## C1 · Querschnitt exakt über die Zellflächen (1 Tag)

**Ist:** `casebuilder.function_objects` `discharge_<id>`: `sampledSurface plane` mit `bounds`,
`weightedAreaIntegrate` von U mit Gewicht α — interpoliert auf eine Ebene durch die Zellen,
Polylinie nur aus erstem und letztem Punkt (F10).

**Neu:** Der Wasserfluss, den der Solver tatsächlich transportiert, summiert über echte
Zellflächen:
- topoSet: je Querschnitt eine faceZone aus einer senkrecht extrudierten Fläche der
  Polylinie (alle Segmente, nicht nur Anfang/Ende) — `searchableSurfaceToFaceZone` mit einem
  triSurfaceMesh (STL neben den Fall), Orientierung aus der Querschnittsnormalen.
- functionObject `surfaceFieldValue`, `regionType faceZone`, `operation sum`,
  `fields (alphaPhi0.water phi)` → Wasser- und Gemischfluss, konservativ, ohne Interpolation.
- `extract/readers.read_discharge` liest die Summe (Skalar, Vorzeichen aus der Zonen-
  Orientierung) — Namenskontrakt `discharge_<id>` bleibt.

**Zuerst prüfen (Probelauf Fall K bis 2 s, ≈ 1 min):** ob `alphaPhi0.water` für das
functionObject zur Laufzeit erreichbar ist; ob die faceZone-Orientierung stimmt (Vorzeichen).
Rückfall, falls nicht: `phi` mit α-Flächenwert — dann nur Gemischfluss exakt.

**Abnahme:** Fall K und Wehr: |Q_Querschnitt − Q_Ablauf| / Q < 1 % im Beharrungszustand
(heute Wehr 5 %). Harness-Probe um „Querschnitt = Ablauf" erweitert.

## C2 · Planraster aus echten Zellen (3 Tage)

**Server** (`core/planfelder.py`, im Nachlauf `core/nachlauf.py`): je Ausgabezeitpunkt aus
Zellzentren, **Zellvolumen** (writeCellVolumes), α, U, Gelände die Planraster auf dem xy-Gitter
(base_cell, wie heute):
- Tiefe h = Σ α·V / A_Säule (exakt volumentreu — Selbsttest Σ h·A = Solver-Volumen < 1 %),
- WSP = Gelände + h für Säulen ohne Lufteinschluss, sonst Oberkante der zusammenhängenden
  Wassersäule (eine Definition, im Docstring begründet),
- ū = Σ α·V·U_h / Σ α·V (tiefengemittelt, horizontal), u_oben (Oberflächenzelle),
- Fr = |ū| / √(g·h) für h ≥ 2 Zellen, sonst leer,
- τ wie heute (Wandflächen, Bin2d), Hülle (Maximum über alle Zeitpunkte) einmal serverseitig.
Ablage `planfelder/t_XXXX.npz` + Endpunkt `GET /runs/{id}/plan?time=` (F3DV-artig, 2D) und
`GET /runs/{id}/plan/huelle`.

**Client:** `planFields` entfällt; Grundriss, Längsschnitt (Energielinie, Fr, Grenztiefe aus
denselben Rastern), Laubkarten und die Säulenwerte der Punktabfrage lesen die Serverraster.
Grundriss-z-Schicht-Modus und Raum3D behalten das Voxel-Raster (Anzeige, ausdrücklich so
beschriftet).

**Abnahme:** Planraster-Volumen = Solver-Volumen ± 1 % (heute Voxel 34–100 %); eine
Froude-Definition; `energy_head_series` rechnet aus denselben Rastern (Server = Client).
Laubkarten-Tests (29) laufen gegen Serverraster-Fixtures.

## C3 · Wasseroberfläche als VTP (1–2 Tage)

functionObject `surfaces` (`isoSurfaceTopo`, α = 0,5, Format vtk/vtp) zu den Feld-
Ausgabezeiten, Felder U und p_rgh auf den Knoten; Endpunkt liefert die Fläche je Zeitpunkt;
Raum3D zeigt sie statt Marching Cubes auf dem Voxelgitter (Regler α-Iso und Glättung
entfallen für die Oberfläche; bleiben für „freie Isofläche"). Sohlschub auf dem Erdkörper:
nebenbei behoben (heute schreibt Raum3D τ auf das unbenutzte Höhenfeld, wenn ein Erdkörper
existiert — Verbraucherkarte).

**Abnahme:** Oberfläche im Viewer aus der Solver-Isofläche; Browserprobe (ohne Projekt).

## C4 · Kennwerte: eine Definition je Größe (1–2 Tage)

- **C_d:** nur ausdrückliche Paare (Autopaarung „jedes Wehr bekommt denselben Q" entfällt);
  Kronenhöhe = tiefster Punkt der Krone; Energiehöhe H = WSP + ū²/2g aus C2 statt h;
  Rückstaukontrolle (Unterwasser über Krone → Befund „nicht frei"); Zeitfenster =
  Beharrungsbeginn aus der Bilanz statt „letztes Drittel" bzw. ganze Reihe.
- **Froude, WSP, Energiehöhe:** nur serverseitig (C2), Client zeigt an.
- **Tracer am Ablauf:** durchflussgewichtet (`weightField alphaPhi0.water` bzw. Σ α·T·phi /
  Σ α·phi) — Ziel Tracer-Verlust < 3 % (heute 8,8 %).
- **min_bed_shear:** Nässe aus α (C2-Tiefe), nicht aus τ > 0.

**Abnahme:** je Kennwert eine Funktion, Tests; Tracer-Verlust Fall K < 3 %.

## C5 · Wehr neu (Rechenzeit ≈ 16 min)

Wehrfall mit C1 + C4: Q Querschnitt = Ablauf (< 1 %), C_d mit Energiehöhe. Liegt er im
Literaturband für breitkronige Wehre (Quelle im Protokoll nennen), wird die Referenz auf den
neuen Stand gesetzt — mit Begründung, NICHT als Eigenreferenz ohne Physikbezug.

## Was Stufe C bewusst nicht tut

Raum3D-Schnittebenen, Pfeile, Stromlinien und Volumenkörper bleiben auf dem Voxel-Raster
(ausdrücklich „Anzeige-Raster" beschriftet); ein serverseitiges VTP für sie wäre ein
eigener Sprint. Keine neuen Nachweisarten, keine neuen Panels.
