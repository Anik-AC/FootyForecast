"""Tests for footy.ingest.wc2026 and footy.ingest.team_map."""

from __future__ import annotations

import pytest

from footy.ingest.team_map import resolve
from footy.ingest.wc2026 import _group_letter, _stage_from_fd, build_fixture_id


# ---------------------------------------------------------------------------
# build_fixture_id  (football-data.org stage strings)
# ---------------------------------------------------------------------------

def test_build_fixture_id_group_stage():
    assert build_fixture_id(585396, "GROUP_STAGE") == "WC2026-GRP-585396"


def test_build_fixture_id_unknown_stage_defaults_to_grp():
    assert build_fixture_id(585397, "PRELIMINARY_ROUND") == "WC2026-GRP-585397"


def test_build_fixture_id_round_of_32():
    assert build_fixture_id(585420, "ROUND_OF_32") == "WC2026-R32-585420"


def test_build_fixture_id_round_of_16():
    assert build_fixture_id(585428, "ROUND_OF_16") == "WC2026-R16-585428"


def test_build_fixture_id_quarter_final():
    assert build_fixture_id(585432, "QUARTER_FINAL") == "WC2026-QF-585432"


def test_build_fixture_id_semi_final():
    assert build_fixture_id(585434, "SEMI_FINAL") == "WC2026-SF-585434"


def test_build_fixture_id_final():
    assert build_fixture_id(585436, "FINAL") == "WC2026-FIN-585436"


# ---------------------------------------------------------------------------
# _stage_from_fd
# ---------------------------------------------------------------------------

def test_stage_from_fd_group():
    assert _stage_from_fd("GROUP_STAGE") == "group"


def test_stage_from_fd_knockout_rounds():
    assert _stage_from_fd("ROUND_OF_32") == "round_of_32"
    assert _stage_from_fd("ROUND_OF_16") == "round_of_16"
    assert _stage_from_fd("QUARTER_FINAL") == "quarter_final"
    assert _stage_from_fd("SEMI_FINAL") == "semi_final"
    assert _stage_from_fd("FINAL") == "final"


def test_stage_from_fd_unknown_defaults_to_group():
    assert _stage_from_fd("UNKNOWN") == "group"


# ---------------------------------------------------------------------------
# _group_letter
# ---------------------------------------------------------------------------

def test_group_letter_parses_correctly():
    assert _group_letter("GROUP_A") == "A"
    assert _group_letter("GROUP_L") == "L"


def test_group_letter_returns_none_for_knockout():
    assert _group_letter(None) is None
    assert _group_letter("") is None


# ---------------------------------------------------------------------------
# team_map.resolve
# ---------------------------------------------------------------------------

def test_resolve_usa_variants():
    assert resolve("United States") == "USA"
    assert resolve("USA") == "USA"


def test_resolve_korea_variants():
    assert resolve("Korea Republic") == "KOR"
    assert resolve("South Korea") == "KOR"


def test_resolve_ivory_coast_variants():
    assert resolve("Ivory Coast") == "CIV"
    assert resolve("Côte d'Ivoire") == "CIV"
    assert resolve("Cote d'Ivoire") == "CIV"


def test_resolve_dr_congo_variants():
    assert resolve("DR Congo") == "COD"
    assert resolve("Congo DR") == "COD"
    assert resolve("Democratic Republic of Congo") == "COD"


def test_resolve_turkey_variants():
    assert resolve("Turkey") == "TUR"
    assert resolve("Türkiye") == "TUR"


def test_resolve_czechia_variants():
    assert resolve("Czech Republic") == "CZE"
    assert resolve("Czechia") == "CZE"


def test_resolve_former_names_post_2002():
    assert resolve("Serbia and Montenegro") is None
    assert resolve("FR Yugoslavia") is None
    assert resolve("Macedonia") is None
    assert resolve("Netherlands Antilles") is None


def test_resolve_nonqualifier_returns_none():
    assert resolve("Gibraltar") is None
    assert resolve("Chile") is None
    assert resolve("Wales") is None
    assert resolve("Russia") is None


def test_resolve_unknown_name_raises_key_error():
    with pytest.raises(KeyError, match="Unknown team name"):
        resolve("Zembla FC")


def test_resolve_all_wc2026_qualifiers():
    qualifiers = [
        # CONCACAF (6)
        "United States", "Canada", "Mexico", "Panama", "Haiti", "Curaçao",
        # CONMEBOL (6)
        "Argentina", "Brazil", "Colombia", "Uruguay", "Ecuador", "Paraguay",
        # UEFA (16)
        "Germany", "France", "England", "Spain", "Portugal", "Netherlands",
        "Belgium", "Croatia", "Austria", "Switzerland", "Scotland", "Turkey",
        "Czech Republic", "Norway", "Sweden", "Bosnia and Herzegovina",
        # CAF (10)
        "Morocco", "Senegal", "Egypt", "Ivory Coast", "South Africa",
        "Ghana", "DR Congo", "Algeria", "Tunisia", "Cape Verde",
        # AFC (9)
        "Japan", "Korea Republic", "Australia", "Iran", "Saudi Arabia",
        "Iraq", "Jordan", "Qatar", "Uzbekistan",
        # OFC (1)
        "New Zealand",
    ]
    for name in qualifiers:
        code = resolve(name)
        assert code is not None, f"Expected non-None FIFA code for qualifier {name!r}"
        assert len(code) == 3, f"Expected 3-letter FIFA code for {name!r}, got {code!r}"


def test_resolve_non_qualifiers_return_none():
    non_qualifiers = [
        "Costa Rica", "Jamaica",           # CONCACAF: missed out
        "Italy", "Denmark", "Slovakia",    # UEFA: missed out
        "Nigeria", "Cameroon",             # CAF: missed out
        "Indonesia",                       # AFC: missed out
    ]
    for name in non_qualifiers:
        assert resolve(name) is None, f"Expected None for non-qualifier {name!r}"
