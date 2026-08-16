"""
Leerlauf: der Lauf endet, wenn nichts mehr abläuft — nicht zur Uhrzeit.

Die Tests prüfen genau die Fälle, an denen ein solches Kriterium in der
Praxis scheitert: es löst am Anfang aus (da steht das Wasser noch still),
es löst bei Restpfützen nie aus, oder es reagiert auf Messrauschen.
"""
from __future__ import annotations

from ..core.leerlauf import Kriterium, stagnation_erreicht, volumenreihe_lesen


def _reihe(werte, dt=1.0):
    return [i * dt for i in range(len(werte))], list(werte)


def test_stagnation_greift_erst_wenn_wirklich_nichts_mehr_laeuft():
    # 100 m³ laufen ab, ab t=10 stehen 2 m³ als Restpfütze
    volumen = [100 - 10 * i for i in range(10)] + [2.0] * 40
    zeiten, v = _reihe(volumen)
    k = Kriterium(fenster_s=10, schwelle=0.01, mindest_abfall=0.05)

    fertig, grund = stagnation_erreicht(zeiten, v, k)

    assert fertig is True
    assert "Restvolumen" in grund and "2.0" in grund.replace(",", ".")


def test_loest_am_anfang_NICHT_aus():
    """
    Der wichtigste Test: vor dem Öffnen des Auslasses ändert sich nichts —
    ohne Anlaufsperre wäre der Lauf nach zwei Messpunkten „fertig".
    """
    zeiten, v = _reihe([100.0] * 40)          # Wasser steht, nichts läuft
    k = Kriterium(fenster_s=10, schwelle=0.01, mindest_abfall=0.05)
    assert stagnation_erreicht(zeiten, v, k) == (False, None)

    # auch ein winziger Anlauf reicht noch nicht (unter mindest_abfall)
    zeiten, v = _reihe([100.0 - 0.05 * i for i in range(40)])
    assert stagnation_erreicht(zeiten, v, k)[0] is False


def test_laeuft_weiter_solange_es_ablaeuft():
    zeiten, v = _reihe([100 - 2 * i for i in range(40)])   # stetig fallend
    k = Kriterium(fenster_s=10, schwelle=0.01, mindest_abfall=0.05)
    assert stagnation_erreicht(zeiten, v, k)[0] is False


def test_braucht_ein_vollstaendiges_fenster():
    """Kurz nach dem Start reicht die Reihe nicht zurück — dann wäre der
    Vergleich mit dem Startwert eine Zufallsantwort."""
    zeiten, v = _reihe([100.0, 80.0, 70.0])          # nur 2 s Reihe
    k = Kriterium(fenster_s=30, schwelle=0.01, mindest_abfall=0.05)
    assert stagnation_erreicht(zeiten, v, k)[0] is False


def test_messrauschen_haelt_den_lauf_nicht_ewig_am_leben():
    """Ein zappelnder Messwert um die Restpfütze herum darf das Kriterium
    nicht dauerhaft blockieren, solange er unter der Schwelle bleibt."""
    ruhe = [2.0 + (0.002 if i % 2 else -0.002) for i in range(40)]
    zeiten, v = _reihe([100 - 10 * i for i in range(10)] + ruhe)
    k = Kriterium(fenster_s=10, schwelle=0.01, mindest_abfall=0.05)
    assert stagnation_erreicht(zeiten, v, k)[0] is True

    # ein GROBES Zappeln (über der Schwelle) haelt ihn dagegen am Laufen
    unruhe = [2.0 + (3.0 if i % 2 else -1.0) for i in range(40)]
    zeiten, v = _reihe([100 - 10 * i for i in range(10)] + unruhe)
    assert stagnation_erreicht(zeiten, v, k)[0] is False


def test_leere_oder_kaputte_reihe_kippt_nichts():
    k = Kriterium()
    assert stagnation_erreicht([], [], k) == (False, None)
    assert stagnation_erreicht([0.0], [1.0], k) == (False, None)
    assert stagnation_erreicht([0.0, 1.0], [0.0, 0.0], k) == (False, None)


def test_volumenreihe_wird_aus_dem_laufenden_fall_gelesen(tmp_path):
    """Format wie OpenFOAM es schreibt, inklusive Kopfzeilen und eines
    Neustartordners (Wiederaufnahme überschreibt gleiche Zeiten)."""
    ordner = tmp_path / "postProcessing" / "water_volume"
    (ordner / "0").mkdir(parents=True)
    (ordner / "0" / "volFieldValue.dat").write_text(
        "# Region: all\n# Time \t volIntegrate(alpha.water)\n"
        "0\t100.0\n1\t90.0\n2\t80.0\n")
    (ordner / "2").mkdir()
    (ordner / "2" / "volFieldValue.dat").write_text(
        "# Time \t volIntegrate(alpha.water)\n2\t79.0\n3\t70.0\n")

    zeiten, volumen = volumenreihe_lesen(tmp_path)

    assert zeiten == [0.0, 1.0, 2.0, 3.0]
    assert volumen[2] == 79.0            # der Neustart gewinnt
    assert volumen[-1] == 70.0


def test_ohne_datei_keine_reihe(tmp_path):
    assert volumenreihe_lesen(tmp_path) == ([], [])


# ── Verdrahtung: Spec, Befunde, Schätzung ───────────────────────────────────

def _voller_fall(**abbruch):
    """Der Stufe-3-Fall hat Gebiet, Raender und Anfangswasser — der
    Minimalfixture nicht."""
    from ..core import casespec as cs
    from .test_stage3_preprocessing import build_spec_stage3
    spec = build_spec_stage3()
    if abbruch is not None:
        spec.solver.abbruch = cs.Abbruch(**abbruch)
    return spec


