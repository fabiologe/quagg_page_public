# Protokoll Stufe C — Ergebnisse ehrlich machen (flood-3D)

Zu `FAHRPLAN_C_ERGEBNISSE_2026-09-24.md`. Kein Schritt erledigt ohne Zahl vorher/nachher.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| C0 | Messlatte | ◐ in C1 aufgegangen (Wehr alt/neu im Vergleich) | 2026-09-24 | |
| C1 | Querschnitt exakt über die Zellflächen | ☑ gebaut, Suite + Harness grün | 2026-09-24 | `2fd2dbf` |
| C2 | Planraster aus echten Zellen | ☑ gebaut; Volumen 50 % → 0,03 %, Pegel 40 → 9 mm | 2026-09-24 | `72209d1` |
| C3 | Wasseroberfläche aus dem Rechennetz | ☑ gebaut; Fall A flach: Iso − plan −2,5 cm, − Voxel +5,4 cm | 2026-09-24 | |
| C4 | Kennwerte: eine Definition je Größe | ☑ gebaut; Tracerbilanz 8,8 % → 0,014 % | 2026-09-24 | |
| C5 | Wehr neu | ☑ C_d 0,533 im Literaturband 0,49–0,55 (DWA-M 176); Querschnitt/Ablauf +0,06 % | 2026-09-24 | |

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
| 6,0 | 100,1854 | 100,1704 | −15,0 mm | 100,1228 | −62,6 mm |
| 15,0 | 100,2353 | 100,2303 | −5,0 mm | 100,1880 | −47,3 mm |
| Mittel \|Δ\| (2,5–15 s) | | | **9,2 mm** | | **40,1 mm** |

Volumen Fall K: 0,006 %. Der Rest gegen den Pegel liegt im Pegel, nicht in den Rastern —
von Hand nachgerechnet bei 15 s: Sohle der Pegelsäule 100,0098 (Gelände 100,010) + Schichten
0,0408 + 2 × 0,0468 + 0,7986 × 0,0941 + 0,1158 × 0,0944 = 100,2303, Server 100,2303 (mit Zellquadern aus dem Netz, c4_k; vorher 100,2305).
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

## C3 · Wasseroberfläche aus dem Rechennetz

functionObject `wasseroberflaeche` (`casebuilder._wasseroberflaeche`): `type surfaces`,
Isofläche `isoMethod topo`, α = 0,5, U auf den Knoten (cellPoint), `writeControl writeTime` —
also zu jeder Feld-Ausgabe außer t = 0. **Abweichung vom Fahrplan:** Legacy-VTK in ASCII statt
VTP. `core/oberflaeche.py` liest es ohne XML-/Base64-Leser, zerlegt die Vielecke (topo
schreibt Vielecke, über Zeilen umbrochen) in Dreiecke und legt je Zeitpunkt
`fields/oberflaeche/t_XXXX.npz` ab; `fields/index.json` trägt `oberflaeche: [Zeiten]`.
Endpunkt `GET /runs/{id}/oberflaeche?time=` liefert ein Binärpaket F3DS (Punkte f32, Dreiecke
u32, U f32; gzip), 404 bei Läufen davor. Syntax am Lauf bestätigt (c3_k, Fall K 3 s): Log
meldet `isoSurface: alpha05 : isoMethod:topo`, keine neue Warnung (die Warnung „Field U not found"
kommt vom `residuals`-Objekt und stand schon in a7_k).

Raum3D: gibt es zur Feldzeit eine Fläche aus dem Rechennetz, wird sie gezeichnet (geglättete
Normalen nur für die Beleuchtung); die Regler α-Grenze und Glättung verschwinden dann, ein
Hinweis sagt, woher die Fläche kommt. Zur Startzeit und in Läufen davor bleibt Marching Cubes
auf dem Raster. Einfärbung |U| exakt an den Knoten, andere Größen wie bisher aus dem Raster.
**Sohlschub auf dem Erdkörper:** τ geht jetzt auf die Punkte des Erdkörpers (Punkte unter der
Geländeoberfläche — Bohrungen, Seiten — bleiben in Geländefarbe); vorher landete es auf dem
Höhenfeld, das bei einem Erdkörper nicht gezeichnet wird.

**Fall K (c3_k, 3 s), je Säule mit Isofläche:**

| t | Säulen | Isofläche − plan_wsp (Median) | \|Δ\| zum alten Voxel-Spiegel (Median / 95 %) | Paket gzip (Voxel-α für MC) |
|---|---|---|---|---|
| 2 s | 448 | +4,5 mm | 10,3 / 41 mm | 32 kB (24 kB) |
| 3 s | 625 | +6,3 mm | 19,8 / 45 mm | 44 kB (34 kB) |

