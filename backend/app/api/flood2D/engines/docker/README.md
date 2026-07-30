# Flood2D Solver-Pipeline — Walkthrough (LISFLOOD-FP im Docker)

Dieses README dokumentiert die **gesamte Solver-Pipeline**: welche Solver angeschlossen sind, was im
Docker läuft, was LISFLOOD-FP (faktisch **8.0.3**) kann, und **welche Dateien wohin müssen**. Es dient
als Planungsgrundlage. Die `⚠️ Bekannte Risiken`-Sektion am Ende listet die offenen Pipeline-Defekte.

> Stand: 2026-06-13. Querverweis Physik-/GIGO-Audit:
> `client/src/features/flood-2D/result/AUDIT_LISFLOOD82_Physik_und_Wehre.md`.

> **Solver-Version (Entscheidung 2026-06-18):** Wir bleiben bewusst bei **LISFLOOD-FP 8.0.3 +
> `quagg-weir-flow.patch`** und steigen NICHT auf 8.2 um. Begründung: 8.0.3 ist gegen den
> Client-Input-Generator end-to-end verifiziert (Kanäle, Wehr-/Brücken-/SGC-Physik), ein 8.2-Upgrade
> brächte Re-Validierungs- und Regressionsrisiko ohne aktuellen fachlichen Mehrwert. Der im Client-Baum
> noch referenzierte „8.2"-Stand ist daher Dokumentations-Altlast, nicht Ziel.
> Querverweis: `client/src/features/flood-2D/result/ROADMAP_FLOOD2D_9of10.md` (Phase 0, T0.4).

---

## 1. Architektur & Datenfluss

```
┌─ Editor (Vue) ────────────────────────────────────────────────────────────────┐
│  Geometrie/Hydraulik-Stores → Flood2DSolverRunner.vue                          │
│  → InputGenerator.processScenario()  erzeugt  this.files = { 'terrain.asc', … } │
└────────────────────────────────────────────────────────────────────────────────┘
        │ createSolverBackend(solverMode)            services/solver/index.js:24
        ▼
  ┌─────────────────────────────┬──────────────────────────────────────────────┐
  │ wasm / bmi  (LOKAL, Browser)│ runpod  (REMOTE, Server/RunPod)                │
  │ WasmWorkerBackend           │ RunpodBackend → HTTP                           │
  │ → simulation.main.js/.bmi.js│ POST /flood2dpod/v2/{ep}/run  (gzip+base64)    │
  │ → lisflood(.wasm)  v5.9     │                                                │
  └─────────────────────────────┴───────────────┬──────────────────────────────┘
                                                 ▼  FastAPI  (backend/app/api/flood2D)
                          router.py  →  job_manager.write_inputs()   (entpackt → /job/inputs)
                                                 │
                                                 ▼  docker_engine.py:83
                          docker run --rm -v {job}:/job  lisflood-fp:latest
                                                 │
                                                 ▼  ENTRYPOINT  handler.py  (im Container)
                          cwd=/job/inputs →  /opt/lisflood/lisflood run.par
                                                 │
                          res.mass (Heartbeat) + res-NNNN.wd (Frames) + res.max
                                                 │  handler.py kodiert → codec.py
                                                 ▼
                          frame-NNNN.bin / max-depth.bin   in /job/results
                                                 │  JSONL-Events (log/progress/frame/done)
                                                 ▼
            router.py  GET /flood2dpod/v2/{ep}/stream/{job}  +  /files/{job}/{name}
                                                 │
                                                 ▼
            RunpodBackend pollt /stream → resultCodec.js dekodiert Frames → 3D-Viewer
```

**Kernquellen:** `services/solver/index.js:24` (Backend-Wahl), `router.py` (Endpunkte),
`job_manager.py:77` (`write_inputs`), `docker_engine.py:83` (`docker run`),
`engines/docker/handler.py:224` (lisflood-Aufruf).

---

## 2. Solver-Matrix

