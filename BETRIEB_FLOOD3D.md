# Betriebsnotiz flood-3D

Stand: 2026-08-11 (Tag `flood3d-v1.0-beta`) · Für den Server-Alltag; Fachliches
steht in der Spezifikation, offene Punkte im Fahrplan.

## Dienste

| Was | Wie |
|---|---|
| Backend (FastAPI) | **PM2**, Prozess `quagg-api`, Port 8001 — Neustart: `pm2 restart quagg-api`. Nach JEDER Backend-Codeänderung nötig (Python ist geladen). `quagg-internal.service` (systemd) ist ein anderer, kaputter Prozess — ignorieren. |
| Frontend Dev | Fabios vite-Dev-Server auf :3000 — **niemals `pkill -f vite`**. HMR zieht Client-Änderungen selbst. |
| Frontend Prod | quagg-engineering.org ist ein STATISCHER dist-Build — ohne `npm run build` (baut nach `dist_neu`, dann atomarer Tausch) ändert sich dort nichts. Vor dem Build RAM/Platte prüfen. |
| Health | `GET /FastAPI/flood3d/health` → `{status, runs}` |

## Rechnen (OpenFOAM im Docker)

- Image: `opencfd/openfoam-run:2406` (Env `FLOOD3D_OF_IMAGE`).
- Kerne: `FLOOD3D_CORES` (Default 4, gedeckelt auf CPU-Zahl) — gilt für Server
  UND Local Companion (dort ist `QUAGG_FOAM_CORES` der Altname).
- Timeouts: Vernetzung 20 min (`FLOOD3D_MESH_TIMEOUT`), Solver 2 h
  (`FLOOD3D_SOLVE_TIMEOUT`).
- Kostensatz: `FLOOD3D_CORE_PRICE` (Default 0,05 €/Kern-h) — Schätzung vor dem
  Lauf und Ist-Kosten im Manifest rechnen damit.
- **Netzvorschau rechnet seriell auf 1 Kern**; nur der Solverlauf nutzt alle
  Kerne (mpirun). Ein voller Lauf zeigt ~400 % CPU — das ist Absicht.
- Verwaiste Container: beim API-Start räumt ein Wächter alle `f3d_*` ab
  (nach Neustart wartet auf keinen Container mehr jemand). Von Hand:
  `docker ps -a --filter name=f3d_` / `docker rm -f <name>`.
- Laufender Serverlauf: Abbrechen über den Knopf im Lauf-&-Log-Panel
  (Status wird `abgebrochen`).

## Bekannte Deckel (bewusst)

| Deckel | Wert | Wo |
|---|---|---|
| Visualisierungsgitter | 1,5 M Zellen / 4 GB | foamfields (Selbsttest-Abweichung steht im Laufmanifest) |
| Erdkörper-Vorschau + STL-Export | 120 000 Rasterknoten | router (`koerper_zu_gross` bzw. 413) |
| Rechen-Porositätszone | 0,15 m Tiefe | casebuilder `_SCREEN_ZONE_TIEFE` — Kirschmer-f ist DARAUF normiert |
| Mesh-Preview | 1 gleichzeitige je Fall (409 sonst) | router `_laufende_previews` |

## Fallen (mehrfach real getroffen)

- **Snap-Docker + /tmp**: Pfade unter /tmp werden LEER in den Container
  gemountet — Arbeitsverzeichnisse immer neben die Daten legen.
- **Endpunkte schreiben**: auch harmlos aussehende Mutations-Endpunkte
  speichern die case.yaml neu — nie an echten Fällen testen, vorher kopieren.
- `_Model` hat `extra="forbid"`: Felder aus der casespec entfernen heißt,
  dass ALTE case.yaml nicht mehr laden (deshalb bleiben die toten
  Conventions-/Meta-Felder drin, siehe Audit-T4-Vermerk).

## Daten & Backup

- `backend/app/api/flood3D/data/` ist NICHT in git (~150 MB): `cases/`
  (Quellen: case.yaml + imports/), `runs/` (Ergebnisse), `archiv/`
  (BetaTest01/02, altes Layout), `verifikation/` (Referenz-Ergebnisse).
- **Backup-Minimum**: je Fall `case.yaml` + `imports/` sichern — alles unter
  `derived/` ist reproduzierbar (Reapply), Läufe sind neu rechenbar.
  Einfachster Weg: `tar czf flood3d-cases-$(date +%F).tgz -C backend/app/api/flood3D/data cases`
  (klein, da ohne derived/-STLs nur Quelltexte). Noch ohne Automatik —
  bewusst offener Punkt.

## Physikalische Verifikation

- `FLOOD3D_VERIFIKATION=1 venv/bin/python -m pytest app/api/flood3D/tests/test_verifikation.py -q`
  (im backend/-Ordner; ~1 h auf 4 Kernen). Nach jeder Änderung an
  casebuilder/meshgen/solids und vor jedem Release/Tag ausführen.
- Ergebnis: Karte „Physikalische Verifikation" in der Phase Simulation;
  der Lauf selbst ist als Projekt `verifikation-wehr` im Werkzeug anwählbar.
- Referenz: C_d = 0,644 ± 10 % (eingefroren 2026-08-11), zweite Schranke
  Literaturband 0,50–0,80.

## Releases

- Stand taggen: `git tag -a flood3d-vX.Y -m "..."` auf dem Merge-Commit;
  aktueller Stand: `flood3d-v1.0-beta`. Push von master/Tags ist bewusst
  Handarbeit (Fabio entscheidet, was auf GitHub geht).
