#!/usr/bin/env bash
# Baut die LISFLOOD-Images als Multi-Arch-Manifest (docker buildx) und pusht sie.
# AUS backend/app/api/flood2D ausfuehren (Build-Kontext braucht codec.py +
# engines/vendor + engines/patches).
#
#   PLATFORMS : Ziel-Architekturen (default nur linux/amd64 — s. WARNUNG unten)
#   REPO      : Registry-Repo (default fabiologe/lisflood_acc_modi)
#   TAG       : Basis-Tag (default runpod)
#   TARGET    : Dockerfile-Stage: runpod (RunPod-Worker) | runtime (handler.py)
#   PUSH      : 1 = in die Registry pushen (default), 0 = nur Cache/lokal
#
# ⚠️  ARCHITEKTUR-STATUS (Stand 2026-07-29)
#   linux/amd64  GETESTET — E2E + SGC-Kopplungs-Regression gruen (Intel/AMD,
#                Linux-Server, Windows+Docker Desktop, Intel-Mac).
#   linux/arm64  UNGETESTET — kompiliert (via QEMU verifiziert), aber auf
#                KEINER echten ARM-Maschine (Apple Silicon, ARM-Server)
#                validiert. Nutzung auf eigene Gefahr: Fliesskomma-Ergebnisse
#                koennen abweichen, solange keine Regression dagegen lief.
#                Bewusst NICHT im Default enthalten.
#
# Beispiele:
#   bash engines/docker/build-multiarch.sh                       # amd64 -> :runpod
#   TARGET=runtime TAG=latest bash engines/docker/build-multiarch.sh
#   PLATFORMS=linux/amd64,linux/arm64 bash engines/docker/build-multiarch.sh
set -euo pipefail

PLATFORMS="${PLATFORMS:-linux/amd64}"
REPO="${REPO:-fabiologe/lisflood_acc_modi}"
TAG="${TAG:-runpod}"
TARGET="${TARGET:-runpod}"
PUSH="${PUSH:-1}"
BUILDER="${BUILDER:-quagg-multiarch}"

if [[ ! -f engines/docker/Dockerfile ]]; then
    echo "FEHLER: aus backend/app/api/flood2D ausfuehren (Build-Kontext)." >&2
    exit 1
fi

# Builder mit docker-container-Driver: der klassische docker-Driver kann KEINE
# Multi-Arch-Manifeste erzeugen.
if ! docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
    echo "==> buildx-Builder '${BUILDER}' anlegen"
    docker buildx create --name "${BUILDER}" --driver docker-container >/dev/null
fi

# Fremd-Architekturen brauchen registrierte QEMU-binfmt-Handler auf dem Host.
if [[ "${PLATFORMS}" == *"arm"* ]]; then
    if ! docker buildx inspect --bootstrap "${BUILDER}" 2>/dev/null | grep -q "linux/arm64"; then
        echo "==> QEMU-Emulation fuer ARM installieren (einmalig, Host-weit)"
        docker run --privileged --rm tonistiigi/binfmt --install arm64 >/dev/null
        docker buildx rm "${BUILDER}" >/dev/null 2>&1 || true
        docker buildx create --name "${BUILDER}" --driver docker-container >/dev/null
    fi
    echo "⚠️  ARM ist UNGETESTET (nur Kompilier-Nachweis) — s. Kopf dieser Datei."
fi

OUTPUT_ARG="--output=type=cacheonly"
[[ "${PUSH}" == "1" ]] && OUTPUT_ARG="--push"

echo "==> Baue ${REPO}:${TAG}  (Stage=${TARGET}, Plattformen=${PLATFORMS})"
docker buildx build \
    --builder "${BUILDER}" \
    --platform "${PLATFORMS}" \
    --target "${TARGET}" \
    -f engines/docker/Dockerfile \
    -t "${REPO}:${TAG}" \
    ${OUTPUT_ARG} .

if [[ "${PUSH}" == "1" ]]; then
    echo
    echo "==> Manifest:"
    docker buildx imagetools inspect "${REPO}:${TAG}" | grep -E "^Name:|Platform:" || true
fi
echo "✅ Fertig: ${REPO}:${TAG} (${PLATFORMS})"