| solverMode | engine | Backend (Client) | Worker / Endpoint | Binary | SGC | FV1/DG2 | Bridge-`B` |
|---|---|---|---|---|---|---|---|
| `wasm` | `v5` | `WasmWorkerBackend` | `simulation.main.js` → `lisflood.wasm` | **5.9** | ❌ | ❌ | ❌ |
| `bmi`  | `v5` | `WasmWorkerBackend` | `simulation.bmi.js` → `lisflood_bmi.wasm` (1D-Culverts) | **5.9** | ❌ | ❌ | ❌ |
| `runpod` (real) | `v8` | `RunpodBackend` | `POST /flood2dpod/...` → Docker | **8.0.3** | ✅ | ✅ | ✅ |
| `runpod` (mock) | `v8`→`v5` | `RunpodBackend` | `MockRunpodTransport` → `simulation.main.js` | **5.9** | ❌ (gestrippt) | ❌ (gestrippt) | ⚠️ unklar |

- engine wird gesetzt in `Flood2DSolverRunner.vue:649` (`runpod`→`v8`, sonst `v5`).
- `solverMode` Default `'wasm'` in `useSimulationStore.js:48`.
- Mock-Fallback greift, wenn keine RunPod-Credentials gesetzt sind (`index.js:24`); der Mock **strippt
  v8-Keywords** aus `run.par` und erzwingt `acceleration` (`MockRunpodTransport.js:34-48`).

> **Folge:** Eine Validierung über den Mock testet **v5.9-Physik ohne SGC/FV1/Brücken** — nicht den
> echten Docker-8.0.3. SGC/FV1/Brücken **nur am echten Docker** verifizieren.

---

## 3. LISFLOOD-FP 8.0.3 — Fähigkeiten (Referenz)

Quelle: `engines/LISFLOOD-FP-trunk/{pars.cpp,input.cpp,lisflood.cpp,VersionHistory.h}`.
Version: `LF_VersionMajor 8 / Minor 0 / Inc 3` → **8.0.3** (FV1+DG2 kamen mit 8.0.0, SGC mit 7.x).

### 3.1 Numerische Schemata (Floodplain)

| Keyword | Schema | CFL-Default | Constraints | pars.cpp |
|---|---|---|---|---|
| *(keins)* | adaptive (Original-Bates, CFL-basiert) | adaptiv | — | :199 |
| `acceleration` | Trägheits-/Beschleunigungsformulierung (robust) | 0.7 | ⊕ adaptive/qlim/Roe | :296 |
| `adaptoff` | Q-Limit (fester Max-Abfluss/Breite) | — | — | :289 |
| `Roe` / `Roe_slow` | Roe-Flux-Splitter (TVD); `_slow` mit Ghost-Cell wet/dry | 0.7 | ⊕ accel/fv1/SGC | :399 |
| `fv1` | Finite-Volume 1. Ordnung, HLL-Flux | 0.5 | GPU-fähig | :571 |
| `dg2` | Discontinuous Galerkin 2. Ordnung | 0.33 | `limitslopes`, GPU-fähig | :579 |
| `SGC_enable`/`SGCwidth` | Sub-Grid-Kanal | — | **erzwingt `acceleration`**, ⊕ Roe/fv1 | :730 |

Kanal-Solver (unabhängig): kinematic (default), `diffusive`, `ch_dynamic` (volle SWE, nur Init).

### 3.2 Wichtigste `.par`-Keywords (verdichtet — Vollverweis pars.cpp)

