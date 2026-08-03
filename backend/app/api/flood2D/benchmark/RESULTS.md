# Benchmark-Ergebnistabelle

Automatisch erzeugt von `run_benchmark.py` — **nicht von Hand bearbeiten.**
Einordnung und Interpretation der Zahlen: `REPORT.md`.

- Lauf: **2026-08-01T09:50:35+00:00**
- Image: `fabiologe/quagg-lisflood:latest`
- Solver-Stempel: `73653c3-dirty`

## Ergebnisse

Leere Zellen (—) bedeuten: die Groesse ist fuer diesen Fall nicht aussagekraeftig
(z. B. eine Profilneigung bei einer wandernden Welle oder NSE bei konstanter Referenz).

| Fall | Schema | dx [m] | RMSE [m] | Abw. [%] | NSE | Front ≥0,2 m | Neigung [mm/km] | Status |
|---|---|---|---|---|---|---|---|---|
| ritter_dambreak | fv1 | 2 | 0.0820 | +0.34 | 0.9992 | -10.0 | — | ✅ |
| ritter_dambreak | acceleration | 2 | 1.8778 | +0.08 | 0.6030 | -154.0 | — | ✅ |
| manning_normalflow | acceleration | 10 | 0.0014 | +0.07 | — | +0.0 | +1.9 | ✅ |

## Gitterkonvergenz — ritter_dambreak / fv1

| dx [m] | RMSE [m] | NSE | Front ≥0,2 m |
|---|---|---|---|
| 8 | 0.2137 | 0.9948 | -24.0 |
| 4 | 0.1268 | 0.9982 | -20.0 |
| 2 | 0.0820 | 0.9992 | -10.0 |
| 1 | 0.0523 | 0.9997 | -3.0 |

- Fehler faellt monoton: **ja**
- beobachtete Konvergenzordnung: **p ≈ 0.68**

## Gitterkonvergenz — manning_normalflow / acceleration

| dx [m] | RMSE [m] | NSE | Front ≥0,2 m |
|---|---|---|---|
| 40 | 0.0058 | — | +0.0 |
| 20 | 0.0028 | — | +0.0 |
| 10 | 0.0014 | — | +0.0 |
| 5 | 0.0007 | — | +0.0 |

- Fehler faellt monoton: **ja**
- beobachtete Konvergenzordnung: **p ≈ 1.00**
