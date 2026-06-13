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

# ── Build ────────────────────────────────────────────────────────────────────
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

RUN cmake -S /src -B /build \
        -DCMAKE_BUILD_TYPE=Release \
        -D_CONFIG=/src/config.docker.cmake \
    && cmake --build /build --target lisflood -j"$(nproc)"

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM ${RUNTIME_IMAGE}

# volles python3 (nicht -minimal): der Handler braucht die stdlib (json, ...)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 libnuma1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/lisflood /opt/lisflood/lisflood
COPY engines/docker/handler.py /opt/lisflood/handler.py
COPY codec.py /opt/lisflood/codec.py

# Job-Verzeichnis wird vom Backend gemountet: /job/inputs + /job/results
WORKDIR /job
ENTRYPOINT ["python3", "-u", "/opt/lisflood/handler.py"]
CMD ["--job", "/job"]
