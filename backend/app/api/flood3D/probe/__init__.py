"""
Probeläufe der Hülle (Fahrplan Stufe A, docs/flood3d/FAHRPLAN_A_PHYSIK_2026-09-23.md).

Der Solver bleibt, wie er ist; geprüft wird, was wir um ihn herum bauen —
Randbedingungen, Anfangsfelder, Schemata, functionObjects. Ein Probelauf
geht denselben Weg wie ein echter Lauf (bundle_bauen → case.zip →
local_runner im OpenFOAM-Image), nur im Server-Docker und ohne Kosten.
Nicht Teil des Bundles: `bundle.runtime_baum_kopieren` nimmt nur `core/`.
"""
