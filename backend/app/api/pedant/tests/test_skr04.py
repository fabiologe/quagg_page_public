"""Haelt core/skr04.py (die Quelle) und 003_seed_skr04.sql (das Generat)
auf demselben Stand — wer die Kontenliste aendert, muss den Seed neu erzeugen
(cli.py skr04-sql), sonst faellt dieser Test."""

from pathlib import Path

from app.api.pedant.core import skr04


def test_seed_datei_ist_aus_der_quelle_generiert():
    datei = Path(__file__).parents[1] / "migrations" / "003_seed_skr04.sql"
    assert datei.read_text(encoding="utf-8") == skr04.seed_sql()


def test_kontenliste_ist_wohlgeformt():
    nummern = [kontonr for kontonr, _, _ in skr04.KONTEN]
    assert len(nummern) == len(set(nummern)), "doppelte Kontonummern"
    assert all(len(nr) == 4 and nr.isdigit() for nr in nummern)
