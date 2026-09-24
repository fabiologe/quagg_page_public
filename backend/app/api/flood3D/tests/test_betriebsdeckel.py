"""Fahrplan B5: Zeitdeckel für Cloud-Läufe."""
from __future__ import annotations

from ..laufwerk import (ZEITDECKEL_HART_MAX_S, ZEITDECKEL_MIN_S,
                        ZEITDECKEL_VORGABE_MAX_S, zeitdeckel_s)
from ..probe.faelle import fall_k


def test_vorgabe_aus_der_laufschaetzung():
    spec = fall_k()
    assert zeitdeckel_s(spec, {"lauf": {"stunden": 1.0}}) == 3 * 3600
    assert zeitdeckel_s(spec, {"lauf": {"stunden": 0.001}}) == ZEITDECKEL_MIN_S
    assert zeitdeckel_s(spec, {"lauf": {"stunden": 10.0}}) == ZEITDECKEL_VORGABE_MAX_S
    # ohne Schätzung trotzdem ein Deckel — nie „unbegrenzt"
    assert zeitdeckel_s(spec, None) == ZEITDECKEL_VORGABE_MAX_S


def test_angabe_gilt_aber_nie_ueber_24_h():
    spec = fall_k()
    assert zeitdeckel_s(spec, {"lauf": {"stunden": 1.0}}, 600) == 600
    assert zeitdeckel_s(spec, None, 10 * 24 * 3600) == ZEITDECKEL_HART_MAX_S


def test_platte_pruefen_meldet_507(monkeypatch, tmp_path):
    import shutil as _sh

    import pytest
    from fastapi import HTTPException

    from .. import laufwerk
    monkeypatch.setattr(_sh, "disk_usage", lambda p: _sh._ntuple_diskusage(100e9, 99.5e9, 0.5e9))
    with pytest.raises(HTTPException) as e:
        laufwerk.platte_pruefen(tmp_path)
    assert e.value.status_code == 507 and "0.5 GB" in e.value.detail
    monkeypatch.setattr(_sh, "disk_usage", lambda p: _sh._ntuple_diskusage(100e9, 50e9, 50e9))
    laufwerk.platte_pruefen(tmp_path)                    # genug frei: still


def test_zweite_netzvorschau_wartet(monkeypatch):
    from .. import laufwerk
    monkeypatch.setattr(laufwerk, "_laufende_previews", {"anderer_fall"})
    assert len(laufwerk._laufende_previews) >= laufwerk.MAX_PREVIEWS
