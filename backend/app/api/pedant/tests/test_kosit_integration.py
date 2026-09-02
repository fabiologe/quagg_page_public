"""ECHTER KoSIT-Lauf (Java + installierte Artefakte unter /opt/kosit).
Wird uebersprungen, wo der Stack fehlt — auf dem Server ist er installiert,
dort ist dieser Test die eigentliche Wahrheit: unsere Rechnung ist valide,
und das KoSIT-Beispiel auch (Sanity der Installation)."""

from pathlib import Path

import pytest

from app.api.pedant.core import kosit
from app.api.pedant.tests.fixtures_rechnung import beispiel_xml

_JAR = Path(kosit.STANDARD_JAR)
_SZENARIEN = Path(kosit.STANDARD_SZENARIEN)

pytestmark = pytest.mark.skipif(
    not (_JAR.is_file() and _SZENARIEN.is_file()),
    reason="KoSIT-Stack nicht installiert (kosit_setup.sh)")


@pytest.fixture(autouse=True)
def echte_pfade(monkeypatch):
    # conftest sperrt PEDANT_KOSIT_JAR — hier bewusst auf die echten Artefakte.
    monkeypatch.setenv("PEDANT_KOSIT_JAR", str(_JAR))
    monkeypatch.setenv("PEDANT_KOSIT_SZENARIEN", str(_SZENARIEN))


def test_kosit_beispielrechnung_ist_valide():
    kandidaten = sorted(Path("/opt/kosit/testsuite").rglob("*_ubl.xml"))
    assert kandidaten, "Testsuite-Beispiele nicht gefunden"
    beispiel = next((k for k in kandidaten if "01.01a" in k.name), kandidaten[0])
    bericht = kosit.validieren(beispiel.read_bytes())
    assert bericht.valide, f"KoSIT-Beispiel {beispiel.name} abgelehnt: {bericht.meldungen}"


def test_unsere_rechnung_ist_valide():
    bericht = kosit.validieren(beispiel_xml())
    assert bericht.valide, f"eigene XRechnung abgelehnt: {bericht.meldungen}"
    assert bericht.report_html  # der Bericht wird spaeter mit abgelegt


def test_kaputte_rechnung_wird_abgelehnt():
    xml = beispiel_xml().replace(b"<cbc:BuyerReference>04011000-12345-03</cbc:BuyerReference>", b"")
    bericht = kosit.validieren(xml)
    assert not bericht.valide
    assert any("BR-DE-15" in meldung or "BuyerReference" in meldung
               for meldung in bericht.meldungen), bericht.meldungen[:5]


def test_abschlag_und_schlussrechnung_sind_valide():
    """4b: KoSIT akzeptiert Typ 326 sowie 380 mit BG-3 und BT-113."""
    from datetime import date
    from app.api.pedant.core import xrechnung
    from app.api.pedant.tests.fixtures_rechnung import AUFTRAGGEBER, FIRMA, POSITIONEN, RECHNUNG
    betraege = xrechnung.summen(POSITIONEN, 19)
    abschlag = xrechnung.ubl_erzeugen(
        rechnungsnummer="RE-2027-0002", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
        rechnung={**RECHNUNG, "rechnungstyp": "326"}, positionen=POSITIONEN, betraege=betraege)
    bericht = kosit.validieren(abschlag)
    assert bericht.valide, f"Abschlagsrechnung abgelehnt: {bericht.meldungen[:5]}"
    schluss = xrechnung.ubl_erzeugen(
        rechnungsnummer="RE-2027-0003", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
        rechnung=RECHNUNG, positionen=POSITIONEN, betraege=betraege,
        vorrechnungen=[{"rechnungsnummer": "RE-2027-0002", "rechnungsdatum": date(2027, 1, 15)}],
        vorab_cent=50_000)
    bericht = kosit.validieren(schluss)
    assert bericht.valide, f"Schlussrechnung abgelehnt: {bericht.meldungen[:5]}"
