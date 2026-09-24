# Protokoll Stufe C — Ergebnisse ehrlich machen (flood-3D)

Zu `FAHRPLAN_C_ERGEBNISSE_2026-09-24.md`. Kein Schritt erledigt ohne Zahl vorher/nachher.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| C0 | Messlatte | ◐ in C1 aufgegangen (Wehr alt/neu im Vergleich) | 2026-09-24 | |
| C1 | Querschnitt exakt über die Zellflächen | ☑ gebaut, Suite + Harness grün | 2026-09-24 | (dieser) |
| C2 | Planraster aus echten Zellen | ☐ offen | | |
| C3 | Wasseroberfläche als VTP | ☐ offen | | |
| C4 | Kennwerte: eine Definition je Größe | ☐ offen | | |
| C5 | Wehr neu | ☐ offen | | |

## C1 · Querschnitt exakt

`casebuilder.schnitt_band(spec, sec)`: senkrechtes Band entlang ALLER Polylinienpunkte
(Normale = Rechtsnormale wie `section_normal`) → STL `constant/triSurface/schnitt_<id>.stl`
→ topoSet `searchableSurfaceToFaceZone` → faceZone `qs_<id>` → functionObject
`surfaceFieldValue`, `regionType faceZone`, `operation sum`, `fields (phi alphaPhi0.water)`.
`readers.read_discharge` nimmt die Spalte `sum(alphaPhi0.water)` (Wasserfluss), alte Läufe
(Vektorformat) lesen wie bisher. Syntax an der kommentierten Referenz des Images
(`etc/caseDicts/annotated/topoSetSourcesDict`, `postProcessing/flowRate/flowRateFaceZone`).

Probelauf Fall K bis 2 s: faceZone 150 Flächen / 0,99 m² (= Querschnitt über dem Gelände),
Vorzeichen positiv in Fließrichtung, `alphaPhi0.water` für das functionObject erreichbar.

**Wehr (c1_wehr, 20 896 Zellen, 817 s) gegen a6_wehr (alte Schnittebene):**

| Mittel | Q Zufluss | Q Querschnitt | Q Ablauf | Querschnitt / Ablauf |
|---|---|---|---|---|
| alt, 12–18 s | 0,1166 | 0,1059 | 0,1070 | −1,0 % |
| alt, 15–18 s | 0,1164 | 0,1086 | 0,1139 | −4,7 % |
| neu, 12–18 s | 0,1165 | 0,1082 | 0,1076 | +0,5 % |
| neu, 15–18 s | 0,1164 | 0,1110 | 0,1139 | −2,6 % |

Befund: die exakte Messung rückt den Querschnitt ≈ 2 Prozentpunkte an den Ablauf. Der
Rest ist KEINE Messfrage — bei 18 s fließt 2 % mehr zu als ab, der Oberwasserspiegel steigt
noch (95,758 → 95,770 m zwischen 12 und 18 s): der Wehrfall ist nach 18 s nicht
eingeschwungen, und das „letzte Drittel" für C_d liegt im Anlauf. → C4 (Zeitfenster aus der
Beharrung) und C5 (längere Laufzeit). C_d mit exaktem Querschnitt: 0,552 ± 0,017 (vorher
0,540). Die Abnahme „< 1 % im Beharrungszustand" ist an diesem Fall deshalb noch nicht
prüfbar; über 12–18 s gemittelt 0,5 %.

Nebenwirkung: behebt Audit F10 (geknickte Querschnitte maßen auf einer Geraden aus Anfangs-
und Endpunkt). Tests: alter bounds-Test ersetzt durch `test_querschnitt_misst_ueber_die_ganze_polylinie`;
Belag-Test zählte `searchableSurfaceToFace` als Teilstring. Golden `controlDict` neu
(Schnittebene → faceZone-Summe).

Dauertest: Backend-Suite 922 passed / 4 skipped; Harness-Probe Fall K 4/4 (8 min).
Fall K bei t_end (10 s, Gerinne füllt sich noch): Q Zulauf 0,280 · Querschnitt 0,262 ·
Ablauf 0,237 m³/s — der Querschnitt liegt dazwischen, wie es beim Auffüllen sein muss;
Massenfehler 0,8 %.
