-- =============================================================================
-- FootyForecast: Seed data
--
-- Contains stable reference data: the WC2026 tournament record and the 48
-- qualified teams.
--
-- IMPORTANT: The team list below is best-effort based on publicly available
-- qualification results. Verify all entries against an authoritative source
-- (FIFA API, Opta, or your chosen fixture data feed) before running the model.
-- FIFA three-letter codes and team names should match exactly what the fixture
-- feed uses, or ingestion will fail on FK lookups.
--
-- Group stage fixtures (all 72 matches) are NOT in this file. Fixture
-- metadata (venue, exact kickoff times, team assignments) is sourced from the
-- fixture data feed in the ingestion pipeline (milestone 2) so it stays in
-- sync with the authoritative source rather than being hardcoded here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tournament
-- ---------------------------------------------------------------------------

INSERT INTO tournaments (id, name, start_date, end_date) VALUES
    ('WC2026', 'FIFA World Cup 2026', '2026-06-11', '2026-07-19');


-- ---------------------------------------------------------------------------
-- Teams
-- Listed by confederation. Count: 6 CONCACAF + 6 CONMEBOL + 16 UEFA +
-- 9 CAF + 8 AFC + 1 OFC = 46 direct qualifiers.
-- The 2 intercontinental playoff winners are marked as TODO below.
-- ---------------------------------------------------------------------------

INSERT INTO teams (id, name, short_name, confederation, fifa_code) VALUES

    -- CONCACAF (6): 3 hosts + 3 additional qualifiers
    ('USA', 'United States',   'USA',     'CONCACAF', 'USA'),
    ('CAN', 'Canada',          'Canada',  'CONCACAF', 'CAN'),
    ('MEX', 'Mexico',          'Mexico',  'CONCACAF', 'MEX'),
    ('PAN', 'Panama',          'Panama',  'CONCACAF', 'PAN'),
    ('CRC', 'Costa Rica',      'C Rica',  'CONCACAF', 'CRC'),
    ('JAM', 'Jamaica',         'Jamaica', 'CONCACAF', 'JAM'), -- verify: may be HON

    -- CONMEBOL (6)
    ('ARG', 'Argentina',       'ARG',     'CONMEBOL', 'ARG'),
    ('BRA', 'Brazil',          'Brazil',  'CONMEBOL', 'BRA'),
    ('COL', 'Colombia',        'COL',     'CONMEBOL', 'COL'),
    ('URU', 'Uruguay',         'Uruguay', 'CONMEBOL', 'URU'),
    ('ECU', 'Ecuador',         'Ecuador', 'CONMEBOL', 'ECU'),
    ('PAR', 'Paraguay',        'PAR',     'CONMEBOL', 'PAR'), -- verify: may be VEN or CHI

    -- UEFA (16)
    ('GER', 'Germany',         'GER',     'UEFA', 'GER'),
    ('FRA', 'France',          'France',  'UEFA', 'FRA'),
    ('ENG', 'England',         'England', 'UEFA', 'ENG'),
    ('ESP', 'Spain',           'Spain',   'UEFA', 'ESP'),
    ('POR', 'Portugal',        'POR',     'UEFA', 'POR'),
    ('NED', 'Netherlands',     'NED',     'UEFA', 'NED'),
    ('BEL', 'Belgium',         'Belgium', 'UEFA', 'BEL'),
    ('ITA', 'Italy',           'Italy',   'UEFA', 'ITA'),
    ('CRO', 'Croatia',         'Croatia', 'UEFA', 'CRO'),
    ('AUT', 'Austria',         'Austria', 'UEFA', 'AUT'),
    ('SUI', 'Switzerland',     'SUI',     'UEFA', 'SUI'),
    ('DEN', 'Denmark',         'Denmark', 'UEFA', 'DEN'),
    ('SCO', 'Scotland',        'Scotland','UEFA', 'SCO'),
    ('TUR', 'Turkey',          'Turkey',  'UEFA', 'TUR'),
    ('CZE', 'Czech Republic',  'CZE',     'UEFA', 'CZE'),
    ('SVK', 'Slovakia',        'SVK',     'UEFA', 'SVK'),

    -- CAF (9)
    ('MAR', 'Morocco',         'MAR',     'CAF', 'MAR'),
    ('NGA', 'Nigeria',         'Nigeria', 'CAF', 'NGA'),
    ('SEN', 'Senegal',         'Senegal', 'CAF', 'SEN'),
    ('EGY', 'Egypt',           'Egypt',   'CAF', 'EGY'),
    ('CMR', 'Cameroon',        'CMR',     'CAF', 'CMR'),
    ('CIV', 'Cote d''Ivoire',  'CIV',     'CAF', 'CIV'),
    ('RSA', 'South Africa',    'RSA',     'CAF', 'RSA'),
    ('GHA', 'Ghana',           'Ghana',   'CAF', 'GHA'),
    ('COD', 'DR Congo',        'COD',     'CAF', 'COD'), -- verify: may be MLI, TUN, or ALG

    -- AFC (8)
    ('JPN', 'Japan',           'Japan',   'AFC', 'JPN'),
    ('KOR', 'Korea Republic',  'Korea',   'AFC', 'KOR'),
    ('AUS', 'Australia',       'AUS',     'AFC', 'AUS'),
    ('IRN', 'Iran',            'Iran',    'AFC', 'IRN'),
    ('KSA', 'Saudi Arabia',    'KSA',     'AFC', 'KSA'),
    ('IRQ', 'Iraq',            'Iraq',    'AFC', 'IRQ'),
    ('JOR', 'Jordan',          'Jordan',  'AFC', 'JOR'),
    ('IDN', 'Indonesia',       'IDN',     'AFC', 'IDN'), -- verify: may be UZB or QAT

    -- OFC (1)
    ('NZL', 'New Zealand',     'NZL',     'OFC', 'NZL');

-- TODO: Add the 2 intercontinental playoff winners. The playoff involved teams
-- from multiple confederations competing for 2 remaining spots. Populate these
-- rows from the fixture data feed or the official FIFA source before running
-- any predictions.
--
-- Template:
--   INSERT INTO teams (id, name, short_name, confederation, fifa_code) VALUES
--       ('XXX', 'Team Name', 'Short', 'CONFEDERATION', 'XXX');
