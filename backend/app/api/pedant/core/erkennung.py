"""Beleg-Erkennung — VORBEREITET, im Betrieb INAKTIV bis zum Scharfstellen.

Fabios Vorgabe (2026-08-23): kein API-Key, die OCR kommt erst kurz vor dem
finalen Test am Ende aller Phasen dazu. Der manuelle Erfassungsweg ist der
Hauptpfad und bleibt dauerhaft als Fallback.

Scharfstellen spaeter, ohne Codeaenderung am Ablauf:
  1. in backend/.env:  ANTHROPIC_API_KEY=...  und  PEDANT_OCR=1
  2. venv/bin/pip install anthropic   (Paket ist bewusst NICHT installiert)
  3. Batch:  venv/bin/python -m app.api.pedant.cli beleg-erkennen --ziel prod

Fachliche Regeln nach dem gemessenen Vorbild backend/ingest/vision.py:
Sonnet statt Haiku (0/4 vs. 4/4 Tabellenzeilen), und die tragende Regel —
ein selbstbewusst falscher Betrag ist schlimmer als eine Luecke: nicht sicher
Lesbares bleibt null und setzt `unsicher` auf true. Die menschliche Pruefung
(felder_speichern) bleibt IMMER Pflicht; die OCR fuellt nur vor.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol

from app.api.flood2D.env_util import env

STANDARD_MODELL = "claude-sonnet-5"

# JSON-Schema nach vision.py-Vorbild: unsicher ist optional, die harte Regel
# steht im Prompt. Betraege als Integer-Cent — wie ueberall im Pedanten.
BELEG_SCHEMA = {
    "type": "object",
    "properties": {
        "lieferant": {"type": ["string", "null"]},
        "belegdatum": {"type": ["string", "null"], "description": "ISO JJJJ-MM-TT"},
        "netto_cent": {"type": ["integer", "null"]},
        "steuersatz": {"type": ["integer", "null"], "enum": [0, 7, 19, None]},
        "brutto_cent": {"type": ["integer", "null"]},
        "unsicher": {"type": "boolean"},
    },
    "required": ["lieferant", "belegdatum", "netto_cent", "steuersatz",
                 "brutto_cent"],
}

ANWEISUNG = (
    "Du liest einen deutschen Kaufbeleg (Kassenbon, Rechnung) fuer die "
    "Buchhaltung eines Ingenieurbueros. Erfasse: lieferant (Name wie gedruckt), "
    "belegdatum (ISO), netto_cent, steuersatz (0, 7 oder 19), brutto_cent — "
    "alle Betraege als ganze Cent. Nichts erfinden: Ist ein Wert nicht sicher "
    "lesbar, setze ihn auf null und unsicher auf true. Ein selbstbewusst "
    "falscher Betrag ist schlimmer als eine Luecke, weil ihn niemand nachprueft."
)


class ErkennungNichtKonfiguriert(RuntimeError):
    """OCR-Aufruf ohne Schluessel/Paket — mit Anleitung in der Meldung."""


@dataclass(frozen=True)
class ErkannteFelder:
    lieferant: str | None
    belegdatum: date | None
    netto_cent: int | None
    steuersatz: int | None
    brutto_cent: int | None
    unsicher: bool
    roh: dict


class Erkenner(Protocol):
    def erkenne(self, pfad: Path) -> ErkannteFelder: ...


class MockErkenner:
    """Testdouble: liefert ein vorgegebenes Ergebnis."""

    def __init__(self, ergebnis: ErkannteFelder):
        self._ergebnis = ergebnis

    def erkenne(self, pfad: Path) -> ErkannteFelder:  # noqa: ARG002
        return self._ergebnis


class AnthropicErkenner:
    """Anthropic-SDK-Anbindung. Der Import passiert LAZY in erkenne() —
    das Paket ist bis zum Scharfstellen nicht installiert, und diese Klasse
    muss trotzdem importierbar und konstruierbar bleiben (Tests)."""

    def __init__(self, api_key: str, modell: str = STANDARD_MODELL):
        self._api_key = api_key
        self._modell = modell

    def erkenne(self, pfad: Path) -> ErkannteFelder:
        try:
            import anthropic  # noqa: F401 — bewusst lazy
        except ImportError:
            raise ErkennungNichtKonfiguriert(
                "anthropic-Paket nicht installiert — Scharfstellen: "
                "venv/bin/pip install anthropic (siehe Kopf von erkennung.py)")
        # Skizze fuers Scharfstellen (bewusst noch nicht ausgefuehrt/getestet):
        #   daten = base64(pfad.read_bytes())
        #   block = {'type': 'document'|'image', 'source': {'type': 'base64',
        #            'media_type': <mime>, 'data': daten}}
        #   client = anthropic.Anthropic(api_key=self._api_key)
        #   antwort = client.messages.create(model=self._modell, max_tokens=1024,
        #       system=ANWEISUNG, messages=[{'role': 'user', 'content': [block]}],
        #       ...JSON-Ausgabe gegen BELEG_SCHEMA erzwingen...)
        #   -> _felder_aus_roh(json)
        raise ErkennungNichtKonfiguriert(
            "AnthropicErkenner.erkenne ist bis zum Scharfstellen nicht ausgebaut"
            " — der Aufrufpfad wird mit dem API-Key finalisiert und getestet")


def felder_aus_roh(roh: dict) -> ErkannteFelder:
    """Rohe Modellantwort -> ErkannteFelder, defensiv geparst."""
    datum = None
    if roh.get("belegdatum"):
        try:
            datum = date.fromisoformat(str(roh["belegdatum"]))
        except ValueError:
            datum = None

    def ganzzahl(name):
        wert = roh.get(name)
        return wert if isinstance(wert, int) and not isinstance(wert, bool) else None

    satz = ganzzahl("steuersatz")
    return ErkannteFelder(
        lieferant=(str(roh["lieferant"]).strip() or None) if roh.get("lieferant") else None,
        belegdatum=datum,
        netto_cent=ganzzahl("netto_cent"),
        steuersatz=satz if satz in (0, 7, 19) else None,
        brutto_cent=ganzzahl("brutto_cent"),
        unsicher=bool(roh.get("unsicher", False)),
        roh=roh,
    )


def erkenner_aus_umgebung() -> Erkenner | None:
    """None, solange die OCR nicht scharf gestellt ist — der Aufrufer laesst
    den Beleg dann schlicht im Status 'erfasst' (manueller Hauptpfad)."""
    if env("PEDANT_OCR", "").strip() != "1":
        return None
    schluessel = env("ANTHROPIC_API_KEY", "").strip()
    if not schluessel:
        return None
    return AnthropicErkenner(schluessel, env("PEDANT_OCR_MODEL", STANDARD_MODELL))
