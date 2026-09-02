"""KoSIT-Validator-Anbindung — der Tuersteher vor jedem Stellen.

Das Pruefwerkzeug ist ein Java-JAR (validator-1.6.3-standalone.jar) mit der
XRechnung-3.0.2-Szenariokonfiguration; exakt die Artefakte, mit denen auch
die Behoerdenportale pruefen. Installation: kosit_setup.sh (Java 21 headless
+ drei gepinnte Artefakte nach /opt/kosit).

Exit-Code-Semantik des Validators (docs/cli.md):
  0   = alles valide
  > 0 = Anzahl ABGELEHNTER Dateien (fachliche Ablehnung, Report vorhanden)
  < 0 = Konfigurations-/Aufruffehler (erscheint in POSIX als 254/255)
Unterscheidung hier: liegt ein Report neben der Eingabe, war es eine fachliche
Entscheidung; fehlt er, ist der Validator selbst kaputt -> KositNichtBereit.
"""

import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

from app.api.flood2D.env_util import env

STANDARD_JAR = "/opt/kosit/validator-1.6.3-standalone.jar"
STANDARD_SZENARIEN = "/opt/kosit/xrechnung-3.0.2/scenarios.xml"
ZEITLIMIT_S = 180
MAX_MELDUNGEN = 25

ANLEITUNG = ("Setup: sudo bash backend/app/api/pedant/kosit_setup.sh "
             "(installiert Java 21 + Validator + XRechnung-Konfiguration)")


class KositNichtBereit(RuntimeError):
    """Java/Artefakte fehlen oder der Validator selbst scheitert -> Router 503."""


@dataclass(frozen=True)
class KositBericht:
    valide: bool
    meldungen: list = field(default_factory=list)
    report_xml: bytes = b""
    report_html: bytes = b""


def _jar_pfad() -> Path | None:
    wert = env("PEDANT_KOSIT_JAR", STANDARD_JAR).strip()
    return Path(wert) if wert else None


def _szenarien_pfad() -> Path:
    return Path(env("PEDANT_KOSIT_SZENARIEN", STANDARD_SZENARIEN).strip()
                or STANDARD_SZENARIEN)


def bereit() -> str | None:
    """None = einsatzbereit, sonst Fehlertext (auch fuer /status)."""
    if shutil.which("java") is None:
        return "java fehlt"
    jar = _jar_pfad()
    if jar is None or not jar.is_file():
        return f"validator-jar fehlt ({jar})"
    szenarien = _szenarien_pfad()
    if not szenarien.is_file():
        return f"szenariokonfiguration fehlt ({szenarien})"
    return None


def _meldungen_aus_report(report_xml: bytes) -> list:
    """Zieht die fachlichen Ablehnungsgruende aus dem Pruefbericht:
    Schematron failed-asserts und Validator-Fehlermeldungen."""
    meldungen = []
    try:
        baum = etree.fromstring(report_xml)
    except etree.XMLSyntaxError:
        return ["pruefbericht unlesbar"]
    for knoten in baum.iter():
        lokal = etree.QName(knoten).localname
        if lokal == "failed-assert":
            kennung = knoten.get("id") or ""
            text = " ".join(" ".join(knoten.itertext()).split())
            meldungen.append(f"{kennung}: {text}".strip(": ").strip())
        elif lokal == "message" and (knoten.get("level") or "").lower() == "error":
            text = " ".join(" ".join(knoten.itertext()).split())
            if text:
                meldungen.append(text)
    # Reihenfolge erhalten, Dubletten raus, Deckel drauf.
    einmalig = list(dict.fromkeys(meldungen))
    if len(einmalig) > MAX_MELDUNGEN:
        einmalig = einmalig[:MAX_MELDUNGEN] + [
            f"... und {len(einmalig) - MAX_MELDUNGEN} weitere Meldungen"]
    return einmalig or ["vom validator abgelehnt (keine einzelmeldungen gefunden)"]


def validieren(xml_bytes: bytes) -> KositBericht:
    grund = bereit()
    if grund:
        raise KositNichtBereit(f"KoSIT-Validator nicht bereit: {grund}. {ANLEITUNG}")
    jar = _jar_pfad()
    szenarien = _szenarien_pfad()

    with tempfile.TemporaryDirectory(prefix="pedant-kosit-") as tmp:
        arbeit = Path(tmp)
        eingabe = arbeit / "rechnung.xml"
        eingabe.write_bytes(xml_bytes)
        befehl = ["java", "-jar", str(jar), "-s", str(szenarien),
                  "-r", str(szenarien.parent), "-o", str(arbeit), "-h",
                  str(eingabe)]
        try:
            lauf = subprocess.run(befehl, capture_output=True, text=True,
                                  timeout=ZEITLIMIT_S, cwd=arbeit)
        except subprocess.TimeoutExpired:
            raise KositNichtBereit(
                f"validator-timeout nach {ZEITLIMIT_S}s — jvm/konfiguration pruefen")

        report_xml_pfad = arbeit / "rechnung-report.xml"
        report_html_pfad = arbeit / "rechnung-report.html"
        report_xml = report_xml_pfad.read_bytes() if report_xml_pfad.is_file() else b""
        report_html = report_html_pfad.read_bytes() if report_html_pfad.is_file() else b""

        if lauf.returncode == 0:
            return KositBericht(valide=True, meldungen=[],
                                report_xml=report_xml, report_html=report_html)
        if report_xml:
            # Fachliche Ablehnung: der Validator hat entschieden.
            return KositBericht(valide=False,
                                meldungen=_meldungen_aus_report(report_xml),
                                report_xml=report_xml, report_html=report_html)
        # Kein Report -> der Validator selbst ist gescheitert.
        auszug = (lauf.stderr or lauf.stdout or "").strip()[-500:]
        raise KositNichtBereit(
            f"validator-aufruf gescheitert (exit {lauf.returncode}): {auszug}")
