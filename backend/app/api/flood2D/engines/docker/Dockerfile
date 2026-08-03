# LISFLOOD-FP-Solver-Image — CPU (Server) und CUDA-ready (RunPod).
#
# Build-Kontext: backend/app/api/flood2D  (wegen codec.py + Trunk-Quellcode)
#
#   CPU (dieser Server):
#     docker build -f engines/docker/Dockerfile -t lisflood-fp:latest .
#
#   CUDA / RunPod-GPU (RTX 4090 / L40 = sm_89) — siehe build-cuda.sh. CMake aktiviert
#   die GPU-Targets automatisch, wenn nvcc im Build-Image ist; CUDA_ARCH setzt sm_XX:
#     docker build -f engines/docker/Dockerfile \
#       --build-arg BASE_IMAGE=nvidia/cuda:12.4.1-devel-ubuntu22.04 \
#       --build-arg RUNTIME_IMAGE=nvidia/cuda:12.4.1-runtime-ubuntu22.04 \
#       --build-arg CUDA_ARCH=89 \
#       -t lisflood-fp:cuda .
#
# EIN Binary kann beides: GPU-Schemata (fv1/dg2 + run.par-Keyword `cuda`, mit --gpus all)
# UND CPU-Schemata (acceleration + SGC-Subgrid). CUDA-Quellen (cuda/) sind im Tarball.
ARG BASE_IMAGE=ubuntu:24.04
ARG RUNTIME_IMAGE=ubuntu:24.04

