"""Export scored data from Supabase to static JSON files for the frontend."""

from __future__ import annotations

import json
from pathlib import Path

try:
    from pipeline.utils import get_supabase
except ImportError:
    from utils import get_supabase


OUTPUT_DIR = Path(__file__).resolve().parent.parent / "app" / "src" / "data"
CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def fetch_all_rows(sb, table_name: str) -> list[dict]:
    """Fetch all rows from a Supabase table."""
    print(f"  Fetching {table_name}...")
    rows = sb.table(table_name).select("*").execute().data
    print(f"  Got {len(rows)} rows from {table_name}")
    return rows


def parse_json_field(value: str | None) -> object:
    """Safely parse a JSON string field, returning the parsed value or the original."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    return value


def build_recommendations(recs: list[dict], cities_by_key: dict) -> dict:
    """Build recommendations dict keyed by brand_id, sorted by rank."""
    by_brand: dict[str, list[dict]] = {}

    for rec in recs:
        brand_id = rec["brand_id"]
        city_key = rec["city_key"]
        city = cities_by_key.get(city_key, {})

        entry = {
            "brand_id": brand_id,
            "city_key": city_key,
            "city": city.get("display_name", ""),
            "state": city.get("state", ""),
            "lat": city.get("lat"),
            "lng": city.get("lng"),
            "population": city.get("population"),
            "rank": rec.get("rank"),
            "composite_score": rec.get("composite_score"),
            "market_demand_score": rec.get("market_demand_score"),
            "market_quality_score": rec.get("market_quality_score"),
            "competitive_opportunity_score": rec.get("competitive_opportunity_score"),
            "portfolio_gap_score": rec.get("portfolio_gap_score"),
            "search_vol_total": rec.get("search_vol_total"),
            "search_vol_breakdown": parse_json_field(rec.get("search_vol_breakdown")),
            "owner_occupied_pct": rec.get("owner_occupied_pct"),
            "median_household_income": rec.get("median_household_income"),
            "median_year_built": rec.get("median_year_built"),
            "competition_index": rec.get("competition_index"),
            "same_brand_distance_mi": rec.get("same_brand_distance_mi"),
            "sister_brands_nearby": rec.get("sister_brands_nearby"),
            "cross_brand_distance_mi": rec.get("cross_brand_distance_mi"),
            "crm_badge": rec.get("crm_badge"),
            "crm_leads": rec.get("crm_leads"),
            "crm_jobs": rec.get("crm_jobs"),
            "crm_revenue": rec.get("crm_revenue"),
            "data_confidence": rec.get("data_confidence"),
            "sensitivity_flag": rec.get("sensitivity_flag"),
        }

        by_brand.setdefault(brand_id, []).append(entry)

    for brand_id in by_brand:
        by_brand[brand_id].sort(key=lambda r: (r["rank"] or 9999))

    return by_brand


def build_brands(brands_rows: list[dict]) -> list[dict]:
    """Build brands array with parsed JSON fields."""
    result = []
    for b in brands_rows:
        result.append({
            "brand_id": b["brand_id"],
            "display_name": b.get("display_name"),
            "existing_locations": parse_json_field(b.get("existing_locations")),
            "keyword_weights": parse_json_field(b.get("keyword_weights")),
            "confidence_tier": b.get("confidence_tier"),
            "investment_tier": b.get("investment_tier"),
            "total_leads": b.get("total_leads"),
            "total_jobs": b.get("total_jobs"),
            "total_revenue": b.get("total_revenue"),
        })
    return result


def build_config(recs: list[dict]) -> dict:
    """Build config.json from pipeline config + config_hash from scored data."""
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    config_hash = None
    for rec in recs:
        if rec.get("config_hash"):
            config_hash = rec["config_hash"]
            break

    return {**config, "config_hash": config_hash}


def write_json(path: Path, data: object) -> None:
    """Write data to a JSON file, converting inf/None properly."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str, allow_nan=False)
    size_kb = path.stat().st_size / 1024
    print(f"  Wrote {path.name} ({size_kb:.1f} KB)")


def main() -> None:
    print("Export: connecting to Supabase...")
    sb = get_supabase()

    print("Export: fetching data...")
    recs = fetch_all_rows(sb, "loc_scored_recommendations")
    cities = fetch_all_rows(sb, "loc_cities")
    brands = fetch_all_rows(sb, "loc_brands")

    cities_by_key = {c["city_key"]: c for c in cities}

    print("Export: building output files...")
    recommendations = build_recommendations(recs, cities_by_key)
    brands_list = build_brands(brands)
    config = build_config(recs)

    print(f"Export: writing to {OUTPUT_DIR}/")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(OUTPUT_DIR / "recommendations.json", recommendations)
    write_json(OUTPUT_DIR / "brands.json", brands_list)
    write_json(OUTPUT_DIR / "config.json", config)

    print(f"Export: done — {len(recommendations)} brands, "
          f"{sum(len(v) for v in recommendations.values())} recommendations")


if __name__ == "__main__":
    main()
