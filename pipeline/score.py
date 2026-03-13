"""Scoring engine for Location Intelligence v3.0.

Pure scoring functions (no I/O) plus pipeline orchestration for loading
data from Supabase, scoring, and writing results.
"""

from __future__ import annotations
import hashlib
import json
import math
from collections import defaultdict
from math import sqrt
from pathlib import Path


def clamp(val: float, lo: float, hi: float) -> float:
    """Clamp val to [lo, hi]."""
    if val < lo:
        return lo
    if val > hi:
        return hi
    return val


def calc_market_demand(
    brand_vol: float,
    max_brand_vol: float,
    population: int,
    max_brand_pop: int,
    config: dict,
) -> float:
    """Market Demand score (0 to weights.market_demand).

    Two sub-components:
      - Search volume (sqrt-dampened, 70%)
      - Population (sqrt-dampened, capped, 30%)
    """
    w = config["weights"]["market_demand"]
    md = config["market_demand"]

    # Search volume component
    ratio = brand_vol / max_brand_vol if max_brand_vol > 0 else 0
    search_score = sqrt(ratio) * w * md["search_volume_pct"]

    # Population component (capped)
    pop_cap = md["population_cap"]
    capped_pop = min(population, pop_cap)
    max_pop = min(max_brand_pop, pop_cap)
    pop_ratio = capped_pop / max_pop if max_pop > 0 else 0
    pop_score = sqrt(pop_ratio) * w * md["population_pct"]

    return search_score + pop_score


def calc_market_quality(
    owner_pct: float,
    income: float,
    year_built: int,
    config: dict,
) -> float:
    """Market Quality score (0 to weights.market_quality).

    Three sub-components:
      - Owner-occupied % (55%)
      - Median household income (30%)
      - Median year built (15%)
    """
    w = config["weights"]["market_quality"]
    mq = config["market_quality"]

    # Owner-occupied %
    floor = mq["owner_occ_floor"]
    ceiling = mq["owner_occ_ceiling"]
    raw_owner = clamp((owner_pct - floor) / (ceiling - floor), 0, 1)
    owner_score = raw_owner * w * mq["owner_occupied_pct"]

    # Income
    inc_floor = mq["income_floor"]
    inc_ceiling = mq["income_ceiling"]
    raw_income = clamp((income - inc_floor) / (inc_ceiling - inc_floor), 0, 1)
    income_score = raw_income * w * mq["income_pct"]

    # Year built (older = higher score for renovation-focused brands)
    baseline = mq["year_built_baseline"]
    oldest = mq["year_built_oldest"]
    raw_year = clamp((baseline - year_built) / (baseline - oldest), 0, 1)
    year_score = raw_year * w * mq["year_built_pct"]

    return owner_score + income_score + year_score


def calc_strategic_fit(
    comp_index: float,
    same_brand_dist: float,
    sister_brands: int,
    config: dict,
) -> float:
    """Strategic Fit score (0 to weights.strategic_fit).

    Three sub-components:
      - Market validation via competition index (50%) — high = proven market
      - Same-brand distance (30%)
      - Sister brand overlap (20%)
    """
    w = config["weights"]["strategic_fit"]
    sf = config["strategic_fit"]

    # Market validation (high competition = proven, lucrative market)
    if comp_index >= 70:
        raw_comp = 1.0
    elif comp_index >= 40:
        raw_comp = 0.7
    elif comp_index >= 15:
        raw_comp = 0.4
    else:
        raw_comp = 0.15  # Unproven market — risky for physical office
    comp_score = raw_comp * w * sf["market_validation_pct"]

    # Same-brand distance
    if same_brand_dist < 15:
        raw_dist = 0
    elif same_brand_dist < 30:
        raw_dist = (same_brand_dist - 15) / 15
    elif same_brand_dist < 60:
        raw_dist = 1.0
    else:
        raw_dist = 0.8  # isolation penalty
    same_brand_score = raw_dist * w * sf["same_brand_distance_pct"]

    # Sister brand overlap
    if sister_brands == 0:
        raw_sister = 1.0
    elif sister_brands <= 2:
        raw_sister = 0.7
    else:
        raw_sister = 0.4
    sister_score = raw_sister * w * sf["sister_overlap_pct"]

    return comp_score + same_brand_score + sister_score


