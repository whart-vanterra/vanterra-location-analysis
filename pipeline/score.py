"""Scoring engine for Location Intelligence v3.0.

Pure functions — no I/O, no side effects. All thresholds and weights
are read from the config dict passed to each function.
"""

from __future__ import annotations
from math import sqrt


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


def calc_competitive_opportunity(
    comp_index: float,
    same_brand_dist: float,
    sister_brands: int,
    config: dict,
) -> float:
    """Competitive Opportunity score (0 to weights.competitive_opportunity).

    Three sub-components:
      - Competition index inverted (50%)
      - Same-brand distance (30%)
      - Sister brand overlap (20%)
    """
    w = config["weights"]["competitive_opportunity"]
    co = config["competitive_opportunity"]

    # Competition index (inverted: lower competition = higher score)
    raw_comp = 1 - (comp_index / 100)
    comp_score = raw_comp * w * co["competition_index_pct"]

    # Same-brand distance
    if same_brand_dist < 15:
        raw_dist = 0
    elif same_brand_dist < 30:
        raw_dist = (same_brand_dist - 15) / 15
    elif same_brand_dist < 60:
        raw_dist = 1.0
    else:
        raw_dist = 0.8  # isolation penalty
    same_brand_score = raw_dist * w * co["same_brand_distance_pct"]

    # Sister brand overlap
    if sister_brands == 0:
        raw_sister = 1.0
    elif sister_brands <= 2:
        raw_sister = 0.7
    else:
        raw_sister = 0.4
    sister_score = raw_sister * w * co["sister_overlap_pct"]

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
    """Composite score = market_demand + market_quality + competitive_opportunity.

    Portfolio gap is a separate overlay, not included here.
    """
    demand = calc_market_demand(brand_vol, max_brand_vol, population, max_brand_pop, config)
    quality = calc_market_quality(owner_pct, income, year_built, config)
    opportunity = calc_competitive_opportunity(comp_index, same_brand_dist, sister_brands, config)
    return demand + quality + opportunity
