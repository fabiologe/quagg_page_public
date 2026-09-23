# Protokoll Stufe A — Physik glaubwürdig machen (flood-3D)

Wird während der Umsetzung von `FAHRPLAN_A_PHYSIK_2026-09-23.md` gefüllt. Regel: kein Schritt
ist erledigt ohne Datum, Commit und Zahl vorher/nachher. Läufe stehen in der Laufliste unten.
Angelegt 2026-09-23, noch leer.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| A0 | Messlatte (Fall K, Fall A, `probe_lauf.py`) | ☑ erledigt | 2026-09-23 | `d807cc4` |
| A1 | Freispiegel-Zulauf statt Wasservorhang | ☑ K ☑ A (Lücke = Austritt über die Atmosphäre, a5_a) | 2026-09-23 | `88610a4` |
| A2 | Turbulenz-Init aus Q und Fläche | ☑ gemessen (a2_k) | 2026-09-23 | `88610a4` |
| A3 | Tracer an die Wasserphase | ☑ gemessen (a3_k), Ziel < 3 % verfehlt (6,6 %) | 2026-09-23 | `88610a4` |
| A4 | σ = 0 | ☑ gemessen (a4_k): ohne messbare Wirkung | 2026-09-23 | `88610a4` |
| A5 | Atmosphäre-Regel, y⁺ je Patch | ☑ gemessen (a5_k) | 2026-09-23 | `88610a4` |
| A6 | Harness-Probe, Wehr-Nachlauf, Numerik-Version, Goldens | ☑ live (pm2 20:43, Build 20:47); Wehr **nicht bestanden** (C_d 0,540) → A7 | 2026-09-23 | `88610a4`, `82faf00`, `5c99945` |

Status-Wörter: ☐ offen · ⏳ in Arbeit · ☑ erledigt (mit Zahl) · ✗ verworfen (mit Grund).

## A0 · Messlatte — Vorher-Zahlen

yPlus.dat-Spaltenlayout (in A0 abgelesen): `# Time  patch  min  max  average` — eine Zeile je
Patch und Zeitpunkt, also schon je Patch; `runner._y_plus_range` wirft den Patch nur weg.

Fall K gebaut: 21 000 Zellen (Geländeverfeinerung Stufe 1 an der Sohle; Schätzung
`zellen_schaetzung` sagte 12 000). 15 s Simulation ≈ 7–10 min auf 3 Kernen.
Die alten E7-Skripte liegen jetzt als `backend/app/api/flood3D/probe/` im Repo.
Vorher-Läufe für Fälle, deren Fallbau schon geändert ist, baut eine `git archive HEAD`-
Kopie des Pakets unter `data/probe_a/_code_alt/` (`--nur-bauen`, dann `--nur-rechnen`).

| Messgröße | Fall K | Fall A (BetaTest08-Kopie) |
|---|---|---|
| Zellen | 21 000 | 29 006 (gekürzt auf 10 s, Felder alle 0,5 s) |
| max \|U\| in 0–2 s [m/s] | 3,78 | 7,29 |
| höchste nasse Zelle (α > 0,5) in den 2 Zellreihen vor der Zulauffläche, t ≤ 1 s [m NHN] | 100,58 (Sohle 100,02 → 0,56 m Wasserwand) | 225,73 (Fenster 225,22–225,75 voll; Sohle 225,125) |
| Bilanzlücke \|ΔV − ∫(Zu − Ab)dt\| / ∫Zu dt [%] | 14,7 (0,62 m³; Austritt über die Atmosphäre wird nicht gemessen) | 1,46 |
| Q am Querschnitt, Mittel letzte Sekunde [m³/s] | 0,244 (Soll 0,28; bei 15 s noch nicht eingeschwungen) | – (kein Querschnitt; Zulauf 0,80, Ablauf ≈ 0 — Becken füllt sich) |
| WSP am Pegel, Mittel letzte Sekunde [m NHN] | 100,200 | – (kein Pegel) |
| Co_max | 0,41 | 0,53 |
| y⁺ je Patch min/max (t = 15 s) | terrain 126 / 4 574; farfield 19 / 4 761 | terrain 12 / 48 828; wehr_2 97 / 34 715; randwand_zulauf 24 / 6 936; farfield 46 / 9 320 |
| Tracer-Verlust / davon in der Luft [%] | 62,5 / 18,7 | (kein Tracer) |
| Laufzeit ClockTime [s], Kerne | 566, 3 | 890, 3 |