def calc_portfolio_gap(
    cross_brand_dist: float,
    density: float,
    config: dict,
) -> float:
    """Portfolio Gap overlay score (0 to portfolio_gap.max_points).

    Uses density to pick distance threshold, then scores based on
    how far the nearest cross-brand location is.
    """
    pg = config["portfolio_gap"]
    max_pts = pg["max_points"]
    dt = pg["density_thresholds"]

    if density > 3000:
        threshold = dt["urban"]
    elif density > 1000:
        threshold = dt["suburban"]
    else:
        threshold = dt["rural"]

    half = threshold * 0.5
    if cross_brand_dist < half:
        return 0.0
    elif cross_brand_dist < threshold:
        return max_pts * (cross_brand_dist - half) / half
    else:
        return float(max_pts)


def calc_crm_badge(jobs: int, config: dict) -> str | None:
    """Return CRM badge string or None."""
    badges = config["crm_badges"]
    if jobs >= badges["proven_threshold"]:
        return "PROVEN"
    elif jobs >= badges["signal_threshold"]:
        return "SIGNAL"
    return None


def calc_composite_score(
    brand_vol: float,
    max_brand_vol: float,
    population: int,
    max_brand_pop: int,
    owner_pct: float,
    income: float,
    year_built: int,
    comp_index: float,
    same_brand_dist: float,
    sister_brands: int,
    config: dict,
) -> float:
    """Composite score = market_demand + market_quality + strategic_fit.

    Portfolio gap is a separate overlay, not included here.
    """
    demand = calc_market_demand(brand_vol, max_brand_vol, population, max_brand_pop, config)
    quality = calc_market_quality(owner_pct, income, year_built, config)
    opportunity = calc_strategic_fit(comp_index, same_brand_dist, sister_brands, config)
    return demand + quality + opportunity


# ---------------------------------------------------------------------------
# Sensitivity analysis
# ---------------------------------------------------------------------------

def _rank_scores(scores: list[float]) -> list[int]:
    """Return 1-based ranks (higher score = rank 1)."""
    indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    ranks = [0] * len(scores)
    for rank, (idx, _) in enumerate(indexed, start=1):
        ranks[idx] = rank
    return ranks


def _perturb_weights(config: dict, target_weight: str, delta: int) -> dict:
    """Return a NEW config with target weight adjusted by delta.

    The other two top-level weights absorb the change proportionally
    so the sum remains 100.
    """
    import copy
    new_config = copy.deepcopy(config)
    weights = new_config["weights"]
    weight_names = ["market_demand", "market_quality", "strategic_fit"]

    original = weights[target_weight]
    new_val = max(0, original + delta)
    actual_delta = new_val - original

    others = [w for w in weight_names if w != target_weight]
    other_sum = sum(weights[w] for w in others)

    if other_sum > 0:
        for w in others:
            proportion = weights[w] / other_sum
            weights[w] = max(0, weights[w] - actual_delta * proportion)
    weights[target_weight] = new_val

    return new_config


def calc_sensitivity_flags(cities: list[dict], config: dict) -> list[bool]:
    """Check rank stability under weight perturbations.

    For each of the 3 top-level weights, perturb by +5 and -5,
    redistribute proportionally, rescore, and re-rank.
    A city whose rank shifts by 5+ positions in any perturbation
    is flagged as sensitive.
    """
    if not cities:
        return []

    max_vol = max(c["brand_vol"] for c in cities) or 1
    max_pop = max(c["population"] for c in cities) or 1

    def _score_all(cfg: dict) -> list[float]:
        return [
            calc_composite_score(
                c["brand_vol"], max_vol, c["population"], max_pop,
                c["owner_pct"], c["income"], c["year_built"],
                c["comp_index"], c["same_brand_dist"], c["sister_brands"],
                cfg,
            )
            for c in cities
        ]

    baseline_scores = _score_all(config)
    baseline_ranks = _rank_scores(baseline_scores)

    weight_names = ["market_demand", "market_quality", "strategic_fit"]
    sensitive = [False] * len(cities)

    for target_weight in weight_names:
        for delta in [5, -5]:
            perturbed_config = _perturb_weights(config, target_weight, delta)
            perturbed_scores = _score_all(perturbed_config)
            perturbed_ranks = _rank_scores(perturbed_scores)

            for i in range(len(cities)):
                if abs(baseline_ranks[i] - perturbed_ranks[i]) >= 5:
                    sensitive[i] = True

    return sensitive


# ---------------------------------------------------------------------------
# Distance helpers
# ---------------------------------------------------------------------------

