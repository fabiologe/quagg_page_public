"""Datei-Ablage: Allowlist, MIME-Spoofing, Groessenlimit, Traversal, Idempotenz.
Alles gegen tmp_path (beleg_wurzel-Fixture) — die StorageBox bleibt unberuehrt."""

import asyncio
import io

import pytest

from app.api.pedant.core import ablage

# Minimale, magic-erkennbare Testinhalte.
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
PNG_BYTES = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)
JPEG_BYTES = (b"\xff\xd8\xff\xe0" + b"\x00" * 16 + b"\xff\xd9")


class FakeUpload:
    """Nachbau der UploadFile-Leseschnittstelle fuer Tests."""

    def __init__(self, name, daten):
        self.filename = name
        self._puffer = io.BytesIO(daten)

    async def read(self, n=-1):
        return self._puffer.read(n)


def speichere(name, daten, jahr=2027):
    return asyncio.run(ablage.beleg_speichern(FakeUpload(name, daten), jahr=jahr))


def test_happy_path_content_adressiert(beleg_wurzel):
    ergebnis = speichere("Kassenbon Baumarkt.pdf", PDF_BYTES)
    assert ergebnis.mime_typ == "application/pdf"
    assert ergebnis.groesse_bytes == len(PDF_BYTES)
    assert ergebnis.relativ == f"2027/{ergebnis.sha256}.pdf"
    datei = beleg_wurzel / ergebnis.relativ
    assert datei.read_bytes() == PDF_BYTES
    # keine Temp-Reste
    assert not list(beleg_wurzel.glob("**/.tmp-*"))


def test_duplikat_inhalt_ist_idempotent(beleg_wurzel):
    a = speichere("a.pdf", PDF_BYTES)
    b = speichere("b.pdf", PDF_BYTES)
    assert a.sha256 == b.sha256
    assert len(list((beleg_wurzel / "2027").iterdir())) == 1


def test_unbekannte_endung_wird_abgelehnt_ohne_datei(beleg_wurzel):
    with pytest.raises(ablage.AblageAbgelehnt, match="nicht erlaubt"):
        speichere("virus.exe", b"MZ...")
    with pytest.raises(ablage.AblageAbgelehnt, match="nicht erlaubt"):
        speichere("ohne_endung", PDF_BYTES)
    assert not list(beleg_wurzel.glob("**/*"))


def test_mime_spoofing_wird_erkannt(beleg_wurzel):
    # PDF-Endung, aber JPEG-Inhalt — magic bytes entlarven es.
    with pytest.raises(ablage.AblageAbgelehnt, match="image/jpeg"):
        speichere("getarnt.pdf", JPEG_BYTES)
    # PNG-Endung mit PDF-Inhalt ebenso.
    with pytest.raises(ablage.AblageAbgelehnt, match="application/pdf"):
        speichere("getarnt.png", PDF_BYTES)
    assert not list(beleg_wurzel.glob("**/*"))


def test_leere_datei_abgelehnt(beleg_wurzel):
    with pytest.raises(ablage.AblageAbgelehnt, match="leer"):
        speichere("leer.pdf", b"")


def test_groessenlimit_bricht_ab_und_raeumt_auf(beleg_wurzel, monkeypatch):
    monkeypatch.setattr(ablage, "MAX_GROESSE", 1024)
    zu_gross = PDF_BYTES + b"\x00" * 2048
    with pytest.raises(ablage.AblageAbgelehnt, match="groesser als"):
        speichere("riesig.pdf", zu_gross)
    assert not list(beleg_wurzel.glob("**/*.pdf"))
    assert not list(beleg_wurzel.glob("**/.tmp-*"))


def test_datei_oeffnen_traversal_gesperrt(beleg_wurzel):
    ergebnis = speichere("ok.pdf", PDF_BYTES)
    assert ablage.datei_oeffnen(ergebnis.relativ).read_bytes() == PDF_BYTES
    with pytest.raises(ablage.AblageAbgelehnt, match="verlaesst"):
        ablage.datei_oeffnen("../../../etc/passwd")
    with pytest.raises(FileNotFoundError):
        ablage.datei_oeffnen("2027/" + "0" * 64 + ".pdf")


def test_mount_guard_greift_nur_auf_der_storagebox(tmp_path, monkeypatch):
    # Ausserhalb der StorageBox: kein Guard, kein Fehler.
    monkeypatch.setenv("PEDANT_BELEG_ROOT", str(tmp_path))
    ablage._mount_pruefen(ablage.beleg_wurzel())
    # Die konftest-Sperre zeigt auf einen nicht existenten NICHT-Mount-Pfad —
    # dort schlaegt nicht der Guard fehl, sondern spaeter das Dateisystem.
    monkeypatch.setenv("PEDANT_BELEG_ROOT", "/mnt/storagebox-fake/x")
    ablage._mount_pruefen(ablage.beleg_wurzel())


# ── bytes_speichern (Phase 3: selbst erzeugtes XML/HTML) ─────────────────────

XML_BYTES = b'<?xml version="1.0" encoding="UTF-8"?>\n<Invoice>inhalt</Invoice>\n'
HTML_BYTES = b"<!DOCTYPE html>\n<html><body>Bericht</body></html>\n"


def test_bytes_speichern_xml_und_html(rechnung_wurzel):
    xml = ablage.bytes_speichern(XML_BYTES, endung=".xml", jahr=2027)
    assert xml.mime_typ == "application/xml"
    assert (rechnung_wurzel / xml.relativ).read_bytes() == XML_BYTES
    html = ablage.bytes_speichern(HTML_BYTES, endung=".html", jahr=2027)
    assert html.mime_typ == "text/html"
    # idempotent: gleicher Inhalt -> gleiche Datei, kein Fehler
    nochmal = ablage.bytes_speichern(XML_BYTES, endung=".xml", jahr=2027)
    assert nochmal.sha256 == xml.sha256
    assert len(list((rechnung_wurzel / "2027").iterdir())) == 2


def test_bytes_speichern_ablehnungen(rechnung_wurzel):
    with pytest.raises(ablage.AblageAbgelehnt, match="endung"):
        ablage.bytes_speichern(XML_BYTES, endung=".exe", jahr=2027)
    with pytest.raises(ablage.AblageAbgelehnt, match="leer"):
        ablage.bytes_speichern(b"", endung=".xml", jahr=2027)
    with pytest.raises(ablage.AblageAbgelehnt, match="passt nicht"):
        ablage.bytes_speichern(JPEG_BYTES, endung=".xml", jahr=2027)
    assert not list(rechnung_wurzel.glob("**/*"))


def test_rechnung_datei_oeffnen_getrennte_wurzel(rechnung_wurzel, beleg_wurzel):
    ergebnis = ablage.bytes_speichern(XML_BYTES, endung=".xml", jahr=2027)
    assert ablage.rechnung_datei_oeffnen(ergebnis.relativ).read_bytes() == XML_BYTES
    with pytest.raises(ablage.AblageAbgelehnt, match="verlaesst"):
        ablage.rechnung_datei_oeffnen("../../../etc/passwd")
    # die Beleg-Wurzel kennt die Rechnungsdatei nicht
    with pytest.raises(FileNotFoundError):
        ablage.datei_oeffnen(ergebnis.relativ)
