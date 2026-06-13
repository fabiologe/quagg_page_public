#!/usr/bin/env bash
# Baut das RunPod-GPU-Image (CUDA). AUS backend/app/api/flood2D ausführen
# (Build-Kontext braucht codec.py + engines/vendor + engines/patches).
#
#   CUDA_ARCH : GPU-Compute-Capability ohne Punkt. 80=A100, 89=RTX4090/L40 (default), 90=H100.
#   TAG       : Image-Tag (default lisflood-fp:cuda)
#
# Ausführen mit GPU (--gpus all) macht der DockerEngine im Backend automatisch.
set -euo pipefail
CUDA_ARCH="${CUDA_ARCH:-89}"
TAG="${TAG:-lisflood-fp:cuda}"

docker build -f engines/docker/Dockerfile \
  --build-arg BASE_IMAGE=nvidia/cuda:12.4.1-devel-ubuntu22.04 \
  --build-arg RUNTIME_IMAGE=nvidia/cuda:12.4.1-runtime-ubuntu22.04 \
  --build-arg CUDA_ARCH="${CUDA_ARCH}" \
  -t "${TAG}" .

echo "✅ Gebaut: ${TAG} (sm_${CUDA_ARCH}) — GPU-Schemata: run.par mit 'fv1'/'dg2' + 'cuda'."