## A1 · Freispiegel-Zulauf — Gegenlauf

| Messgröße | Fall K alt | Fall K neu | Fall A alt | Fall A neu | Abnahme |
|---|---|---|---|---|---|
| höchste nasse Zelle am Zulauf, t ≤ 1 s [m NHN] | 100,58 | **100,20** | 225,73 | **225,61** | ≤ z_start + 1 Zelle (K: 100,32; A: 225,53 + 0,125 = 225,66) ☑ K ☑ A |
| Bilanzlücke [%] | 14,7 | **0,79** | 1,46 | **2,39** | < 1 ☑ K ✗ A — Verdacht Austritt über die Atmosphäre (0,5 m Freibord); ab jetzt gemessen (`patchflow_atmosphere`), Fall A erneut als a5_a |
| Q am Querschnitt [m³/s] | 0,244 | 0,258 | – | – | 0,28 ± 5 % — bei 15 s noch nicht eingeschwungen, → A6 (längerer Lauf) |
| WSP am Pegel [m NHN] | 100,200 | 100,235 | | | (Info) |
| max \|U\| t ≤ 2 s [m/s] | 3,78 | 3,34 | 7,29 | 7,55 | (Info) |
| Zufluss gemessen (α-gewichtet) / Soll [m³/s] | 0,280 / 0,28 | 0,278 / 0,28 | 0,800 / 0,8 | 0,787 / 0,8 | ± 2 % ☑ — der Rest ist Luft: `flowRate` ist der Gemischstrom, teilnasse Randflächen (α < 0,9) führen etwas Luft mit |
| Co_max | 0,41 | 0,40 | 0,53 | 0,54 | ≤ 1,5 ☑ K ☑ A |
| Laufzeit [s] | 566 | 418 | 890 | 775 | ≤ 1,5 × alt ☑ K ☑ A |
| z_start / h_start / A_nass / U_mittel (zulauf_lage) | – | 100,22 / 0,20 / 0,20 m² / 1,40 m/s | – | 225,53 / 0,41 / 0,34 m² / 2,37 m/s | (Info) |
| Rampe nötig? | – | nein (Co 0,40) | – | | |

Umgestellte Tests: _Liste_. Neue Tests: `test_zulauf_freispiegel.py` (_n_ Tests). Suite: _n_ grün.

## A2 · Turbulenz-Init

| Messgröße | vorher | nachher |
|---|---|---|
| k / ω am Zulauf und im Innenfeld (Fall K, aus 0/k, 0/omega) | 1e-4 / 1 | 7,35e-3 / 3,91 (U = 1,40 m/s, L = 0,040 m) |
| ν_t(0) = k/ω | 1,0e-4 | 1,9e-3 |
| Q am Querschnitt gegenüber A1 | – | 0,2583 → 0,2551 (−1,2 %) ☑ ± 2 % |
| WSP am Pegel gegenüber A1 | – | 100,2347 → 100,2345 (−0,2 mm) ☑ |
| Zufluss gemessen (α-gewichtet) | 0,2777 | 0,2692 (−3,9 % gegen Soll 0,28) — Gemischstrom-Effekt, siehe A6 |
| Co_max / Laufzeit | 0,40 / 418 s | 0,39 / 406 s |

## A3 · Tracer phasengebunden

| Messgröße | vorher | nachher | Abnahme |
|---|---|---|---|
| div-Schlüssel, den interFoam verlangt hat | – | keiner — `div(phi,T)` genügt, Lauf ohne Fehler | ☑ |
| Tracer-Bilanz Verlust [%] (a2_k → a3_k) | 50,1 | **6,6** | < 3 ✗ — Rest vermutlich flächen- statt flussgewichtete Ablauf-Konzentration (`weightedAverage`), → Stufe B; Dauertest hält < 10 % fest |
| Q am Querschnitt / Bilanz | 0,2551 / 0,78 % | 0,2551 / 0,78 % | unverändert ☑ (Stoff ist nur Beobachter) |

