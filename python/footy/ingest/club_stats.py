"""
Club player stats loader: 2025/26 FBref dataset (Kaggle).

The CSV contains per-player season stats across major leagues (Premier League,
La Liga, Bundesliga, Serie A, Ligue 1, etc.). We extract goal-scoring and
expected-goal metrics, filtered to players whose nation code is a WC 2026
qualifier.

Key column used: xG (expected goals from shot quality). This is available in
the 2025/26 dataset; the 2024/25 dataset lacks xG so we fall back to goals only
when xG is missing.

Usage:
    from footy.ingest.club_stats import load_club_xg
    df = load_club_xg()
    # columns: player_name, nation_code, pos_group, nineties, goals, xg, xg_per90
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from footy.ingest.team_map import TEAM_NAME_MAP

_DATA_DIR = Path(__file__).parent.parent.parent / "data" / "dataset"
_CSV_2526 = _DATA_DIR / "players_data-2025_2026.csv"
_CSV_2425 = _DATA_DIR / "players_data-2024_2025.csv"

# All WC 2026 qualifier 3-letter codes (values of TEAM_NAME_MAP that are not None).
_WC_CODES: frozenset[str] = frozenset(v for v in TEAM_NAME_MAP.values() if v is not None)

# FBref uses different codes for a handful of federations vs our FIFA codes.
# Map FBref code -> our team_id where they differ.
_CODE_REMAP: dict[str, str] = {
    "ENG": "ENG",   # England (FBref uses eng ENG)
    "SCO": "SCO",
    "WAL": None,    # Wales did not qualify; exclude
    "NIR": None,    # Northern Ireland
    "IRL": None,    # Republic of Ireland
    "RSA": "RSA",   # South Africa (FBref: za RSA)
    "CPV": "CPV",   # Cape Verde
    "CUW": "CUW",   # Curaçao
}


def _primary_pos(pos: str) -> str:
    """Return the primary position group from a possibly-combined string like 'MF,FW'."""
    if not isinstance(pos, str):
        return "MF"
    p = pos.strip().upper()
    if "GK" in p:
        return "GK"
    if "FW" in p:
        return "FW"
    if "MF" in p:
        return "MF"
    return "DF"


def load_club_xg(path: Path = _CSV_2526) -> pd.DataFrame:
    """
    Load and clean the 2025/26 club-stats CSV.

    Returns a DataFrame with columns:
        player_name   str   Player name as in FBref
        nation_code   str   3-letter FIFA code (matches teams.id)
        pos_group     str   GK / DF / MF / FW (primary position)
        nineties      float 90-minute periods played (season total)
        goals         int   Goals scored
        xg            float Expected goals (npxG preferred; falls back to Gls)
        xg_per90      float xg / nineties (floor: nineties >= 2)

    Players who appeared for multiple clubs are aggregated to season totals.
    Only WC 2026 nations are included. Minimum 2 appearances (nineties >= 2).
    """
    if not path.exists():
        raise FileNotFoundError(
            f"Club stats CSV not found at {path}. "
            "Place players_data-2025_2026.csv in python/data/dataset/."
        )

    # Columns that exist in the 2025/26 file
    wanted = {"Player", "Nation", "Pos", "90s", "Gls", "xG", "npxG"}
    df = pd.read_csv(path, usecols=lambda c: c in wanted, low_memory=False)

    # Extract 3-letter code from "fr FRA" → "FRA"
    df["nation_code"] = df["Nation"].str.extract(r"\b([A-Z]{3})\b")
    df = df.dropna(subset=["nation_code"])

    # Apply any known code remaps
    df["nation_code"] = df["nation_code"].map(
        lambda c: _CODE_REMAP.get(c, c)
    )
    df = df[df["nation_code"].notna()]

    # Filter to WC 2026 nations only
    df = df[df["nation_code"].isin(_WC_CODES)].copy()

    # Numeric columns
    for col in ("90s", "Gls", "xG", "npxG"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
        else:
            df[col] = 0.0

    # Primary position group
    df["pos_group"] = df["Pos"].apply(_primary_pos)

    # Prefer npxG (non-penalty xG) when available; else xG; else fall back to goals
    # npxG > 0 means the column has real values.
    if "npxG" in df.columns and df["npxG"].sum() > 0:
        df["xg_raw"] = df["npxG"]
    else:
        df["xg_raw"] = df["xG"]

    # Players who moved clubs mid-season appear multiple times — aggregate
    agg = (
        df.groupby(["Player", "nation_code", "pos_group"], as_index=False)
        .agg(
            nineties=("90s",     "sum"),
            goals=   ("Gls",     "sum"),
            xg=      ("xg_raw",  "sum"),
        )
    )

    # Minimum 2 90-minute periods played (≈ 180 min) to filter out unused squad fillers
    agg = agg[agg["nineties"] >= 2.0].copy()

    # Per-90 metrics (floor nineties to avoid division artifacts)
    agg["xg_per90"] = agg["xg"] / agg["nineties"].clip(lower=0.5)

    return agg.rename(columns={"Player": "player_name"}).reset_index(drop=True)
