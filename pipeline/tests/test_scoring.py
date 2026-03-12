import pytest
import json
from pipeline.score import (
    calc_market_demand,
    calc_market_quality,
    calc_competitive_opportunity,
    calc_portfolio_gap,
    calc_crm_badge,
    calc_composite_score,
)

with open("pipeline/config.json") as f:
    CONFIG = json.load(f)


class TestMarketDemand:
    def test_max_volume_city_scores_near_max(self):
        """City with highest search volume should score near 31.5 for search component."""
        score = calc_market_demand(
            brand_vol=780, max_brand_vol=780,
            population=500000, max_brand_pop=500000,
            config=CONFIG
        )
        assert 43.0 <= score <= 45.0

    def test_low_volume_city_scores_lower(self):
        """City with 1/13 the volume should score meaningfully lower."""
        high = calc_market_demand(780, 780, 500000, 500000, CONFIG)
        low = calc_market_demand(60, 780, 63000, 500000, CONFIG)
        assert high - low > 15

    def test_sqrt_dampening(self):
        """Sqrt should compress range: 10x volume diff -> ~3x score diff."""
        score_high = calc_market_demand(1000, 1000, 100000, 500000, CONFIG)
        score_low = calc_market_demand(100, 1000, 100000, 500000, CONFIG)
        ratio = score_high / score_low if score_low > 0 else float('inf')
        assert 2.0 < ratio < 5.0

    def test_population_capped(self):
        """Population above 500K should not increase score."""
        score_500k = calc_market_demand(500, 1000, 500000, 500000, CONFIG)
        score_1m = calc_market_demand(500, 1000, 1000000, 500000, CONFIG)
        assert score_500k == score_1m


class TestMarketQuality:
    def test_high_owner_occ_scores_high(self):
        score = calc_market_quality(
            owner_pct=0.85, income=98000, year_built=1956, config=CONFIG
        )
        assert score > 20

    def test_low_owner_occ_scores_low(self):
        score = calc_market_quality(
            owner_pct=0.35, income=57000, year_built=1949, config=CONFIG
        )
        assert score < 15

    def test_floor_and_ceiling(self):
        """Below 30% owner-occ should clamp to 0."""
        score = calc_market_quality(
            owner_pct=0.20, income=80000, year_built=1960, config=CONFIG
        )
        assert score < 15


class TestCompetitiveOpportunity:
    def test_low_competition_scores_high(self):
        score = calc_competitive_opportunity(
            comp_index=8.2, same_brand_dist=45.0,
            sister_brands=1, config=CONFIG
        )
        assert score > 18

    def test_close_same_brand_scores_zero_distance(self):
        score = calc_competitive_opportunity(
            comp_index=50.0, same_brand_dist=10.0,
            sister_brands=0, config=CONFIG
        )
        assert score < 20

    def test_many_sisters_penalizes(self):
        few = calc_competitive_opportunity(50, 45, 0, CONFIG)
        many = calc_competitive_opportunity(50, 45, 4, CONFIG)
        assert few > many


class TestPortfolioGap:
    def test_far_city_gets_max_gap(self):
        gap = calc_portfolio_gap(
            cross_brand_dist=100.0, density=1000, config=CONFIG
        )
        assert gap == 25.0

    def test_close_city_gets_no_gap(self):
        gap = calc_portfolio_gap(
            cross_brand_dist=3.0, density=5000, config=CONFIG
        )
        assert gap == 0.0


class TestCrmBadge:
    def test_proven(self):
        assert calc_crm_badge(15, CONFIG) == "PROVEN"

    def test_signal(self):
        assert calc_crm_badge(5, CONFIG) == "SIGNAL"

    def test_none(self):
        assert calc_crm_badge(0, CONFIG) is None


class TestPhiladelphiaVsLevittown:
    """The critical validation: Philadelphia must score above Levittown."""
    def test_philly_beats_levittown(self):
        philly = calc_composite_score(
            brand_vol=780, max_brand_vol=780,
            population=500000, max_brand_pop=500000,
            owner_pct=0.47, income=57000, year_built=1949,
            comp_index=8.2, same_brand_dist=45, sister_brands=2,
            config=CONFIG
        )
        levittown = calc_composite_score(
            brand_vol=60, max_brand_vol=780,
            population=63000, max_brand_pop=500000,
            owner_pct=0.85, income=98000, year_built=1956,
            comp_index=22.1, same_brand_dist=45, sister_brands=1,
            config=CONFIG
        )
        assert philly > levittown, f"Philadelphia ({philly:.1f}) must beat Levittown ({levittown:.1f})"
        assert philly - levittown > 10, f"Gap ({philly - levittown:.1f}) should be >10 points"
