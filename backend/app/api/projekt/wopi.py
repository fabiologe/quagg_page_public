"""WOPI-Host fuer ONLYOFFICE Docs (Stufe 5, O2). Der Dokumentserver ruft diese
Routen SERVER-ZU-SERVER auf; die Berechtigung traegt ein signiertes access_token
(HMAC ueber projekt_id|relpfad|ablauf), nicht das Nutzer-JWT.

Vertrag (WOPI, Ausschnitt, den ONLYOFFICE nutzt):
  GET  /files/{id}                 CheckFileInfo
  GET  /files/{id}/contents        GetFile
  POST /files/{id}/contents        PutFile  (X-WOPI-Override: PUT)
  POST /files/{id}                 LOCK / UNLOCK / REFRESH_LOCK / GET_LOCK (X-WOPI-Override, X-WOPI-Lock)
Sperren sind im Prozess (ein Nutzer, ein Server); nach Neustart sind sie weg.
"""

import base64
import hashlib
import hmac
import os
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response

from app.core.config import get_settings

from .core import office, ordner

router = APIRouter()
TOKEN_TTL_S = 8 * 3600
_LOCKS: dict[str, tuple[str, float]] = {}       # file_id -> (lock, ablauf)
LOCK_TTL_S = 30 * 60


class WopiAbgelehnt(Exception):
    pass


def _schluessel() -> bytes:
    return str(get_settings().SECRET_KEY).encode("utf-8")


def _b64(daten: bytes) -> str:
    return base64.urlsafe_b64encode(daten).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def file_id(projekt_id: int, relpfad: str) -> str:
    return _b64(f"{projekt_id}|{relpfad}".encode("utf-8"))


def file_id_lesen(fid: str) -> tuple[int, str]:
    try:
        roh = _unb64(fid).decode("utf-8")
        pid, rel = roh.split("|", 1)
        return int(pid), rel
    except Exception:
        raise HTTPException(status_code=404, detail="unbekannte datei")


