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

## ⚠️ Offen

- **Upstream-Provenienz** (genauer LISFLOOD-FP-Commit/Tag, aus dem der Tarball stammt) ist nicht
  dokumentiert. Bei einem späteren echten 8.2-Upgrade: Upstream-Quelle + Commit hier festhalten.
