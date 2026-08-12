# Audit: Rechenorte im Vergleich — Server, Cloud, Nutzer-Maschine

Stand 2026-08-12. Anlass: Ein lokaler Lauf mit **12 Kernen** meldete 38 Stunden
Restzeit für einen Fall, für den die Vorschau 4,8 Stunden auf 4 Kernen nannte.
Frage: Woran liegt es — am Fall, am Werkzeug oder am Rechenort?

## Wie gemessen wurde

Ein Prüfstand, eine Größe je Messpunkt. Immer derselbe Fall
(`Rentrich_Beta07`), dasselbe fertig vernetzte Gitter (**317.375 Zellen**),
derselbe Startzustand, dieselbe OpenFOAM-Ausgabe (v2406, identisches Image auf
allen drei Rechenorten — abgesichert in `core/foam.py`). Gemessen wird die
**Sekunde je Zeitschritt** aus `ExecutionTime` im Solverlog, umgerechnet auf
**Zellaktualisierungen je Kern und Sekunde** — die einzige Zahl, die sich über
verschiedene Kernzahlen hinweg vergleichen lässt.

Skript: `backend/app/api/flood3D/data/_audit/messe.sh`

## Ergebnisse

| Rechenort | Ränge | `/dev/shm` | s je Schritt | je Kern | gesamt |
|---|---:|---:|---:|---:|---:|
| Server | 1 | 64 MB | 6,11 | 51.919 | 52.000/s |
| Server | 2 | 64 MB | 3,15 | 50.300 | 101.000/s |
| Server | 4 | 64 MB | 1,75 | 45.411 | 182.000/s |
| Server | 4 | 2 GB | 1,72 | 46.043 | 184.000/s |
| Server | 8 | 64 MB | 1,02 | 38.771 | 310.000/s |
| Server | 8 | 2 GB | 1,04 | 37.991 | 304.000/s |
| **Cloud (RunPod)** | 4 | – | 1,41 | **56.251** | 225.000/s |
| **Cloud (RunPod)** | 16 | – | 0,48 | **41.160** | **658.000/s** |
| **Nutzer-Maschine** | 12 | ? | 4,16 | **6.361** | 76.000/s |

Die Zeile „Nutzer-Maschine" ist aus der gemeldeten Restzeit zurückgerechnet
(38,5 h für 60 s bei einem Zeitschritt von 0,0018 s), nicht direkt gemessen.

## Was damit ausgeschlossen ist

- **Der Fall skaliert gut.** 4 Ränge bringen das 3,49-fache — 87 % Wirkungsgrad.
  Auch 8 Ränge auf 4 physischen Kernen bringen noch das 5,9-fache; Hyperthreads
  helfen hier, statt zu bremsen.
- **`/dev/shm` ist unschuldig** (bis mindestens 8 Ränge): 64 MB und 2 GB messen
  gleich (1,02 s gegen 1,04 s). Die ursprüngliche Vermutung, der kleine
  gemeinsame Speicher bremse OpenMPI, ist damit **widerlegt**. Der Zusatz
  `--shm-size=2g` im Companion v1.5.1 schadet nicht, erklärt aber nichts.
- **Die Cloud-Hardware ist in Ordnung.** 56.251 je Kern bei 4 Rängen, 41.160
  bei 16 — auf Augenhöhe mit dem Server (45.411). Der frühere Eindruck „ein
  Cloud-Kern ist dreimal langsamer" stammte aus einem Lauf mit **943.370**
  Zellen; dort bricht die Cloud auf 13.000 je Kern ein, während der Server bei
  42.000 bleibt. Der Cloud fehlt also **Speicherbandbreite für große Netze**,
  nicht Rechenleistung.
- **Die Rangzahl an sich ist es nicht.** 16 Ränge laufen in der Cloud sauber.

## Was übrig bleibt

Die **lokale Umgebung**. Zwei Kandidaten, beide nur auf der Nutzer-Maschine
prüfbar:

1. **Docker Desktop teilt der VM weniger CPUs zu, als die Maschine hat.** Der
   Läufer liest seit 2026-08-12 das Kontingent des Containers
   (`sched_getaffinity` + cgroup-Quote, `local_runner.erlaubte_kerne`) — die
   Log-Zeile **„Rechne auf N Kernen"** sagt, was er wirklich bekommt.
2. **Der Job-Ordner liegt auf einem Windows-Pfad statt im Docker-Volume.**
   Dateizugriffe über die Docker-Desktop-Brücke sind um Größenordnungen
   langsamer, und OpenFOAM schreibt permanent (Logs, Prozessorordner,
   Zeitschritte). Das erzeugt genau dieses Bild: viele Kerne, kaum Fortschritt,
   kein Absturz. Verstärkt wird es durch dichte Feldausgaben — im Fall standen
   0,1 s, das sind **601 Schreibvorgänge** über den Lauf.

## Empfehlung je Rechenort

| | wofür | Bemerkung |
|---|---|---|
| **Server** | kleine bis mittlere Netze, Netzvorschau | 4 Kerne, geteilt mit der Webseite; ab ~500k Zellen wird es zäh |
| **Cloud** | große Netze, lange Läufe | 16 vCPU = 3,6-facher Durchsatz des Servers; ab ~1 Mio. Zellen bricht die Bandbreite ein — dann lieber Netz prüfen als Kerne kaufen |
| **Lokal** | schnelle Iteration, kostenfrei | erst nutzen, wenn die zwei Punkte oben geklärt sind |

## Nebenbefunde

- Die **Feldausgabe** ist der unterschätzte Kostenpunkt: 0,1 s Intervall bei 60 s
  Simulationsdauer sind 601 Ausgaben und rund 6,9 GB. 1,0 s genügt für Ansicht
  und Zeitschieber und kostet ein Zehntel.
- Der **Zeitschritt hängt an der Wasseroberfläche**, nicht an der global
  feinsten Zelle: Die Geländeverfeinerung von Stufe 3 auf 2 drittelte die
  Zellzahl, änderte den Zeitschritt aber nur um 12 % (0,0016 → 0,0018 s). Die
  Laufzeitschätzung leitet ihn bisher aus der feinsten Zelle ab und liegt
  deshalb noch rund 2,3-fach zu optimistisch — offener Punkt.
