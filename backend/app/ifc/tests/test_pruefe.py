"""Das Prueftor mit Stufen — jede Pruefung an einer Datei, die GENAU diesen Fehler hat.

Die beschaedigten Dateien entstehen hier im Test aus einer Gruppendatei des
Repos; nichts davon wird eingecheckt. Jeder Test misst die Groesse, die er
behauptet (Hausregel „Regel und Kur messen dasselbe"):

  * halb abgeschnitten -> Zeilen-/Verweisfehler > 0 — auf dem alten Weg (das
    geoeffnete Dateiobjekt an `validate`) war es genau 1,
  * zwei Unsinnszeilen -> genau 2 Syntaxfehler — auf dem alten Weg 0,
  * ein Aushub in der Raumgliederung ohne Wirt -> Where-Rule UND Schemaverstoss,
  * eine IDS-Anforderung, die der Aushub verfehlt -> Warnung, sperrt nicht.

Laeuft mit dem IFC-venv:
    PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m pytest app/ifc/tests/test_pruefe.py
"""
from pathlib import Path

import pytest

ifcopenshell = pytest.importorskip("ifcopenshell", reason="ifcopenshell fehlt — mit dem IFC-venv laufen lassen")
import ifcopenshell.api                                    # noqa: E402
import ifcopenshell.validate                               # noqa: E402

from app.ifc import pruefe as P                            # noqa: E402

QUELLE = Path(__file__).parents[4] / "client/src/features/cde/test/BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc"
braucht_quelle = pytest.mark.skipif(not QUELLE.is_file(), reason="Gruppendatei liegt nicht im Baum")


def _spf(ergebnis):
    return next(b for b in ergebnis["befunde"] if b["id"] == "SPF")


def _alter_weg(pfad) -> int:
    """So pruefte das Tor bis 2026-09-11: das GEOEFFNETE Objekt an validate."""
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(ifcopenshell.open(pfad), log, express_rules=False)
    return len(log.statements)


@pytest.fixture(scope="module")
def regelverstoss(tmp_path_factory) -> Path:
    """Ein Aushub IN der Raumgliederung (Where-Rule NotContained) und ohne Wirt (VoidsElements [1:1])."""
    run = ifcopenshell.api.run
    f = ifcopenshell.file(schema="IFC4X3_ADD2")
    projekt = run("root.create_entity", f, ifc_class="IfcProject", name="P")
    run("unit.assign_unit", f)
    site = run("root.create_entity", f, ifc_class="IfcSite", name="S")
    run("aggregate.assign_object", f, relating_object=projekt, products=[site])
    cut = run("root.create_entity", f, ifc_class="IfcEarthworksCut", name="Aushub")
    f.createIfcRelContainedInSpatialStructure(ifcopenshell.guid.new(), None, None, None, [cut], site)
    pfad = tmp_path_factory.mktemp("pruefe") / "regelverstoss.ifc"
    f.write(str(pfad))
    return pfad


