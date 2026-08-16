"""
leerlauf — wann ein Lauf fertig ist, obwohl noch Zeit übrig wäre.

Ein Leerlauf endet nicht zu einer bekannten ZEIT, sondern in einem
ZUSTAND. Gemessen wird das an der Volumenreihe, die das Funktionsobjekt
`water_volume` ohnehin fortlaufend schreibt — hier steht nur die
Entscheidung, ohne Dateien und ohne Solver, damit sie prüfbar ist.

Reist im Bundle mit (stdlib only, kein pydantic-Import nötig).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Kriterium:
    """Die Parameter aus `solver.abbruch` — bewusst als schlichte Werte,
    damit der Wächter im Container keine Spec-Klasse braucht."""
    fenster_s: float = 30.0
    schwelle: float = 0.01          # Anteil von V_start je Fenster
    mindest_abfall: float = 0.05    # Anlaufsperre


def stagnation_erreicht(zeiten, volumen, k: Kriterium
                        ) -> tuple[bool, str | None]:
    """
    Prüft die Volumenreihe eines laufenden Falls.

    Rückgabe ``(fertig, grund)``; ``grund`` ist ein fertiger Klartext für
    Protokoll und Manifest, damit später niemand raten muss, warum der Lauf
    endete.

    Gemessen wird die SPANNE im Fenster (größter minus kleinster Wert),
    nicht die Differenz der beiden Endpunkte. Ein Test hat gezeigt, warum:
    schwankt das Volumen — etwa weil eine Restwelle im Becken hin- und
    herschwappt —, sind Anfangs- und Endwert eines Fensters zufällig
    gleich, und der Lauf würde mitten in der Bewegung für „fertig" erklärt.
    Die Spanne sieht die Bewegung unabhängig von der Phase.

    Die beiden Sicherungen, ohne die das Kriterium falsch auslöst:

    1. **Anlaufsperre.** Zu Beginn steht das Wasser still, bevor der
       Auslass anspringt — die Volumenänderung ist dann winzig und das
       Kriterium wäre bei t≈0 erfüllt. Stagnation zählt deshalb erst,
       nachdem das Volumen einmal um ``mindest_abfall`` gefallen ist.
    2. **Vollständiges Fenster.** Gemessen wird nur, wenn die Reihe
       wirklich über ``fenster_s`` zurückreicht; sonst maße man den
       Anlauf mit und bekäme eine zufällige Antwort.
    """
    if len(zeiten) < 2 or len(zeiten) != len(volumen):
        return False, None
    v_start = max(volumen[0], 0.0)
    if v_start <= 0:
        return False, None

    t_jetzt = zeiten[-1]
    v_jetzt = volumen[-1]

    # (1) Anlaufsperre: ist überhaupt schon etwas abgelaufen?
    if v_jetzt > v_start * (1.0 - k.mindest_abfall):
        return False, None

    # (2) Fenster: den Messpunkt suchen, der fenster_s zurückliegt
    ziel = t_jetzt - k.fenster_s
    if zeiten[0] > ziel:
        return False, None                      # Reihe reicht nicht zurück
    i = len(zeiten) - 1
    while i > 0 and zeiten[i - 1] >= ziel:
        i -= 1

    fenster = volumen[i:]
    aenderung = max(fenster) - min(fenster)     # Spanne, nicht Differenz
    if aenderung >= k.schwelle * v_start:
        return False, None

    rest = v_jetzt / v_start
    return True, (
        f"Leerlauf beendet bei t = {t_jetzt:g} s: das Restvolumen hat sich "
        f"über {k.fenster_s:g} s nur noch um {aenderung:.4g} m³ bewegt "
        f"({aenderung / v_start:.2%} des Startvolumens, Grenze "
        f"{k.schwelle:.2%}). Es stehen noch {rest:.1%} von "
        f"{v_start:.4g} m³ — abgelaufen ist, was ablaufen kann.")


def volumenreihe_lesen(case_dir) -> tuple[list[float], list[float]]:
    """
    Die laufend geschriebene Volumenreihe aus dem Fall lesen
    (``postProcessing/water_volume/<startzeit>/volFieldValue.dat``).

    Auch bei parallelen Läufen schreibt OpenFOAM postProcessing in die
    Fallwurzel, nicht in die processor*-Ordner — die Datei ist also
    während des Laufs lesbar, ohne irgendetwas zu rekonstruieren.
    Neustartordner (Wiederaufnahme) werden zusammengeführt.
    """
    from pathlib import Path

    wurzel = Path(case_dir) / "postProcessing" / "water_volume"
    if not wurzel.is_dir():
        return [], []
    paare: dict[float, float] = {}
    for ordner in sorted(wurzel.iterdir()):
        datei = ordner / "volFieldValue.dat"
        if not datei.is_file():
            continue
        try:
            text = datei.read_text(errors="replace")
        except OSError:
            continue
        for zeile in text.splitlines():
            zeile = zeile.strip()
            if not zeile or zeile.startswith("#"):
                continue
            teile = zeile.split()
            if len(teile) < 2:
                continue
            try:
                # spätere Ordner (Neustart) überschreiben frühere Zeiten
                paare[float(teile[0])] = float(teile[1])
            except ValueError:
                continue
    if not paare:
        return [], []
    zeiten = sorted(paare)
    return zeiten, [paare[t] for t in zeiten]
