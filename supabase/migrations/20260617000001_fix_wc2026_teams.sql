-- Fix WC 2026 team roster.
--
-- The initial seed incorrectly included 8 teams that did not qualify and
-- omitted 10 that did. This migration corrects the teams table and the
-- team_name_map entries that reference those team IDs.
--
-- Teams removed (did not qualify for WC 2026):
--   CRC (Costa Rica), JAM (Jamaica), ITA (Italy), DEN (Denmark),
--   SVK (Slovakia), NGA (Nigeria), CMR (Cameroon), IDN (Indonesia)
--
-- Teams added (actual WC 2026 qualifiers):
--   HAI (Haiti), CUW (Curaçao), NOR (Norway), SWE (Sweden),
--   BIH (Bosnia-Herzegovina), ALG (Algeria), TUN (Tunisia),
--   CPV (Cape Verde Islands), QAT (Qatar), UZB (Uzbekistan)

BEGIN;

-- Step 1: Nullify team_name_map references to removed teams.
-- (Cannot delete from teams while FK references exist in team_name_map.)
UPDATE team_name_map
SET team_id = NULL
WHERE team_id IN ('CRC', 'JAM', 'ITA', 'DEN', 'SVK', 'NGA', 'CMR', 'IDN');

-- Step 2: Remove the wrong teams from the teams table.
DELETE FROM teams WHERE id IN ('CRC', 'JAM', 'ITA', 'DEN', 'SVK', 'NGA', 'CMR', 'IDN');

-- Step 3: Insert the 10 missing qualifiers.
-- ON CONFLICT DO NOTHING makes this safe to re-run.
INSERT INTO teams (id, name, short_name, confederation, fifa_code) VALUES
    ('HAI', 'Haiti',               'Haiti',   'CONCACAF', 'HAI'),
    ('CUW', 'Curaçao',             'Curaçao', 'CONCACAF', 'CUW'),
    ('NOR', 'Norway',              'Norway',  'UEFA',     'NOR'),
    ('SWE', 'Sweden',              'Sweden',  'UEFA',     'SWE'),
    ('BIH', 'Bosnia-Herzegovina',  'BIH',     'UEFA',     'BIH'),
    ('ALG', 'Algeria',             'Algeria', 'CAF',      'ALG'),
    ('TUN', 'Tunisia',             'Tunisia', 'CAF',      'TUN'),
    ('CPV', 'Cape Verde Islands',  'CPV',     'CAF',      'CPV'),
    ('QAT', 'Qatar',               'Qatar',   'AFC',      'QAT'),
    ('UZB', 'Uzbekistan',          'UZB',     'AFC',      'UZB')
ON CONFLICT (id) DO NOTHING;

-- Step 4: Wire the name-map entries to the newly inserted team IDs.
-- These rows already exist in team_name_map (seeded from team_map.py)
-- but with NULL team_id because the team rows didn't exist yet.
UPDATE team_name_map SET team_id = 'HAI' WHERE raw_name IN ('Haiti');
UPDATE team_name_map SET team_id = 'CUW' WHERE raw_name IN ('Curaçao', 'Curacao');
UPDATE team_name_map SET team_id = 'NOR' WHERE raw_name IN ('Norway');
UPDATE team_name_map SET team_id = 'SWE' WHERE raw_name IN ('Sweden');
UPDATE team_name_map SET team_id = 'BIH' WHERE raw_name IN (
    'Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'Bosnia & Herzegovina'
);
UPDATE team_name_map SET team_id = 'ALG' WHERE raw_name IN ('Algeria');
UPDATE team_name_map SET team_id = 'TUN' WHERE raw_name IN ('Tunisia');
UPDATE team_name_map SET team_id = 'CPV' WHERE raw_name IN (
    'Cape Verde', 'Cabo Verde', 'Cape Verde Islands'
);
UPDATE team_name_map SET team_id = 'QAT' WHERE raw_name IN ('Qatar');
UPDATE team_name_map SET team_id = 'UZB' WHERE raw_name IN ('Uzbekistan');

COMMIT;
