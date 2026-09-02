"""Unveraenderliche Beleg-Ablage (FAHRPLAN Kap. 4, Punkt 5).

Content-adressiert: eine Datei liegt unter '<jahr>/<sha256><endung>' relativ
zur Beleg-Wurzel. Damit sind Kollisionen und Path-Traversal per Konstruktion
ausgeschlossen, ein Duplikat-Upload schreibt idempotent dieselbe Datei, und
die Unveraenderlichkeit ist ueber den sha256 in der Datenbank jederzeit
nachpruefbar (auf CIFS-chmod bauen wir nicht).

Die Helfer sind aus app/services/email_fetcher.py uebernommen — KOPIERT statt
importiert, weil dessen Modulebene den IMAP-Stack zieht. Zwei Verbesserungen:
Path.is_relative_to() statt String-startswith (Praefix-Falle /x/ab vs /x/abc)
und echtes Streaming von der Quelle (kein Voll-RAM-Read wie library.py).
"""

import hashlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

import magic

from app.api.flood2D.env_util import env

STANDARD_WURZEL = "/mnt/storagebox/3_Buchhaltung/belege"
_MOUNT_SENTINEL = Path("/mnt/storagebox/.quagg_mount_ok")
_STORAGEBOX = Path("/mnt/storagebox")

MAX_GROESSE = 25 * 1024 * 1024  # 25 MB — nginx laesst global 100M durch
CHUNK = 256 * 1024

# Endung -> erlaubte MIME-Typen (magic bytes muessen zu EINEM davon passen).
# HEIC/HEIF: Standardformat von iPhone-Fotos — ohne diesen Eintrag lehnte der
# Upload jedes Handyfoto ab (Prod-Befund 24.08.: dreimal 422 beim Belegupload).
ERLAUBT = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".heic": {"image/heic", "image/heif"},
    ".heif": {"image/heif", "image/heic"},
}


class AblageAbgelehnt(ValueError):
    """Datei nicht annehmbar (Typ/Groesse) — Router uebersetzt in 422."""


class AblageNichtBereit(RuntimeError):
    """Ablage nicht erreichbar (Mount weg) — Router uebersetzt in 503."""


@dataclass(frozen=True)
class AblageErgebnis:
    sha256: str
    relativ: str
    mime_typ: str
    groesse_bytes: int
    original_name: str


def beleg_wurzel() -> Path:
    """Bei JEDEM Aufruf aus der Umgebung gelesen — Tests biegen per
    PEDANT_BELEG_ROOT auf tmp_path um."""
    return Path(env("PEDANT_BELEG_ROOT", STANDARD_WURZEL))


def _mount_pruefen(wurzel: Path) -> None:
    """Zwei unabhaengige Pruefungen (Muster email_fetcher), aber nur wenn die
    Wurzel auf der StorageBox liegt — tmp_path in Tests braucht keinen Guard."""
    if not wurzel.is_relative_to(_STORAGEBOX):
        return
    try:
        mounts = Path("/proc/mounts").read_text(encoding="utf-8", errors="replace")
    except OSError as fehler:
        raise AblageNichtBereit(f"/proc/mounts nicht lesbar: {fehler}")
    if str(_STORAGEBOX) not in mounts:
        raise AblageNichtBereit("storagebox ist nicht gemountet")
    if not _MOUNT_SENTINEL.exists():
        raise AblageNichtBereit("mount-sentinel .quagg_mount_ok fehlt")


def _endung(dateiname: str) -> str:
    endung = Path(dateiname or "").suffix.lower()
    if endung not in ERLAUBT:
        erlaubt = ", ".join(sorted(ERLAUBT))
        raise AblageAbgelehnt(f"dateityp {endung or '(ohne endung)'} nicht erlaubt"
                              f" (erlaubt: {erlaubt})")
    return endung


