# quagg flood3D RunPod-Worker — dasselbe Rechen-Image wie auf der
# Nutzer-Maschine, nur mit RunPod-Handler davor.
#
# Build (aus backend/app/api/):
#   docker build -f flood3D/engines/runpod/Dockerfile \
#     -t fabiologe/quagg-foam-runpod:2406 .
#
# WICHTIG: Die Basis ist das Local-Image, damit Server, Nutzer-Maschine und
# Cloud dieselbe OpenFOAM-Ausgabe fahren (s. core/foam.py, Tests in
# tests/test_foam_version.py). Nicht auf ein anderes Foam-Image umhaengen,
# ohne FOAM_API_ERWARTET und den Server mitzunehmen.
FROM fabiologe/quagg-foam-local:latest

USER root
RUN pip3 install --no-cache-dir --break-system-packages runpod boto3

# Der Handler ersetzt den ENTRYPOINT des Local-Images; local_runner.py
# liegt dort schon unter /opt/quagg und wird als Subprozess gefahren.
COPY flood3D/engines/runpod/foam_worker.py /opt/quagg/foam_worker.py

ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "-u", "/opt/quagg/foam_worker.py"]
