import type { Recommendation, ScoringConfig, Brand } from './types';
import { calcCompositeScore, calcPortfolioGap, calcStrategicFit, haversine } from './scoring';

export function rescoreRecommendations(
  recs: readonly Recommendation[],
  config: ScoringConfig,
  portfolioGapEnabled: boolean,
): Recommendation[] {
  const maxBrandVol = recs.reduce((max, r) => Math.max(max, r.search_vol_total), 0);
  const maxBrandPop = recs.reduce((max, r) => Math.max(max, r.population), 0);

  const rescored = recs.map((rec) => {
    const baseScore = calcCompositeScore({
      brandVol: rec.search_vol_total,
      maxBrandVol,
      population: rec.population,
      maxBrandPop,
      ownerPct: rec.owner_occupied_pct,
      income: rec.median_household_income,
      yearBuilt: rec.median_year_built,
      compIndex: rec.competition_index,
      sameBrandDist: rec.same_brand_distance_mi ?? 999,
      sisterBrands: rec.sister_brands_nearby,
      config,
    });

    const finalScore = portfolioGapEnabled
      ? ((baseScore + rec.portfolio_gap_score) / 125) * 100
      : baseScore;

    return { ...rec, composite_score: finalScore };
  });

  const sorted = [...rescored].sort((a, b) => b.composite_score - a.composite_score);
  return sorted.map((rec, i) => ({ ...rec, rank: i + 1 }));
}

export function rescoreWithOfficeToggle(
  recs: readonly Recommendation[],
  config: ScoringConfig,
  portfolioGapEnabled: boolean,
  brand: Brand,
  activeOffices: Set<string>,
): Recommendation[] {
  const activeLocations = brand.existing_locations.filter((loc) =>
    activeOffices.has(loc.city_key)
  );

  const allBrandLocations = brand.existing_locations;
  const allActive = activeLocations.length === allBrandLocations.length;

  if (allActive) {
    return rescoreRecommendations(recs, config, portfolioGapEnabled);
  }

  const maxBrandVol = recs.reduce((max, r) => Math.max(max, r.search_vol_total), 0);
  const maxBrandPop = recs.reduce((max, r) => Math.max(max, r.population), 0);

  const rescored = recs.map((rec) => {
    let sameBrandDist: number | null = null;
    let nearestOffice: string | null = null;

    if (activeLocations.length > 0) {
      let minDist = Infinity;
      for (const loc of activeLocations) {
        const dist = haversine(rec.lat, rec.lng, loc.lat, loc.lng);
        if (dist < minDist) {
          minDist = dist;
          nearestOffice = `${loc.city}, ${loc.state}`;
        }
      }
      sameBrandDist = minDist;
    }

    let sisterCount = rec.sister_brands_nearby;

    const crossBrandDist = rec.cross_brand_distance_mi;

    const strategicFitScore = calcStrategicFit(
      rec.competition_index,
      sameBrandDist ?? 999,
      sisterCount,
      config,
    );

    const baseScore = calcCompositeScore({
      brandVol: rec.search_vol_total,
      maxBrandVol,
      population: rec.population,
      maxBrandPop,
      ownerPct: rec.owner_occupied_pct,
      income: rec.median_household_income,
      yearBuilt: rec.median_year_built,
      compIndex: rec.competition_index,
      sameBrandDist: sameBrandDist ?? 999,
      sisterBrands: sisterCount,
      config,
    });

    const portfolioGapScore = crossBrandDist != null
      ? calcPortfolioGap(crossBrandDist, rec.population, config)
      : rec.portfolio_gap_score;

    const finalScore = portfolioGapEnabled
      ? ((baseScore + portfolioGapScore) / 125) * 100
      : baseScore;

    return {
      ...rec,
      composite_score: finalScore,
      same_brand_distance_mi: sameBrandDist,
      nearest_same_brand_office: nearestOffice ?? rec.nearest_same_brand_office,
      sister_brands_nearby: sisterCount,
      strategic_fit_score: strategicFitScore,
      portfolio_gap_score: portfolioGapScore,
    };
  });

  const sorted = [...rescored].sort((a, b) => b.composite_score - a.composite_score);
  return sorted.map((rec, i) => ({ ...rec, rank: i + 1 }));
}
