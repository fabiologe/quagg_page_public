# quagg Local Companion als Docker-Image — Windows-/Mac-freundliche Verteilung:
# der Nutzer braucht NUR Docker Desktop (kein Python auf dem Host).
#
# Build (aus backend/companion):
#   docker build -t fabiologe/quagg-companion:latest .
#
# Start beim Nutzer (ein Copy-Paste-Kommando, Windows/macOS/Linux identisch):
#   docker run -d --restart unless-stopped --name quagg-companion \
#     -p 127.0.0.1:8642:8642 \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     -v quagg-flood2d-data:/data \
#     -v quagg-flood3d-data:/data3d \
#     fabiologe/quagg-companion:latest
#
# Der Solver läuft als GESCHWISTER-Container über den gemounteten Docker-Socket;
# Ergebnisse liegen im benannten Volume quagg-flood2d-data (Sibling-Modus, s.
# quagg_local_companion.py). Port nur auf 127.0.0.1 publishen — der Companion
# gehört nicht ins Netz.
FROM python:3.12-alpine

# docker-CLI (redet über den gemounteten Socket mit dem Host-Daemon)
RUN apk add --no-cache docker-cli

COPY quagg_local_companion.py /opt/quagg/quagg_local_companion.py

# Zwei getrennte Volumes: LISFLOOD-Ergebnisse sind klein, OpenFOAM-Laeufe
# (Netz + Zeitschritte) gehen in die GB — getrennt heisst getrennt
# aufraeumbar, und ein 3D-Schwung raeumt keine 2D-Ergebnisse weg.
ENV QUAGG_COMPANION_DATA=/data \
    QUAGG_COMPANION_DATA_3D=/data3d \
    QUAGG_SIBLING_VOLUME=quagg-flood2d-data \
    QUAGG_SIBLING_VOLUME_OPENFOAM=quagg-flood3d-data \
    QUAGG_COMPANION_PORT=8642

EXPOSE 8642
# 0.0.0.0 im Container — nach außen begrenzt das -p 127.0.0.1:8642:8642 des Nutzers.
ENV QUAGG_COMPANION_BIND=0.0.0.0
ENTRYPOINT ["python3", "-u", "/opt/quagg/quagg_local_companion.py"]