def token_erzeugen(projekt_id: int, relpfad: str, nutzer: str, ttl: int = TOKEN_TTL_S) -> str:
    ablauf = int(time.time()) + ttl
    nutzlast = f"{projekt_id}|{relpfad}|{nutzer}|{ablauf}"
    sig = hmac.new(_schluessel(), nutzlast.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    return _b64(f"{nutzlast}|{sig}".encode("utf-8"))


def token_pruefen(token: str, projekt_id: int, relpfad: str) -> str:
    """Gibt den Nutzernamen zurueck oder wirft 401."""
    try:
        roh = _unb64(token).decode("utf-8")
        pid, rel, nutzer, ablauf, sig = roh.rsplit("|", 4) if roh.count("|") == 4 else (None,) * 5
        nutzlast = f"{pid}|{rel}|{nutzer}|{ablauf}"
        erwartet = hmac.new(_schluessel(), nutzlast.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig or "", erwartet):
            raise ValueError("signatur")
        if int(ablauf) < time.time():
            raise ValueError("abgelaufen")
        if int(pid) != projekt_id or rel != relpfad:
            raise ValueError("datei")
    except Exception:
        raise HTTPException(status_code=401, detail="access_token ungueltig")
    return nutzer


def _datei(projekt_id: int, relpfad: str) -> Path:
    o = ordner.finde(projekt_id)
    if o is None:
        raise HTTPException(status_code=404, detail="projekt ohne ordner")
    ziel = (o.pfad / relpfad).resolve()
    if not ziel.is_relative_to(o.pfad.resolve()) or ordner.AKTE in ziel.relative_to(o.pfad.resolve()).parts:
        raise HTTPException(status_code=403, detail="pfad verlaesst den projektordner")
    if ziel.suffix.lower() not in office.WOPI_ENDUNGEN:
        raise HTTPException(status_code=415, detail="nur docx/xlsx/pptx")
    return ziel


def session(projekt_id: int, relpfad: str, nutzer: str, api_basis: str) -> dict:
    """Was der Client fuer den Editor braucht (Formular-POST in ein iframe)."""
    server = office.onlyoffice_url()
    if not server:
        raise WopiAbgelehnt("ONLYOFFICE_URL ist nicht konfiguriert (backend/.env)")
    ziel = _datei(projekt_id, relpfad)
    if not ziel.is_file():
        raise HTTPException(status_code=404, detail="datei fehlt")
    art = {".docx": "word", ".xlsx": "cell", ".pptx": "slide"}[ziel.suffix.lower()]
    fid = file_id(projekt_id, relpfad)
    wopisrc = f"{api_basis}/FastAPI/wopi/files/{fid}"
    return {"file_id": fid, "wopisrc": wopisrc, "access_token": token_erzeugen(projekt_id, relpfad, nutzer),
            "access_token_ttl": (int(time.time()) + TOKEN_TTL_S) * 1000,
            "editor_url": f"{server}/hosting/wopi/{art}/edit?wopisrc={wopisrc}"}


def _lock_zustand(fid: str) -> str:
    lock = _LOCKS.get(fid)
    if lock and lock[1] > time.time():
        return lock[0]
    _LOCKS.pop(fid, None)
    return ""


@router.get("/files/{fid}")
def check_file_info(fid: str, access_token: str = Query(...)):
    pid, rel = file_id_lesen(fid)
    nutzer = token_pruefen(access_token, pid, rel)
    ziel = _datei(pid, rel)
    if not ziel.is_file():
        raise HTTPException(status_code=404, detail="datei fehlt")
    st = ziel.stat()
    return {
        "BaseFileName": ziel.name, "Size": st.st_size, "Version": str(int(st.st_mtime)),
        "OwnerId": "quagg", "UserId": nutzer, "UserFriendlyName": nutzer,
        "UserCanWrite": True, "SupportsUpdate": True, "SupportsLocks": True, "SupportsGetLock": True,
        "UserCanNotWriteRelative": True, "LastModifiedTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(st.st_mtime)),
    }


@router.get("/files/{fid}/contents")
def get_file(fid: str, access_token: str = Query(...)):
    pid, rel = file_id_lesen(fid)
    token_pruefen(access_token, pid, rel)
    ziel = _datei(pid, rel)
    if not ziel.is_file():
        raise HTTPException(status_code=404, detail="datei fehlt")
    return Response(content=ziel.read_bytes(), media_type="application/octet-stream")


@router.post("/files/{fid}/contents")
async def put_file(fid: str, request: Request, access_token: str = Query(...),
                   x_wopi_override: str = Header(default=""), x_wopi_lock: str = Header(default="")):
    pid, rel = file_id_lesen(fid)
    token_pruefen(access_token, pid, rel)
    if x_wopi_override.upper() != "PUT":
        raise HTTPException(status_code=400, detail="X-WOPI-Override PUT erwartet")
    ziel = _datei(pid, rel)
    aktuell = _lock_zustand(fid)
    if aktuell and aktuell != x_wopi_lock:
        return Response(status_code=409, headers={"X-WOPI-Lock": aktuell})
    daten = await request.body()
    temp = ziel.parent / f".tmp-{uuid.uuid4().hex}"
    try:
        with temp.open("wb") as f:
            f.write(daten)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, ziel)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return Response(status_code=200, headers={"X-WOPI-ItemVersion": str(int(ziel.stat().st_mtime))})


@router.post("/files/{fid}")
def lock_ops(fid: str, access_token: str = Query(...), x_wopi_override: str = Header(default=""),
             x_wopi_lock: str = Header(default=""), x_wopi_oldlock: str = Header(default="")):
    pid, rel = file_id_lesen(fid)
    token_pruefen(access_token, pid, rel)
    _datei(pid, rel)
    op = x_wopi_override.upper()
    aktuell = _lock_zustand(fid)
    if op == "GET_LOCK":
        return Response(status_code=200, headers={"X-WOPI-Lock": aktuell})
    if op == "LOCK":
        if x_wopi_oldlock:                                   # UnlockAndRelock
            if aktuell != x_wopi_oldlock:
                return Response(status_code=409, headers={"X-WOPI-Lock": aktuell})
            _LOCKS[fid] = (x_wopi_lock, time.time() + LOCK_TTL_S)
            return Response(status_code=200)
        if aktuell and aktuell != x_wopi_lock:
            return Response(status_code=409, headers={"X-WOPI-Lock": aktuell})
        _LOCKS[fid] = (x_wopi_lock, time.time() + LOCK_TTL_S)
        return Response(status_code=200)
    if op in ("UNLOCK", "REFRESH_LOCK"):
        if aktuell != x_wopi_lock:
            return Response(status_code=409, headers={"X-WOPI-Lock": aktuell})
        if op == "UNLOCK":
            _LOCKS.pop(fid, None)
        else:
            _LOCKS[fid] = (x_wopi_lock, time.time() + LOCK_TTL_S)
        return Response(status_code=200)
    raise HTTPException(status_code=400, detail=f"unbekannte X-WOPI-Override {op!r}")
