"""Auditlog: jede schreibende Aktion, auch die abgelehnte, hinterlaesst eine Zeile."""

import hashlib
import json

from psycopg.types.json import Jsonb


def nutzlast_hash(nutzlast: dict) -> str:
    kanonisch = json.dumps(nutzlast, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(kanonisch.encode("utf-8")).hexdigest()


def audit_schreiben(conn, akteur: str, aktion: str, erfolg: bool, nutzlast: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO auditlog (akteur, aktion, erfolg, nutzlast_hash, detail)"
            " VALUES (%s, %s, %s, %s, %s)",
            (akteur, aktion, erfolg, nutzlast_hash(nutzlast),
             Jsonb(json.loads(json.dumps(nutzlast, default=str)))),
        )
