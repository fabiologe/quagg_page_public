# LISFLOOD-FP Solver-Patches (QUAGG)

**Single Source of Truth für QUAGG-Änderungen am Solver.** Statt einen voll-gepatchten
126-MB-Quellbaum zu vendoren, halten wir den **pristine Upstream-8.0.3** + **versionierte Patches**,
die der Docker-Build (`engines/docker/Dockerfile`) zur Build-Zeit anwendet.

## Patches

### `quagg-weir-flow.patch`
Behebt einen Original-Bug in `weir_flow.cpp` (LISFLOOD-FP 8.0.3):

- Die Brücken-Orifice-Physik (`CalcWeirQx/Qy`, `EWeir_Bridge`) war an `Statesptr->SGC == ON`
  gebunden. **Ohne** Subgrid-Kanäle sind die SGC-Arrays (`SGCn/SGCgroup/QxSGold/SGCwidth`) **nicht
  allokiert** → Zugriff segfaultet, sobald Wasser eine Brückenzelle erreicht; bzw. `hflow≈0 → 0/0 = NaN`
  verseucht das gesamte H-Feld. Ohne Fix wird die Brücke faktisch zur **Wand**.
- Der Patch entfernt den SGC-Guard und ergänzt einen Nicht-SGC-Fallback (Manning aus `Manningsn`/`FPn`,
  Trägheitsterm aus `Qxold·dx`, Brückenbreite als Bezugsbreite) plus Trockenfall-/Div-by-zero-Guards.

Erzeugt aus dem Diff `pristine → deployt` und verifiziert: pristine + Patch == zuvor deployte Binärquelle.

### `quagg-inflow-momentum.patch`
Ergänzt **gerichteten Innenzufluss mit Impuls — freier Winkel**. Im pristine 8.0.3 heben
Punkt­quellen (`P x y QVAR/QFIX`) nur die Wassersäule (`iterateq.cpp` `H += PS_Val·dx·Tstep/dA`)
— richtungslos, ohne Impuls; echter Impuls gibt es nur an den 4 Rasterkanten (`boundary.cpp`).
Der Patch erlaubt einen optionalen Richtungs-Token in der `.bci`-Punktquelle:
`P x y QVAR <profil> <DIR>` (bzw. `P x y QFIX <wert> <DIR>`), wobei `<DIR>` entweder eine
Himmelsrichtung (`N|E|S|W`) ODER ein **freier Welt-Azimut in Grad** ist. Damit kann **jede**
Zelle einen gerichteten Zufluss in **beliebigem Winkel** bekommen, ohne NoData-Tricks/Kanten-Snap.

**Winkel-Konvention:** Welt-Azimut θ in Grad, **0° = Ost, 90° = Nord** (gegen Uhrzeigersinn).
N/E/S/W mappen intern auf 90/0/270/180°. Solver-Zerlegung (T1-verifiziert: `+Qx=Ost`,
`+Qy=Süd` ⇒ Nord=`−Qy`): `qx = q·cos θ`, `qy = −q·sin θ`, jede Komponente einzeln Froude-gekappt.
Jede Komponente wird auf ihre **Vorderkante** (in Komponenten-Richtung) injiziert: ostwärts→
Ostkante `Qx[xi+1]`, westwärts→Westkante `Qx[xi]`; nordwärts→Nordkante `Qy[xi]`, südwärts→
Südkante `Qy[xi+(yi+1)]`. So liegt der Impuls immer auf der **offenen** Vorderkante und nie auf
einer Rück-/Flankenwand (s.u. Nozzle-Wand im Client) — konsistente Vorwärts-Geschwindigkeit
für alle Richtungen. Ohne Winkel-Token byte-identisch (Patch inert).

Hinweis: Allein hält der (Froude-gekappte) Impuls den Rückfluss NICHT auf — die LISFLOOD-
Punktquelle pumpt die volle Menge als **Masse** in die Zelle → radialer Spiegelgradient.
Gerichteter Austritt entsteht erst zusammen mit der **Nozzle-Wand** (`InputGenerator.buildInflowBackBarriers`):
die Zufluss-Zelle wird dreiseitig mit hohen Wehren umschlossen (Rückseite + Flanken),
Vorderkante offen.

Betroffene Dateien:
- **lisflood.h**: `EDirection *PS_Dir` + `NUMERIC_TYPE *PS_Angle` (Grad, NaN=keiner) in `struct BoundCs`.
- **input.cpp** (`LoadBCs`): `PS_Dir`/`PS_Angle` allokieren/initialisieren, Token via `ParseInflowDir`
  (Himmelsrichtung ODER Float-Grad) parsen, im Resize-Block mitkopieren.
- **iterateq.cpp** (Punktquellen-Schleife in `UpdateH`, nach der Divergenz): den Winkel in
  Qx/Qy-Komponenten zerlegen und auf die jeweilige **Vorderkante** der Zelle **addieren** (in `Qx/Qy`,
  m³/s — `UpdateQs` kopiert nach `Qxold/Qyold`), den der Trägheits-Solver weiterträgt.

