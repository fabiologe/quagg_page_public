# Protokoll Stufe C — Ergebnisse ehrlich machen (flood-3D)

Zu `FAHRPLAN_C_ERGEBNISSE_2026-09-24.md`. Kein Schritt erledigt ohne Zahl vorher/nachher.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| C0 | Messlatte | ◐ in C1 aufgegangen (Wehr alt/neu im Vergleich) | 2026-09-24 | |
| C1 | Querschnitt exakt über die Zellflächen | ☑ gebaut, Suite + Harness grün | 2026-09-24 | `2fd2dbf` |
| C2 | Planraster aus echten Zellen | ☑ gebaut; Volumen 50 % → 0,03 %, Pegel 40 → 9 mm | 2026-09-24 | (dieser) |
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

## C2 · Planraster aus echten Zellen

`core/planfelder.py` (`PlanNetz`): Zellzentren (0/C) + Zellvolumen (0/V, `writeCellVolumes`
im Nachlauf) + α, U je Ausgabezeitpunkt → acht 2D-Raster `plan_h, plan_wsp, plan_ux, plan_uy,
plan_uox, plan_uoy, plan_uo, plan_fr` auf dem xy-Gitter des Laufs. Zellmaße aus der
blockMesh-Zelle und der Verfeinerungsstufe (Grundfläche = Block / 4^Stufe, Höhe = V /
Grundfläche); jede Zelle wird anteilig auf die überdeckten Säulen verteilt → Σ h·A = Σ α·V
exakt, auch auf gröberem oder schiefem Raster.

**Abweichung vom Fahrplan:** keine eigene Ablage `planfelder/` und keine neuen Endpunkte.
Die Raster liegen in derselben `fields/t_XXXX.npz` wie `bed_shear` und gehen über den
bestehenden F3DV-Endpunkt (`?fields=plan_h,…`). Ansichten fordern sie immer an; ein Lauf vor
C2 liefert sie nicht, dann rechnet der Client wie bisher aus dem Voxel-Raster
(`quelle: 'raster'` statt `'zellen'`). Keine serverseitige Hülle: die Umhüllende im
Grundriss nimmt dieselben Raster und lädt dafür nur noch die 2D-Felder (vorher je Zeitpunkt
alpha + U in 3D).

**Definitionen** (Docstring `planfelder.py`): h = Σ α·V / A; WSP = u + W / A_S (u =
Unterkante der obersten Zelle mit α ≥ 0,5, W = Wasser ab u aufwärts, A_S = Fluidfläche der
Schicht bei u), Filme ohne nasse Zelle Sohle + h; ū tiefengemittelt; u_oben aus der obersten
nassen Zelle; Fr = |ū|/√(g h) nur für h ≥ 2 Zellhöhen. Energiehöhe (`energy_head_series`)
rechnet aus plan_wsp + |ū|²/2g, der Längsschnitt tastet `froude` ab statt eine zweite Fr zu
rechnen.

**Drei Entwürfe verworfen, jeder am Lauf gemessen:**

1. WSP = Sohle + h, Rückfall auf die oberste nasse Zelle nur bei „Luftpolster". In Fall A
   traf der Rückfall 46 von 84 Säulen mit nasser Zelle — keine Luftpolster, sondern
   Böschungen: Geländespanne in der Säule im Median 0,44 m (normale Säulen 0,03 m); Sohle + h
   lag im Median 0,15 m unter der Grenzfläche.
2. WSP = oberste nasse Zelle + Füllgrad + Zelle darüber (wie der alte Client): Fall K am
   Pegel systematisch 4–14 mm zu tief.
3. WSP = oberste nasse Zelle + Σ α·Zellhöhe aufwärts (Kante ∛V): feine Zellen liegen in einer
   verfeinerten Säule NEBENEINANDER (Fall K: 4 × 0,05 m unter einer 0,1-m-Zelle) und wurden
   übereinander gezählt → +6 cm bei 3,5 s; dazu sind die Zellen flacher als breit
   (0,05 × 0,05 × 0,047 m), ∛V legte die Sohle 3 mm unters Gelände.

Tests: `test_boeschung_in_der_saeule_spiegel_an_der_grenzflaeche`,
`test_feine_zellen_nebeneinander_zaehlen_als_flaeche`, `test_zellmasse_aus_blockzelle_und_stufe`.

**Fall A (c2_a, BetaTest08-Kopie, 29 000 Zellen, 10 s, 21 Zeitpunkte):**

| Größe | Voxel-Raster (vorher) | Planraster (C2) |
|---|---|---|
| Volumen gegen Solver, max | 49,8 % | **0,028 %** |
| Volumen gegen Solver, Mittel | 17,5 % | **0,007 %** |
| Säulen mit Spiegel (t = 10 s) | 179 | 184 (= alle nassen) |
| Spiegelsprung zu Nachbarsäulen, Median | 6,8 cm | 4,2 cm |

Der Volumenrest sind Zellen am Gebietsrand, deren Grundfläche über das Raster hinausragt. Große
Spiegelsprünge (95 % 0,54 m, vorher 0,57 m) liegen zwischen Zulauf und Wehr (y = 2,5–8 m,
schießend den Hang hinab) — im alten Raster genauso.

**Fall K (c2_k, 21 000 Zellen, 15 s), Pegel bei (5,0 | 0,5) gegen `interfaceHeight`:**

| t [s] | Pegel Solver | Planraster (Mittel der 4 Säulen an der Ecke) | Δ | Voxel alt | Δ |
|---|---|---|---|---|---|
| 2,5 | 100,0784 | 100,0801 | +1,7 mm | 100,0749 | −3,5 mm |
| 6,0 | 100,1854 | 100,1705 | −14,9 mm | 100,1228 | −62,6 mm |
| 15,0 | 100,2353 | 100,2305 | −4,8 mm | 100,1880 | −47,3 mm |
| Mittel \|Δ\| (2,5–15 s) | | | **9,1 mm** | | **40,1 mm** |

Volumen Fall K: 0,006 %. Der Rest gegen den Pegel liegt im Pegel, nicht in den Rastern —
von Hand nachgerechnet bei 15 s: Sohle der Pegelsäule 100,0098 (Gelände 100,010) + Schichten
0,0408 + 2 × 0,0468 + 0,7986 × 0,0941 + 0,1158 × 0,0944 = 100,2303, Server 100,2305.
`interfaceHeight` integriert punktweise interpoliertes α auf einer Linie über der Säulenecke
und zählt dabei 5 mm mehr Wasser, als in der Säule steckt.

Nebenfund: `viz_volume_check` klemmte t = 0 (vor dem ersten Takt der Volumenreihe, 0,1 s) auf
deren ersten Wert — in Fall A ein Scheinfehler von 14 %; beide Selbsttests vergleichen jetzt nur
innerhalb der Reihe (`test_viz_volume_check_vergleicht_nur_innerhalb_der_reihe`).

Befunde: die Viz-Warnung sagt mit Planrastern „nur die 3D-Ansicht"; neu **fehler**, wenn die
Planraster > 1 % vom Solver abweichen. Harness-Probe: fünfte Behauptung
`test_planraster_volumentreu` (< 1 %) — Lauf 5/5 grün (8 min, Planraster 0,006 %, Voxel 37 %). Suiten: Backend 937 + 6 übersprungen, Client 400.

Nicht gemacht: Browserprobe der Panels an einem C2-Lauf (braucht pm2 + Build); Laubkarten-Tests
laufen weiter gegen synthetische Arrays — `planFields` liefert aus Serverrastern dieselben
Schlüssel (`test/planFields.test.js`, Serverzweig).
