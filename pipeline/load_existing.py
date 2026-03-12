"""
Load existing JSON data files into Supabase loc_* tables.
Idempotent: uses upserts throughout.

Usage:
    python -m pipeline.load_existing [--brands-only] [--search-volumes-only]
                                     [--census-only] [--mappings-only] [--crm-only]
    (no flags = run all loaders in dependency order)
"""

import argparse
import json
import os
from pathlib import Path

from pipeline.utils import get_supabase, normalize_city_key

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BRAND_ID_MAP = {
    2: "AW",
    3: "SD",
    4: "DC",
    5: "LT",
    6: "SB",
    7: "KF",
    25: "58-TN",
    26: "58-NC",
    27: "58-SC",
    28: "58-GA",
    29: "58-MA",
    30: "FB-FB",
    32: "KC",
    33: "AC",
    34: "CF",
    35: "ES",
    36: "CB",
}

BATCH_SIZE = 100

DATA_DIR = Path("/Users/whart/www/vanterra-location-analysis/data")
TMP_DIR = Path("/tmp")

BRAND_OVERVIEW_PATH = DATA_DIR / "brand_overview.json"
SEARCH_VOLUME_PATH = DATA_DIR / "search_volume.json"
CENSUS_PATH = DATA_DIR / "census_demographics.json"
BRAND_CITY_MAPPINGS_PATH = TMP_DIR / "brand_city_mappings.json"
CRM_PATH = TMP_DIR / "crm_by_brand_city.json"

CONFIG_PATH = Path(__file__).parent / "config.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _batch_upsert(sb, table: str, rows: list[dict]) -> int:
    """Upsert rows in batches of BATCH_SIZE. Returns total count upserted."""
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        sb.table(table).upsert(chunk).execute()
        total += len(chunk)
    return total


def _confidence_tier(total_leads: int, total_jobs: int) -> str:
    combined = (total_leads or 0) + (total_jobs or 0)
    if combined > 5000:
        return "HIGH"
    if combined >= 500:
        return "MODERATE"
    if combined >= 50:
        return "LOW"
    return "SPECULATIVE"


def _load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_brands(sb) -> None:
    print("Loading brands...", end=" ", flush=True)

    with open(BRAND_OVERVIEW_PATH) as f:
        data = json.load(f)

    config = _load_config()
    keyword_weights = config.get("brand_keyword_weights", {})

    rows = []
    for brand in data["brands"]:
        shortcode = brand["shortcode"]
        total_leads = brand.get("total_leads") or 0
        total_jobs = brand.get("total_jobs") or 0

        # Build existing_locations with city_key included
        existing_locs = []
        for loc in brand.get("existing_locations") or []:
            city = loc.get("city", "")
            state = loc.get("state", "")
            city_key = normalize_city_key(city, state)
            existing_locs.append(
                {
                    "city_key": city_key,
                    "city": city,
                    "state": state,
                    "lat": loc.get("lat"),
                    "lng": loc.get("lng"),
                }
            )

        rows.append(
            {
                "brand_id": shortcode,
                "display_name": brand.get("display_name"),
                "existing_locations": json.dumps(existing_locs),
                "zip_count": brand.get("zip_count"),
                "total_leads": total_leads,
                "total_jobs": total_jobs,
                "total_revenue": brand.get("total_revenue"),
                "investment_tier": brand.get("investment_tier"),
                "investment_note": brand.get("investment_note"),
                "confidence_tier": _confidence_tier(total_leads, total_jobs),
                "keyword_weights": json.dumps(keyword_weights.get(shortcode, {})),
            }
        )

    count = _batch_upsert(sb, "loc_brands", rows)
    print(f"{count} upserted")


def load_search_volumes(sb) -> None:
    print("Loading search volumes...", end=" ", flush=True)

    with open(SEARCH_VOLUME_PATH) as f:
        data = json.load(f)

    city_rows: list[dict] = []
    sv_rows: list[dict] = []

    for label, entry in data["data"].items():
        city = entry["city"]
        state = entry["state"]
        city_key, display = normalize_city_key(city, state, return_display=True)

        city_rows.append(
            {
                "city_key": city_key,
                "city": display,
                "state": state.strip().upper(),
            }
        )

        sv_rows.append(
            {
                "city_key": city_key,
                "foundation_vol": entry.get("foundation_vol"),
                "basement_vol": entry.get("basement_vol"),
                "crawlspace_vol": entry.get("crawlspace_vol"),
                "concrete_vol": entry.get("concrete_vol"),
                "avg_competition_index": entry.get("avg_competition_index"),
                "avg_cpc_high": entry.get("avg_cpc_high"),
            }
        )

    _batch_upsert(sb, "loc_cities", city_rows)
    count = _batch_upsert(sb, "loc_search_volumes", sv_rows)
    print(f"{count} upserted")