# ── SWMM-Build (EPA SWMM 5.2.4 — 1D-Kanalnetz-Solver für die 1D/2D-Kopplung) ───
# Zuerst (vor der LISFLOOD-Stage), damit die build-Stage per COPY --from=swmm-build
# Header+lib ziehen kann. Direkt-gcc-Build (wie solver/build_wasm.sh, nur nativ) statt
# des SWMM-Parent-CMake-Projekts, das deps/bindings voraussetzt. Erzeugt libswmm5.so
# (Toolkit swmm_start/step/getValue/setValue/end — von LISFLOOD in-process gelinkt) UND
# das swmm5-CLI (Standalone-Regression). Tarball-Provenienz: client/.../isybau/solver/src.
FROM ${BASE_IMAGE} AS swmm-build
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc libc6-dev make \
    && rm -rf /var/lib/apt/lists/*
COPY engines/vendor/swmm-5.2.4-src.tar.gz /tmp/swmm.tgz
RUN mkdir -p /swmm-src && tar -xzf /tmp/swmm.tgz -C /swmm-src
WORKDIR /swmm-src
RUN mkdir -p /swmm \
    && gcc -O2 -fopenmp -fPIC -shared -w -Wl,-soname,libswmm5.so \
           -Isolver -Isolver/include solver/*.c \
           -o /swmm/libswmm5.so -lm \
    && gcc -O2 -fopenmp -w -Isolver -Isolver/include solver/*.c run/main.c \
           -o /swmm/swmm5 -lm

# ── Build (LISFLOOD-FP + QUAGG-Patches, inkl. 1D/2D-Kopplung) ─────────────────
FROM ${BASE_IMAGE} AS build
ARG CUDA_ARCH=89
ENV CUDA_ARCH=${CUDA_ARCH}
ARG CUDA_ARCHS=""
ENV CUDA_ARCHS=${CUDA_ARCHS}

RUN apt-get update && apt-get install -y --no-install-recommends \
        g++ cmake make libnuma-dev patch \
    && rm -rf /var/lib/apt/lists/*

# Single Source of Truth: gepinnter pristine Upstream als schlanker Quell-Tarball
# (engines/vendor/, ~600 K, versioniert) statt 126-MB-Baum. Wird extrahiert, dann gepatcht.
COPY engines/vendor/lisflood-fp-8.0.3-src.tar.gz /tmp/src.tgz
RUN mkdir -p /src && tar -xzf /tmp/src.tgz -C /src --strip-components=1
COPY engines/docker/config.docker.cmake /src/config.docker.cmake

# Die gebündelte uralte CUB-Kopie (cuda/cub, für CUDA ~10) kollidiert mit dem in
# CUDA 11+/12 eingebauten CUB+Thrust ("CUB version not compatible with this Thrust").
# Entfernen → #include <cub/cub.cuh> nimmt die zum Toolkit passende CUB. Für CPU-Builds
# irrelevant (cuda/ wird ohne nvcc nie kompiliert).
RUN rm -rf /src/cuda/cub

# QUAGG-FIX als versionierter Patch über den pristine Upstream. Ohne diesen Patch
# segfaultet eine Brückenzelle ohne SGC (siehe engines/patches/README.md).
# --forward bricht ab, falls der Patch schon angewandt ist (statt doppelt zu patchen).
COPY engines/patches/quagg-weir-flow.patch /tmp/quagg-weir-flow.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-weir-flow.patch

# QUAGG inflow-momentum: gerichteter Innenzufluss mit Impuls (Froude-gekappt, sicher).
# Siehe engines/patches/README.md. Ohne diesen Patch sind Punktquellen richtungslos.
COPY engines/patches/quagg-inflow-momentum.patch /tmp/quagg-inflow-momentum.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-inflow-momentum.patch

# QUAGG 1D/2D-Kopplung: EPA-SWMM (1D) wird IN-PROCESS an LISFLOOD gekoppelt. Der Patch
# fügt einen No-Op-Hook in IterateQ + Coupling_Init/Finalize ein (verhaltensgleich ohne
# couplingfile). coupling.cpp linkt libswmm5 (aus der swmm-build-Stage). Siehe
# engines/patches/README.md und engines/docker/coupling.{h,cpp}.
COPY --from=swmm-build /swmm-src/solver/include/swmm5.h /src/swmm5.h
COPY --from=swmm-build /swmm/libswmm5.so /tmp/libswmm5.so
COPY engines/docker/coupling.h /src/coupling.h
COPY engines/docker/coupling.cpp /src/coupling.cpp
COPY engines/patches/quagg-coupling.patch /tmp/quagg-coupling.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-coupling.patch

# QUAGG outflow-direction: Punkt-FREE mit expliziter Austrittskante ("P x y FREE <slope>
# <N|E|S|W>") -- fuer Randzellen, die die literale Rechteck-Kante nirgends erreichen (schiefes/
# rotiertes DGM). Nutzt PS_Dir aus dem inflow-momentum-Patch mit; muss deshalb NACH diesem
# angewandt werden. Siehe engines/patches/README.md.
COPY engines/patches/quagg-outflow-free-direction.patch /tmp/quagg-outflow-free-direction.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-outflow-free-direction.patch

# QUAGG SGC-trapezoid: vervollstaendigt SGCchan_type 7 (Trapez-Querschnitt) in sgc.cpp +
# lisflood2/sgm_fast.cpp -- ohne diesen Patch stuerzt der Solver bei einem Trapez-SGC-Kanal
# ab (korrumpierte Kanalgeometrie -> "Bridge must have sub grid flows on either side").
# Siehe engines/patches/README.md.
COPY engines/patches/quagg-sgc-trapezoid.patch /tmp/quagg-sgc-trapezoid.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-sgc-trapezoid.patch

# QUAGG SGC-bridge-blowup: CalcBridgeQ() (lisflood2/sgm_fast.cpp) mass ihren
# Freispiegelabfluss unter einer Bruecke gegen die rohe DEM-Hoehe statt gegen die
# SGC-Kanalsohle -- sobald ein SGC-Kanal unter der Bruecke im Bett fliesst (nicht
# ueberflutet), wird hflow negativ und produziert eine physikalisch sinnlose
# Flaeche/Radius, die in eine katastrophale Massebilanz-Explosion muendet (fein
# aufgeloest) bzw. ins vendor-eigene Referenzszenario leise falschen Abfluss
# einschleust (grob aufgeloest, Qout=0 die ganze Laufzeit). Siehe
# engines/patches/README.md.
COPY engines/patches/quagg-sgc-bridge-blowup.patch /tmp/quagg-sgc-bridge-blowup.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-sgc-bridge-blowup.patch

# QUAGG bridge-flow-index: entfernt einen zu strengen, asymmetrischen Setup-Check
# (lisflood2/lisflood_processing.cpp), der eine Bruecke ueber einem GUELTIGEN SGC-Kanal
# mit "Invalid bridge cell. Bridge must have sub grid flows on either side." abstuerzen
# liess, sobald der Kanal nicht zusaetzlich 2 Zellen ueber die Bruecke hinausreichte.
# CalcBridgeQ() (sgm_fast.cpp) faellt jetzt sicher auf usVel=0 zurueck statt abzustuerzen.
# Siehe engines/patches/README.md.
COPY engines/patches/quagg-bridge-flow-index.patch /tmp/quagg-bridge-flow-index.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-bridge-flow-index.patch

# QUAGG timeseries-memset: behebt einen Original-Vendor-Speicherfehler (keiner der QUAGG-
# Patches war die Ursache), der JEDEN Lauf mit 2+ referenzierten .bdy-Zeitreihen-Profilen
# (QVAR/HVAR) sporadisch mit SIGSEGV abstuerzen lassen konnte: memset() ueberschreibt einen
# bereits konstruierten C++-Container-Member (undefined behavior), dessen Referenzen zudem
# bei Vector-Reallokation ungueltig wurden. Siehe engines/patches/README.md.
COPY engines/patches/quagg-timeseries-memset.patch /tmp/quagg-timeseries-memset.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-timeseries-memset.patch

# QUAGG coupling-sgc-hook: haengt die 1D/2D-SWMM-Kopplung in die SGC-Zeitschleife des
# lisflood2-Fast-Pfads ein (Coupling_RegisterFastGrid/Coupling_UpdateFast, sgm_fast.cpp).
# Vorher lief bei SGC == ON die Kopplung GAR NICHT ("[COUPLE] aktiv", aber 0.00 m3 —
# Coupling_Update haengt nur in IterateQ, der Fast-Pfad hat eigene gepadete Gitter).
# MUSS als letzter Patch laufen: diff-Basis ist der Stand nach ALLEN Vorgaengern
# (sgc-bridge-blowup + bridge-flow-index aendern sgm_fast.cpp ebenfalls).
COPY engines/patches/quagg-coupling-sgc-hook.patch /tmp/quagg-coupling-sgc-hook.patch
RUN patch -p1 --forward -d /src < /tmp/quagg-coupling-sgc-hook.patch

# QUAGG Versionsstempel: haelt fest, WELCHE Patches wirklich in diesem Image stecken.
# Ohne das laesst sich hinterher nicht mehr feststellen, gegen welchen Solver-Stand ein
# Ergebnis gerechnet wurde — am 2026-08-01 waren :latest, :runpod und :local nachweislich
# auseinandergelaufen (coupling-sgc-hook fehlte in zweien davon).
RUN ls -1 /tmp/*.patch | xargs -n1 basename | sort > /opt/quagg-patches.txt

RUN cmake -S /src -B /build \
        -DCMAKE_BUILD_TYPE=Release \
        -D_CONFIG=/src/config.docker.cmake \
        -DQUAGG_COUPLING=ON \
        -DSWMM_INC=/src \
        -DSWMM_LIB=/tmp/libswmm5.so \
    && cmake --build /build --target lisflood -j"$(nproc)"

# ── Runtime ──────────────────────────────────────────────────────────────────
# ACHTUNG: Nicht mehr das letzte Stage! Lokale Builds brauchen --target runtime
# (siehe README), sonst wird das runpod-Stage mit anderem ENTRYPOINT gebaut.
FROM ${RUNTIME_IMAGE} AS runtime

# volles python3 (nicht -minimal): der Handler braucht die stdlib (json, ...)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 libnuma1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/lisflood /opt/lisflood/lisflood
# EPA SWMM 5.2.4: libswmm5.so (in-process von LISFLOOD via rpath /opt/swmm geladen) + CLI.
COPY --from=swmm-build /swmm/libswmm5.so /opt/swmm/libswmm5.so
COPY --from=swmm-build /swmm/swmm5 /opt/swmm/swmm5
COPY engines/docker/handler.py /opt/lisflood/handler.py
COPY codec.py /opt/lisflood/codec.py

# Versionsstempel (vgl. build-Stage): Patch-Liste im Image + Git-SHA des Repos beim Bau.
# Bauen mit:  docker build --build-arg QUAGG_SHA=$(git rev-parse --short HEAD) ...
ARG QUAGG_SHA=unknown
ENV QUAGG_SOLVER_SHA=${QUAGG_SHA}
COPY --from=build /opt/quagg-patches.txt /opt/lisflood/PATCHES.txt

# Job-Verzeichnis wird vom Backend gemountet: /job/inputs + /job/results
WORKDIR /job
ENTRYPOINT ["python3", "-u", "/opt/lisflood/handler.py"]
CMD ["--job", "/job"]

# ── RunPod-Serverless-Worker ─────────────────────────────────────────────────
# Gleiches Runtime-Image + runpod-SDK/boto3 + Wrapper (runpod_worker.py), der
# handler.py als Subprozess faehrt und Binaer-Ergebnisse gzip't nach S3/R2 laedt.
# Build:  docker build --target runpod -t lisflood-fp:runpod -f engines/docker/Dockerfile .
# pip braucht auf ubuntu 24.04 --break-system-packages (PEP 668, kein venv noetig
# im Wegwerf-Container).
FROM runtime AS runpod
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && pip3 install --no-cache-dir --break-system-packages runpod boto3 \
    && apt-get purge -y python3-pip && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*
COPY engines/docker/runpod_worker.py /opt/lisflood/runpod_worker.py
ENTRYPOINT ["python3", "-u", "/opt/lisflood/runpod_worker.py"]
CMD []
