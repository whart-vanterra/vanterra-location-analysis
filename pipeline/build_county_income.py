"""Fetch county boundaries + median household income, output filtered GeoJSON for the app."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.request import urlopen, Request

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "app" / "public" / "county_income.json"

# 23 operating states (FIPS codes)
STATE_FIPS = {
    "01": "AL", "08": "CO", "10": "DE", "11": "DC", "13": "GA",
    "17": "IL", "19": "IA", "20": "KS", "21": "KY", "24": "MD",
    "25": "MA", "27": "MN", "29": "MO", "37": "NC", "38": "ND",
    "34": "NJ", "39": "OH", "42": "PA", "44": "RI", "45": "SC",
    "47": "TN", "51": "VA", "54": "WV", "55": "WI",
}

BOUNDARY_URL = (
    "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
)

CENSUS_API_URL = (
    "https://api.census.gov/data/2022/acs/acs5"
    "?get=NAME,B19013_001E"
    "&for=county:*"
    "&in=state:{state_fips}"
)


def fetch_json(url: str) -> dict | list:
    req = Request(url, headers={"User-Agent": "county-income-builder/1.0"})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def fetch_income_data() -> dict[str, int | None]:
    """Fetch median household income by 5-digit FIPS from Census ACS."""
    income_map: dict[str, int | None] = {}
    for state_fips in STATE_FIPS:
        url = CENSUS_API_URL.format(state_fips=state_fips)
        try:
            rows = fetch_json(url)
        except Exception as e:
            print(f"  WARNING: Failed to fetch income for state {state_fips}: {e}")
            continue
        # rows[0] is header: ['NAME', 'B19013_001E', 'state', 'county']
        for row in rows[1:]:
            fips = row[2] + row[3]  # state(2) + county(3)
            try:
                val = int(float(row[1]))
                income_map[fips] = val if val > 0 else None
            except (ValueError, TypeError):
                income_map[fips] = None
    return income_map


def round_coords(coords: list, decimals: int = 3) -> list:
    """Recursively round coordinate arrays to reduce file size."""
    if isinstance(coords[0], (int, float)):
        return [round(c, decimals) for c in coords]
    return [round_coords(c, decimals) for c in coords]


def main() -> None:
    print("Fetching county boundaries...")
    geo = fetch_json(BOUNDARY_URL)
    print(f"  Got {len(geo['features'])} total counties")

    print("Fetching income data from Census ACS...")
    income_map = fetch_income_data()
    print(f"  Got income data for {sum(1 for v in income_map.values() if v is not None)} counties")

    # Filter to operating states and attach income
    filtered_features = []
    for feature in geo["features"]:
        fips = feature.get("id") or feature.get("properties", {}).get("GEO_ID", "")[-5:]
        if len(fips) < 5:
            continue
        state_fips = fips[:2]
        if state_fips not in STATE_FIPS:
            continue

        props = feature.get("properties", {})
        income = income_map.get(fips)

        new_props = {
            "fips": fips,
            "name": props.get("NAME", props.get("name", "")),
            "state": STATE_FIPS[state_fips],
            "income": income,
        }

        geometry = feature.get("geometry", {})
        if "coordinates" in geometry:
            geometry = {**geometry, "coordinates": round_coords(geometry["coordinates"])}

        filtered_features.append({
            "type": "Feature",
            "properties": new_props,
            "geometry": geometry,
        })

    result = {
        "type": "FeatureCollection",
        "features": filtered_features,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"\nWrote {len(filtered_features)} counties to {OUTPUT_PATH}")
    print(f"File size: {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