@braucht_quelle
def test_halb_abgeschnitten_zaehlt_verweisfehler(tmp_path):
    kaputt = tmp_path / "abgeschnitten.ifc"
    roh = QUELLE.read_bytes()
    kaputt.write_bytes(roh[: len(roh) // 2])
    spf = P.schema_pruefen(kaputt, regeln=False)
    assert spf["ok"] is False
    assert spf["teile"]["syntax"] > 1000, spf["teile"]      # gemessen 5.691
    assert _alter_weg(kaputt) <= 1                           # der alte Weg sah fast nichts


@braucht_quelle
def test_unsinnszeilen_sind_genau_zwei_syntaxfehler(tmp_path):
    text = QUELLE.read_bytes().decode("latin1")
    i = text.index("DATA;") + len("DATA;\n")
    kaputt = tmp_path / "falsche_zeilen.ifc"
    kaputt.write_bytes((text[:i] + "#9999991=IFCCARTESIANPOINT((0.,0.,0.),5.);\n"
                        "#9999992=IFCQUATSCH('x');\n" + text[i:]).encode("latin1"))
    spf = P.schema_pruefen(kaputt, regeln=False)
    assert spf["teile"] == {"syntax": 2, "schema": 0, "regeln": 0}, spf["sagt"][:600]
    assert "IFCQUATSCH" in spf["sagt"]
    assert _alter_weg(kaputt) == 0                           # der alte Weg sah nichts


def test_where_rule_und_schemaverstoss_werden_getrennt_gezaehlt(regelverstoss):
    spf = P.schema_pruefen(regelverstoss)
    assert spf["teile"]["regeln"] >= 1 and spf["teile"]["schema"] >= 1, spf["teile"]
    assert "NotContained" in spf["sagt"] or "containedinstructure" in spf["sagt"]
    assert "VoidsElements" in spf["sagt"]
    ohne = P.schema_pruefen(regelverstoss, regeln=False)
    assert ohne["teile"]["regeln"] == 0 and "ohne Where-Rules" in ohne["titel"]


def test_ohne_ids_ein_hinweis_der_nicht_sperrt(regelverstoss):
    ergebnis = P.pruefe(regelverstoss)
    ids = next(b for b in ergebnis["befunde"] if b["id"] == "IDS")
    gherkin = next(b for b in ergebnis["befunde"] if b["id"] == "GHERKIN")
    for b in (ids, gherkin):
        assert b["ok"] is None and b["schwere"] == "hinweis" and not P.offen(b)
    # Gezaehlt wird nur, was sperrt: SPF (Regel + Schema), V07 (Aushub ohne Wirt), ...
    assert ergebnis["verstoesse"] == sum(1 for b in ergebnis["befunde"] if P.offen(b))
    assert all(b["schwere"] in P.SCHWEREN and b["stufe"] for b in ergebnis["befunde"])


def test_ids_anforderung_ist_warnung_mit_kennung(regelverstoss, tmp_path):
    import ifctester.facet
    import ifctester.ids
    anf = ifctester.ids.Ids(title="Probe")
    spez = ifctester.ids.Specification(name="Aushub traegt eine Beschreibung", minOccurs=1, ifcVersion=["IFC4X3_ADD2"])
    spez.applicability.append(ifctester.facet.Entity(name="IFCEARTHWORKSCUT"))
    spez.requirements.append(ifctester.facet.Attribute(name="Description", cardinality="required"))
    anf.specifications.append(spez)
    datei = tmp_path / "probe.ids"
    anf.to_xml(str(datei))

    befunde = [b for b in P.pruefe(regelverstoss, ids=[datei])["befunde"] if b["stufe"] == "ids"]
    assert len(befunde) == 1, befunde
    b = befunde[0]
    assert b["ok"] is False and b["schwere"] == "warnung" and not P.offen(b)
    assert b["zahl"] == 1
    cut = ifcopenshell.open(str(regelverstoss)).by_type("IfcEarthworksCut")[0]
    assert b["beispiele"] == [cut.GlobalId]


def test_kaputte_ids_ist_eine_warnung_kein_absturz(regelverstoss, tmp_path):
    kaputt = tmp_path / "kaputt.ids"
    kaputt.write_text("<ids>kein IDS</ids>", encoding="utf-8")
    [b] = [b for b in P.pruefe(regelverstoss, ids=[kaputt])["befunde"] if b["stufe"] == "ids"]
    assert b["ok"] is None and b["schwere"] == "warnung" and "nicht lesbar" in b["sagt"]


def test_keine_ifc_datei_ist_ein_befund_kein_absturz(tmp_path):
    fremd = tmp_path / "fremd.ifc"
    fremd.write_text("das ist kein STEP", encoding="utf-8")
    ergebnis = P.pruefe(fremd)
    assert ergebnis["verstoesse"] >= 1
    assert any(P.offen(b) for b in ergebnis["befunde"])


def test_offen_heisst_nicht_bestanden_und_schwere_fehler():
    assert P.offen({"ok": False})                               # alte Befunde ohne Schwere
    assert P.offen({"ok": None, "schwere": "fehler"})           # ungeprueft sperrt
    assert not P.offen({"ok": None, "schwere": "hinweis"})
    assert not P.offen({"ok": False, "schwere": "warnung"})
    assert not P.offen({"ok": True, "schwere": "fehler"})


def test_die_tabelle_sagt_was_ein_befund_ist(regelverstoss, capsys):
    assert P._main([str(regelverstoss)]) == 1
    aus = capsys.readouterr().out
    assert "[info] IDS" in aus and "[info] GHERKIN" in aus
    assert "[FEHL] SPF" in aus


def test_lieferung_meldet_verbundregeln_nur_und_zaehlt_fuer_den_zweiten_motor(regelverstoss):
    """Stufe 4b: eine einzelne Lieferung ist kein Verbund."""
    ergebnis = P.pruefe(regelverstoss, verbund=False)
    b = {x["id"]: x for x in ergebnis["befunde"]}
    assert all(b[k]["schwere"] == "warnung" for k in P.NUR_IM_VERBUND)
    assert (b["V01"]["schwere"], b["V04"]["schwere"], b["SPF"]["schwere"]) == ("fehler", "fehler", "fehler")
    assert set(ergebnis["zaehlung"]) == {"schema", "entitaeten", "produkte", "raumwurzeln", "kontexte"}
    assert (ergebnis["zaehlung"]["schema"], ergebnis["zaehlung"]["raumwurzeln"]) == ("IFC4X3_ADD2", 1)
    # Im Verbund-Modus bleibt jede Verbundregel ein Fehler — so ist das Tor gemeint.
    assert all(x["schwere"] == "fehler" for x in P.pruefe(regelverstoss)["befunde"] if x["stufe"] == "verbund")


def test_ein_paket_mit_misserfolg_sperrt_ein_leeres_nicht(regelverstoss):
    """Fahrplan Erdbau-Container, Stufe 1: was der Eigenbau nicht bauen konnte, sperrt (V10).

    Im Projekt 1337 kam ein Verbund, dem zwei Aushuebe fehlten, als „geprueft,
    0 Verstoesse" ins Register — die Misserfolge standen nur im Bericht.
    Leere Gegenstuecke und Ausgeblendetes melden nur (V11).
    """
    paket = {"bauteile": [{}, {}],
             "misserfolge": [{"globalId": "cde-a", "grund": "Quelle „cde-x\" (gelaende) nicht ableitbar"}],
             "leer": ["cde-b"], "verborgen": []}
    bef = {b["id"]: b for b in P.pruefe(regelverstoss, regeln=False, paket=paket)["befunde"]}
    assert P.offen(bef["V10"]) and bef["V10"]["zahl"] == 1 and bef["V10"]["beispiele"][0].startswith("cde-a")
    assert "1 von 3" in bef["V10"]["sagt"]
    assert not P.offen(bef["V11"]) and bef["V11"]["zahl"] == 1 and bef["V11"]["schwere"] == "hinweis"
    sauber = {b["id"]: b for b in P.pruefe(regelverstoss, regeln=False, paket={"bauteile": [{}]})["befunde"]}
    assert sauber["V10"]["ok"] is True and sauber["V11"]["ok"] is True
    assert "V10" not in {b["id"] for b in P.pruefe(regelverstoss, regeln=False)["befunde"]}