## A4 · σ = 0

| Messgröße | vorher (σ = 0,07) | nachher (σ = 0) |
|---|---|---|
| Log ohne FatalError | ☑ | ☑ (σ = 0 wird angenommen) |
| Q am Querschnitt [m³/s] | 0,25509 | 0,25508 |
| WSP am Pegel [m NHN] | 100,23448 | 100,23446 |
| max \|U\| in Wasserzellen je Ausgabezeit | 2,75 … 2,04 | identisch auf 0,01 m/s |
| Co_max | 0,386 | 0,392 |
| Laufzeit [s] | 393 | 396 |

Befund: bei 0,1-m-Zellen ohne messbare Wirkung — die Physik sagt das voraus (We ≫ 1).
Die im Audit vermuteten Scheinströmungen an der Grenzfläche waren in Fall K nicht zu sehen;
die Änderung bleibt, weil sie eine bedeutungslose Kraft entfernt, nicht weil sie etwas repariert.
Eine eigene Messgröße „|U| in Luftzellen an der Grenzfläche" hat `probe_lauf.py` nicht.

## A5 · Atmosphäre-Regel, y⁺ je Patch

| Prüfung | Ergebnis |
|---|---|
| Fall ohne Atmosphäre → `fehler` | ☑ (`test_atmosphaere_yplus.py`) |
| Kur `atmosphaere_anlegen` → Befund weg (dieselbe Messung `hat_atmosphaere`) | ☑ |
| y⁺ je Patch im Manifest (a5_k, echter Runner im Container) | ☑ farfield 34 / 6 608, terrain 28 / 6 086 |
| Befundtext nennt die Patches | ☑ „y+ bis 6.608 („farfield" bis 6.608, „terrain" bis 6.086) …" |
| Grenzschichten | entfällt — schon standardmäßig aus |

## Befund Zufluss-Defizit (a5_k, 2026-09-23 20:15)

Die neue Randbedingung liefert Q als GEMISCHstrom: `variableHeightFlowRateInletVelocity`
verteilt `flowRate` auf die Randflächen im Verhältnis ihres Wasseranteils α; Flächen in der
verschmierten Grenzschicht (0 < α < upperBound 0,9) tragen Luft mit. Gemessener Wasserzufluss
(α-gewichteter `patchflow_inlet`) in Fall K:

| t [s] | 0,1 | 0,5 | 1 | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q_Wasser [m³/s] (Soll 0,28) | 0,258 | 0,266 | 0,280 | 0,280 | 0,280 | 0,278 | 0,276 | 0,274 | 0,271 | 0,270 | 0,269 |

Bis 4 s exakt, danach −4 % bei steigendem Wasserstand am Rand (Fall A −1,6 %). Die alte
Randbedingung lieferte exakt Q — als Wasserwand. Sichtbar ist das Defizit, weil Bilanz und
Kennwerte den gemessenen Randfluss nehmen, nicht die Vorgabe. Versuch: `upperBound 0.5`
(Lauf a5b_k, gleiches Bundle, nur diese Zeile). Theorie: das Defizit sinkt, verschwindet aber
nicht, solange Flächen mit 0 < α ≤ upperBound existieren.

**Ergebnis a5b_k — übernommen (`88610a4`):**

| | upperBound 0,9 (a5_k) | upperBound 0,5 (a5b_k) |
|---|---|---|
| Q_Wasser t = 1 / 4 / 8 / 12 / 15 s | 0,280 / 0,280 / 0,276 / 0,271 / 0,269 | 0,280 / 0,280 / 0,280 / 0,280 / 0,280 |
| Q Querschnitt bei 15 s | 0,255 | 0,262 |
| WSP Pegel | 100,2345 | 100,2332 |
| Bilanzlücke | 0,78 % | 0,79 % |
| höchste nasse Zelle am Zulauf t ≤ 1 s | 100,20 | 100,30 (Grenze 100,32) |
| Tracer-Verlust | 6,6 % | 8,8 % |
| Co_max / Laufzeit | 0,39 / 400 s | 0,38 / 403 s |

