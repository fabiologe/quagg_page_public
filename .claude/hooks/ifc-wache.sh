#!/bin/sh
# ifc-wache — PostToolUse-Hook fuer Edit/Write (Fahrplan IFC-Konsistenz, Stufe 7).
#
# Prueft nach einer Aenderung genau das, was diese Aenderung brechen kann, und
# sonst nichts (Ziel < 15 s; gemessen 2026-09-11: 5,3 s bzw. 0,4 s):
#   backend/app/ifc/*.py (ohne tests/)   -> Vertrag mit ifcopenshell + Schema-Schnappschuss
#   backend/app/ifc/daten/*, schema.py,
#   generiere_client.py, cde/data/*      -> Client-Woerterbuch == Schnappschuss
#   Quellen der Diagramme (IFC-Module,
#   paket_v2.json, Typprofile, Rezepte,
#   Gelaende, Kategorien, docs/ifc/*)    -> docs/ifc == Erzeugnis (diagramme.py)
# Alles andere: sofort exit 0. Faellt eine Pruefung, meldet exit 2 den Grund an
# Claude zurueck (stderr); die Aenderung selbst bleibt stehen.
wurzel="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$wurzel" ] || exit 0
datei=$(python3 -c 'import json, sys
try:
    print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")
except Exception:
    print("")' 2>/dev/null)
case "$datei" in
  "") exit 0 ;;
  /*) ;;
  *) datei="$wurzel/$datei" ;;
esac
rel=${datei#"$wurzel"/}

woerterbuch=0
vertrag=0
diagramme=0
case "$rel" in
  backend/app/ifc/daten/*|client/src/features/cde/data/*|backend/app/ifc/schema.py|backend/app/ifc/generiere_client.py)
    woerterbuch=1 ;;
esac
case "$rel" in
  backend/app/ifc/tests/*) ;;
  backend/app/ifc/*.py) vertrag=1 ;;
esac
case "$rel" in
  backend/app/ifc/tests/daten/paket_v2.json|backend/app/ifc/daten/*|docs/ifc/*) diagramme=1 ;;
  backend/app/ifc/tests/*) ;;
  backend/app/ifc/*.py) diagramme=1 ;;
  client/src/features/cde/services/bauform/Typprofile.js|client/src/features/cde/services/Bauteilrezepte.js) diagramme=1 ;;
  client/src/features/cde/services/GelaendeQuelle.js|client/src/features/cde/services/Kategorien.js) diagramme=1 ;;
esac

if [ "$woerterbuch" = 1 ]; then
  aus=$(cd "$wurzel/backend" && python3 -m app.ifc.generiere_client --pruefe 2>&1) || {
    printf 'ifc-wache: Client-Woerterbuch weicht vom Schema-Schnappschuss ab (nach %s).\n%s\nNeu erzeugen: cd backend && python3 -m app.ifc.generiere_client\n' "$rel" "$aus" >&2
    exit 2
  }
fi
if [ "$diagramme" = 1 ]; then
  aus=$(cd "$wurzel/backend" && python3 -m app.ifc.diagramme --pruefe 2>&1) || {
    printf 'ifc-wache: docs/ifc weicht vom Code ab (nach %s).\n%s\nNeu erzeugen: cd backend && python3 -m app.ifc.diagramme\n' "$rel" "$aus" >&2
    exit 2
  }
fi
if [ "$vertrag" = 1 ]; then
  py="$wurzel/backend/app/ifc/.venv-ifc/bin/python"
  [ -x "$py" ] || exit 0
  aus=$(cd "$wurzel/backend" && PYTHONPATH=. timeout 60 "$py" -m pytest app/ifc/tests/test_vertrag.py app/ifc/tests/test_schema.py -q -x -p no:cacheprovider 2>&1) || {
    printf 'ifc-wache: Vertrags-/Schema-Test rot nach Aenderung an %s:\n%s\n' "$rel" "$(printf '%s\n' "$aus" | tail -25)" >&2
    exit 2
  }
fi
exit 0
