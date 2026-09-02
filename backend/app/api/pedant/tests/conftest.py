"""Testrahmen des Pedanten — laeuft AUSSCHLIESSLICH gegen pedant_test.

Kreditkarten-Sperre nach flood3D-Vorbild (dort: Cloud-Credentials): die
Prod-URLs werden hart geleert, BEVOR irgendein Modul sie lesen kann. env_util
gibt os.environ Vorrang — ein leerer String ist eine gesetzte Sperre. Kein
Testlauf kann pedant_prod erreichen, egal was in backend/.env steht.
"""

import os

os.environ["PEDANT_DB_URL"] = ""
os.environ["PEDANT_MIGRATE_URL"] = ""
os.environ["PEDANT_ZIEL"] = "test"
# Beleg-Sperren: kein Test darf je auf die StorageBox schreiben oder die
# LLM-OCR erreichen. Die Beleg-Wurzel zeigt auf einen nicht existenten Pfad —
# wer die beleg_wurzel-Fixture vergisst, faellt LAUT statt auf den Mount.
os.environ["PEDANT_BELEG_ROOT"] = "/pedant-testsperre-nicht-vorhanden"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["PEDANT_OCR"] = ""
# Phase-3-Sperren: erzeugte XML/Berichte nie auf die StorageBox, und der
# KoSIT-Validator wird in Unit-Tests ueber einen Stub-Pfad injiziert —
# ein leerer JAR-Pfad heisst "nicht konfiguriert".
os.environ["PEDANT_RECHNUNG_ROOT"] = "/pedant-testsperre-nicht-vorhanden"
os.environ["PEDANT_KOSIT_JAR"] = ""
# Projektmodul (Schema projekt in derselben DB): kein Test darf je Ordner auf
# der StorageBox anlegen — die Wurzel zeigt auf einen nicht existenten Pfad.
os.environ["PROJEKTE_ROOT"] = "/projekt-testsperre-nicht-vorhanden"

from datetime import date  # noqa: E402

import psycopg  # noqa: E402
import pytest  # noqa: E402

from app.api.flood2D.env_util import env  # noqa: E402
from app.api.pedant import cli  # noqa: E402
from app.api.pedant.core import journal  # noqa: E402


@pytest.fixture(scope="module")
def frische_db():
    """Wirft das Schema der Test-DB weg und baut es ueber die ECHTEN
    Migrationen neu auf — jedes Testmodul startet auf gruener Wiese."""
    url_migrate = env("PEDANT_MIGRATE_URL_TEST", "")
    url_app = env("PEDANT_DB_URL_TEST", "")
    if not url_migrate or not url_app:
        pytest.skip("PEDANT_*_TEST nicht gesetzt (backend/.env) — Test-DB fehlt")
    try:
        with psycopg.connect(url_migrate) as conn:
            with conn.transaction():
                conn.execute("DROP SCHEMA public CASCADE")
                conn.execute("DROP SCHEMA IF EXISTS projekt CASCADE")
                conn.execute("CREATE SCHEMA public")
    except psycopg.OperationalError as fehler:
        pytest.skip(f"Test-DB nicht erreichbar: {fehler}")
    assert cli.migrate("test") == 0
    assert cli.migrate("test", modul="projekt") == 0
    return {"app": url_app, "migrate": url_migrate}


@pytest.fixture()
def app_conn(frische_db):
    with psycopg.connect(frische_db["app"]) as conn:
        yield conn


@pytest.fixture()
def migrate_conn(frische_db):
    with psycopg.connect(frische_db["migrate"]) as conn:
        yield conn


@pytest.fixture()
def beleg_wurzel(tmp_path, monkeypatch):
    """Biegt die Beleg-Ablage auf ein Wegwerf-Verzeichnis um. Eigener
    Unterordner — ein Test kann beide Wurzeln zugleich brauchen, und die
    muessen getrennt sein (sonst faende die Beleg-Wurzel Rechnungsdateien)."""
    wurzel = tmp_path / "belege"
    wurzel.mkdir()
    monkeypatch.setenv("PEDANT_BELEG_ROOT", str(wurzel))
    return wurzel


@pytest.fixture()
def rechnung_wurzel(tmp_path, monkeypatch):
    """Biegt die Rechnungs-Ablage (XML/Berichte) auf ein Wegwerf-Verzeichnis um."""
    wurzel = tmp_path / "rechnungen"
    wurzel.mkdir()
    monkeypatch.setenv("PEDANT_RECHNUNG_ROOT", str(wurzel))
    return wurzel


@pytest.fixture()
def buche(app_conn):
    """Buchungshelfer mit sinnvollen Defaults; jedes Feld uebersteuerbar."""
    def _buche(**ueberschrieben):
        felder = dict(
            buchungsdatum=date(2027, 1, 15), belegdatum=date(2027, 1, 15),
            sollkonto="6815", habenkonto="1800", betrag_cent=1234,
            buchungstext="Testbuchung", akteur="pytest",
        )
        felder.update(ueberschrieben)
        return journal.buchung_anlegen(app_conn, **felder)
    return _buche
