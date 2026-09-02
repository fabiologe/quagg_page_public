"""KoSIT-Wrapper: Exit-Code-Semantik mit gestubbtem subprocess —
0 = valide, >0 mit Report = fachliche Ablehnung, Fehler ohne Report = kaputt."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.api.pedant.core import kosit

REPORT_ABLEHNUNG = b"""<?xml version="1.0" encoding="UTF-8"?>
<report xmlns:svrl="http://purl.oclc.org/dsdl/svrl">
  <svrl:failed-assert id="BR-DE-15"><svrl:text>BuyerReference fehlt</svrl:text></svrl:failed-assert>
  <svrl:failed-assert id="BR-DE-15"><svrl:text>BuyerReference fehlt</svrl:text></svrl:failed-assert>
  <message level="error">Schema-Fehler in Zeile 3</message>
</report>"""


@pytest.fixture()
def kosit_stub(tmp_path, monkeypatch):
    """Existierende Dummy-Artefakte + injizierbarer subprocess.run."""
    jar = tmp_path / "validator.jar"
    jar.write_bytes(b"PK\x03\x04dummy")
    szenarien = tmp_path / "scenarios.xml"
    szenarien.write_bytes(b"<scenarios/>")
    monkeypatch.setenv("PEDANT_KOSIT_JAR", str(jar))
    monkeypatch.setenv("PEDANT_KOSIT_SZENARIEN", str(szenarien))

    def einbauen(returncode, mit_report=True, mit_html=True):
        def fake_run(befehl, **_):
            eingabe = Path(befehl[-1])
            if mit_report:
                (eingabe.parent / "rechnung-report.xml").write_bytes(REPORT_ABLEHNUNG)
            if mit_html:
                (eingabe.parent / "rechnung-report.html").write_bytes(b"<html>bericht</html>")
            return SimpleNamespace(returncode=returncode, stdout="", stderr="kaputt")
        monkeypatch.setattr(kosit.subprocess, "run", fake_run)
    return einbauen


def test_bereit_meldet_fehlende_teile(monkeypatch):
    monkeypatch.setenv("PEDANT_KOSIT_JAR", "")  # conftest-Sperre explizit
    assert "jar" in kosit.bereit()
    with pytest.raises(kosit.KositNichtBereit, match="Setup"):
        kosit.validieren(b"<x/>")


def test_exit_0_ist_valide(kosit_stub):
    kosit_stub(0)
    bericht = kosit.validieren(b"<Invoice/>")
    assert bericht.valide is True
    assert bericht.report_html == b"<html>bericht</html>"


def test_exit_positiv_mit_report_ist_fachliche_ablehnung(kosit_stub):
    kosit_stub(1)
    bericht = kosit.validieren(b"<Invoice/>")
    assert bericht.valide is False
    # Dublette entfernt, failed-assert UND error-message eingesammelt
    assert bericht.meldungen == [
        "BR-DE-15: BuyerReference fehlt", "Schema-Fehler in Zeile 3"]


def test_fehler_ohne_report_ist_nicht_bereit(kosit_stub):
    kosit_stub(255, mit_report=False, mit_html=False)
    with pytest.raises(kosit.KositNichtBereit, match="exit 255"):
        kosit.validieren(b"<Invoice/>")
