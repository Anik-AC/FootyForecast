"""
Market name mapping: FIFA team codes to human-readable names used by
prediction markets, plus helpers to match market titles to fixture IDs.

Polymarket and Kalshi use full team names (not FIFA codes) in their market
questions. This module provides the lookup and matching logic.
"""

from __future__ import annotations

# FIFA code -> primary market display name.
# Covers all 48 WC 2026 qualifiers. Spellings match Polymarket conventions
# observed in WC 2022 and WC 2026 markets.
TEAM_MARKET_NAMES: dict[str, str] = {
    # CONCACAF
    "USA": "United States",
    "CAN": "Canada",
    "MEX": "Mexico",
    "PAN": "Panama",
    "HAI": "Haiti",
    "CUW": "Curacao",
    # CONMEBOL
    "ARG": "Argentina",
    "BRA": "Brazil",
    "COL": "Colombia",
    "URU": "Uruguay",
    "ECU": "Ecuador",
    "PAR": "Paraguay",
    # UEFA
    "GER": "Germany",
    "FRA": "France",
    "ENG": "England",
    "ESP": "Spain",
    "POR": "Portugal",
    "NED": "Netherlands",
    "BEL": "Belgium",
    "CRO": "Croatia",
    "AUT": "Austria",
    "SUI": "Switzerland",
    "SCO": "Scotland",
    "TUR": "Turkey",
    "CZE": "Czech Republic",
    "NOR": "Norway",
    "SWE": "Sweden",
    "BIH": "Bosnia-Herzegovina",
    # CAF
    "MAR": "Morocco",
    "SEN": "Senegal",
    "EGY": "Egypt",
    "CIV": "Ivory Coast",
    "RSA": "South Africa",
    "GHA": "Ghana",
    "COD": "DR Congo",
    "ALG": "Algeria",
    "TUN": "Tunisia",
    "CPV": "Cape Verde",
    # AFC
    "JPN": "Japan",
    "KOR": "South Korea",
    "AUS": "Australia",
    "IRN": "Iran",
    "KSA": "Saudi Arabia",
    "IRQ": "Iraq",
    "JOR": "Jordan",
    "QAT": "Qatar",
    "UZB": "Uzbekistan",
    # OFC
    "NZL": "New Zealand",
}

# Additional aliases: alternate spellings that prediction markets have used.
# Used in market title matching, not in outbound search queries.
_ALIASES: dict[str, str] = {
    "usa":                 "USA",
    "united states":       "USA",
    "korea republic":      "KOR",
    "republic of korea":   "KOR",
    "south korea":         "KOR",
    "ivory coast":         "CIV",
    "cote d'ivoire":       "CIV",
    "côte d'ivoire":       "CIV",
    "cote divoire":        "CIV",
    "dr congo":            "COD",
    "dem. rep. congo":     "COD",
    "bosnia":              "BIH",
    "bosnia and herzegovina": "BIH",
    "cape verde islands":  "CPV",
    "cape verde":          "CPV",
    "curacao":             "CUW",
    "curaçao":             "CUW",
}


def market_name(team_id: str) -> str:
    """Return the market display name for a FIFA team code."""
    try:
        return TEAM_MARKET_NAMES[team_id]
    except KeyError as exc:
        raise KeyError(f"No market name for team '{team_id}'") from exc


def _normalize(s: str) -> str:
    """Lowercase, strip punctuation used in team names."""
    return s.lower().replace(".", "").replace("-", " ").strip()


def team_id_from_name(raw: str) -> str | None:
    """
    Resolve a raw market team name to a FIFA code.

    Returns None if the name is not recognized (non-qualifier or new spelling).
    Raises nothing: unknown names are the caller's problem to log.
    """
    norm = _normalize(raw)

    # Direct alias lookup first.
    if norm in _ALIASES:
        return _ALIASES[norm]

    # Reverse lookup in TEAM_MARKET_NAMES.
    for code, name in TEAM_MARKET_NAMES.items():
        if _normalize(name) == norm:
            return code

    return None


def market_search_query(home_id: str, away_id: str) -> str:
    """
    Build a search query string for Polymarket/Kalshi event search APIs.

    Uses both full names so the search engine can match either occurrence in
    the market title, e.g. "Brazil vs Argentina" or "Argentina v Brazil".
    """
    home = market_name(home_id)
    away = market_name(away_id)
    return f"{home} {away}"


def match_market_to_fixture(
    title: str,
    home_id: str,
    away_id: str,
) -> bool:
    """
    Return True if a market title plausibly refers to this fixture.

    Checks that both team names (or known aliases) appear in the title.
    Case-insensitive. Does not check order (some markets say "Away vs Home").
    """
    norm_title = _normalize(title)
    home_name = _normalize(market_name(home_id))
    away_name = _normalize(market_name(away_id))

    # Check primary names.
    if home_name in norm_title and away_name in norm_title:
        return True

    # Try aliases for home.
    home_alts = {k for k, v in _ALIASES.items() if v == home_id}
    home_alts.add(home_name)
    away_alts = {k for k, v in _ALIASES.items() if v == away_id}
    away_alts.add(away_name)

    return any(h in norm_title for h in home_alts) and any(a in norm_title for a in away_alts)
