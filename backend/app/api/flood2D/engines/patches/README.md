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

## Build (so wird der Patch angewandt)

Single Source of Truth = **versionierter Quell-Tarball** `../vendor/lisflood-fp-8.0.3-src.tar.gz`
(schlank, ~600 K, nur Build-Quellen) + **dieser Patch**. Kein 126-MB-Baum mehr.

```dockerfile
COPY engines/vendor/lisflood-fp-8.0.3-src.tar.gz /tmp/src.tgz
RUN mkdir -p /src && tar -xzf /tmp/src.tgz -C /src --strip-components=1   # pristine Upstream
COPY engines/patches/quagg-weir-flow.patch /tmp/...
RUN patch -p1 --forward -d /src < /tmp/quagg-weir-flow.patch
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
