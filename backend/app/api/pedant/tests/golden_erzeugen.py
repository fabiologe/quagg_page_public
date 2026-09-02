"""Erzeugt die Golden-Datei fuer test_xrechnung — NUR laufen lassen, wenn die
UBL-Aenderung gewollt ist, und danach den KoSIT-Integrationstest pruefen."""

from pathlib import Path

from app.api.pedant.tests.fixtures_rechnung import beispiel_xml

ziel = Path(__file__).parent / "daten" / "rechnung_golden.xml"
ziel.write_bytes(beispiel_xml())
print(f"geschrieben: {ziel}")
