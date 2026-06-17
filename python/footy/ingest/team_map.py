"""
Single source of truth for team name normalization.

Keys are raw name strings as they appear in external data sources (Kaggle CSV,
API-Football API responses). Values are FIFA three-letter codes matching
teams.id in the database, or None for explicitly known non-qualifiers.

Usage:
    from footy.ingest.team_map import resolve

    team_id = resolve("United States")  # -> "USA"
    team_id = resolve("Gibraltar")      # -> None  (known non-qualifier)
    team_id = resolve("Zembla FC")      # raises KeyError  (unknown name: add it here)

When resolve() raises KeyError, find the exact string being returned by the
data source, add it to TEAM_NAME_MAP below, and re-run ingestion.
"""

from __future__ import annotations

import psycopg

# fmt: off
TEAM_NAME_MAP: dict[str, str | None] = {

    # -------------------------------------------------------------------------
    # CONCACAF (6 WC 2026 qualifiers)
    # -------------------------------------------------------------------------
    "United States":           "USA",
    "USA":                     "USA",
    "Canada":                  "CAN",
    "Mexico":                  "MEX",
    "Panama":                  "PAN",
    "Haiti":                   "HAI",
    "Curaçao":                 "CUW",
    "Curacao":                 "CUW",

    # CONCACAF non-qualifiers
    "Costa Rica":              None,   # did not qualify for WC 2026
    "Jamaica":                 None,   # did not qualify for WC 2026
    "Honduras":                None,
    "El Salvador":             None,
    "Trinidad and Tobago":     None,
    "Netherlands Antilles":    None,   # former name until 2010, used in results.csv
    "Guatemala":               None,
    "Nicaragua":               None,
    "Cuba":                    None,
    "Barbados":                None,
    "Belize":                  None,
    "Martinique":              None,
    "Guadeloupe":              None,
    "Bermuda":                 None,
    "Antigua and Barbuda":     None,
    "Dominican Republic":      None,
    "Saint Kitts and Nevis":   None,
    "Saint Lucia":             None,
    "Saint Vincent and the Grenadines": None,
    "Suriname":                None,
    "Grenada":                 None,
    "Montserrat":              None,
    "Cayman Islands":          None,
    "Aruba":                   None,
    "Puerto Rico":             None,
    "US Virgin Islands":       None,
    "British Virgin Islands":  None,
    "Anguilla":                None,
    "Turks and Caicos Islands": None,

    # -------------------------------------------------------------------------
    # CONMEBOL (6 WC 2026 qualifiers)
    # -------------------------------------------------------------------------
    "Argentina":               "ARG",
    "Brazil":                  "BRA",
    "Colombia":                "COL",
    "Uruguay":                 "URU",
    "Ecuador":                 "ECU",
    "Paraguay":                "PAR",

    # CONMEBOL non-qualifiers
    "Chile":                   None,
    "Venezuela":               None,
    "Peru":                    None,
    "Bolivia":                 None,

    # -------------------------------------------------------------------------
    # UEFA (16 WC 2026 qualifiers)
    # -------------------------------------------------------------------------
    "Germany":                 "GER",
    "France":                  "FRA",
    "England":                 "ENG",
    "Spain":                   "ESP",
    "Portugal":                "POR",
    "Netherlands":             "NED",
    "Belgium":                 "BEL",
    "Croatia":                 "CRO",
    "Austria":                 "AUT",
    "Switzerland":             "SUI",
    "Scotland":                "SCO",
    "Turkey":                  "TUR",
    "Türkiye":                 "TUR",   # FIFA official spelling post-2022
    "Czech Republic":          "CZE",
    "Czechia":                 "CZE",
    "Norway":                  "NOR",
    "Sweden":                  "SWE",
    "Bosnia and Herzegovina":  "BIH",
    "Bosnia-Herzegovina":      "BIH",   # football-data.org spelling
    "Bosnia & Herzegovina":    "BIH",

    # UEFA non-qualifiers
    "Slovakia":                None,   # did not qualify for WC 2026
    "Italy":                   None,   # did not qualify for WC 2026
    "Denmark":                 None,   # did not qualify for WC 2026
    "Wales":                   None,
    "Serbia":                  None,
    "Serbia and Montenegro":   None,   # former name, used 2003-2006 in results.csv
    "FR Yugoslavia":           None,   # former name, used until 2003 in results.csv
    "Poland":                  None,
    "Finland":                 None,
    "Greece":                  None,
    "Hungary":                 None,
    "Romania":                 None,
    "Bulgaria":                None,
    "Ukraine":                 None,
    "Russia":                  None,
    "Northern Ireland":        None,
    "Republic of Ireland":     None,
    "Ireland":                 None,
    "Israel":                  None,
    "Albania":                 None,
    "Georgia":                 None,
    "Iceland":                 None,
    "Luxembourg":              None,
    "Montenegro":              None,
    "Kosovo":                  None,
    "North Macedonia":         None,
    "Macedonia":               None,   # former name until 2018, used in results.csv
    "Slovenia":                None,
    "Moldova":                 None,
    "Armenia":                 None,
    "Azerbaijan":              None,
    "Belarus":                 None,
    "Estonia":                 None,
    "Latvia":                  None,
    "Lithuania":               None,
    "Kazakhstan":              None,
    "Gibraltar":               None,
    "Andorra":                 None,
    "San Marino":              None,
    "Malta":                   None,
    "Liechtenstein":           None,
    "Cyprus":                  None,
    "Faroe Islands":           None,

    # -------------------------------------------------------------------------
    # CAF (9 WC 2026 qualifiers)
    # -------------------------------------------------------------------------
    "Morocco":                 "MAR",
    "Senegal":                 "SEN",
    "Egypt":                   "EGY",
    "Ivory Coast":             "CIV",
    "Côte d'Ivoire":           "CIV",
    "Cote d'Ivoire":           "CIV",
    "South Africa":            "RSA",
    "Ghana":                   "GHA",
    "DR Congo":                "COD",
    "Congo DR":                "COD",
    "Democratic Republic of Congo": "COD",
    "Democratic Republic of the Congo": "COD",
    "Algeria":                 "ALG",
    "Tunisia":                 "TUN",
    "Cape Verde":              "CPV",
    "Cabo Verde":              "CPV",
    "Cape Verde Islands":      "CPV",   # football-data.org spelling

    # CAF non-qualifiers
    "Nigeria":                 None,   # did not qualify for WC 2026
    "Cameroon":                None,   # did not qualify for WC 2026
    "Mali":                    None,
    "Guinea":                  None,
    "Zimbabwe":                None,
    "Uganda":                  None,
    "Kenya":                   None,
    "Tanzania":                None,
    "Ethiopia":                None,
    "Rwanda":                  None,
    "Mozambique":              None,
    "Zambia":                  None,
    "Angola":                  None,
    "Togo":                    None,
    "Benin":                   None,
    "Burkina Faso":            None,
    "Congo":                   None,
    "Gabon":                   None,
    "Libya":                   None,
    "Sudan":                   None,
    "Eritrea":                 None,
    "Mauritania":              None,
    "Niger":                   None,
    "Namibia":                 None,
    "Botswana":                None,
    "Lesotho":                 None,
    "Eswatini":                None,
    "Swaziland":               None,
    "Sierra Leone":            None,
    "Liberia":                 None,
    "Guinea-Bissau":           None,
    "Gambia":                  None,
    "Equatorial Guinea":       None,
    "Central African Republic": None,
    "Comoros":                 None,
    "Djibouti":                None,
    "Madagascar":              None,
    "Malawi":                  None,
    "Mauritius":               None,
    "Seychelles":              None,
    "Somalia":                 None,
    "South Sudan":             None,
    "Chad":                    None,
    "Burundi":                 None,

    # -------------------------------------------------------------------------
    # AFC (8 WC 2026 qualifiers)
    # -------------------------------------------------------------------------
    "Japan":                   "JPN",
    "Korea Republic":          "KOR",
    "South Korea":             "KOR",
    "Australia":               "AUS",
    "Iran":                    "IRN",
    "Saudi Arabia":            "KSA",
    "Iraq":                    "IRQ",
    "Jordan":                  "JOR",
    "Qatar":                   "QAT",
    "Uzbekistan":              "UZB",

    # AFC non-qualifiers
    "Indonesia":               None,   # did not qualify for WC 2026
    "China":                   None,
    "China PR":                None,
    "UAE":                     None,
    "United Arab Emirates":    None,
    "Bahrain":                 None,
    "Oman":                    None,
    "Kuwait":                  None,
    "Vietnam":                 None,
    "Thailand":                None,
    "Malaysia":                None,
    "Philippines":             None,
    "Singapore":               None,
    "Myanmar":                 None,
    "India":                   None,
    "Bangladesh":              None,
    "Pakistan":                None,
    "Nepal":                   None,
    "Sri Lanka":               None,
    "Lebanon":                 None,
    "Syria":                   None,
    "Palestine":               None,
    "Yemen":                   None,
    "Tajikistan":              None,
    "Kyrgyzstan":              None,
    "Turkmenistan":            None,
    "Mongolia":                None,
    "North Korea":             None,
    "Korea DPR":               None,
    "Hong Kong":               None,
    "Chinese Taipei":          None,
    "Taiwan":                  None,
    "Guam":                    None,
    "Afghanistan":             None,
    "Cambodia":                None,
    "Laos":                    None,
    "Maldives":                None,
    "Bhutan":                  None,
    "Timor-Leste":             None,
    "Brunei":                  None,

    # -------------------------------------------------------------------------
    # OFC (1 WC 2026 qualifier)
    # -------------------------------------------------------------------------
    "New Zealand":             "NZL",

    # OFC non-qualifiers
    "Fiji":                    None,
    "Papua New Guinea":        None,
    "Solomon Islands":         None,
    "Tahiti":                  None,
    "Vanuatu":                 None,
    "Samoa":                   None,
    "American Samoa":          None,
    "Tonga":                   None,
    "Cook Islands":            None,
    "New Caledonia":           None,

}
# fmt: on


def resolve(raw: str) -> str | None:
    """
    Map a raw team name to a FIFA three-letter code.

    Returns None for known non-qualifiers (caller should skip that record).
    Raises KeyError for unknown names (add the name to TEAM_NAME_MAP above).
    """
    if raw not in TEAM_NAME_MAP:
        raise KeyError(
            f"Unknown team name {raw!r}. "
            "Add it to footy/ingest/team_map.py::TEAM_NAME_MAP before re-running."
        )
    return TEAM_NAME_MAP[raw]


def seed_name_map(conn: psycopg.Connection) -> int:
    """
    Insert all TEAM_NAME_MAP entries into the team_name_map database table.

    Idempotent: ON CONFLICT DO NOTHING. Returns the number of new rows inserted.
    """
    rows = list(TEAM_NAME_MAP.items())
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO team_name_map (raw_name, team_id) VALUES (%s, %s) "
            "ON CONFLICT (raw_name) DO NOTHING",
            rows,
        )
        inserted = cur.rowcount
    conn.commit()
    return inserted
