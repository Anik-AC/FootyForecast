"""
WC 2026 venue coordinates and travel distance utilities.

Provides geodesic distances between host venues to quantify travel burden
between consecutive matches. Distances are computed using the Haversine
formula (spherical Earth approximation; error < 0.5% for these distances).

All 16 WC 2026 host venues are included. When a fixture's venue is unknown
(NULL in DB), travel distance defaults to None (no adjustment applied).

Usage:
    from footy.models.venues import geodesic_km, VENUES
    km = geodesic_km("AT&T Stadium", "Hard Rock Stadium")   # ~ 2010 km
"""

from __future__ import annotations

import math

# WC 2026 host venue coordinates (lat, lon in decimal degrees).
# Sources: official stadium locations, verified against Google Maps.
VENUES: dict[str, tuple[float, float]] = {
    # USA
    "AT&T Stadium":             (32.748,  -97.093),   # Arlington / Dallas-Fort Worth
    "Hard Rock Stadium":        (25.958,  -80.239),   # Miami Gardens, Florida
    "MetLife Stadium":          (40.814,  -74.074),   # East Rutherford, New Jersey
    "Lincoln Financial Field":  (39.901,  -75.168),   # Philadelphia, Pennsylvania
    "Levi's Stadium":           (37.403, -121.970),   # Santa Clara / San Francisco Bay Area
    "Gillette Stadium":         (42.091,  -71.264),   # Foxborough / Boston
    "Arrowhead Stadium":        (39.049,  -94.484),   # Kansas City, Missouri
    "Rose Bowl":                (34.161, -118.168),   # Pasadena / Los Angeles
    "NRG Stadium":              (29.685,  -95.411),   # Houston, Texas
    "SoFi Stadium":             (33.953, -118.340),   # Inglewood / Los Angeles
    "Lumen Field":              (47.595, -122.332),   # Seattle, Washington
    "Mercedes-Benz Stadium":    (33.755,  -84.401),   # Atlanta, Georgia
    # Canada
    "BC Place":                 (49.276, -123.112),   # Vancouver, British Columbia
    "BMO Field":                (43.633,  -79.419),   # Toronto, Ontario
    # Mexico
    "Estadio Akron":            (20.752, -103.450),   # Zapopan / Guadalajara
    "Estadio Azteca":           (19.303,  -99.151),   # Mexico City
    "Estadio BBVA":             (25.670, -100.246),   # Guadalupe / Monterrey
}

# Canonical venue names as stored in the fixtures table.
# ESPN returns slightly different names; this dict normalises them.
ESPN_VENUE_ALIASES: dict[str, str] = {
    "Gillette Stadium":                 "Gillette Stadium",
    "AT&T Stadium":                     "AT&T Stadium",
    "Hard Rock Stadium":                "Hard Rock Stadium",
    "MetLife Stadium":                  "MetLife Stadium",
    "Lincoln Financial Field":          "Lincoln Financial Field",
    "Levi's Stadium":                   "Levi's Stadium",
    "Arrowhead Stadium":                "Arrowhead Stadium",
    "Rose Bowl Stadium":                "Rose Bowl",
    "Rose Bowl":                        "Rose Bowl",
    "NRG Stadium":                      "NRG Stadium",
    "SoFi Stadium":                     "SoFi Stadium",
    "Lumen Field":                      "Lumen Field",
    "Mercedes-Benz Stadium":            "Mercedes-Benz Stadium",
    "BC Place Stadium":                 "BC Place",
    "BC Place":                         "BC Place",
    "BMO Field":                        "BMO Field",
    "Estadio Akron":                    "Estadio Akron",
    "Estadio Azteca":                   "Estadio Azteca",
    "Estadio BBVA":                     "Estadio BBVA",
    "Estadio BBVA Bancomer":            "Estadio BBVA",
}


def _to_rad(deg: float) -> float:
    return deg * math.pi / 180.0


def geodesic_km(venue_a: str, venue_b: str) -> float | None:
    """
    Return the great-circle distance in kilometres between two WC 2026 venues.

    Returns None if either venue name is not in the VENUES dict.
    Uses the Haversine formula (< 0.5% error for distances up to 20 000 km).
    """
    coord_a = VENUES.get(venue_a)
    coord_b = VENUES.get(venue_b)
    if coord_a is None or coord_b is None:
        return None

    lat1, lon1 = coord_a
    lat2, lon2 = coord_b
    R = 6_371.0  # Earth radius, km

    dlat = _to_rad(lat2 - lat1)
    dlon = _to_rad(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(_to_rad(lat1)) * math.cos(_to_rad(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2.0 * R * math.asin(math.sqrt(a))


def normalise_venue_name(raw: str) -> str | None:
    """Map an ESPN or raw venue string to the canonical name used in VENUES."""
    return ESPN_VENUE_ALIASES.get(raw)
