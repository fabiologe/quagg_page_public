"""Autor und Organisation einer ausgegebenen Datei (Fahrplan Klare Ablaeufe, S4 neu).

Bis 2026-09-12 hiess jede Datei nach dem Anmeldenamen, und die Organisation
stand fest auf „quagg engineering" — auch fuer ein Buero, das mit der CDE
ausgibt. Jetzt kommen beide aus dem Ausgeben-Dialog; entwickelt hat die
Anwendung weiter quagg engineering (IfcApplication) — eine andere Rolle.
"""
import re
from pathlib import Path

import pytest

ifcopenshell = pytest.importorskip("ifcopenshell")

from app.ifc import verbund as V                   # noqa: E402


def _kopf(pfad):
    text = Path(pfad).read_text(encoding="utf-8", errors="replace")
    return re.search(r"FILE_NAME\('([^']*)','[^']*',\(([^)]*)\),\(([^)]*)\)", text)


def test_autor_und_organisation_im_kopf_und_im_besitz(tmp_path):
    g = V.zielgeruest("Probe", crs="EPSG:31466", bearbeiter="Anna Muster", firma="Ingenieurbuero Muster")
    ziel = tmp_path / "probe.ifc"
    g["datei"].write(str(ziel))
    m = _kopf(ziel)
    assert m and (m.group(2), m.group(3)) == ("'Anna Muster'", "'Ingenieurbuero Muster'")
    f = ifcopenshell.open(str(ziel))
    wer = f.by_type("IfcOwnerHistory")[0].OwningUser
    assert (wer.ThePerson.FamilyName, wer.TheOrganization.Name) == ("Anna Muster", "Ingenieurbuero Muster")
    assert f.by_type("IfcApplication")[0].ApplicationDeveloper.Name == V.ENTWICKLER


def test_ohne_angabe_wie_bisher(tmp_path):
    g = V.zielgeruest("Probe", crs="EPSG:31466", bearbeiter="fabio")
    f = g["datei"]
    assert [o.Name for o in f.by_type("IfcOrganization")] == [V.ENTWICKLER]
    assert f.by_type("IfcOwnerHistory")[0].OwningUser.ThePerson.FamilyName == "fabio"
    ziel = tmp_path / "p.ifc"
    f.write(str(ziel))
    assert _kopf(ziel).group(3) == f"'{V.ENTWICKLER}'"