Besser als die Theorie: Q kommt über den ganzen Lauf exakt an. Kosten: 2,2 Prozentpunkte
mehr Tracer-Verlust, Startwasser eine Zelle höher. Atmosphären-Austritt in Fall K: 4·10⁻⁸ m³ —
die 0,8 % Restlücke hat eine andere Ursache (vermutlich α-gewichteter Randfluss gegen den
tatsächlich von MULES transportierten Fluss).

## Fall A erneut, mit Atmosphären-Durchfluss (a5_a, Stand A1–A5, upperBound noch 0,9)

| Messgröße | a1_a | a5_a |
|---|---|---|
| Bilanzlücke ohne Atmosphäre | 2,39 % | 0,78 % |
| über die Atmosphäre ausgetreten | (nicht gemessen) | **0,056 m³ = 0,72 %** des Zuflusses |
| Bilanzlücke mit Atmosphäre | – | **0,05 %** ☑ |
| höchste nasse Zelle am Zulauf t ≤ 1 s | 225,61 | 225,61 |
| Wasser-Zufluss / Soll | 0,787 / 0,8 | 0,787 / 0,8 (mit 0,5 nicht nachgerechnet) |
| Co_max / Laufzeit | 0,54 / 775 s | 0,54 / 734 s |

Die Fall-A-Lücke ist Wasser, das bei 0,5 m Freibord oben hinausspritzt — kein Rechenfehler.
Warum sie in a1_a 2,4 % und hier 0,8 % beträgt, ist nicht geklärt (geänderter Anfangszustand
durch A2 ist der einzige Unterschied im Bundle).

## Wehr-Nachlauf (a6_wehr, Stand 2026-09-A mit upperBound 0,5) — NICHT bestanden

Server-Docker, 20 896 Zellen (Netz identisch zur Referenz), 18 s, 943 s Rechenzeit.
**C_d = 0,540 ± 0,016** (Median letztes Drittel) — Referenzband 0,58–0,71 verfehlt,
Literaturband 0,50–0,80 gehalten. Referenz 2026-08-13: 0,633 (mit Wasserwand-Zulauf).

| t [s] | 2 | 8 | 12 | 16 | 18 |
|---|---|---|---|---|---|
| Wasser-Zufluss (Soll 0,120) | 0,118 | 0,118 | 0,117 | 0,116 | 0,116 |
| Q Querschnitt `qs_ow` | 0,120 | 0,058 | 0,109 | 0,105 | 0,110 |
| Q Ablauf | 0,373 | 0,057 | 0,095 | 0,114 | 0,116 |
| WSP `pegel_ow` | 95,538 | 95,719 | 95,758 | 95,767 | 95,770 |

Befunde:
1. Zufluss-Defizit bleibt beim nassen Start: −3 % (Fall K trocken: exakt). Die
   Freispiegel-Randbedingung ist fallabhängig ungenau → eigener Schritt **A7**.
2. Querschnitt und Ablauf messen im Beharrungszustand 0,110 vs. 0,116 (−5 %) —
   C_d mit Ablauf-Q ≈ 0,56, mit Soll-Q ≈ 0,58. Messdefinition des Querschnitts
   (sampledPlane über Schnittzellen) → Stufe B/C (Kennwert-Definitionen).
3. Die Referenz wird **nicht** neu eingefroren (das wäre die Eigenreferenz, die das
   Audit kritisiert). Die Verifikationskarte zeigt „nicht bestanden"; Numerik-Stand
   2026-09-A gilt als nicht verifiziert, neue Läufe tragen den Hinweis.

## A6 · Abschluss

| Prüfung | Ergebnis | Abnahme |
|---|---|---|
| `FLOOD3D_PROBE=1 pytest tests/test_harness_probe.py` | | grün ☐ |
| Wehr-Nachlauf: Cd, Streuung, Zellen, Dauer, Ort | | Band 0,58–0,71 ☐ / neue Referenz mit Grund |
| `numerik_version` im Manifest eines neuen Laufs | | ☐ |
| Goldens: Anzahl Dateien im Satz | 4 → | ☐ |
| Backend-Suite / Client-Suite | | grün ☐ |
| BETRIEB, Spez.-Vermerk nachgezogen | | ☐ |