| Gruppe | Keywords | Einheit/Hinweis |
|---|---|---|
| Zeit/Steuerung | `sim_time`, `initial_tstep`, `saveint`, `massint`, `tstart`, `kill`, `steady`/`steadytol` | s |
| Friction | `fpfric`/`nfp` (skalar n), `manningfile` (Raster), `SGCmanningfile` | dimensionslos |
| Solver-Param | `cfl`, `theta`, `dhlin`, `depththresh`, `momentumthresh`, `max_Froude` | — |
| SGC | `SGCwidth`, `SGCbed`, `SGCbank`, `SGCn`, `SGCchan` (1=Rechteck…6), `SGCp/r/m/s/a` | m, mNN |
| Infiltration/Evap | `infiltration`/`inf` (**m/s**), `infilfile` (mm/h-Raster), `evaporation` (mm/Tag) | s. Einheiten |
| Regen | `rainfall` (**mm/h**-Zeitreihe), `rainfallmask`, `dynamicrainfile` (NetCDF) | — |
| Routing | `routing`, `routingspeed`, `routesfthresh`, `dist_routing` | — |
| Output | `voutput`, `qoutput`, `hazard`, `depthoff`, `elevoff`, `binary_out`, `gzip`, `debug` | Flags |
| Struktur | `weirfile`/`weir` | s. 3.3 |
| Datei-Wurzeln | `DEMfile`, `resroot`, `dirroot`, `bcifile`, `bdyfile`, `startfile` | Pfade |
| GPU | `cuda` (nur fv1/dg2; `-DCUDA`-Build) | Flag |

### 3.3 Input-Datei-Formate (mit Einheiten-Umrechnung beim Laden)

- **DEMfile** (`terrain.asc`): ESRI-ASCII (`ncols/nrows/xllcorner/yllcorner/cellsize/NODATA_value` + row-major).
  Höhen in mNN, keine Umrechnung. NoData → `nodata_elevation` (Default −9999).
- **bcifile** (`flow.bci`): Punkt/Kanten-Randbedingungen. Typen `QFIX` (m³/s), `QVAR` (Profil aus .bdy),
  `HFIX`/`HVAR` (mNN), `FREE`. Zeilen `P x y TYPE [profil]` oder `N/S/E/W a b TYPE [profil]`.
- **bdyfile** (`profiles.bdy`): Zeitreihen je benanntem Profil. `name` / `<n> seconds` / `value time`.
  QVAR-Werte in m²/s (pro Zellbreite, vom Generator flux-gesplittet), HVAR in mNN.
- **weirfile** (`flow.weir`): erste Zeile `<n>`, dann `x y dir Cd hc m w`.
  **`x,y` = Weltkoordinaten** — LISFLOOD rechnet selbst in Zellindizes um (`input.cpp:165`,
  `xi=(x−blx)/dx`). `dir`: `N/S/E/W` (bidirektionales Poleni-Wehr), `…F` (Rückstauklappe),
  `…B` (Brücke, Orifice). `hc` = Krone/Soffit in mNN. `Cd` = kombinierter Poleni-Koeffizient
  (LISFLOOD nutzt `Q=Cd·w·hu^1.5`, ohne separates g/⅔ — daher ~1.7, nicht 0.6; `weir_flow.cpp:86`).
- **manningfile** (`terrain.n`): ASCII-Raster mit Manning-n je Zelle.
- **rainfall** (`rain.txt`): `value time`, **Einheit mm/h** — LISFLOOD rechnet intern `/= 1000·3600`
  (`input.cpp:2111`).
- **infiltration** (skalares Keyword): **m/s**, direkt ohne Umrechnung (`lisflood.cpp:520`).
  (`infilfile`-Raster dagegen mm/h, `input.cpp:904`.)
- **SGCwidth/bed/bank** (`sgc.*.asc`): ASCII-Raster. width [m/Zelle], bed/bank [mNN]; bank = DEM.

### 3.4 Output-Dateien

`{resroot}.mass` (Massenbilanz, je `massint`), `res-NNNN.wd` (Tiefe, je `saveint`), `.elev`, `.Vx/.Vy`
(bei `voutput`), `.max`/`.maxVc`/`.maxHaz` (bei `hazard`). ASCII (oder binär bei `binary_out`).

---

## 4. Datei-Fluss konkret (welche Datei wohin)

### 4.1 Was der Client erzeugt — `InputGenerator.processScenario()` (`InputGenerator.js:144-285`)

