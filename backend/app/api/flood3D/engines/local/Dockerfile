# quagg flood3D Local Engine — OpenFOAM v2406 + Nachlauf-Pipeline in einem
# Image. Läuft auf der NUTZER-Maschine, gestartet vom quagg Local Companion.
#
# Build (aus backend/app/api/):
#   docker build -f flood3D/engines/local/Dockerfile -t fabiologe/quagg-foam-local:latest .
#
# Der Container bekommt den Job-Ordner unter /job gemountet und erwartet
# /job/inputs/case.zip (serverseitig gebauter Fall + case.yaml + run_id.txt);
# Ergebnis ist /job/results/artifacts.zip. Protokoll: NDJSON auf stdout.
FROM opencfd/openfoam-run:2406

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages \
      numpy scipy pandas pyarrow matplotlib pyyaml pydantic shapely trimesh

# Nur der abhängigkeitsfreie Core (Spez. Kap. 3) + dieser Runner
COPY flood3D/__init__.py /opt/quagg/flood3D/__init__.py
COPY flood3D/core /opt/quagg/flood3D/core
COPY flood3D/engines/local/local_runner.py /opt/quagg/local_runner.py

ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "/opt/quagg/local_runner.py"]