Am Pegel bei 3 s: Isofläche 100,1095, plan_wsp 100,1088, Pegel (`interfaceHeight`) 100,1149.
Isofläche und Pegel interpolieren α punktweise (cellPoint) und liegen beide rund 5 mm über dem
volumentreuen Spiegel aus C2 — das ist der Unterschied der Definitionen an einer über eine
0,1-m-Zelle verschmierten Grenzfläche, kein Fehler einer Seite. Der Grundriss (C2) bleibt beim
volumentreuen Maß; die 3D-Ansicht zeigt die Fläche, die OpenFOAM schneidet.

**Fall A (c3_a, 29 000 Zellen, 10 s, 20 Flächen):** 1 300–1 400 Punkte, 2 400–2 600 Dreiecke
je Zeitpunkt, Paket 39–41 kB gzip. Je Säule verglichen lag die Isofläche 4–9 cm unter plan_wsp —
aber in Fall A fällt das Gelände innerhalb einer 0,5-m-Säule bis 0,44 m ab; dort hat eine Säule
keinen einen Spiegel, der Vergleich misst die Neigung. Nur flache, tiefe Säulen (Geländespanne
< 5 cm, h > 10 cm, 32 Säulen, t = 10 s):

| | Median | \|Δ\| 95 % |
|---|---|---|
| Isofläche − plan_wsp (C2) | −25,5 mm | 138 mm |
| Isofläche − Voxel-Spiegel alt | +54,1 mm | 297 mm |

Die Zellen an der Oberfläche sind in Fall A 0,25–0,47 m hoch; 2,5 cm sind ein Zehntel davon —
genauer lassen sich zwei Definitionen an einer über eine Zelle verschmierten Grenzfläche nicht
vergleichen.

**Nachtrag C2 — Zellgeometrie aus dem Netz:** Fall A deckte auf, dass die Zellmaße aus dem
Volumen (Stufe = log₈(V_Block / V)) für angeschnittene Zellen nicht taugen: 511 Zellen lägen
rechnerisch auf Stufe 3, die der Fall nicht hat; eine Zelle mit V = 0,005 m³ wurde zu
0,125 × 0,125 × 0,32 m. `foamfields.zellquader` liest jetzt den achsparallelen Quader jeder Zelle
aus `constant/polyMesh` (points/faces/owner/neighbour; Min/Max über die Punkte ihrer Flächen) —
Grundfläche und Unterkante exakt, Höhe volumentreu V/Grundfläche. Fall A Planraster-Volumen
0,028 % → 0,0 %; Fall K unverändert (Gelände bündig, keine angeschnittenen Zellen). Tests
`test_zellquader_aus_dem_netz`, `test_angeschnittene_zelle_mit_echter_unterkante`.

## C4 · Kennwerte: eine Definition je Größe

**Überfallbeiwert** (`evaluate.ueberfall_paare`, `overfall_cd_rows`, `ueberfall_beiwert`):

- Paare nur aus Kriterien; ohne Kriterium nur, wenn eindeutig (genau 1 Wehr, 1 Querschnitt,
  1 Pegel). **Abweichung vom Fahrplan:** die Autopaarung entfällt nicht ganz — im eindeutigen
  Fall bleibt sie, sonst verlöre jeder einfache Fall sein C_d-Diagramm. Entfallen ist „jedes
  Wehr bekommt den einen Querschnitt" (zwei Wehre → zweimal derselbe Q).
- Krone = tiefster Kronenpunkt (vorher Mittel).
- H = WSP − Krone + ū²/2g, ū tiefengemittelt an der Pegelsäule aus den Planrastern (C2);
  Läufe ohne Planraster: H = h.
- EINE Verdichtung für Nachweis und Verifikation: Median ab Beharrungsbeginn des Ablaufs
  (`kennwerte` → bilanz.beharrung_ab); nicht eingeschwungen → letztes Drittel, im Nachweis
  ausgewiesen. Vorher: Nachweis = Median der ganzen Reihe (Anlauf inklusive), Verifikation =
  letztes Drittel.
- Rückstau: Unterwasser neben der Krone (plan_wsp im Abstand 2 Rasterzellen, tiefere Seite)
  als Pegelreihe `<wehr>_unterwasser`; liegt es im Fenster über der Krone → `frei = False`,
  Hinweis „Überfall nicht frei, die Überfallformel gilt nicht".

**Tracer am Ablauf durchflussgewichtet** (`weightField alphaPhi0.water` statt `alpha.water`)
— und dabei ein Fehler der Probe aus Stufe A aufgedeckt: mit `phase alpha.water` transportiert
`scalarTransport` T mit dem Wasserfluss, T ist Masse je ZELLvolumen. Die Probe zählte die Masse
als Σ α·T·V und buchte den Anteil in den Grenzflächenzellen als „Verlust". Fall K, 15 s:

| Bilanz Zufluss − Ablauf − Masse | Masse Σ α·T·V | Masse Σ T·V |
|---|---|---|
| Ablauf α-gewichtet (a5b_k / c2_k) | 8,8 % | −0,8 % |
| Ablauf durchflussgewichtet (c4_k) | 9,6 % | **0,014 %** |

