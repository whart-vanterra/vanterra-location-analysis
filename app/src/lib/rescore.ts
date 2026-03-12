import type { Recommendation, ScoringConfig } from './types';
import { calcCompositeScore } from './scoring';

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