def test_abbruch_ist_optional_und_aendert_sonst_nichts():
    from ..core.foamfields import schaetzdauer
    from .test_stage3_preprocessing import build_spec_stage3

    spec = build_spec_stage3()
    assert spec.solver.abbruch is None                # Vorgabe: wie bisher
    assert schaetzdauer(spec) == spec.solver.end_time


def test_erwartete_dauer_haelt_das_gitter_fein():
    """
    Der stille Fallstrick: eine grosszuegige Obergrenze wuerde das
    Ausgabegitter vergroebern — ausgerechnet dort, wo die Laubkarten
    Aufloesung brauchen. Mit erwarteter Dauer bleibt es so fein wie bei
    einem kurzen Lauf.
    """
    from ..core.foamfields import schaetzdauer, viz_grid_for

    kurz = _voller_fall()
    kurz.solver.abbruch = None
    kurz.solver.write_interval_fields = 0.2           # sehr feine Ausgabe
    fein = viz_grid_for(kurz)

    lang = _voller_fall(erwartete_dauer_s=60.0)
    lang.solver.write_interval_fields = 0.2
    lang.solver.end_time = 36000.0                    # 10 h Obergrenze
    assert schaetzdauer(lang) == 60.0
    mit_erwartung = viz_grid_for(lang)

    ohne = _voller_fall()
    ohne.solver.abbruch = None
    ohne.solver.write_interval_fields = 0.2
    ohne.solver.end_time = 36000.0
    ohne_erwartung = viz_grid_for(ohne)

    assert mit_erwartung.dims == fein.dims      # so fein wie kurz
    assert ohne_erwartung.dims[0] < fein.dims[0]  # sonst vergroebert


def test_befund_wenn_es_nichts_zu_entleeren_gibt(tmp_path):
    from ..core.validate import validate_case

    spec = _voller_fall()
    spec.solver.initial_level = None
    spec.solver.vorfuellungen = []
    befunde = validate_case(spec, tmp_path)
    assert any(b["severity"] == "fehler" and "kein Wasser" in b["message"]
               for b in befunde)


def test_warnung_bei_dauerhaftem_zufluss(tmp_path):
    """Mit stetigem Zufluss wird nie stagniert — das muss dastehen, bevor
    jemand eine Nacht lang bis zur Obergrenze rechnet."""
    from ..core.validate import validate_case

    befunde = validate_case(_voller_fall(), tmp_path)
    assert any(b["severity"] == "warnung" and "nie leer" in b["message"]
               for b in befunde)


def test_warnung_wenn_das_fenster_kaum_messpunkte_hat(tmp_path):
    from ..core.validate import validate_case

    spec = _voller_fall(fenster_s=0.1)               # = ein Messpunkt
    befunde = validate_case(spec, tmp_path)
    assert any("Messpunkt" in b["message"] for b in befunde)


# ── Der Waechter im Runner ──────────────────────────────────────────────────

def _waechter_fall(tmp_path, volumen, dt=1.0):
    """Ein Fall auf der Platte, wie ihn der Solver hinterlaesst: controlDict
    zum Umschreiben und die laufend geschriebene Volumenreihe."""
    (tmp_path / "system").mkdir()
    (tmp_path / "system" / "controlDict").write_text(
        "application     interFoam;\nstopAt           endTime;\n"
        "endTime         600;\nrunTimeModifiable yes;\n")
    ordner = tmp_path / "postProcessing" / "water_volume" / "0"
    ordner.mkdir(parents=True)
    ordner.joinpath("volFieldValue.dat").write_text(
        "# Time \t volIntegrate(alpha.water)\n"
        + "".join(f"{i * dt:g}\t{v:g}\n" for i, v in enumerate(volumen)))


def _waechter(case, spec):
    import sys
    from pathlib import Path
    # Im Container ist `flood3D` oberste Ebene (Bundle-Vertrag) — hier muss
    # der Pfad dafuer erst gesetzt werden.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from ..engines.local.local_runner import LeerlaufWaechter
    w = LeerlaufWaechter(case, spec, min_intervall_s=0.0)
    return w


def test_waechter_haelt_den_solver_weich_an(tmp_path):
    """
    Der Hebel ist `stopAt writeNow` in der controlDict, nicht ein Kill:
    der Solver schreibt den laufenden Zeitschritt zu Ende und haelt sauber
    an — sonst waere der letzte Speicherpunkt halb geschrieben.
    """
    _waechter_fall(tmp_path, [100 - 10 * i for i in range(10)] + [2.0] * 40)
    spec = _voller_fall(fenster_s=10.0)
    w = _waechter(tmp_path, spec)

    w.tick()

    assert w.grund and "Leerlauf beendet" in w.grund
    assert w.ende_zeit == 49.0
    assert "stopAt          writeNow;" in (
        tmp_path / "system" / "controlDict").read_text()


def test_waechter_ohne_kriterium_fasst_nichts_an(tmp_path):
    """Ohne `abbruch` rechnet der Fall exakt wie bisher — auch dann, wenn
    die Volumenreihe laengst stagniert."""
    _waechter_fall(tmp_path, [100 - 10 * i for i in range(10)] + [2.0] * 40)
    spec = _voller_fall()
    spec.solver.abbruch = None
    w = _waechter(tmp_path, spec)

    w.tick()

    assert w.aktiv is False and w.grund is None
    assert "stopAt           endTime;" in (
        tmp_path / "system" / "controlDict").read_text()


def test_waechter_laesst_einen_laufenden_ablauf_in_ruhe(tmp_path):
    _waechter_fall(tmp_path, [100 - 2 * i for i in range(40)])
    w = _waechter(tmp_path, _voller_fall(fenster_s=10.0))

    w.tick()

    assert w.grund is None
    assert "writeNow" not in (tmp_path / "system" / "controlDict").read_text()