Belegt ist die Deutung durch die Zahl (die Bilanz schließt), nicht durch den OpenFOAM-Quelltext.
Harness-Behauptung verschärft: |Tracer-Verlust| < 1 % (vorher < 10 %).

**min_bed_shear:** nass = plan_h > 1 cm (`TIEFE_BENETZT`, gleich dem Client) statt τ > 0 — die
Luftströmung über trockenem Gelände erzeugt ein τ > 0, das Minimum fand sie. Läufe ohne
Planraster: wie bisher.

**Froude, WSP, Energiehöhe:** mit C2 nur noch aus den Serverrastern (Längsschnitt tastet
`froude` ab, Energiehöhe aus plan_wsp + ū²/2g).

Tests: `test_ueberfall_c4.py` (6), `test_bed_shear_minimum_nur_ueber_nassen_saeulen`; Hilfetext
C_d im Client (H statt h, Beharrung, Rückstau). Backend 950 + 6 übersprungen, Client 404.

## C5 · Wehr neu

**Kriterium vor dem Ergebnis festgelegt** (`tests/verifikation_wehr.bewertungsband`, eine
Funktion für Server-Probe und RunPod-Weg): C_d im Literaturband **0,49–0,55** nach
DWA-M 176 (2013), Abschn. 4.9 „Ausbildung von Überlaufschwellen", Tabelle der Überfallbeiwerte
zur hydraulischen Berechnung: breitkroniges Wehr 0,49–0,51, abgefasst 0,50–0,55 (scharfkantig
0,62, rundkronig 0,75, profiliert 0,75–0,85; OCR-Lesung der Tabelle, Quelle über NormRAG).
Keine Eigenreferenz mehr.

**Fund dabei:** der Kommentar zum alten Band rechnete „µ ≈ 0,5–0,58 nach Poleni entspricht
C_d ≈ 0,55–0,75" um. Unsere Formel Q = C_d · ⅔ · √(2g) · b · h^1,5 IST die Poleni-Formel,
C_d = µ — die Umrechnung gibt es nicht. Sie weitete das Band auf 0,50–0,80, und die am
2026-08-11 eingefrorene Referenz 0,644 (vor dem Freispiegel-Zulauf A1 gerechnet, mit dem
Wasservorhang) lag scheinbar „mitten im Literaturband". 0,644 ist der Wert eines scharfkantigen
Wehrs; das „nicht bestanden" von Stufe A (0,540) lag in Wahrheit im Band.

**Lauf c5_wehr** (Server-Docker, 3 Kerne, 20 896 Zellen, 40 s statt 18 s, Felder alle 2 s,
Rechenzeit 1 950 s):

| Größe | Wert |
|---|---|
| Beharrung ab (Ablauf im 2-%-Band) | 16,6 s |
| Q Querschnitt / Q Ablauf, 16,6–40 s | **+0,06 %** (Abnahme C1 < 1 %: ☑; bei 15–18 s −2,35 %) |
| Q Zulauf / Q Ablauf, 16,6–40 s | +0,78 % (Massenfehler 1,03 %) |
| Pegel 18 / 25 / 40 s | 95,7704 / 95,7740 / 95,7745 m |
| ū²/2g am Pegel | 1,2 mm (h ≈ 0,17 m → C_d −1 %) |
| **C_d** (Median ab Beharrung, H = h + ū²/2g) | **0,5333 ± 0,0030** |
| Unterwasser (tiefster Spiegel stromab bis 3 m) | 95,04 m, 0,56 m unter der Krone → frei |
| Bewertung | im Band 0,49–0,55 — **bestanden** |

Zum Vergleich mit derselben Definition: 12–18 s 0,547, 15–18 s 0,542 — das alte Zeitfenster lag
im Anlauf.

**Rückstaukontrolle korrigiert:** der erste Entwurf maß das Unterwasser 2 Rasterzellen neben der
Kronenlinie — beim Verifikationswehr (Krone 0,4 m breit, geneigte Flanken) noch auf dem
Wehrkörper im Überfallstrahl, 8 mm über der Krone → Fehlalarm „nicht frei". Jetzt: tiefster
Spiegel entlang der Normalen bis 3 m, je Seite; frei, sobald er stromab unter die Krone fällt
(Tests `test_unterwasser_frei_trotz_strahl_auf_dem_wehrkoerper`, `test_unterwasser_eingestaut`).

**Nicht geschrieben:** `data/verifikation/wehr_ueberfall.json`. Die Datei wird in der Produktion
sofort angezeigt, der Nachlauf-/Bewertungscode von Stufe C ist dort noch nicht deployt. Beim
Deploy: `venv/bin/python -m app.api.flood3D.probe.verifikation c5_wehr` (Job-Ordner
`data/probe_a/c5_wehr`, 121 MB, bis dahin behalten).
