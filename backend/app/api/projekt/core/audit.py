"""Auditlog des Projektmoduls — gleiche Form wie beim Pedanten, eigenes Schema."""

import json

from psycopg.types.json import Jsonb

from app.api.pedant.core.audit import nutzlast_hash


def audit_schreiben(conn, akteur: str, aktion: str, erfolg: bool, nutzlast: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO projekt.auditlog (akteur, aktion, erfolg, nutzlast_hash, detail)"
            " VALUES (%s, %s, %s, %s, %s)",
            (akteur, aktion, erfolg, nutzlast_hash(nutzlast),
             Jsonb(json.loads(json.dumps(nutzlast, default=str)))),
        )