**Sicherheits-Design** (verhindert Solver-Instabilität / „Physik-Vergewaltigung"):
- `PS_Dir == DirectionNA` / `PS_Angle == NaN` (Default) ⇒ **byte-identisch** zum pristine Verhalten (Null-Risiko-Regression).
- Nur wenn `acceleration == ON && SGC == OFF` (sonst Volumen-only; FV1/DG2/Roe/SGC unberührt).
- **Wet-Gate** `h > DepthThresh`: bei trockener Zelle erst Volumen aufbauen (verhindert `0/0`).
- **Froude-Kappung** `|q_in| ≤ √(g·h)·h` PRO KOMPONENTE ⇒ injizierte Geschwindigkeit ≤ Wellengeschwindigkeit,
  womit der vorhandene (tiefenbasierte) CFL-Zeitschritt gültig bleibt — kein dt-Eingriff nötig.
- **ADD-then-clamp** je Komponente auf `±√(g·h)·h` ⇒ gegenläufige/serielle Zuläufe bleiben beschränkt.

**Verifiziert** (Docker-Läufe, flaches Gelände, Quelle in Zellmitte):
- 4-Richtungs-Stand (T1): E⇒+Vx, W⇒−Vx, N und S bestätigt gegensätzlich; keine NaN auch bei
  gegenläufigen Extremzuläufen (Q=50, Froude hält |v| endlich nahe √(g·h)).
- Freier Winkel: θ=0°⇒Ost (+0.05 vs. richtungslos), 90°⇒Nord (−0.03), 180°⇒West (−0.39),
  270°⇒Süd (+0.32), 45°⇒diagonal (Ost +0.06 & Nord −0.03) — alle physikalisch korrekt, 0 NaN.
- Ohne Token: byte-identisch zum richtungslosen Baseline (Regression bestätigt).

**Wichtige Implementierungs-Subtilität**: Der Flux wird in `Qx/Qy` (m³/s) NACH der
Divergenz-Schleife in `UpdateH` gesetzt — NICHT in `Qxold/Qyold` und NICHT vor der Divergenz.
Grund: `UpdateQs` (fp_acc.cpp, läuft direkt nach `UpdateH`) überschreibt `Qxold = Qx/dx`;
ein in `Qxold` gesetzter Wert würde sofort ausradiert. Setzen nach der Divergenz vermeidet
zudem einen Massenfehler.

### `quagg-outflow-free-direction.patch`
Ergänzt **Punkt-FREE mit expliziter Austrittskante**. Im pristine 8.0.3 ist eine "freie"
(Normalabfluss-)Randbedingung (`FREE`) ausschließlich als native `N/S/E/W`-Kantenzeile am
literalen Rasterrand gültig (`boundary.cpp`) — eine Punktquelle `P x y FREE` wird nur akzeptiert,
wenn `SGC==ON` (`FREE6`, kanalspezifische Physik, s.u.), sonst still verworfen. Für ein
schiefes/rotiertes DGM (in einer achsparallelen Bounding-Box mit NoData-Padding gespeichert)
berührt die wahre Geländekante die literale Rechteck-Kante oft NIRGENDS — "Frei" war für solche
Terrains bisher komplett unerreichbar, egal welche Zelle der Nutzer wählte.

Der Patch erlaubt einen **erforderlichen** Richtungs-Token in der `.bci`-Punktquelle:
`P x y FREE <slope> <N|E|S|W>` — nur Himmelsrichtungen (kein freier Winkel wie bei
inflow-momentum), weil FREE ein 1-D Manning-Normalabfluss PRO KANTE ist (keine Winkel-Zerlegung
möglich). Ohne Token bleibt die Zeile ein stiller No-Op, byte-identisch zum bisherigen Verhalten.

**Warum `FREE6` (SGC) nicht wiederverwendbar ist:** `FREE6` wird ausschließlich vom separaten
SGC-Solver-Pfad (`lisflood2/sgm_fast.cpp`, `SGC2_CalcPointFREE`) verarbeitet — eine
volumetrische Kanal-Manning-ODE mit `SGCwidth`/`SGCbfH`/`SGCgroup`, die ohne gezeichneten
Sub-Grid-Kanal nicht existieren. SGC ist ein einziges globales Flag für den gesamten Lauf; der
neue `FREE9`-Typ ist bewusst ein eigener Enum-Wert (nicht `FREE6`), obwohl beide Pfade
laufzeitseitig gegenseitig exklusiv sind (SGC an ODER aus, nie beides) — nur zur Klarheit,
damit `FREE6`s SGC-Verbraucher unangetastet bleiben.

**Physik (identisch zur nativen Kanten-FREE, `boundary.cpp` FREE1/acceleration):**
`Q = sign · (|q₀| + |g·Δt·hflow·Sf|) / (1 + g·Δt·hflow·n²·|q₀| / hflow^(10/3))`, mit
`hflow` = eigene Wassertiefe der Austrittszelle, `Sf` = Sohlgefälle (vom Nutzer vorgegeben, oder
`-1` = automatisch aus dem DEM-Gefälle zum rückwärtigen Nachbarn — mit Bounds-Guard, falls dieser
Nachbar außerhalb des Rasters läge). Angewendet auf die Kante DIESER Zelle in der angegebenen
Richtung (`Qx`/`Qy`-Array-Index, identische Formeln wie im inflow-momentum-Patch für die
Vorderkanten-Auswahl), statt an einer der vier Array-Rand-Kanten.

Betroffene Dateien:
- **lisflood.h**: neuer Enum-Wert `FREE9` in `ESourceType` (kein neues `BoundCs`-Feld — nutzt
  `PS_Dir` aus `quagg-inflow-momentum.patch` mit; muss deshalb NACH diesem Patch angewandt werden).
- **input.cpp** (`LoadBCs`): neuer `else if`-Zweig NACH dem bestehenden `FREE6`/SGC-Zweig, nur
  bei `SGC==OFF`. Parst einen 3. Token aus `buff2`, akzeptiert nur `N/E/S/W` (bzw. volle Namen);
  jeder andere/fehlende Token lässt die Zeile inert (kein `PS_Ident` gesetzt).
- **iterateq.cpp** (`UpdateH`): neue Schleife über `BCptr->numPS`, gefiltert auf `FREE9` +
  `acceleration==ON && SGC==OFF` + Wet-Gate — **VOR** der Divergenz-Schleife eingefügt (anders
  als der inflow-momentum-Block, der bewusst DANACH steht): FREE muss DIESEN Zeitschritt Volumen
  abführen (wie die native Kanten-FREE, die in `BCs()` ebenfalls vor `UpdateH` läuft), nicht nur
  die nächste Reibungs-Rückkopplung beeinflussen. Trägt außerdem in `BCptr->Qpoint_neg` ein
  (wie die bestehenden QFIX4/QVAR5-Punktquellen-Schleifen direkt darüber) — sonst berechnet
  `BoundaryFlux()` (`boundary.cpp`) `Qout` nur aus den 4 literalen Rand-Kanten und der Abfluss
  bliebe in `res.mass`' Qout-Spalte unsichtbar (bei laufender Physik!). **Zweite, NEUE Schleife
  NACH der Divergenz-Schleife**: setzt die NoData-Empfängerzelle (in die entwässert wird) hart
  auf `H=0` zurück. Grund: anders als am echten Rasterrand (wo "jenseits der Kante" gar kein
  Array-Slot mehr existiert) IST die Nachbarzelle hier ein echter, im Array vorhandener
  NoData-Slot — die Divergenz-Schleife schreibt ihm dasselbe Wasser gut, das der Quellzelle
  gerade abgezogen wurde, und `DomainVol()` (`util.cpp`) summiert `H` über ALLE Zellen ohne
  NoData-Ausschluss (nur ein `ChanMask`-Filter) — ohne den Reset "verschwindet" das Wasser
  also gar nicht aus der Bilanz, es wandert nur eine Zelle weiter. Der Reset ist unschädlich für
  jede andere Physik: eine NoData-Zelle bekommt aus keiner anderen Quelle je sinnvollen Zufluss
  (deren `hflow` kollabiert dort ohnehin auf ~0 wegen der riesigen NoData-Elevation, s.
  `CalcFPQxAcc`/`CalcFPQyAcc`).

**Sicherheits-Design:**
- Kein Richtungs-Token ⇒ **byte-identisch** zum pristine Verhalten (Null-Risiko-Regression, wie
  bei inflow-momentum).
- Nur `acceleration==ON && SGC==OFF` (identischer Geltungsbereich wie inflow-momentum — `fv1`/
  `dg2` sind eigenständige Solver ohne `iterateq.cpp`/`BoundCs.PS_Dir`, siehe unten).
- **Wet-Gate** `h>DepthThresh` und `ChanMask==-1`-Guard, identisch zu `boundary.cpp` FREE1.
- Auto-Sf-Zweig (`PS_Val<-0.999`) hat einen **Bounds-Guard** für den rückwärtigen Nachbarn (Zelle
  am äußersten Rasterrand mit orthogonaler Austrittsrichtung) — fällt auf ein flaches
  Sicherheits-Sf zurück statt außerhalb des Arrays zu lesen. In der Praxis irrelevant, da der
  Client (InputGenerator.js) FREE nie mit `-1` exportiert, immer ein konkretes Sf.

**Verifiziert (lokal, außerhalb Docker — g++/cmake im Sandbox-Environment verfügbar):**
- Patch wendet sauber auf `pristine + weir-flow + inflow-momentum + coupling` an (Reihenfolge
  wie im Dockerfile), Build (`cmake --build --target lisflood`) kompiliert ohne neue Warnungen/
  Fehler in den geänderten Dateien.
- End-to-End-Lauf (10×10 flaches Testraster, Startwasserstand 2 m, `P x y FREE 0.05 E` an einer
  INNENLIEGENDEN Zelle über 60 s): Massebilanz zeigt echten, gemessenen Volumenverlust
  (5000.0000 → 4999.9995 m³) und ein asymmetrisches Tiefenfeld um die Austrittszelle — Wasser
  verlässt tatsächlich das Modell an der gewählten Innenzelle/Richtung. Baseline OHNE
  Richtungs-Token (identische Szene, `P x y FREE 0.05` ohne 4. Token): Massebilanz bleibt exakt
  konstant (5000.0000 durchgehend), Tiefenfeld bleibt exakt flach (2.000 überall) — bestätigt
  byte-identischen No-Op ohne Token.
- **Docker-Image gebaut und gegen ein ECHTES App-Szenario verifiziert** (`pod-9857d9fb80ee`,
  reale urbane Terrain-Daten 314×428, Qin=20 m³/s über 25 QVAR-Punkte, 51 Punkt-FREE-Zellen mit
  Richtung, `flow.weir` mit 46 Gebäudewänden). Erste Docker-Version (v1) zeigte im echten Szenario
  weiterhin `Qout=0.000` durchgehend, obwohl die Tiefe an der Ziel-Zelle nachweislich einbrach
  (2.487 m ohne Abfluss vs. 0.016 m mit) — **zwei echte Bugs gefunden, die im simplen 10×10-Test
  nicht auffielen**, weil dort weder Massebilanz-Buchführung noch die Nachbarzellen-Falle
  eine Rolle spielten: (1) `Qpoint_neg` wurde nie beschrieben ⇒ `Qout` blieb unsichtbar trotz
  laufender Physik; (2) die NoData-Empfängerzelle behielt das abgeführte Wasser (kein
  NoData-Ausschluss in `DomainVol()`) ⇒ Wasser "verschwand" nicht wirklich aus der Bilanz,
  wanderte nur eine Zelle weiter. Beide gefixt (s. iterateq.cpp-Abschnitt oben). Nach dem Fix,
  am selben echten Szenario: `Qin≈20.0 ≈ Qout≈19.3–22.0` (Fließgleichgewicht, wie erwartet),
  `Verror` zurück auf Rauschniveau (0.0001–0.0002, vorher −40 mit dem halbfertigen v1-Fix),
  Gesamtvolumen am Ende sinkt von 2141 auf 526 m³ (Wasser verlässt jetzt tatsächlich das Modell).
  Lehre: ein synthetischer Einzelzellen-Test beweist nur, dass die lokale Manning-Formel korrekt
  rechnet — NICHT, dass die Massebilanz-Buchführung und die Nachbarzellen-Interaktion stimmen;
  beides erst am echten, komplexen Szenario sichtbar geworden.
- `lisflood-fp:latest` zeigt seit diesem Fix auf das image mit BEIDEN Korrekturen; die
  ursprüngliche (fehlerhafte) Docker-Version bleibt unter `lisflood-fp:outflow-free-direction-v1-broken-qout`
  archiviert (nicht löschen, dokumentiert die gefundenen Bugs).

### `quagg-coupling.patch`
Fügt die **1D/2D-Kopplung EPA-SWMM ↔ LISFLOOD-FP** ein (In-Process-Lockstep). Statt SWMM extern
über einen Python-Treiber zu steppen, linkt LISFLOOD `libswmm5` und treibt SWMM aus der
`IterateQ`-Schleife — feinere Kopplung, `handler.py` bleibt ein einfacher Launcher.

- **Neue Dateien** (nicht im Patch, per Dockerfile in `/src` kopiert): `engines/docker/coupling.{h,cpp}`.
  Die eigentliche Austauschlogik lebt dort; der Patch fügt nur Aufruf-Stellen ein.
- **lisflood.h**: `int coupling` (States) + `char couplingfilename[256]` (Fnames).
- **pars.cpp**: `couplingfile`-Keyword (Pfad zur `flow.coupling`).
- **lisflood.cpp**: `Coupling_Init(...)` vor dem Solver-Branch, `Coupling_Finalize(...)` danach.
- **iterateq.cpp**: ein `Coupling_Update(...)`-Hook nach `t += Tstep`.
- **CMakeLists.txt**: `coupling.cpp` in `lisflood-base`; unter `-DQUAGG_COUPLING=ON` wird
  `libswmm5` gelinkt (`SWMM_LIB`), der Header eingebunden (`SWMM_INC`), rpath `/opt/swmm` gesetzt.

**Sicherheits-Design / Regression:** Ohne `-DQUAGG_COUPLING` sind `Coupling_*` reine No-Ops
(coupling.cpp kompiliert ohne libswmm5) → der pristine-Build ist unberührt. MIT dem Flag, aber
**ohne** `couplingfile` in der `.par`, bleibt `coupling==OFF` und der Hook kehrt sofort zurück →
verhaltensgleich (Gate: `../docker/test_bridge_no_sgc.py` grün). Kopplungsnachweis:
`../docker/test_coupling.py` (SWMM-Überstau erscheint im 2D).

**`flow.coupling`-Format** (Text, wie `flow.weir`; Weltkoordinaten):
```
<swmm.inp> <dt_c[s]> <n>
<node-id> <x> <y> <rim[mNN]> <Cw> <Amax>
...
```
**Austauschlogik** (ratenbasiert, seit 2026-07-08): Alle `dt_c` wird SWMM lockstep vorgerückt und je
Schacht eine Rate `Q` bestimmt; die wird dann **jeden 2D-Zeitschritt** als Quellterm `H += Q·Tstep/dA`
angewendet (kein instantaner Volumen-Slug mehr → keine Druckstöße/Phantom-Quellen im acceleration-Schema).
- JUNCTION/STORAGE — **bidirektionales Deckel-Wehr über die Kopfdifferenz** `dh = hu − max(hd, rim)`
  (hu/hd = größerer/kleinerer von 2D-WSE und SWMM-`NODE_HEAD`): `Q=Cw·dh·√(g·dh)`.
  2D höher → Einzug (positiver LATFLOW); Netz höher → **Flutung aufs Gelände** (negativer LATFLOW,
  gleiche Menge ins Raster) — der Schacht bekommt dafür im coupled-Export `SurDepth 999`
  (Druckabfluss statt SWMM-internem Fluten). `Cw` bündelt Cd·L; `Amax`=0 → keine Zusatz-Kappung.
  Stabilisierung der expliziten Kopplung: Qeq-Limiter (max. ¼ der Kopfdifferenz pro Intervall
  ausgleichen), Kappung auf verfügbares 2D-/1D-Volumen, 50/50-LATFLOW-Relaxation. Ohne diese drei
  schaukelt sich der Austausch am SWMM-Slot-Schacht auf (Head springt, `Q~dh^1.5` → Explosion) bzw.
  SWMM produziert große Kontinuitätsfehler (= im Netz „erzeugtes" Wasser).
- Notventil: flutet SWMM doch intern (SurDepth klein, `ALLOW_PONDING NO`), wird `NODE_OVERFLOW`
  während der SWMM-Schritte **integriert** und als Pool ratenkontrolliert ins Raster ausgeliefert —
  Momentanraten-Sampling am Intervallende erzeugt nachweislich Phantom-Wasser (Rate kollabiert,
  sobald LATFLOW=0 gesetzt wird).
- OUTFALL: `NODE_INFLOW` wird während der SWMM-Schritte integriert und ins Raster ausgeliefert
  (`NODE_OVERFLOW` ist an Outfalls immer 0 — vorher ging Auslass-Wasser komplett verloren).
  Bewusst keine Stage-Rückkopplung (positive Rückkopplung, unbilanzierter Rückfluss).
- Massenbilanz: jede getauschte m³ wird in `BCptr->VolInMT/VolOutMT` eingebucht → `Verror` in
  `res.mass` bleibt echt (vorher zählte Kopplungswasser als Massenfehler → „Instabilität"-Badge).
  Liefert das 2D weniger als SWMM per LATFLOW schon erhielt (Zelle leergelaufen), wird die Differenz
  als Bilanz-Schuld geführt und beim nächsten Intervall vom Einzug abgezogen.
- Schutz: `rim < DEM` wird auf Geländehöhe geklemmt (fehlendes coverZ → Dauereinzug-Falle);
  Knoten auf NoData-Zellen werden deaktiviert (Client-seitig im couplingDetector + Solver-seitig).
- Regression: `../docker/test_coupling_roundtrip.py` (2D→1D→Outfall→2D, Erhaltung + Verror +
  [COUPLE]-Logs) und `../docker/test_coupling.py` (Notventil-Überstau).
- Logging: `[COUPLE]`-Zeilen auf stdout (Init-Tabelle, Status/Σ-Bilanz alle ≥60 s Sim-Zeit, Endsumme);
  `handler.py` reicht sie UNGEDROSSELT als log-Events durch → sichtbar in der Solver-Konsole des
  Flood2D-Runners (`[SOLVER] [COUPLE] …`).

**Achtung Zeilenenden:** Die LISFLOOD-Quellen sind CRLF. Diff-**Metazeilen** (`---`/`+++`/`@@`) müssen
LF-only sein, die **Inhaltszeilen** CRLF — sonst strippt GNU patch alle CRs und kein Hunk matcht
(„different line endings"). Editor-Autokonvertierung auf durchgehend CRLF macht den Patch kaputt.

### `quagg-sgc-trapezoid.patch`
Vervollständigt **`SGCchan_type 7`** (Trapez-Querschnitt: Sohlbreite + Böschungsneigung,
`A=(we+sl·h)·h`) im vendorten LISFLOOD-FP 8.0.3. Fund (2026-07-25, ausgelöst durch einen
echten RunPod-Absturz): Typ 7 war nur in den Pro-Zeitschritt-Funktionen `CalcSGC_A`/
`CalcSGC_R` (`sgc.cpp`) — und deren „fast"-Duplikaten `SGC2_CalcA`/`SGC2_CalcR`
(`lisflood2/sgm_fast.cpp`, ein **komplett paralleler** zweiter Satz derselben
Kanaltyp-Switch-Statements, den man leicht übersieht) — aktiv implementiert. Drei weitere
Funktionen fielen für Typ 7 in den `default`-Zweig (`printf("Should not be here!...")`)
und ließen `SGCc`/`SGCbfV` auf 0: `CalcSGCz` (einmalige Initialisierung), `CalcSGC_UpV`/
`CalcSGC_UpH` (Volumen↔Tiefe, Hot Loop) sowie deren `sgm_fast.cpp`-Pendants
`SGC2_CalcUpV`/`SGC2_CalcUpH`. Ergebnis: jede Trapez-Kanalzelle bekam eine korrumpierte
Geometrie → nachgelagert „Bridge must have sub grid flows on either side" (`lisflood2/
lisflood_processing.cpp`) → Exit 255, sobald eine Brücke in der Nähe lag.

**Fix je Funktion:**
- `CalcSGCz`: `SGCc[p0] = SGCc[p0]*(w0+sl*bfH)`, `SGCbfV[p0] = SGCc[p0]*bfH` — reproduziert
  exakt die Bankfull-Trapezfläche `(we+sl·bfH)·bfH` (dieselbe Formel wie das bereits aktive
  `CalcSGC_A` case 7). `w0`/`SGCwidth` bleibt unverändert die **Sohlbreite** (verifiziert:
  `CalcSGC_A`/`R` lesen `Arrptr->SGCwidth[p0]` direkt als `we`, ohne Umrechnung — der
  auskommentierte Original-Entwurf ging von Bankfull-Breite aus und hätte ein nie
  allokiertes `SGCsl`-Array gebraucht; nicht übernommen).
- `CalcSGC_UpV`/`UpH` + `SGC2_CalcUpV`/`UpH`: **lineare Näherung** unterhalb Bankfull
  (`v=h·c` bzw. `h=V/c`) — dieselbe Konvention, die der Vendor selbst schon für den
  einzigen anderen Nicht-Rechteck-Fall verwendet (Dreieck, Case 3/4). Bewusste
  Einschränkung: diese Funktionssignatur bekommt die Kanalbreite nicht als Parameter (nur
  Neigung + den geformten Skalar `c`), ein echtes Trapez ist unterhalb Bankfull aber
  quadratisch in der Tiefe — eine exakte Lösung hätte die Signatur an 5+ Aufrufstellen in
  zwei Dateien ändern müssen. Oberhalb/bei Bankfull ist das Ergebnis exakt (`SGCbfV`
  stimmt), darunter eine dokumentierte Näherung.

**Sicherheits-Design:** reiner Additiv-Patch (neue `case 7`-Zweige), Typ 1 (Rechteck) und
alle anderen Typen unangetastet → Null-Risiko-Regression für bestehende SGC-Szenarien.

**Verifiziert (lokal, außerhalb Docker):**
- Baut ohne neue Compiler-Warnungen in `sgc.cpp`/`lisflood2/sgm_fast.cpp`
  (`cmake --build --target lisflood`, `_NETCDF=0` lokal wegen fehlender Systemlib).
- Patch appliziert sauber auf `pristine + weir-flow + inflow-momentum + coupling +
  outflow-free-direction` (exakte Docker-Reihenfolge), Ergebnis byte-identisch zur
  bearbeiteten Arbeitskopie.
- Testlauf mit einem vorhandenen Vendor-SGC-Testfall (`testing/T002_BCTest/BCTest_SGC.par`,
  `SGCchan 7` + `SGCs 1.5` ergänzt, globaler Modus ohne `SGCchangroup` — testet dieselben
  gepatchten Switch-Zweige wie der Gruppen-Modus): Exit 0, keine „Should not be
  here"-Ausgabe mehr, alle Wasserstände endlich, `Verror`/`Qerror` exakt 0. Rechteck-
  Kontrollgruppe (unverändertes `BCTest_SGC.par`) läuft unverändert weiter — Regression
  bestanden. Physik-Plausibilität: Trapez zeigt bei gleicher Sohlbreite eine niedrigere
  Spitzenwassertiefe als Rechteck (1.302 m vs. 1.436 m am Zufluss-Zentrum) — mehr
  Abflusskapazität durch die geneigten Böschungen, wie erwartet.
- **Noch offen** (s. „⚠️ Offen" unten): kein Docker-Image gebaut, keine
  `SGCchangroup`/`SGCchanprams`-Mehrfachkanal-Verifikation, keine Brücke-über-Trapez-
  Szenario-Verifikation (genau die Kombination, die den ursprünglichen Absturz auslöste).

### `quagg-sgc-bridge-blowup.patch`
Behebt eine **separate, vom Trapez-Patch unabhängige** katastrophale Fehlberechnung: eine
Brücke (`<dir>B`) über einem SGC-Kanal, im `acceleration`-Schema (der Modus, den SGC in
dieser Codebasis praktisch immer nutzt). Beim Verifizieren von `quagg-sgc-trapezoid.patch`
mit einer Brücke gefunden (2026-07-25) — reproduziert **identisch mit unverändertem
Rechteck-Kanal (Typ 1)**, also kein Trapez-spezifisches Problem.

**Repro** (30×12-Raster, 1×1 m Zellen, SGC-Kanal + eine Brücke quer darüber,
`SGCchangroup`/`SGCchanprams`, `acceleration`): sobald die Benetzungsfront die Brückenzelle
erreicht, springt die Massebilanz innerhalb eines einzigen Zeitschritts von sauber auf
>50.000 m³ Fehler (kein Crash — falsches Ergebnis).

**Root Cause** (`lisflood2/sgm_fast.cpp`, `CalcBridgeQ` — das ist der tatsächlich aktive
Pfad im `acceleration`-Schema; `weir_flow.cpp`s `CalcWeirQx`/`CalcWeirQy` sind hier
**nicht** beteiligt, die laufen nur im klassischen Schema, und `sgc.cpp`s
`SGC_FloodplainQ` ist toter Code hinter einem nie definierten `RESULT_CHECK`-Macro —
zwei Sackgassen, die vor dem eigentlichen Fund erst ausgeschlossen werden mussten).
`CalcBridgeQ` berechnet den Freispiegelabfluss (`Qoc`) unter der Brücke über
`hflow = max(se0,se1) - max(z0,z1)` — korrekt für plane Überschwemmungsfläche (Wasser
fällt dort nie unter DEM-Niveau `z`), aber falsch sobald ein SGC-Kanal vorhanden ist: der
Kanal liegt unterhalb von `z`, der Wasserstand im durchströmten (nicht überfluteten) Bett
liegt also legitim unterhalb `z` (`h_grid` negativ relativ zu `z`, SGC_BankFullHeight-
Konvention). `hflow` wird dadurch negativ, sobald der Kanal nur im Bett fließt — eine
negative Fläche `A=Width·hflow` und ein negativer hydraulischer Radius `R` gehen
ungeprüft in `CalculateQ()` und liefern ein physikalisch sinnloses `Qoc` (schon lange vor
dem sichtbaren Blowup: `Qoc=50730` bei 2 mm Wassertiefe). Die normale (nicht-Brücken-)
SGC-Kanalzelle-zu-Zelle-Rechnung in derselben Datei (`ProcessSubGridQBlock`) macht es
richtig: misst `hflow` gegen die Kanalsohle (`z - SGC_BankFullHeight`) und nutzt
`SGC2_CalcA`/`SGC2_CalcR` (kanal-bewusst) statt `Width·hflow`. `CalcBridgeQ` hatte diese
Kanal-Bewusstheit nie bekommen.

**Verifiziert am vendor-eigenen offiziellen Testfall**
(`testing/T016c_Bridge_orifice_test/MT_SGC_orifice.par`, große Zellen, SGC-Kanal +
Brücke, 5.440.500 s Simulationszeit): vor diesem Fix blieb der Lauf zwar numerisch
endlich (kein Absturz), zeigte aber **die gesamte Laufzeit über `Qout=0.000`** (kein
Abfluss durch die Brücke) und einen Massebilanzfehler in Millionenhöhe (`Verror` bis
2.87e6 bei `Vol`~4e7, ~7 % relativer Fehler) — der Bug war also nicht nur ein Problem
feiner (1×1 m) Raster, sondern hat auch das vendor-eigene große Referenzszenario die
ganze Zeit still falsch gerechnet. Nach dem Fix: `Qout` wächst auf einen physikalisch
plausiblen Wert (~810–860 m³/s, vergleichbar mit `Qin`), `Verror` fällt auf
Maschinenrauschen (< 50 bei `Vol`~1e8).

**Fix:** neuer Zweig in `CalcBridgeQ` — ist an mindestens einer Seite ein SGC-Kanal
vorhanden (`SGCwidth > 0`), wird `hflow` gegen die Kanalsohle gemessen und Fläche/Radius
über `SGC2_CalcA`/`SGC2_CalcR` berechnet (inkl. „kleinste Fläche gewinnt"-Konvention
zwischen beiden Seiten, wie in `ProcessSubGridQBlock`). Ist an keiner Seite ein SGC-Kanal
vorhanden, bleibt die ursprüngliche Vendor-Formel bitgleich erhalten — reiner
Additiv-Fix, kein Verhaltenswechsel für Brücken ohne SGC. `CalcBridgeQ` und
`SGC2_UpdateBridgesFlow_row` bekommen dafür einen neuen `SGCptr`-Parameter (in
`Do_Update` bereits vorhanden, nur eine Ebene tiefer durchgereicht).

**Sicherheits-Design:** `hflow > depth_thresh`-Wache wie beim bestehenden Vendor-Muster;
bei `SGCwidth=0` ist der neue Zweig unerreichbar, alte Formel bitgleich (verifiziert per
`test_bridge_no_sgc.py`, unverändert grün).

**Verifiziert (lokal, außerhalb Docker):**
- Baut ohne neue Compiler-Warnungen in `lisflood2/sgm_fast.cpp`.
- Patch appliziert sauber auf `pristine + weir-flow + inflow-momentum + coupling +
  outflow-free-direction + sgc-trapezoid` (exakte Docker-Reihenfolge), Ergebnis
  byte-identisch zur bearbeiteten Arbeitskopie.
- Repro-Szenario (SGC-Kanal Typ 1 + Brücke, 1×1 m Raster, `saveint 1`): vorher Exit 124
  (hängt in Divergenz), `Vol` explodiert bei t=30 auf 50734; nachher Exit 0, `Vol` wächst
  exakt linear (0.1 m³/s Zufluss), `Verror` auf Maschinenrauschen (1e-7) den ganzen Lauf.
- Vendor-Testfall `MT_SGC_orifice.par`: s. oben, `Qout>0` und `Verror` auf Rauschniveau
  statt Millionenfehler.
- `test_bridge_no_sgc.py` (Brücke ganz ohne SGC-Keyword): unverändert grün, `res.max`
  weiterhin endlich, keine Verhaltensänderung.
- **Noch offen** (s. „⚠️ Offen" unten): kein Docker-Image gebaut, kein RunPod-Lauf.

### `quagg-bridge-flow-index.patch`
Entfernt einen zu strengen, **asymmetrischen** Setup-Check in
`lisflood2/lisflood_processing.cpp` (Bridge-Validierung), der eine Brücke über
einem **völlig gültigen** SGC-Kanal mit „Invalid bridge cell. Bridge must have
sub grid flows on either side." abstürzen ließ — unabhängig von den beiden
Patches oben. Gefunden beim Testen von `quagg-sgc-bridge-blowup.patch` gegen
ein echtes Kundenprojekt (2026-07-25).

**Repro** (314×428 Zellen, 1×1 m, Typ-7-Trapezkanal, 5 Brücken, aus einem
echten fehlgeschlagenen RunPod-Job): 2 von 5 Brücken (eine `EB`, eine `SB`)
standen exakt über durchgehendem Kanal (Breite 2 m auf beiden Zellen, an
denen die Brücke selbst hängt) — der Solver brach trotzdem mit Exit 255 ab.

**Root Cause** (per Debug-Instrumentierung direkt am Absturzpunkt
verifiziert, nicht geraten): Für eine an Spalte `xi` hängende `EB`-Brücke
prüft `lisflood_processing.cpp` zwei Einträge in
`Weir_pair_stream_flow_index` — die „upstream flow"-Indizes, die
`CalcBridgeQ` (`sgm_fast.cpp`) für die Anströmgeschwindigkeit `usVel` beim
Druckabfluss (`Qp`) braucht:
- West-Check: prüft effektiv nur die zwei Zellen, über denen die Brücke
  selbst hängt (`xi-1`, `xi`) — praktisch immer erfüllt.
- Ost-Check: verlangt zusätzlich, dass der Kanal **zwei weitere** Zellen
  Richtung Osten reicht (`xi+1`, `xi+2`) — eine Anforderung ohne Gegenstück
  auf der Westseite. Analog für `SB`-Brücken in Y-Richtung.

Beim Kundenprojekt verläuft der Kanal an beiden betroffenen Kreuzungen leicht
diagonal (treppenförmig im Raster) — der Korridor ist an der Brücke genau 2
Zellen breit, reicht aber nicht die zusätzlich verlangten 2 Zellen weiter. Ob
das im Original-Vendor-Code eine bewusste (aber fragile) Anforderung oder ein
Off-by-One-Fehler ist, ließ sich nicht abschließend klären — sicherer als
eine Vermutung über die „richtige" Index-Verschiebung zu raten (Risiko:
stiller Out-of-Bounds-Read/falsche Physik statt eines klaren Abbruchs) ist
es, den Check zu entschärfen.

**Warum das sicher ist:** `Weir_pair_stream_flow_index` wird in
`CalcBridgeQ` ausschließlich für `usVel`/`heg` verwendet, die wiederum nur in
`Qp` (Druckabfluss-Zweig) einfließen — niemals in `Qoc` (den dominanten,
Freispiegel-Zweig unterhalb der Soffitte, s. `quagg-sgc-bridge-blowup.patch`
oben). `usVel=0` ist eine etablierte, sichere Vereinfachung.

**Fix:**
- `lisflood_processing.cpp`: harter `exit(-1)` in beiden `EWeir_Bridge`-
  Zweigen (Qx- und Qy-Richtung) entfernt; `Weir_pair_stream_flow_index`
  bleibt bei -1 (ohnehin schon der Default).
- `sgm_fast.cpp`, `CalcBridgeQ`: beide `usVel`-Berechnungen prüfen den Index
  vor dem Array-Zugriff; bei -1 wird `usVel = 0` gesetzt statt
  `sg_flow_Q[-1]` zu lesen.

**Sicherheits-Design:** reiner Additiv-Fix (weniger Abbruchbedingungen, ein
zusätzlicher Guard vor einem Array-Zugriff) — für Brücken, bei denen beide
Indizes bereits gültig waren, ist das Verhalten bitidentisch.

**Verifiziert:**
- Lokaler Build: keine neuen Compiler-Warnungen/-Fehler.
- Patch appliziert sauber auf `pristine + weir-flow + inflow-momentum +
  coupling + outflow-free-direction + sgc-trapezoid + sgc-bridge-blowup`
  (exakte Docker-Reihenfolge), Ergebnis byte-identisch zur bearbeiteten
  Arbeitskopie.
- **Echtes Kundenprojekt** (aus dem realen fehlgeschlagenen RunPod-Job):
  vorher Exit 255 ("Invalid bridge cell"), nachher Exit 0, vollständiger
  Lauf über 100 s Simulationszeit (10000 Zeitschritte), `res.max`
  durchgehend endlich (895 nasse Zellen, max. Tiefe 1.84 m), Massebilanzfehler
  klein und gegen Laufende auf Rauschniveau (`Verror` 7.6e-6 bei t=100s).
- Regressions-Repro aus `quagg-sgc-bridge-blowup.patch` (1×1 m, SGC-Kanal +
  Brücke): weiterhin Exit 0, `Vol` wächst exakt linear, `Verror` auf
  Maschinenrauschen — unverändert.
- `test_bridge_no_sgc.py` (Brücke ganz ohne SGC): weiterhin grün, `res.max`
  endlich — unverändert (dieser Pfad nutzt `Weir_pair_stream_flow_index` gar
  nicht über das SGC-Array).

### `quagg-timeseries-memset.patch`
Behebt einen **Speicherfehler im Original-Vendor-Code** (keiner der vorherigen
QUAGG-Patches war die Ursache) — jeder Lauf mit **2 oder mehr** referenzierten
`.bdy`-Zeitreihen-Profilen (`QVAR`/`HVAR`, egal ob Rand oder Punktquelle)
konnte sporadisch mit SIGSEGV abstürzen. Gefunden 2026-07-25 beim Testen
eines echten Kundenprojekts (RunPod-Job, Exit -11/245, keine
stderr-Ausgabe — lokal identisch reproduziert).

**Root Cause, zwei zusammenwirkende Bugs** (per `gdb`-Backtrace verifiziert,
nicht geraten):
1. `input.cpp`, `LoadBCVar()`: hängt für jedes `.bdy`-Profil ein neues
   `TimeSeries` an `BCptr->allTimeSeries` (Typ `std::vector<TimeSeries>`) und
   speichert sofort die Adresse des frisch angehängten Elements dauerhaft in
   `BC_TimeSeries[]`/`PS_TimeSeries[]` — genutzt in **jedem** Zeitschritt via
   `InterpolateTimeSeries()`. Ein `std::vector` kann bei `push_back()` seinen
   kompletten Speicherblock verschieben (Reallokation) — das macht jede
   zuvor genommene Referenz auf ein älteres Element ungültig (dangling
   pointer). Bei genau 1 Profil tritt das nie auf; ab 2 Profilen hängt es
   vom internen Kapazitätswachstum des Vectors ab.
2. `lisflood.cpp`, `main()`: `BoundCs Bounds;` wird korrekt als C++-Objekt
   konstruiert (inkl. `allTimeSeries`), aber direkt danach überschreibt
   `memset(&Bounds, 0, sizeof(BoundCs));` den kompletten Speicher mit
   Nullbytes — undefined behavior für einen nicht-trivialen Member. Bei
   `std::vector` „funktioniert" das meist zufällig (libstdc++s leerer
   vector = drei Nullpointer, zufällig bytegleich mit `memset(...,0,...)`)
   — deshalb blieb dieser zweite Bug lange unbemerkt.

Der naheliegende Fix für Bug 1 (`vector`→`deque`, da `deque` Referenzen bei
`push_back`/`pop_back` an den Enden nicht ungültig macht) deckte Bug 2 sofort
auf: `deque`s leerer Zustand ist bei libstdc++ **nicht** einfach „alles
Null" — ein reiner Typtausch crashte prompt beim allerersten `push_back()`
(Null-Pointer-Konstruktion tief in der STL, per `gdb` verifiziert).

**Fix (beide Teile nötig):**
- `lisflood.h`: `BoundCs::allTimeSeries` von `std::vector<TimeSeries>` auf
  `std::deque<TimeSeries>` geändert.
- `lisflood.cpp`: direkt nach dem `memset()` von `Bounds` wird
  `new (&Bounds.allTimeSeries) std::deque<TimeSeries>();` (placement new)
  eingefügt — konstruiert gezielt nur diesen Member neu, ohne die anderen
  (gewollt genullten) `BoundCs`-Felder anzutasten.

**Sicherheits-Design:** rein korrigierend; `allTimeSeries` wird
ausschließlich in `LoadBCVar()` genutzt (`push_back`/`back()`/`pop_back()`,
von `deque` identisch unterstützt) — reiner Drop-in-Containertausch.

**Verifiziert:**
- Lokaler Build: keine neuen Compiler-Warnungen/-Fehler.
- Patch appliziert sauber auf `pristine + weir-flow + inflow-momentum +
  coupling + outflow-free-direction + sgc-trapezoid + sgc-bridge-blowup +
  bridge-flow-index` (exakte Docker-Reihenfolge), Ergebnis byte-identisch
  zur bearbeiteten Arbeitskopie.
- **Echtes Kundenprojekt** (identische Eingabedateien wie beim realen
  RunPod-Crash, 2 referenzierte Profile): vorher Segfault (per `gdb`
  verifiziert: Absturz in `InterpolateTimeSeries()` bzw. nach dem ersten
  Fix-Teil in `LoadBCVar()` selbst), nachher Exit 0, vollständiger Lauf über
  100s (10000 Zeitschritte), plausible Massebilanz (`Verror` konvergiert
  gegen 0).
- Negativkontrolle: sowohl das echte Kundenprojekt als auch ein neuer
  synthetischer Stresstest mit 10 referenzierten Profilen crashen
  zuverlässig (Exit 139/SIGSEGV) gegen die ungepatchte Basis und laufen
  fehlerfrei durch mit diesem Patch.
- Alle bestehenden lokalen Repro-Szenarien (SGC-Bridge-Blowup-Repro,
  Brücke-ohne-SGC) unverändert grün.

### `quagg-coupling-sgc-hook.patch`
Hängt die **1D/2D-SWMM-Kopplung in die SGC-Zeitschleife** des lisflood2-Fast-Pfads ein
(3 Hunks in `lisflood2/sgm_fast.cpp`; die Logik liegt in `coupling.cpp`/`coupling.h`,
die per COPY eingespielt werden).

- **Problem** (verifiziert 2026-07-28, `../docker/test_coupling_sgc.py`): `lisflood.cpp`
  verzweigt bei `SGC == ON` nach `Fast_MainStart()` → `Fast_IterateLoop()` (lisflood2/),
  und nur `IterateQ()` rief `Coupling_Update()`. Mit aktivem SGC lief der Austausch GAR
  NICHT — der Lauf meldete `[COUPLE] aktiv`, tauschte aber 0,00 m³. Da der Client offene
  Gerinne grundsätzlich als SGC exportiert, schlossen sich Kopplung und Gerinne aus.
- **Warum nicht einfach derselbe Hook:** der Fast-Pfad alloziert eigene, gepadete Gitter
  (`grid_cols_padded`) und **gibt `Arrptr->H/DEM/SGCz/dA` frei**; `h_grid` ist dort
  **relativ zum DEM** (auf Gerinnezellen negativ bis −SGCbfH); H darf nicht direkt
  beschrieben werden (`SGC2_ProcessH_Row` leitet h zentral aus `volume_grid` ab).
- **Lösung:** `Coupling_RegisterFastGrid()` (einmalig vor der Schleife) +
  `Coupling_UpdateFast()` (im `omp single` nach dem t-Vorrücken). Buchung ausschließlich
  über `volume_grid` + `fp_vol`-Weitung (Muster `SGC2_PointSources_Vol_row`), Einzug
  volumen-gekappt (h·dA wäre auf Gerinnezellen um Zellfläche/Kanalfläche zu groß),
  Wasserspiegel = `dem + h`, Deckel-Klemmung gegen die Kanalsohle (`dem − bfH`),
  Massenkonto über `boundary_cond->VolInMT/VolOutMT`. Wehrformel/Limiter/Relaxation/
  Logformat identisch zum klassischen Pfad (gemeinsamer Code).
- **MUSS als letzter Patch** angewandt werden (diff-Basis = Stand nach allen Vorgängern;
  `sgc-bridge-blowup` + `bridge-flow-index` ändern `sgm_fast.cpp` ebenfalls).
- Verifiziert (Image `lisflood-fp:sgc-coupling-hook`, 2026-07-28): neuer Positiv-Test
  `test_coupling_sgc.py` (Einzug 272 m³ / Rücklieferung 263 m³ auf Gerinnezellen,
  Datums-Beweis: Schacht mit Deckel über dem Gerinne-WSP zieht 0,000 m³) + alle 8
  bestehenden Docker-Regressionen unverändert grün.

## Build (so wird der Patch angewandt)

Single Source of Truth = **versionierter Quell-Tarball** `../vendor/lisflood-fp-8.0.3-src.tar.gz`
(schlank, ~600 K, nur Build-Quellen) + **dieser Patch**. Kein 126-MB-Baum mehr.

```dockerfile
COPY engines/vendor/lisflood-fp-8.0.3-src.tar.gz /tmp/src.tgz
RUN mkdir -p /src && tar -xzf /tmp/src.tgz -C /src --strip-components=1   # pristine Upstream
COPY engines/patches/quagg-weir-flow.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-weir-flow.patch
COPY engines/patches/quagg-inflow-momentum.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-inflow-momentum.patch
COPY engines/patches/quagg-outflow-free-direction.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-outflow-free-direction.patch   # NACH inflow-momentum (nutzt PS_Dir mit)
COPY engines/patches/quagg-sgc-trapezoid.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-sgc-trapezoid.patch
COPY engines/patches/quagg-sgc-bridge-blowup.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-sgc-bridge-blowup.patch
COPY engines/patches/quagg-bridge-flow-index.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-bridge-flow-index.patch
COPY engines/patches/quagg-timeseries-memset.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-timeseries-memset.patch
COPY engines/patches/quagg-coupling-sgc-hook.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-coupling-sgc-hook.patch   # ALS LETZTER (diff-Basis = alle Vorgaenger)
RUN cmake -S /src -B /build ... && cmake --build ...
```

`--forward` bricht ab, falls der Patch bereits drin ist (kein Doppel-Patch).

## Konvention

- **Upstream = der Tarball in `../vendor/`** (gepinnter pristine 8.0.3). Keine direkten Handpatches
  am extrahierten Baum — sonst divergiert der Build wieder unkontrolliert.
- Jede QUAGG-Änderung am Solver = **ein neuer Patch hier** + Eintrag in dieser README.
- Neuen Patch erzeugen: `diff -u a/<datei> b/<datei> > engines/patches/<name>.patch` (Labels `a/`,`b/`
  relativ zur Trunk-Wurzel, damit `patch -p1 -d /src` greift).
- Tarball neu erzeugen (falls eine bisher ausgeschlossene Quelldatei gebraucht wird): aus einem
  pristine Upstream-Checkout `tar -czf ... LISFLOOD-FP-trunk` (Ballast wie testing/DLLs/windep/
  linuxdep/Mac-Binaries ausschließen).

## Status (erledigt 2026-06-13)

- ✅ QUAGG-FIX als Patch versioniert; Build extrahiert Tarball + patcht (verifiziert: erzeugt
  byte-gleiches Verhalten wie das deployte Binary; Regression `../docker/test_bridge_no_sgc.py` grün).
- ✅ Bewiesen, dass der Patch nötig ist: ungepatchtes 8.0.3 **segfaultet (SIGSEGV/-11)** bei einer
  Brücke ohne SGC.
- ✅ 126-MB-Client-Dublette `client/.../LISFLOOD-FP-8/` aus Git entfernt; loser Trunk aus dem
  Docker-Kontext genommen (`.dockerignore`).

## Welche Patches stecken in einem Image?

**Das Dockerfile ist die einzige Wahrheit** (`../docker/Dockerfile`, `COPY engines/patches/…`),
nicht dieser Abschnitt. Bis 2026-08-01 stand hier eine per Hand gepflegte Liste, die drei Patches
fälschlich als „noch nicht gebaut" führte, obwohl sie längst drin waren — und gleichzeitig einen
echten Bruch verschwieg (s. unten). Handgepflegte Release-Notes driften; deshalb gilt jetzt:

- Welche Patches ein **Image** hat: `docker run --rm --entrypoint sh <image> -c 'cat /opt/lisflood/PATCHES.txt'`
- Aus welchem **Repo-Stand** es gebaut wurde: `… -c 'echo $QUAGG_SOLVER_SHA'`
- Beides steht zusätzlich in jedem Ergebnis (`results/solver_version.json`) und geht als erstes
  `solver_version`-Event über das Handler-Protokoll raus.

### Vorfall 2026-08-01: die Images waren auseinandergelaufen

Alle 9 Patches standen korrekt im Dockerfile, aber die gebauten Images hatten unterschiedliche
Stände, weil sie zu verschiedenen Zeitpunkten gebaut wurden:

| Image | gebaut | `coupling-sgc-hook` |
|---|---|---|
| `lisflood-fp:latest` | 2026-07-28 21:15 | ❌ fehlte |
| `lisflood-fp:runpod` | 2026-07-29 11:31 | ❌ fehlte |
| `lisflood_acc_modi:local` | 2026-07-30 19:56 | ✅ |

Die `COPY`-Zeile kam erst mit `5074ec7` (2026-07-30 19:21) dazu — nach dem Bau der ersten beiden.
Folge: SWMM↔LISFLOOD-Kopplung auf SGC-Zellen rechnete je nach Backend anders, ohne sichtbares
Symptom. **Behoben am 2026-08-01**: alle Images aus einem Stand neu gebaut, Versionsstempel
eingeführt, Regressionssuite 11/11 grün. Regel seither: Solver-Images werden nie einzeln
nachgezogen, sondern immer runtime + runpod gemeinsam aus demselben Commit.

## ⚠️ Offen

- **Upstream-Provenienz** (genauer LISFLOOD-FP-Commit/Tag, aus dem der Tarball stammt) ist nicht
  dokumentiert. Bei einem späteren echten 8.2-Upgrade: Upstream-Quelle + Commit hier festhalten.
- **`quagg-sgc-trapezoid.patch` — Mehrfachkanal-Kombination ungetestet.** Verifiziert ist Typ 7
  als einzelner globaler Kanal (`SGCchan 7`) sowie Brücke-über-Trapez (`test_sgc_trapezoid.py`).
  **Nicht** getestet ist `SGCchangroup` + `SGCchanprams` mit Typ 7 **und** einer Brücke darüber —
  also genau der Mehrfachkanal-Modus, den das Channel-Tool im Client tatsächlich exportiert.
  Die Kombination ist im UI ohne Warnung nutzbar. Vor Produktiv-Einsatz entweder Test nachziehen
  oder im Client sperren.
- **Kein echter RunPod-Cloud-Lauf.** `test_runpod_e2e.py` fährt gegen das lokale Image, nicht gegen
  RunPod (keine Queue, kein S3/R2, keine GPU). Der CUDA-Build ist gebaut, aber nie auf
  RunPod-Hardware gelaufen.
- **Keine Validierung gegen Ground Truth.** Die gesamte Suite ist Regression (tut der Code, was er
  soll) — nicht Physik-Verifikation (stimmt das Ergebnis mit der Realität). Fahrplan dazu:
  `ROADMAP_FLOOD2D_PRODUKTION.md`, Phase P1.
