"""Office-Anbindung ohne Serverdienst (O1): Links, die Word/Excel am Netzlaufwerk
oeffnen (Office-URI-Schema), plus die Konfiguration fuer den Client."""

from urllib.parse import quote

from .env import env

SCHEMATA = {
    ".docx": "ms-word", ".doc": "ms-word", ".docm": "ms-word", ".rtf": "ms-word", ".odt": "ms-word",
    ".xlsx": "ms-excel", ".xlsm": "ms-excel", ".xls": "ms-excel", ".csv": "ms-excel", ".ods": "ms-excel",
    ".pptx": "ms-powerpoint", ".ppt": "ms-powerpoint",
}
WOPI_ENDUNGEN = {".docx", ".xlsx", ".pptx"}


def webdav_basis() -> str:
    """Basis-URL, die auf 1_Projekte zeigt (backend/.env PROJEKTE_WEBDAV_URL), ohne Schlussstrich."""
    return env("PROJEKTE_WEBDAV_URL", "").strip().rstrip("/")


def onlyoffice_url() -> str:
    return env("ONLYOFFICE_URL", "").strip().rstrip("/")


def konfiguration() -> dict:
    return {"webdav_url": webdav_basis(), "office_online": bool(onlyoffice_url()),
            "office_endungen": sorted(SCHEMATA), "wopi_endungen": sorted(WOPI_ENDUNGEN)}


def office_link(relpfad: str) -> dict | None:
    """relpfad relativ zu 1_Projekte ('01_Laufend/1338_x/00_Vertrag/Angebot.docx')."""
    basis = webdav_basis()
    endung = ("." + relpfad.rsplit(".", 1)[-1].lower()) if "." in relpfad else ""
    schema = SCHEMATA.get(endung)
    if not basis or not schema:
        return None
    url = f"{basis}/{quote(relpfad.strip('/'))}"
    return {"schema": schema, "uri": f"{schema}:ofe|u|{url}", "webdav": url}


def api_basis(request) -> str:
    """Oeffentliche Basis fuer WOPI-URLs: PUBLIC_BASE_URL aus .env, sonst aus dem Request
    (nginx setzt X-Forwarded-Proto/Host)."""
    fest = env("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if fest:
        return fest
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    return f"{proto}://{host}"
