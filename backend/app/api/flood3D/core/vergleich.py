"""
vergleich — worin sich zwei Läufe unterscheiden, in Worten statt in Hashes.

Gebraucht für die Laubkarten: dort werden ZWEI Läufe Zelle für Zelle
verschnitten (Ablagerung aus dem Leerlauf, Spülwirkung aus dem Schwall).
Dahinter stehen zwei ganz verschiedene Fragen, die vorher ein einziger
Hash beantworten sollte:

  1. Kann man die Karten überhaupt übereinanderlegen? — Passen die
     AUSGABERASTER Zelle auf Zelle? Exakt prüfbar und technisch zwingend.
  2. Ist es fachlich dasselbe Bauwerk? — Eine Beurteilung, keine Sperre.

Ein Hash sagt nur „gleich" oder „ungleich". Steht er auf ungleich, hilft
er nicht weiter; genau daran ist ein fertiges Leerlauf-/Schwall-Paar
gescheitert (2026-08-17). Deshalb hier zusätzlich die Unterschiede im
Klartext — aus „zwei verschiedene Netze" wird „Zufluss 0,0 gegen 0,8".

Reine Funktionen, keine Dateien, kein FastAPI (Bundle-Vertrag).
"""
from __future__ import annotations


def spec_unterschiede(a, b, pfad: str = "", grenze: int = 20) -> list[dict]:
    """
    Rekursiver Vergleich zweier Fall-Abbilder (``model_dump(mode="json")``
    oder Teile davon).

    Rückgabe: Liste von ``{"pfad", "a", "b"}`` in Fundreihenfolge, bei
    ``grenze`` abgeschnitten. Listen verschiedener Länge werden als EIN
    Unterschied gemeldet — eine Positionsdiagonale über verschieden lange
    Listen liefert nur Rauschen.
    """
    aus: list[dict] = []

    def lauf(x, y, p):
        if len(aus) >= grenze:
            return
        if isinstance(x, dict) and isinstance(y, dict):
            for k in sorted(set(x) | set(y)):
                lauf(x.get(k), y.get(k), f"{p}.{k}" if p else k)
        elif isinstance(x, list) and isinstance(y, list):
            if len(x) != len(y):
                aus.append({"pfad": p, "a": f"{len(x)} Einträge",
                            "b": f"{len(y)} Einträge"})
                return
            for i, (u, v) in enumerate(zip(x, y)):
                lauf(u, v, f"{p}[{i}]")
        elif x != y:
            aus.append({"pfad": p, "a": x, "b": y})

    lauf(a, b, pfad)
    return aus[:grenze]


def raster_gleich(a: dict | None, b: dict | None) -> dict:
    """
    Passen die AUSGABERASTER zweier Läufe Zelle auf Zelle?

    Verglichen wird nur die Grundrissebene (nx, ny, Ursprung, Zellgröße) —
    die Höhenschichtung darf abweichen, sie geht in die Karten nicht ein.

    Das ist die einzige HARTE Bedingung: dieselbe Zellnummer muss in
    beiden Läufen denselben Ort meinen. Sonst entsteht kein Fehler,
    sondern ein plausibel aussehendes Bild von zwei verschiedenen Orten.
    """
    if not a or not b:
        return {"gleich": False, "grund": "Rasterangaben fehlen."}
    try:
        da, db = list(a["dims"]), list(b["dims"])
        oa, ob = list(a["origin"]), list(b["origin"])
        sa, sb = list(a["spacing"]), list(b["spacing"])
    except (KeyError, TypeError):
        return {"gleich": False, "grund": "Rasterangaben unvollständig."}

    if da[:2] != db[:2]:
        return {"gleich": False,
                "grund": (f"Verschieden große Ausgaberaster "
                          f"({da[0]}×{da[1]} gegen {db[0]}×{db[1]} Zellen). "
                          "Das Viz-Gitter folgt einem Datenbudget und hängt "
                          "deshalb an Laufdauer und Schreibintervall — für "
                          "ein Kartenpaar müssen beide Läufe darin "
                          "übereinstimmen.")}
    eps = 1e-6
    for i in range(2):
        if abs(oa[i] - ob[i]) > eps or abs(sa[i] - sb[i]) > eps:
            return {"gleich": False,
                    "grund": ("Die Ausgaberaster liegen verschoben oder "
                              "haben verschiedene Zellgrößen — dieselbe "
                              "Zellnummer meint in beiden Läufen einen "
                              "anderen Ort.")}
    return {"gleich": True, "grund": ""}


def paar_stufe(raster_ok: bool, netz_gleich: bool,
               geometrie_stand: str) -> str:
    """
    Die Ampel für ein Laufpaar — eine BEURTEILUNG, keine Sperre.

    ``geometrie_stand``: ``gleich`` | ``verschieden`` | ``unbekannt``.

      grün  gleiches Netz — uneingeschränkt verschneidbar
      gelb  gleiche (oder unbekannte) Geometrie, andere Randbedingungen.
            Bei einem Leerlauf-/Schwall-Paar ist das der NORMALFALL: die
            beiden unterscheiden sich per Definition im Zufluss.
      rot   verschiedene Geometrie oder Raster — der Verschnitt vergleicht
            dann zwei verschiedene Bauwerke bzw. zwei verschiedene Orte.

    Ob gerechnet werden KANN, ist eine andere Frage: das entscheidet
    allein das Raster (siehe `raster_gleich`). Eine rote Ampel bei
    passendem Raster warnt, sperrt aber nicht — sonst säße man wieder
    fest, so wie vorher am Netz-Hash.
    """
    if not raster_ok:
        return "rot"
    if netz_gleich:
        return "gruen"
    if geometrie_stand == "verschieden":
        return "rot"
    return "gelb"