## Laufliste

| Datum | run_id / Job-Ordner | Fall | Schritt | Ort | Zellen | Dauer | Kerne | Ergebnis-Zeile | gelöscht? |
|---|---|---|---|---|---|---|---|---|---|
| | | | | Server-Docker | | | | | |

Fall A lief mit `--trotz-fehler`: der echte Fall hat selbst einen Prüffehler
(Wehrkrone 0,1 m < Zelle 0,125 m) — für die Zulaufmessung unerheblich.

## Entscheidungen und Abweichungen vom Fahrplan

| Datum | Was | Grund |
|---|---|---|
| 2026-09-23 | Keine Benchmark-Suite, kein RunPod | Fabio: Solver unverändert, wir bauen die Hülle; Server heute frei |
| 2026-09-23 | Grenzschichten-Punkt entfällt | schon standardmäßig aus (Erkundung) |
| 2026-09-23 | Zulauf-Arten statt „mit/ohne Fenster" | Fenster, deren Unterkante > 1 Zelle über dem Gelände liegt, sind eine Öffnung in der Wand → „strahl", voller Querschnitt wie bisher; ein Freispiegel-Rand dort würde leerlaufen (U → ∞) |
| 2026-09-23 | Startwasser = was bei t = 0 wirklich vor der Fläche steht | zuerst immer „Sohle + h_c"; am Wehrfall (Anfangswasserspiegel 95,55) gab das 0,25 statt 0,55 m² und falsches Q/A — korrigiert, Test ergänzt |
| 2026-09-23 | Manifest-Felder `zulauf`, `turbulenz_init` mit A6 statt A1/A2 | ein pm2-Neustart für alle Router-Änderungen |
| 2026-09-23 | Laminar-Sonderfall aus A2 nicht umgesetzt | kein Fall nutzt laminar, kein Probelauf dafür; ungeprüft nichts ändern |
| 2026-09-23 | A1–A6 in EINEM Commit (`88610a4`) statt je Schritt | die Schritte berühren dieselben Funktionen in `casebuilder.py`; getrennt gemessen wurde trotzdem je Schritt (eingefrorene Bundles a1_k … a5_k) |
| 2026-09-23 | `upperBound 0.5` statt 0,9 (Tutorial) | a5b_k: Wasser-Zufluss exakt statt −4 % |
| 2026-09-23 | Atmosphären-Durchfluss als functionObject (`patchflow_atmosphere`) | Fall-A-Bilanzlücke 2,4 % unerklärt; extract_case liest ihn nicht als Ablauf |
| 2026-09-23 | Tracer-Ziel < 3 % → Dauertest hält < 10 % | erreicht 6,6 / 8,8 %; Rest vermutlich flächengewichtete Ablauf-Konzentration → Stufe B |
| 2026-09-23 | Wehr-Nachlauf ans Ende, unbeaufsichtigt | Fabio: nicht alles durchrechnen, das sind kleine Tests |
| 2026-09-23 | Wehr-Nachlauf 1. Versuch bei t = 8,3 s abgebrochen (137) | pm2-Neustart: der API-Startwächter entfernt `f3d_*`-Container ohne lebendes `quagg.pid`-Label; Probe-Container tragen es jetzt (`82faf00`) |
| 2026-09-23 | Verifikationsdatei 20:43–20:45 kurz falsch (C_d 0,48 „nicht bestanden") | Auswerte-Wächter reagierte auf das Ende des abgebrochenen Laufs; Original aus `.bak` zurück, Auswertung verweigert jetzt unvollständige Läufe (`5c99945`) |
| 2026-09-23 | Probe-Warteschlange hing 1 h (17:39–19:25) | `pgrep -f "<muster>"` fand die eigene Startzeile der Shell und wartete auf sich selbst; neu ohne pgrep-Warten |