def load_census(sb) -> None:
    print("Loading census demographics...", end=" ", flush=True)

    with open(CENSUS_PATH) as f:
        data = json.load(f)

    city_rows: list[dict] = []
    census_rows: list[dict] = []

    for label, entry in data["data"].items():
        city = entry["city"]
        state = entry["state"]
        city_key, display = normalize_city_key(city, state, return_display=True)

        city_rows.append(
            {
                "city_key": city_key,
                "city": display,
                "state": state.strip().upper(),
            }
        )

        census_rows.append(
            {
                "city_key": city_key,
                "owner_occupied_pct": entry.get("owner_occupied_pct"),
                "median_household_income": entry.get("median_household_income"),
                "median_year_built": entry.get("median_year_built"),
                "owner_occupied_units": entry.get("owner_occupied_units"),
                "total_housing_units": entry.get("total_housing_units"),
            }
        )

    _batch_upsert(sb, "loc_cities", city_rows)
    count = _batch_upsert(sb, "loc_census_demographics", census_rows)
    print(f"{count} upserted")


def load_mappings(sb) -> None:
    print("Loading brand-city mappings...", end=" ", flush=True)

    with open(BRAND_CITY_MAPPINGS_PATH) as f:
        data = json.load(f)

    city_rows: list[dict] = []
    mapping_rows: list[dict] = []

    for entry in data:
        numeric_id = entry["brand_id"]
        shortcode = BRAND_ID_MAP.get(numeric_id)
        if shortcode is None:
            continue

        city = entry.get("city", "")
        state = entry.get("state", "")
        city_key, display = normalize_city_key(city, state, return_display=True)

        lat = entry.get("avg_lat")
        lng = entry.get("avg_lng")
        population = entry.get("total_pop")

        city_rows.append(
            {
                "city_key": city_key,
                "city": display,
                "state": state.strip().upper(),
                "lat": float(lat) if lat is not None else None,
                "lng": float(lng) if lng is not None else None,
                "population": int(population) if population is not None else None,
            }
        )

        avg_density = entry.get("avg_density")
        mapping_rows.append(
            {
                "brand_id": shortcode,
                "city_key": city_key,
                "zip_count": entry.get("zip_count"),
                "avg_density": float(avg_density) if avg_density is not None else None,
            }
        )

    _batch_upsert(sb, "loc_cities", city_rows)
    count = _batch_upsert(sb, "loc_brand_city_mappings", mapping_rows)
    print(f"{count} upserted")


def load_crm(sb) -> None:
    print("Loading CRM data...", end=" ", flush=True)

    with open(CRM_PATH) as f:
        data = json.load(f)

    # Fetch known brand_ids and city_keys for FK validation
    known_brands = {
        r["brand_id"]
        for r in sb.table("loc_brands").select("brand_id").execute().data
    }
    known_cities = {
        r["city_key"]
        for r in sb.table("loc_cities").select("city_key").execute().data
    }

    crm_rows: list[dict] = []
    skipped = 0

    for key, entry in data.items():
        parts = key.split("|", 2)
        if len(parts) != 3:
            skipped += 1
            continue

        numeric_id_str, city, state = parts
        try:
            numeric_id = int(numeric_id_str)
        except ValueError:
            skipped += 1
            continue

        shortcode = BRAND_ID_MAP.get(numeric_id)
        if shortcode is None or shortcode not in known_brands:
            skipped += 1
            continue

        city_key = normalize_city_key(city, state)
        if city_key not in known_cities:
            skipped += 1
            continue

        crm_rows.append(
            {
                "brand_id": shortcode,
                "city_key": city_key,
                "leads": entry.get("leads") or 0,
                "jobs": entry.get("jobs") or 0,
                "revenue": entry.get("revenue") or 0.0,
            }
        )

    count = _batch_upsert(sb, "loc_crm_data", crm_rows)
    if skipped:
        print(f"{count} upserted ({skipped} skipped — unknown brand or city)")
    else:
        print(f"{count} upserted")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load existing JSON data into Supabase loc_* tables."
    )
    parser.add_argument("--brands-only", action="store_true")
    parser.add_argument("--search-volumes-only", action="store_true")
    parser.add_argument("--census-only", action="store_true")
    parser.add_argument("--mappings-only", action="store_true")
    parser.add_argument("--crm-only", action="store_true")
    args = parser.parse_args()

    any_flag = any(
        [
            args.brands_only,
            args.search_volumes_only,
            args.census_only,
            args.mappings_only,
            args.crm_only,
        ]
    )

    sb = get_supabase()

    if args.brands_only:
        load_brands(sb)
        return

    if args.search_volumes_only:
        load_search_volumes(sb)
        return

    if args.census_only:
        load_census(sb)
        return

    if args.mappings_only:
        load_mappings(sb)
        return

    if args.crm_only:
        load_crm(sb)
        return

    # Run all in FK-safe order
    load_brands(sb)
    load_search_volumes(sb)
    load_census(sb)
    load_mappings(sb)
    load_crm(sb)


if __name__ == "__main__":
    main()
