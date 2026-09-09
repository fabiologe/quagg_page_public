"""Der Vertrag mit ifcopenshell — was wir von der Fremdbibliothek VERLANGEN.

WARUM DIESE DATEI ZUERST KAM, nicht zuletzt: die benutzten Namen wandern
zwischen den 0.8.x-Staenden. Faellt einer weg, soll das HIER auffallen — mit
dem Namen des fehlenden Stuecks — und nicht mitten im Verbund als
AttributeError auf einer 300 000-Entitaeten-Datei nach 40 Sekunden Rechenzeit.

Muster: client/src/features/cde/test/fragmentsVertrag.test.js, der dasselbe
fuer @thatopen/fragments tut.

Diese Datei laeuft mit DEM IFC-VENV, nicht mit dem Produktions-venv:
    backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/
"""
import pathlib

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell",
    reason="ifcopenshell fehlt — venv anlegen: "
           "python3 -m venv backend/app/ifc/.venv-ifc && "
           ".venv-ifc/bin/pip install -r backend/app/ifc/requirements-ifc.txt",
)

TESTDATEN = pathlib.Path(__file__).parents[4] / "client/src/features/cde/test"


def test_fassung_ist_die_festgenagelte():
    """0.8.5 ist in requirements-ifc.txt festgeschrieben — hier steht warum."""
    assert ifcopenshell.version.startswith("0.8."), ifcopenshell.version


def test_benutzte_module_existieren():
    """Jedes Modul, das der Verbund importiert."""
    import ifcopenshell.geom            # noqa: F401
    import ifcopenshell.guid            # noqa: F401
    import ifcopenshell.util.placement  # noqa: F401
    import ifcopenshell.util.schema     # noqa: F401
    import ifcopenshell.util.unit       # noqa: F401
    import ifcopenshell.validate        # noqa: F401


def test_migrator_kennt_genau_die_zwei_paare():
    """Der Grund, warum IFC2X3 zweimal wandern muss.

    Es gibt KEINEN direkten Weg IFC2X3 -> IFC4X3. Kaeme einer dazu, darf der
    Verbund den Umweg lassen — dann soll dieser Test darauf hinweisen, statt
    ihn stillschweigend weiterzufahren.
    """
    import ifcopenshell.util.schema
    paare = set(ifcopenshell.util.schema.Migrator().attributes_mapping.keys())
    assert paare == {("IFC4", "IFC2X3"), ("IFC4X3", "IFC4")}, paare


def test_schema_familie_und_fassung_sind_zwei_dinge():
    """`schema` ist die Familie, `schema_identifier` die genaue Fassung.

    Genau daran haette sich der Verbund verschluckt: der Migrator nimmt
    'IFC4X3' (Familie), die Gruppendateien sagen 'IFC4X3_ADD2' (Fassung).
    Beides ist richtig, es sind zwei Ebenen.
    """
    f = ifcopenshell.file(schema="IFC4X3_ADD2")
    assert f.schema == "IFC4X3"
    assert "FILE_SCHEMA(('IFC4X3_ADD2'));" in f.to_string()


def test_schreiben_liefert_das_zielschema():
    """Ohne diese Zusage waere das ganze Vorhaben ohne Grundlage."""
    for name, erwartet in (("IFC2X3", "IFC2X3"), ("IFC4", "IFC4"),
                           ("IFC4X3_ADD2", "IFC4X3_ADD2")):
        f = ifcopenshell.file(schema=name)
        assert f"FILE_SCHEMA(('{erwartet}'));" in f.to_string(), name


def test_benutzte_funktionen_existieren():
    """Namentlich — ein umbenanntes Stueck faellt hier auf, nicht im Lauf."""
    import ifcopenshell.util.schema
    import ifcopenshell.util.unit
    import ifcopenshell.validate

    assert callable(ifcopenshell.util.schema.Migrator().migrate)
    assert callable(ifcopenshell.util.unit.calculate_unit_scale)
    assert callable(ifcopenshell.util.unit.convert_file_length_units)
    assert callable(ifcopenshell.validate.validate)
    assert callable(ifcopenshell.guid.compress)
    assert callable(ifcopenshell.guid.new)

    f = ifcopenshell.file(schema="IFC4X3_ADD2")
    assert callable(f.add)          # traegt eine Instanz samt Abhaengigkeiten ueber
    assert callable(f.create_entity)
    assert callable(f.by_type)
    assert callable(f.by_guid)
    assert callable(f.remove)


def test_guid_compress_liefert_22_zeichen():
    """Der IfcGloballyUniqueId hat GENAU 22 Zeichen, erstes aus 0-3.

    Der Verbund leitet die GlobalIds der CDE-Bauteile deterministisch ab
    (`neueGlobalId()` im Client liefert absichtlich KEINE gueltige GUID).
    Wenn compress() das nicht mehr leistet, ist jede erzeugte Datei
    schemawidrig — und zwar still.
    """
    import uuid
    for i in range(50):
        g = ifcopenshell.guid.compress(uuid.uuid5(uuid.NAMESPACE_URL, f"quagg/{i}").hex)
        assert len(g) == 22, (i, g)
        assert g[0] in "0123", (i, g)


@pytest.mark.skipif(not (TESTDATEN / "BIM26_Gruppe5_BODEN_Erdarbeiten.ifc").is_file(),
                    reason="Gruppenmodelle liegen nicht im Baum")
def test_liest_die_echten_gruppenmodelle():
    """Die ECHTE Schnittstelle, nicht eine selbstgebaute Eingabe.

    Die drei Dateien sind der Grund fuer das ganze Vorhaben: zwei Schemata und
    — beim mittleren — Millimeter statt Meter.
    """
    import ifcopenshell.util.unit
    erwartet = {
        "BIM26_Gruppe5_BODEN_Erdarbeiten.ifc":  ("IFC4X3_ADD2", 1.0),
        "BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc": ("IFC4X3_ADD2", 0.001),
        "IFCOUT_Entwässerung Export .IFC":      ("IFC2X3", 1.0),
    }
    for name, (schema, faktor) in erwartet.items():
        f = ifcopenshell.open(TESTDATEN / name)
        assert f.schema_identifier == schema, (name, f.schema_identifier)
        assert ifcopenshell.util.unit.calculate_unit_scale(f) == pytest.approx(faktor), name
