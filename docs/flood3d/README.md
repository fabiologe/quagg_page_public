# docs/flood3d — Dokumente zum 3D-CFD-Werkzeug flood-3D

Alle Audits, Betriebswissen, Fahrpläne und Protokolle des Werkzeugs liegen hier. Code:
`backend/app/api/flood3D/` (FastAPI + Core), `client/src/features/flood-3D/` (Vue). Die
Spezifikation: `SPEZIFIKATION.md` (bis 2026-09-23 unter `client/src/features/flood-3D/`).
Beispielzeichnung für Import-Tests: `daten/Nacktes_Becken.dxf` (echte Projektdaten — bewusst nicht unter `client/public/`, das die Website ausliefert).

## Lesereihenfolge für den Einstieg

1. `AUDIT_FLOOD3D_GESAMT_2026-09-22.md` — Gesamtbild aus CFD- und Web-Sicht: Stand, Funde
   F1–F12 (fachlich), V1–V11 (Vereinfachung), P1–P10 (Programmiertechnik), Fahrplan A/B/C.
2. `FAHRPLAN_A_PHYSIK_2026-09-23.md` — die dringende Stufe A, Schritt für Schritt.
3. `PROTOKOLL_A.md` — was davon gebaut ist, mit Zahlen vorher/nachher.
4. `BETRIEB_FLOOD3D.md` — wie das Werkzeug läuft (pm2, Docker, Rechenorte, Fallen).

## Audits

| Datei | Datum | Inhalt |
|---|---|---|
| `AUDIT_FLOOD3D_GESAMT_2026-09-22.md` | 2026-09-22 | Gesamtaudit Numerik, Nachweise, Architektur, Betrieb; Fahrplan A/B/C |
| `AUDIT_FLOOD3D_FALLSPEZIFISCH.md` | 2026-09-21/22 | Phantom-Gerinne, 60 fallspezifische Entscheidungen; zugleich Protokoll der Etappen E0–E7a (alle gebaut, PROD) |
| `AUDIT_CODE_QUALITAET_FLOOD3D.md` | 2026-08-13 | Code-Qualität, Wellen W1–W5 (W1/W2 erledigt, W3–W5 teils) |
| `AUDIT_RECHENORTE.md` | 2026-08-12 | Messungen Server / Cloud / Nutzermaschine, Netz-Determinismus |
| `../archiv/AUDIT_FLOOD3D_*.md`, `../archiv/ROADMAP_FLOOD3D_*.md`, `../archiv/TESTRUNDE_FLOOD3D.md` | 2026-08 | historische Audits und Fahrpläne (Preprocessing, Postprocessing, UI, Dead-Ends, Produktionsreife) |

## Betrieb

| Datei | Inhalt |
|---|---|
| `BETRIEB_FLOOD3D.md` | Dienste, Kostentor, Docker-Images, RunPod, Prozessgrenzen, Fallen, Verifikationslauf |

## Fahrpläne und Protokolle

| Datei | Status | Inhalt |
|---|---|---|
| `FAHRPLAN_A_PHYSIK_2026-09-23.md` | gebaut 2026-09-23 (A0–A6, PROD) | Stufe A: Zufluss-Randbedingung, Turbulenz-Init, Tracer-Phase, σ = 0, Atmosphäre-Regel, Harness-Probe, Wehr-Nachlauf, Numerik-Version |
| `PROTOKOLL_A.md` | gefüllt 2026-09-23 | Umsetzungsprotokoll zu Stufe A (Zahlen, Commits, Laufliste, Abweichungen) |
| `PROTOKOLL_B.md` | in Arbeit | Umsetzungsprotokoll zu Stufe B |
| `FAHRPLAN_B_VEREINFACHEN_2026-09-23.md` | in Arbeit (B1 ☑) | Stufe B: Leichen/Kopien, eine Nachlaufkette, Schätzung nur im Server, `schema_version`, Betriebsdeckel, Fenster-Diät (Entscheidung Fabio) |
| `PLAN_LEERLAUF.md` | gebaut (2026-08-16) | „rechne, bis es leer ist" — Abbruchkriterium Stagnation |
| `FAHRPLAN_GPU_FOAM.md` | geparkt | GPU-Beschleunigung G0–G3; für die RX 6700 XT kein Produktpfad |

## Ausblick (aus dem Gesamtaudit, nicht geplant)

- **Stufe B — Ergebnisse ehrlich machen:** VTP aus OpenFOAM `surfaces`-FO statt Voxel-
  Resampling; eine Definition für WSP, v, Fr, Energiehöhe; Cd und Sohlschub neu definieren.
- **Stufe C — Struktur:** eine Pipeline statt drei, `schema_version`, Betriebsdeckel
  (Laufzeit, Semaphor, Platte, Pfade), Fenster-Rückbau, Client-Tests.

## Konventionen

- Ein Fahrplan je Stufe (`FAHRPLAN_<Stufe>_<Thema>_<Datum>.md`), ein Protokoll je Stufe
  (`PROTOKOLL_<Stufe>.md`). Kein Schritt gilt als erledigt ohne Zahl vorher/nachher im Protokoll.
- Erledigte Audits bleiben liegen; überholte wandern nach `../archiv/` mit Kopfvermerk.