| Datei | v5 | v8 | Bedingung |
|---|----|----|---|
| `terrain.asc` | ✅ | ✅ | immer (DEM; v8 ggf. auf `exportCellsize` resampelt) |
| `terrain.n` | ✅ | ✅ | `surfaceGrid` + `surfaceMaterials` |
| `friction.asc` | ✅ | ✅ | Legacy-Polygon-Rauheit (Fallback) |
| `rain.txt` | ✅ | ✅ | `rainSeries`/`rain` |
| `flow.bci` | ✅ | ✅ | Boundaries/Manholes oder globale Domänenkante |
| `profiles.bdy` | ✅ | ✅ | QVAR/HVAR-Profile vorhanden |
| `flow.weir` | ✅ | ✅ | `weirs` oder `bridges` (v8: re-diskretisiert bei `exportCellsize`) |
| `sgc.width/bed/bank.asc` | ❌ | ✅ | nur v8 + `sgcEnabled` + Polyline ≥ 2 Punkte |
| `run.par` | ✅ | ✅ | immer |

### 4.2 Übertragung & Entpacken

- Client komprimiert je Datei (`gzip+base64`) und schickt `{ version:'lisflood-8.2', files:{…}, maxTime }`
  an `POST /flood2dpod/v2/{ep}/run` (`RunpodBackend.js:74`).
- `job_manager.write_inputs()` (`:77`): dekodiert → schreibt als **Text** nach `/job/inputs/{name}`.
  Dateinamen-Whitelist `SAFE_NAME = ^[A-Za-z0-9][A-Za-z0-9._-]*$`. **Alle** hochgeladenen Files landen
  im Container — nichts wird verworfen.

### 4.3 Im Container — `handler.py`

- Nimmt die **erste `*.par`** in `inputs/` (`:204`).
- **Patcht** zwei Felder (`:212-216`): `dirroot → /job/results`, und `massint → min(massint, --heartbeat)`
  (Default Heartbeat 2 s), damit Lebenszeichen dicht genug kommen.
- Startet `subprocess.Popen([LISFLOOD_BIN, par_path.name], cwd=inputs)` (`:224`) — **nur der Dateiname**,
  alle Pfade in `run.par` sind relativ zu `/job/inputs`.
- Tailt `res.mass` → `progress`-Events; scannt `res-NNNN.wd` → kodiert `frame-NNNN.bin`; am Ende
  `res.max` → `max-depth.bin` (`codec.py`: `uint32 jsonLen | JSON-Header | float32-Kanäle`, little-endian).
- Exit-Code ≠ 0 → letzte 10 stdout-Zeilen als Log, dann selber Exit-Code (`:275`).

### 4.4 Auslieferung

`docker_engine.py` konsumiert die JSONL-Events, übersetzt `file`→`url`
(`/flood2dpod/files/{job}/{name}`), `router.py` liefert Frames via `GET /files/...`.

---

## 5. Build & Betrieb

- **Build-Kontext:** `backend/app/api/flood2D/` (wegen `codec.py` + Vendor-Tarball + Patches).
  ```bash
  # CPU (dieser Server) — --target runtime ist PFLICHT, seit das runpod-Stage
  # das letzte im Dockerfile ist (sonst falscher ENTRYPOINT auf :latest!):
  docker build -f engines/docker/Dockerfile --target runtime -t lisflood-fp:latest .
  # RunPod-Serverless-Worker (CPU, handler.py + S3/R2-Upload-Wrapper):
  docker build -f engines/docker/Dockerfile --target runpod -t lisflood-fp:runpod .
  # GPU (RunPod, RTX 4090/L40 = sm_89):
  CUDA_ARCH=89 bash engines/docker/build-cuda.sh        # → lisflood-fp:cuda
  # Multi-Arch (buildx, pusht in die Registry) — s. Abschnitt 5c:
  bash engines/docker/build-multiarch.sh                # → :runpod (amd64)
  ```
- **Dockerfile:** multi-stage. Quelle = Vendor-Tarball (extrahiert) + QUAGG-Patch → cmake Release
  `--target lisflood`. `config.docker.cmake`: NetCDF aus, alle Solver im Binary; CUDA wird automatisch
  einkompiliert, **wenn mit nvcc-Base gebaut** (`CMAKE_CUDA_ARCHITECTURES` aus build-arg `CUDA_ARCH`,
  Default 89). Binary `/opt/lisflood/lisflood`, ENTRYPOINT `python3 -u handler.py --job /job`.
