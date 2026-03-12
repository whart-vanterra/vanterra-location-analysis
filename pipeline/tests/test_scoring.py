import pytest
import json
from pipeline.score import (
    calc_market_demand,
    calc_market_quality,
    calc_competitive_opportunity,
    calc_portfolio_gap,
    calc_crm_badge,
    calc_composite_score,
    haversine,
    calc_same_brand_distance,
    count_sister_brands,
    calc_cross_brand_distance,
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

    def test_owner_occ_floor_clamps_to_zero(self):
        """Below 30% owner-occ: owner component should be 0, only income+year contribute."""
        below_floor = calc_market_quality(owner_pct=0.20, income=80000, year_built=1960, config=CONFIG)
        at_floor = calc_market_quality(owner_pct=0.30, income=80000, year_built=1960, config=CONFIG)
        assert below_floor == at_floor  # Both should have 0 for owner component

    def test_owner_occ_ceiling_clamps_to_max(self):
        """Above 90% owner-occ should score same as exactly 90%."""
        at_ceiling = calc_market_quality(owner_pct=0.90, income=80000, year_built=1960, config=CONFIG)
        above_ceiling = calc_market_quality(owner_pct=0.99, income=80000, year_built=1960, config=CONFIG)
        assert at_ceiling == above_ceiling


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

    def test_signal_at_boundary(self):
        assert calc_crm_badge(1, CONFIG) == "SIGNAL"

    def test_proven_at_boundary(self):
        assert calc_crm_badge(10, CONFIG) == "PROVEN"

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


class TestHaversine:
    def test_known_distance_philly_to_nyc(self):
        """Philadelphia to New York is ~80 miles."""
        dist = haversine(39.9526, -75.1652, 40.7128, -74.0060)
        assert 75 < dist < 85

    def test_same_point_is_zero(self):
        dist = haversine(40.0, -75.0, 40.0, -75.0)
        assert dist == 0.0

    def test_known_distance_la_to_sf(self):
        """LA to SF is ~347 miles."""
        dist = haversine(34.0522, -118.2437, 37.7749, -122.4194)
        assert 340 < dist < 360


class TestSameBrandDistance:
    def test_no_offices_returns_inf(self):
        dist = calc_same_brand_distance(39.95, -75.17, [])
        assert dist == float('inf')

    def test_none_lat_returns_inf(self):
        dist = calc_same_brand_distance(None, -75.17, [{"lat": 40.0, "lng": -75.0}])
        assert dist == float('inf')

    def test_none_lng_returns_inf(self):
        dist = calc_same_brand_distance(39.95, None, [{"lat": 40.0, "lng": -75.0}])
        assert dist == float('inf')

    def test_nearest_office(self):
        offices = [
            {"lat": 40.7128, "lng": -74.0060},  # NYC ~80mi
            {"lat": 39.2904, "lng": -76.6122},  # Baltimore ~100mi
        ]
        dist = calc_same_brand_distance(39.9526, -75.1652, offices)
        assert 75 < dist < 85  # Should pick NYC as closest

    def test_office_with_none_coords_skipped(self):
        offices = [
            {"lat": None, "lng": -74.0},
            {"lat": 40.7128, "lng": -74.0060},
        ]
        dist = calc_same_brand_distance(39.9526, -75.1652, offices)
        assert 75 < dist < 85


class TestSisterBrandCount:
    def test_count_nearby_brands(self):
        locations = {
            "SB": [{"lat": 39.95, "lng": -75.17}],
            "LT": [{"lat": 39.96, "lng": -75.18}],
            "CF": [{"lat": 33.75, "lng": -84.39}],  # Atlanta, far away
        }
        count = count_sister_brands(39.95, -75.17, locations, "SB", 50)
        assert count == 1  # Only LT is nearby, CF is too far

    def test_none_lat_returns_zero(self):
        locations = {"SB": [{"lat": 39.95, "lng": -75.17}]}
        count = count_sister_brands(None, -75.17, locations, "XX", 50)
        assert count == 0

    def test_no_other_brands(self):
        locations = {"SB": [{"lat": 39.95, "lng": -75.17}]}
        count = count_sister_brands(39.95, -75.17, locations, "SB", 50)
        assert count == 0


class TestCrossBrandDistance:
    def test_no_offices_returns_inf(self):
        dist = calc_cross_brand_distance(39.95, -75.17, [])
        assert dist == float('inf')

    def test_none_lat_returns_inf(self):
        dist = calc_cross_brand_distance(None, -75.17, [{"lat": 40.0, "lng": -75.0}])
        assert dist == float('inf')

    def test_nearest_any_office(self):
        offices = [
            {"lat": 40.7128, "lng": -74.0060},
            {"lat": 39.2904, "lng": -76.6122},
        ]
        dist = calc_cross_brand_distance(39.9526, -75.1652, offices)
        assert 75 < dist < 85
