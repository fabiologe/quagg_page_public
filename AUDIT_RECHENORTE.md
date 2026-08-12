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

## Messfehler der ersten Runde — und die Korrektur

Die erste Fassung dieser Tabelle las `ExecutionTime` aus dem Solverlog. Das
ist die **CPU-Zeit des Master-Prozesses**, nicht die Wanduhr: Teilen sich
8 Ränge 4 Kerne, bekommt jeder Prozess nur einen halben Kern — seine CPU-Zeit
läuft langsamer als die Uhr, und die Messung sieht **schneller** aus, als sie
ist. Alle Zeilen mit mehr Rängen als Kernen waren dadurch Artefakte
(scheinbar 5,9-fache Beschleunigung bei 8 Rängen auf 4 Kernen). Der
Prüfstand liest seit der Korrektur `ClockTime`.

## Ergebnisse (Wanduhr, korrigiert)

Server = 4 physische Kerne ohne SMT (Topologie geprüft).

| Rechenort | Ränge | s je Schritt | je Kern | Beschleunigung |
|---|---:|---:|---:|---:|
| Server | 1 | 6,03 | 52.638 | 1,00 |
| Server | 2 | 3,29 | 48.229 | 1,83 |
| Server | 4 | 1,85 | 42.820 | 3,26 |
| Server | **8** | **2,25** | 17.632 | **2,68 — LANGSAMER als 4** |
| Server | **12** | **2,23** | 11.868 | **2,70 — LANGSAMER als 4** |
| Cloud (RunPod) | 4 | 1,41 | 56.251 | (16 vCPU zugeteilt) |
| Cloud (RunPod) | 16 | 0,48 | 41.160 | skaliert sauber |
| Nutzer-Maschine | 12 | 4,16 | 6.361 | (zurückgerechnet, 6C/12T!) |

**Kernbefund:** Mehr Ränge als physische Kerne machen den Lauf LANGSAMER —
8 Ränge auf 4 Kernen kosten 22 % gegenüber 4 Rängen. interFoam ist
speicherbandbreiten-begrenzt; Hyperthreads teilen sich Kern und Bandbreite.
Die Cloud skaliert bis 16 sauber, weil dort 16 vCPU wirklich zugeteilt sind.

**Folge für die Nutzer-Maschine (Ryzen 5 2600, 6C/12T):** Die alte Automatik
nahm 12 Ränge — nach dieser Messung kontraproduktiv. Der Läufer zählt seit
2026-08-12 die **physischen Kerne** (sysfs-Topologie, auf die erlaubten CPUs
eingeschränkt) und fährt dort 6. `/dev/shm` bleibt unschuldig — bei 12 und
16 Rängen messen 64 MB und 2 GB gleich (Verhältnisse sind vom Messfehler
nicht betroffen).

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

## Stellschrauben lokal — und was das Werkzeug NICHT begrenzt

Eingebaute Grenzen gibt es keine mehr: Der Läufer nimmt seit 2026-08-11 alle
Kerne, der Container startet ohne `--memory` und ohne `--cpus`. Was bleibt,
sind Stellschrauben in der Umgebung:

| Stellschraube | Wirkung | wo |
|---|---|---|
| **Ränge = physische Kerne** statt Threads (Ryzen 5 2600: **6** statt 12) | GEMESSEN: 8 Ränge auf 4 Kernen sind 22 % langsamer als 4 | macht die Automatik seit 2026-08-12 selbst (sysfs-Topologie); `FLOOD3D_CORES` übersteuert |
| **Job-Ordner ins Docker-Volume** | Kann ein Vielfaches ausmachen (s. u.) | Companion, Sibling-Modus mit `quagg-flood3d-data` |
| **Feldausgabe 0,1 s → 1,0 s** | zehnmal weniger Schreibvorgänge (601 → 61) | Fall, „3D-Felder schreiben alle" |
| **Docker-Desktop: CPUs und RAM hochziehen** | Voreinstellung gibt der VM oft nur die Hälfte | Docker Desktop → Settings → Resources |
| **WSL2 statt Hyper-V** (Windows) | deutlich schnellerer Dateizugriff | Docker Desktop → General |
| **Virenscanner-Ausnahme** für das Docker-Verzeichnis | Windows scannt sonst jede geschriebene Datei | Windows-Sicherheit |

Der Läufer meldet seit 2026-08-12 selbst, was er vorfindet — Ränge, sichtbare
CPUs, RAM, `/dev/shm` und **das Dateisystem des Job-Ordners**. Liegt es auf
einer Virtualisierungsbrücke (`9p`, `drvfs`, `virtiofs`, `grpcfuse`), warnt er
im Log und im Manifest. Damit beantwortet der nächste Lauf die Frage von
selbst, statt dass jemand raten muss.

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
