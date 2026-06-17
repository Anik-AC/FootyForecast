# ADR-003: Ingestion data sources for historical results and live fixtures

**Date:** 2026-06-17
**Status:** accepted

## Context

PRD milestone 2 requires two categories of data:

1. Historical international results for model training (Elo computation, goal-rate estimation).
2. Live WC 2026 fixture metadata and real-time results as matches complete.

Several source options exist for each category and the choices have downstream
implications for schema design, data quality, and operational cost.

## Decision 1: Historical results

**Chosen source:** Kaggle dataset "International football results from 1872 to
present" (martj42/international-football-results-from-1872-to-2017).

Alternatives considered:

- API-Football historical data: possible via the same direct API used for WC
  2026 fixtures, but free tier (100 req/day) makes bulk backfill expensive.
  The Kaggle CSV covers the same time range in a single download.
- StatsBomb open data: covers fewer matches (mainly top European leagues) and
  does not have broad international coverage. Useful for xG features later
  (milestone 2 phase 2) but not a general results dataset.

Consequences: team names in the Kaggle CSV do not match FIFA codes or the
API-Football spellings, requiring a normalization layer. This is handled by
`footy/ingest/team_map.py`, which is the single source of truth for name
resolution. The `historical_matches` table stores raw team names (TEXT, no FK)
and name resolution happens at feature-computation time via the `team_name_map`
database table seeded from that dict.

The training window starts at 2002-01-01 (PRD decision). Rows before this
date are filtered at load time in `historical.py::_parse_row`.

## Decision 2: Live WC 2026 data

**Chosen source:** API-Football via direct access (api-football.com dashboard,
not RapidAPI wrapper).

The user obtained their key from `https://dashboard.api-football.com/`. This
gives access to the same API-Football v3 endpoint but with a direct key in the
`x-apisports-key` header, rather than the RapidAPI header pair. The base URL
is `https://v3.football.api-sports.io`.

League ID 1, season 2026 covers all WC 2026 matches. The response contains
fixture metadata (kickoff time, venue, round string) and results for completed
matches (goals, status code FT/AET/PEN).

The free tier allows 100 requests/day. The loader caches the full fixture list
to `data/wc2026_fixtures_cache.json` after the first call. Deleting the cache
file triggers a fresh API call on the next run.

Alternatives considered:

- FIFA official API: not publicly accessible.
- Manual entry: error-prone; not operationally viable for 104 matches.
- RapidAPI wrapper: the user's key was issued via the direct dashboard, so
  RapidAPI headers would not authenticate.

## Decision 3: xG / event data

Deferred. The PRD lists StatsBomb open data and FBref as candidates. StatsBomb
coverage of international matches is limited. A separate session will resolve
which source is used and add the corresponding ingestion pipeline once the
coverage question is settled. This ADR will be updated at that point.

## Consequences

The `historical_matches` schema (added in migration 20260617000000) uses TEXT
for team names and omits FK constraints, which is an intentional denormalization.
The `team_name_map` table and `footy/ingest/team_map.py` dict must be kept in
sync; the Python dict is authoritative and the database table is seeded from it.

Any team name that appears in a data source but is not in `TEAM_NAME_MAP` will
raise a `KeyError` loudly rather than silently being dropped. This is
intentional: silent drops during ingestion would produce missing training data
without any observable error, which could corrupt the model without a clear
signal.