- **GPU / max Leistung (RunPod):** EIN CUDA-gebautes Binary kann beides:
  - **GPU:** `run.par` mit `fv1` **oder** `dg2` + Keyword `cuda` (emittiert der InputGenerator, wenn
    `scenario.useGpu` und Schema fv1/dg2). Container mit `--gpus all` (macht `docker_engine._gpu_args`).
    **CUDA beschleunigt NUR fv1/dg2.**
  - **CPU:** `acceleration` (+ SGC-Subgrid-Kanäle) laufen unverändert auf CPU — SGC ist **nicht** GPU-fähig.
  - ⚠️ **CUDA-Build braucht ~8 GB Platz + nvcc** (devel-Image 7.4 GB Build-Stage → 2.3 GB Runtime-Image).
    nvcc kompiliert auch ohne GPU; **laufen** braucht eine GPU (hier nicht vorhanden → nur Build verifiziert).
  - **CUB-Fix:** Der Tarball bringt eine uralte gebündelte `cuda/cub` mit (für CUDA ~10), die mit dem in
    CUDA 12 eingebauten Thrust kollidiert (*„CUB version not compatible with this Thrust"*). Das Dockerfile
    löscht daher `/src/cuda/cub` vor dem Build, sodass `#include <cub/cub.cuh>` die Toolkit-CUB nimmt.
- **Verifiziert (2026-06-13):** `lisflood-fp:cuda` (sm_89) baut sauber durch (alle `.cu` inkl. fv1+dg2,
  `Built target lisflood`); Binary enthält `fatbin` + `sm_89` + `cudaLaunchKernel`. Die CPU-Regression
  (`test_bridge_no_sgc.py lisflood-fp:cuda`, acceleration-Schema) läuft **im GPU-Image** identisch durch
  → ein Binary deckt GPU- *und* CPU-Pfad ab. GPU-Ausführung selbst steht auf RunPod aus.
- **Env-Vars (Backend/`docker_engine.py`):** `FLOOD2D_ENGINE` (auto|docker|mock), `FLOOD2D_DOCKER_IMAGE`
  (Default `lisflood-fp:latest`), `FLOOD2D_GPU` (auto|1|0), `FLOOD2D_HEARTBEAT` (Default 2 s),
  `FLOOD2D_MAX_WALL_S` (Default 21600 = 6 h).
- **nginx:** `location /flood2dpod/ → 127.0.0.1:8001`, `client_max_body_size 200m`, `proxy_read_timeout 300s`,
  `proxy_buffering off`.
- **Smoke-Test-Referenz:** `/tmp/lisjob/inputs/` (`run.par` + `terrain.asc` + `flow.bci`, 20×10, 60 s,
  ein QFIX-Zulauf — minimaler Funktionstest, **ohne** Wehre/SGC).

### 5b. RunPod-Serverless-Worker (`--target runpod`, seit 2026-07-29)

- **Architektur:** `runpod_worker.py` (Generator-Handler, runpod-SDK) fährt den **unveränderten**
  `handler.py` als Subprozess und reicht dessen NDJSON-Events durch. Binär-Ergebnisse
  (`frame-*.bin`, Max-Raster, `network-results.json`, `swmm-report.rpt`) werden **gzip-komprimiert
  nach S3/R2 geladen** (`ContentEncoding: gzip` → Browser-`fetch()` dekomprimiert transparent,
  Client-Codec unverändert), lokal sofort gelöscht (Container-Disk bleibt klein) und als
  **presigned URLs** in die Events geschrieben — exakt die `file→url`-Übersetzung von
  `docker_engine.py`. Der Client-Transport (`runpodTransport.js`) lässt `https://…`-URLs schon
  heute unverändert durch → **null Client-Änderungen**.
- **Input** = das JobInput des Backends (`schemas.py`): `files` als `text` / `gzip+base64` /
  **`s3`** (`{"encoding":"s3","key":…}` — für DGMs, die das 10-MB-`/run`-Limit sprengen).
- **Ohne S3-Env** (lokale Tests): kleine Ergebnisse als `data:`-URLs inline (Cap 8 MB/Datei).
- **Env-Vars (RunPod-Endpoint-Secrets):** `S3_ENDPOINT` (R2: `https://<account>.r2.cloudflarestorage.com`),
  `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_PREFIX` (Default `jobs`),
  `S3_URL_EXPIRY` (Default 86400 s), `QUAGG_GZIP_LEVEL` (Default 4), `QUAGG_HEARTBEAT` (Default 2),
  `QUAGG_KEEP_JOBDIR=1` (Debug).
- **Endpoint-Empfehlung:** **CPU-Worker** (16–32 vCPU — acceleration+SGC+Kopplung sind OpenMP-CPU;
  CUDA lohnt nur für ungekoppelte fv1/dg2), Container-Disk ≥ 20 GB (Peak = transiente ASCII-Frames,
  .bin wird nach Upload sofort gelöscht), `executionTimeout` ≥ geplante Wandzeit (Default RunPod ist
  zu kurz für große Läufe!).
- **Tests:** `python3 test_runpod_worker.py` (26 Unit-Checks, ohne Docker/SDK/boto3) und
  `python3 test_runpod_e2e.py [IMAGE]` (echter Solver-Lauf durch den Worker im Container, Inline-
  Fallback, plus `--test_input`-Smoke über das SDK; braucht weder Volume-Mount noch S3).
- **Backend-Relay (`engines/runpod_engine.py`, seit 2026-07-29):** `FLOOD2D_ENGINE=runpod`
  reicht das JobInput 1:1 an `api.runpod.ai/v2/{endpoint}/run` weiter, pollt `/stream` und
  emittet die Events unverändert (Worker liefert fertige presigned URLs). Keys in
  `backend/.env`: `RUNPOD_API_KEY` + `RUNPOD_ENDPOINT_ID` (Fallback-Loader in
  `engines/__init__.py`, da PM2 die .env nicht exportiert). Abbruch → `POST /cancel`;
  Wall-Budget wie DockerEngine (`FLOOD2D_MAX_WALL_S`). Test:
  `venv/bin/python app/api/flood2D/test_runpod_engine.py` (Fake-RunPod-Stub, 11 Checks).
- **Registry:** `docker.io/fabiologe/lisflood_acc_modi` (PUBLIC — RunPod konnte das private
  Repo ohne hinterlegte Registry-Credentials nicht pullen: `IMAGE_AUTH_ERROR`). Tags:
  `:runpod` (Worker), `:runpod-20260729` (Rollback).

### 5c. Multi-Arch-Builds (`build-multiarch.sh`, seit 2026-07-29)

- **Warum buildx:** Der klassische `docker build` kann keine Multi-Arch-Manifeste erzeugen.
  `build-multiarch.sh` legt bei Bedarf einen Builder mit `docker-container`-Driver an,
  installiert für ARM-Ziele die QEMU-binfmt-Handler (`tonistiigi/binfmt`, Host-weit,
  einmalig) und pusht ein Manifest, aus dem `docker pull` automatisch die passende
  Variante zieht.
- **⚠️ Architektur-Status (WICHTIG, auch im Skriptkopf dokumentiert):**

  | Plattform | Status | Grundlage |
  |---|---|---|
  | `linux/amd64` | **getestet** | E2E (`test_runpod_e2e.py`) + SGC-Kopplungs-Regression (`test_coupling_sgc.py`) grün gegen das buildx-Image |
  | `linux/arm64` | **ungetestet** | nur Kompilier-Nachweis via QEMU; auf **keiner** echten ARM-Maschine (Apple Silicon) validiert — **Nutzung auf eigene Gefahr** |
  | Intel-Mac / Windows+Docker Desktop | amd64-Variante | läuft über dieselbe amd64-Ebene |

  ARM ist bewusst **nicht** im Default (`PLATFORMS=linux/amd64`). Grund: Ohne Regression auf
  echter ARM-Hardware ist nicht belegt, dass die Fließkomma-Ergebnisse identisch sind —
  bei einem Nachweiswerkzeug ist das kein Detail. Erst mit `PLATFORMS=linux/amd64,linux/arm64`
  mitbauen, wenn jemand die Tests auf Apple Silicon gefahren hat.
- **ARM-Portierbarkeit vorab statisch geprüft (2026-07-29):** weder LISFLOOD-FP 8.0.3 noch
  SWMM 5.2.4 enthalten SSE/AVX-Intrinsics oder `-march`-Flags; das einzige x86-Konstrukt
  (`_mm_malloc`/`_mm_free` in `utility.cpp`) hängt hinter `#if defined(_MSC_VER) ||
  defined(__INTEL_COMPILER)` — der GCC-Pfad nutzt `posix_memalign` und ist ARM-tauglich.
- **Beispiele:**
  ```bash
  # aus backend/app/api/flood2D
  bash engines/docker/build-multiarch.sh                          # amd64 → :runpod
  TARGET=runtime TAG=latest bash engines/docker/build-multiarch.sh # lokaler Pfad
  PLATFORMS=linux/amd64,linux/arm64 bash engines/docker/build-multiarch.sh  # + ARM (ungetestet!)
  ```

---

## 6. ⚠️ Bekannte Risiken / To-Do

1. ✅ **ERLEDIGT — Divergente Quellbäume konsolidiert (Single Source of Truth).** Früher: Docker baute
   aus einem ungetrackten, hand-gepatchten Baum, der getrackte Client-Baum war die ungepatchte Dublette.
   Jetzt: gepinnter pristine Upstream als Tarball `engines/vendor/lisflood-fp-8.0.3-src.tar.gz` (~600 K,
   getrackt) + Patch `engines/patches/quagg-weir-flow.patch`; der Build extrahiert + patcht. Die 126-MB-
   Client-Dublette ist aus Git entfernt. (Browser-WASM v5.9 unter `client/public/flood-engine/` bleibt
   unberührt — separater Solver.)

2. ✅ **ERLEDIGT — Version-Label.** `schemas.py` + Client-Payload `RunpodBackend.js` jetzt `lisflood-8.0.3`.

3. ✅ **ERLEDIGT — Original-8.0.3-Brücken-Bug + Gate.** Im unpatchten Code läuft die Brücken-Orifice-Physik
   nur unter `SGC==ON`; ohne Subgrid sind die SGC-Arrays nicht allokiert → **SIGSEGV** (bewiesen: Exit -11),
   bzw. `0/0 = NaN`. Der Patch entfernt den SGC-Guard (`weir_flow.cpp`) + ergänzt Trockenfall-/Div0-Guards.
   Regressionstest `test_bridge_no_sgc.py` ist das Gate: grün gepatcht, rot (Segfault) auf pristine.

4. **Mock ≠ Real (offen).** `MockRunpodTransport` (`:34-48`) strippt `fv1/dg2/slopelimiter/…` und erzwingt
   `acceleration`, dann v5.9-WASM. SGC/FV1/Brücken ausschließlich am echten Docker validieren; im UI
   kennzeichnen, wann Mock läuft.

5. **Upstream-Provenienz (offen).** Der genaue LISFLOOD-FP-Commit/Tag hinter dem Tarball ist nicht
   dokumentiert — bei einem echten 8.2-Upgrade festhalten (siehe `engines/patches/README.md`).

6. **Diagnose-Haken „Wehre durchströmt".** Am realen Lauf prüfen: kommt `flow.weir` an, ist `hc > DEM` an
   den Wehr-Zellen, sind die Tags `N/S/E/W` (Wehr) — **nicht `…B`** (Brücke lässt physikalisch korrekt Wasser
   durch)? Details + Diagnose-Skript: `client/.../test/diag_weir_realcase.mjs` und das Physik-Audit.