def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in miles between two lat/lng points."""
    R = 3959  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def calc_same_brand_distance(
    city_lat: float | None,
    city_lng: float | None,
    brand_locations: list[dict],
) -> float:
    """Haversine to nearest office of the same brand. Returns inf if none."""
    if city_lat is None or city_lng is None or not brand_locations:
        return float("inf")
    best = float("inf")
    for loc in brand_locations:
        lat, lng = loc.get("lat"), loc.get("lng")
        if lat is None or lng is None:
            continue
        d = haversine(city_lat, city_lng, lat, lng)
        if d < best:
            best = d
    return best


def count_sister_brands(
    city_lat: float | None,
    city_lng: float | None,
    all_brand_locations: dict[str, list[dict]],
    current_brand_id: str,
    radius_mi: float,
) -> int:
    """Count distinct other brands with an office within radius."""
    if city_lat is None or city_lng is None:
        return 0
    count = 0
    for brand_id, locations in all_brand_locations.items():
        if brand_id == current_brand_id:
            continue
        for loc in locations:
            lat, lng = loc.get("lat"), loc.get("lng")
            if lat is None or lng is None:
                continue
            if haversine(city_lat, city_lng, lat, lng) <= radius_mi:
                count += 1
                break  # Only count each brand once
    return count


def calc_cross_brand_distance(
    city_lat: float | None,
    city_lng: float | None,
    all_office_locations: list[dict],
) -> float:
    """Haversine to nearest ANY Vanterra office. Returns inf if none."""
    if city_lat is None or city_lng is None or not all_office_locations:
        return float("inf")
    best = float("inf")
    for loc in all_office_locations:
        lat, lng = loc.get("lat"), loc.get("lng")
        if lat is None or lng is None:
            continue
        d = haversine(city_lat, city_lng, lat, lng)
        if d < best:
            best = d
    return best


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

BATCH_SIZE = 100
CONFIG_PATH = Path(__file__).parent / "config.json"


def _fetch_all(sb, table: str, select: str = "*") -> list[dict]:
    """Fetch all rows from a Supabase table, paginating if needed."""
    rows = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            sb.table(table)
            .select(select)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _compute_state_medians(census_by_city: dict, cities: dict) -> dict:
    """Compute median census values per state for fallback."""
    state_vals = defaultdict(lambda: {"owner": [], "income": [], "year": []})
    for city_key, cd in census_by_city.items():
        city_info = cities.get(city_key)
        if not city_info:
            continue
        state = city_info.get("state", "")
        if cd.get("owner_occupied_pct") is not None:
            state_vals[state]["owner"].append(cd["owner_occupied_pct"])
        if cd.get("median_household_income") is not None:
            state_vals[state]["income"].append(cd["median_household_income"])
        if cd.get("median_year_built") is not None:
            state_vals[state]["year"].append(cd["median_year_built"])

    medians = {}
    for state, vals in state_vals.items():
        medians[state] = {
            "owner_occupied_pct": _median(vals["owner"]),
            "median_household_income": _median(vals["income"]),
            "median_year_built": _median_int(vals["year"]),
        }
    return medians


def _median(values: list) -> float | None:
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    if n % 2 == 1:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2


def _median_int(values: list) -> int | None:
    m = _median(values)
    return int(m) if m is not None else None


def load_scoring_data(sb) -> list[dict]:
    """Load all brand x city records from Supabase, joined in Python."""
    mappings = _fetch_all(sb, "loc_brand_city_mappings")
    cities_raw = _fetch_all(sb, "loc_cities")
    sv_raw = _fetch_all(sb, "loc_search_volumes")
    census_raw = _fetch_all(sb, "loc_census_demographics")
    crm_raw = _fetch_all(sb, "loc_crm_data")
    brands_raw = _fetch_all(sb, "loc_brands")

    cities = {r["city_key"]: r for r in cities_raw}
    sv = {r["city_key"]: r for r in sv_raw}
    census = {r["city_key"]: r for r in census_raw}
    crm = {(r["brand_id"], r["city_key"]): r for r in crm_raw}
    brands = {r["brand_id"]: r for r in brands_raw}

    state_medians = _compute_state_medians(census, cities)

    rows = []
    for m in mappings:
        brand_id = m["brand_id"]
        city_key = m["city_key"]

        city = cities.get(city_key)
        if not city:
            continue

        search = sv.get(city_key)
        if not search:
            continue  # Skip rows with no search volume data

        brand = brands.get(brand_id)
        if not brand:
            continue

        cd = census.get(city_key)
        crm_row = crm.get((brand_id, city_key))

        state = city.get("state", "")
        sm = state_medians.get(state, {})

        used_census_fallback = False
        if cd:
            owner_pct = cd.get("owner_occupied_pct")
            income = cd.get("median_household_income")
            year_built = cd.get("median_year_built")
            # Fill individual nulls from state median
            if owner_pct is None:
                owner_pct = sm.get("owner_occupied_pct", 0.5)
                used_census_fallback = True
            if income is None:
                income = sm.get("median_household_income", 60000)
                used_census_fallback = True
            if year_built is None:
                year_built = sm.get("median_year_built", 1975)
                used_census_fallback = True
        else:
            owner_pct = sm.get("owner_occupied_pct", 0.5)
            income = sm.get("median_household_income", 60000)
            year_built = sm.get("median_year_built", 1975)
            used_census_fallback = True

        brand_confidence = brand.get("confidence_tier", "SPECULATIVE")
        if brand_confidence == "SPECULATIVE":
            data_confidence = "SPECULATIVE"
        elif used_census_fallback and brand_confidence in ("MODERATE", "LOW"):
            data_confidence = "LOW"
        elif used_census_fallback or brand_confidence == "MODERATE":
            data_confidence = "MODERATE"
        else:
            data_confidence = "HIGH"

        kw_raw = brand.get("keyword_weights")
        keyword_weights = (
            json.loads(kw_raw) if isinstance(kw_raw, str) and kw_raw else {}
        )

        el_raw = brand.get("existing_locations")
        existing_locations = (
            json.loads(el_raw) if isinstance(el_raw, str) and el_raw else []
        )

        rows.append({
            "brand_id": brand_id,
            "city_key": city_key,
            "city": city.get("city"),
            "state": state,
            "lat": city.get("lat"),
            "lng": city.get("lng"),
            "population": city.get("population") or 0,
            "foundation_vol": search.get("foundation_vol") or 0,
            "basement_vol": search.get("basement_vol") or 0,
            "crawlspace_vol": search.get("crawlspace_vol") or 0,
            "concrete_vol": search.get("concrete_vol") or 0,
            "avg_competition_index": search.get("avg_competition_index") or 0,
            "owner_occupied_pct": owner_pct,
            "median_household_income": income,
            "median_year_built": year_built,
            "leads": crm_row.get("leads", 0) if crm_row else 0,
            "jobs": crm_row.get("jobs", 0) if crm_row else 0,
            "revenue": crm_row.get("revenue", 0.0) if crm_row else 0.0,
            "keyword_weights": keyword_weights,
            "existing_locations": existing_locations,
            "confidence_tier": brand_confidence,
            "data_confidence": data_confidence,
            "avg_density": m.get("avg_density") or 0,
        })

    return rows


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------

def _collect_brand_locations(data: list[dict]) -> dict[str, list[dict]]:
    """Build {brand_id: [location dicts]} from existing_locations across rows."""
    brand_locs: dict[str, list[dict]] = {}
    for row in data:
        bid = row["brand_id"]
        if bid not in brand_locs:
            brand_locs[bid] = row["existing_locations"]
    return brand_locs


def _collect_all_offices(brand_locations: dict[str, list[dict]]) -> list[dict]:
    """Flatten all brand locations into a single list for cross-brand distance."""
    offices = []
    for locs in brand_locations.values():
        offices.extend(locs)
    return offices


def _batch_upsert(sb, table: str, rows: list[dict]) -> int:
    """Upsert rows in batches. Returns total count upserted."""
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        sb.table(table).upsert(chunk).execute()
        total += len(chunk)
    return total


def main() -> None:
    """Run the full scoring pipeline."""
    from pipeline.utils import get_supabase

    with open(CONFIG_PATH) as f:
        config_text = f.read()
    config = json.loads(config_text)
    config_hash = hashlib.sha256(config_text.encode()).hexdigest()

    sb = get_supabase()
    print("Loading scoring data from Supabase...", flush=True)
    data = load_scoring_data(sb)
    print(f"  Loaded {len(data)} brand × city records")

    if not data:
        print("No data to score. Exiting.")
        return

    brand_locations = _collect_brand_locations(data)
    all_offices = _collect_all_offices(brand_locations)
    sister_radius = config["strategic_fit"]["sister_brand_radius_mi"]

    by_brand: dict[str, list[dict]] = defaultdict(list)
    for row in data:
        by_brand[row["brand_id"]].append(row)

    scored_rows = []
    for brand_id, brand_rows in by_brand.items():
        brand_vols = []
        brand_pops = []
        for r in brand_rows:
            kw = r["keyword_weights"] or {}
            bv = (
                r["foundation_vol"] * kw.get("foundation_repair", 1.0)
                + r["basement_vol"] * kw.get("basement_waterproofing", 1.0)
                + r["crawlspace_vol"] * kw.get("crawl_space", 1.0)
                + r["concrete_vol"] * kw.get("concrete_lifting", 1.0)
            )
            brand_vols.append(bv)
            brand_pops.append(r["population"])

        max_brand_vol = max(brand_vols) if brand_vols else 1
        max_brand_pop = max(brand_pops) if brand_pops else 1

        brand_existing = brand_locations.get(brand_id, [])

        city_scores = []
        sensitivity_inputs = []
        for i, r in enumerate(brand_rows):
            kw = r["keyword_weights"] or {}
            brand_vol = brand_vols[i]

            same_dist = calc_same_brand_distance(
                r["lat"], r["lng"], brand_existing
            )
            sisters = count_sister_brands(
                r["lat"], r["lng"], brand_locations, brand_id, sister_radius
            )
            cross_dist = calc_cross_brand_distance(
                r["lat"], r["lng"], all_offices
            )

            comp_index = r["avg_competition_index"]
            composite = calc_composite_score(
                brand_vol, max_brand_vol,
                r["population"], max_brand_pop,
                r["owner_occupied_pct"], r["median_household_income"],
                r["median_year_built"], comp_index,
                same_dist, sisters, config,
            )

            density = r["avg_density"] or 0
            portfolio_gap = calc_portfolio_gap(cross_dist, density, config)

            crm_badge = calc_crm_badge(r["jobs"], config)

            demand_score = calc_market_demand(
                brand_vol, max_brand_vol,
                r["population"], max_brand_pop, config,
            )
            quality_score = calc_market_quality(
                r["owner_occupied_pct"], r["median_household_income"],
                r["median_year_built"], config,
            )
            opportunity_score = calc_strategic_fit(
                comp_index, same_dist, sisters, config,
            )

            sensitivity_inputs.append({
                "brand_vol": brand_vol,
                "population": r["population"],
                "owner_pct": r["owner_occupied_pct"],
                "income": r["median_household_income"],
                "year_built": r["median_year_built"],
                "comp_index": comp_index,
                "same_brand_dist": same_dist,
                "sister_brands": sisters,
            })

            city_scores.append({
                "brand_id": brand_id,
                "city_key": r["city_key"],
                "composite_score": round(composite, 2),
                "market_demand_score": round(demand_score, 2),
                "market_quality_score": round(quality_score, 2),
                "strategic_fit_score": round(opportunity_score, 2),
                "portfolio_gap_score": round(portfolio_gap, 2),
                "search_vol_total": (
                    r["foundation_vol"] + r["basement_vol"]
                    + r["crawlspace_vol"] + r["concrete_vol"]
                ),
                "search_vol_breakdown": json.dumps({
                    "foundation": r["foundation_vol"],
                    "basement": r["basement_vol"],
                    "crawlspace": r["crawlspace_vol"],
                    "concrete": r["concrete_vol"],
                }),
                "owner_occupied_pct": r["owner_occupied_pct"],
                "median_household_income": int(r["median_household_income"]),
                "median_year_built": int(r["median_year_built"]),
                "competition_index": comp_index,
                "same_brand_distance_mi": (
                    round(same_dist, 1) if same_dist != float("inf") else None
                ),
                "sister_brands_nearby": sisters,
                "cross_brand_distance_mi": (
                    round(cross_dist, 1) if cross_dist != float("inf") else None
                ),
                "crm_badge": crm_badge,
                "crm_leads": r["leads"],
                "crm_jobs": r["jobs"],
                "crm_revenue": r["revenue"],
                "rank": 0,  # Set after sorting
                "data_confidence": r["data_confidence"],
                "sensitivity_flag": False,
                "config_hash": config_hash,
            })

        flags = calc_sensitivity_flags(sensitivity_inputs, config)
        sensitive_count = 0
        for cs, flag in zip(city_scores, flags):
            cs["sensitivity_flag"] = flag
            if flag:
                sensitive_count += 1

        city_scores.sort(key=lambda x: x["composite_score"], reverse=True)
        for rank, row in enumerate(city_scores, start=1):
            row["rank"] = rank

        if sensitive_count:
            print(f"  {brand_id}: {sensitive_count} sensitive cities")

        scored_rows.extend(city_scores)

    print(f"Scored {len(scored_rows)} rows across {len(by_brand)} brands")

    print("Truncating loc_scored_recommendations...", flush=True)
    sb.table("loc_scored_recommendations").delete().neq(
        "brand_id", "__nonexistent__"
    ).execute()

    print("Writing scored recommendations...", flush=True)
    count = _batch_upsert(sb, "loc_scored_recommendations", scored_rows)
    print(f"  Upserted {count} rows")
    print("Done.")


if __name__ == "__main__":
    main()