async def beleg_speichern(upload, *, jahr: int) -> AblageErgebnis:
    """Nimmt ein FastAPI-UploadFile an und legt es unveraenderlich ab.

    Reihenfolge: Endungs-Allowlist -> MIME-Check auf dem ersten Chunk ->
    Chunk-Schleife mit inkrementellem sha256 in eine Temp-Datei IM Zielordner
    (os.replace ist nur auf demselben Mount atomar) -> fsync -> replace.
    Abgelehnte Uploads hinterlassen NICHTS auf der Platte.
    """
    endung = _endung(upload.filename)
    erwartet = ERLAUBT[endung]

    erster = await upload.read(CHUNK)
    if not erster:
        raise AblageAbgelehnt("leere datei")
    erkannt = magic.from_buffer(erster, mime=True).lower()
    if erkannt not in erwartet:
        raise AblageAbgelehnt(
            f"dateiinhalt ist {erkannt}, erwartet {'/'.join(sorted(erwartet))}"
            f" fuer {endung}")

    wurzel = beleg_wurzel()
    _mount_pruefen(wurzel)
    jahresordner = wurzel / str(jahr)
    jahresordner.mkdir(parents=True, exist_ok=True)
    temp = jahresordner / f".tmp-{uuid.uuid4().hex}"

    pruefsumme = hashlib.sha256()
    groesse = 0
    try:
        with temp.open("wb") as ziel:
            chunk = erster
            while chunk:
                groesse += len(chunk)
                if groesse > MAX_GROESSE:
                    raise AblageAbgelehnt(
                        f"datei groesser als {MAX_GROESSE // (1024 * 1024)} MB")
                pruefsumme.update(chunk)
                ziel.write(chunk)
                chunk = await upload.read(CHUNK)
            ziel.flush()
            os.fsync(ziel.fileno())

        sha = pruefsumme.hexdigest()
        endgueltig = jahresordner / f"{sha}{endung}"
        if endgueltig.exists():
            temp.unlink()  # identischer Inhalt liegt schon — idempotent
        else:
            os.replace(temp, endgueltig)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise

    return AblageErgebnis(
        sha256=sha,
        relativ=f"{jahr}/{sha}{endung}",
        mime_typ=erkannt,
        groesse_bytes=groesse,
        original_name=upload.filename or f"beleg{endung}",
    )


def _oeffnen(wurzel: Path, relativ: str) -> Path:
    """Relativer DB-Pfad -> absoluter Pfad, mit Traversal-Sperre und
    Mount-Guard (eine FileResponse gegen einen toten Mount haengt sonst)."""
    _mount_pruefen(wurzel)
    kandidat = (wurzel / relativ).resolve()
    if not kandidat.is_relative_to(wurzel.resolve()):
        raise AblageAbgelehnt(f"pfad {relativ!r} verlaesst die ablage-wurzel")
    if not kandidat.is_file():
        raise FileNotFoundError(kandidat)
    return kandidat


def datei_oeffnen(relativ: str) -> Path:
    return _oeffnen(beleg_wurzel(), relativ)


# ── Rechnungs-Ablage (Phase 3): selbst erzeugte Dateien ──────────────────────
# XRechnung-XML und KoSIT-Pruefbericht sind KEINE Uploads — sie entstehen im
# Backend und werden synchron abgelegt, content-adressiert wie die Belege.
STANDARD_RECHNUNG_WURZEL = "/mnt/storagebox/3_Buchhaltung/rechnungen"

# libmagic ist bei eigenen Formaten wankelmuetig (XML mal text/xml, mal
# application/xml; XHTML-Berichte je nach Kopf auch als XML) — deshalb
# MENGEN-Vergleich statt Exaktwert.
RECHNUNG_ERLAUBT = {
    ".xml": {"text/xml", "application/xml"},
    ".html": {"text/html", "application/xhtml+xml", "text/xml", "application/xml"},
}
_RECHNUNG_MIME = {".xml": "application/xml", ".html": "text/html"}


def rechnung_wurzel() -> Path:
    return Path(env("PEDANT_RECHNUNG_ROOT", STANDARD_RECHNUNG_WURZEL))


def bytes_speichern(daten: bytes, *, endung: str, jahr: int) -> AblageErgebnis:
    """Synchrone Schwester von beleg_speichern fuer selbst erzeugte Bytes.
    Content-adressiert und damit idempotent: derselbe Inhalt landet unter
    demselben Namen, eine Wiederholung schreibt nichts Neues."""
    if endung not in RECHNUNG_ERLAUBT:
        erlaubt = ", ".join(sorted(RECHNUNG_ERLAUBT))
        raise AblageAbgelehnt(f"endung {endung!r} nicht erlaubt (erlaubt: {erlaubt})")
    if not daten:
        raise AblageAbgelehnt("leerer inhalt")
    erkannt = magic.from_buffer(daten[:CHUNK], mime=True).lower()
    if erkannt not in RECHNUNG_ERLAUBT[endung]:
        raise AblageAbgelehnt(f"inhalt ist {erkannt}, passt nicht zu {endung}")

    wurzel = rechnung_wurzel()
    _mount_pruefen(wurzel)
    jahresordner = wurzel / str(jahr)
    jahresordner.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(daten).hexdigest()
    endgueltig = jahresordner / f"{sha}{endung}"
    if not endgueltig.exists():
        temp = jahresordner / f".tmp-{uuid.uuid4().hex}"
        try:
            with temp.open("wb") as ziel:
                ziel.write(daten)
                ziel.flush()
                os.fsync(ziel.fileno())
            os.replace(temp, endgueltig)
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    return AblageErgebnis(
        sha256=sha, relativ=f"{jahr}/{sha}{endung}",
        mime_typ=_RECHNUNG_MIME[endung], groesse_bytes=len(daten),
        original_name=f"{sha}{endung}",
    )


def rechnung_datei_oeffnen(relativ: str) -> Path:
    return _oeffnen(rechnung_wurzel(), relativ)
