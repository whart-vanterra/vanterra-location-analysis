import { describe, it, expect } from 'vitest';
import { calcCompositeScore } from './scoring';
import type { ScoringConfig } from './types';

import recommendations from '../data/recommendations.json';
import config from '../data/config.json';

const typedConfig = config as unknown as ScoringConfig;

/**
 * Reconstruct the weighted brand_vol that the Python pipeline uses.
 * Python: foundation_vol * kw[foundation_repair] + basement_vol * kw[basement_waterproofing]
 *       + crawlspace_vol * kw[crawl_space] + concrete_vol * kw[concrete_lifting]
 */
function calcWeightedBrandVol(
  breakdown: { foundation: number; basement: number; crawlspace: number; concrete: number },
  brandId: string,
): number {
  const kw = typedConfig.brand_keyword_weights[brandId] ?? {};
  return (
    breakdown.foundation * (kw['foundation_repair'] ?? 1.0) +
    breakdown.basement * (kw['basement_waterproofing'] ?? 1.0) +
    breakdown.crawlspace * (kw['crawl_space'] ?? 1.0) +
    breakdown.concrete * (kw['concrete_lifting'] ?? 1.0)
  );
}

describe('canonical score verification (TS vs Python parity)', () => {
  it('all scores match canonical within +/-0.5 tolerance', () => {
    const brands = Object.keys(recommendations);
    let checked = 0;
    const mismatches: string[] = [];

    for (const brandId of brands) {
      const recs = (recommendations as any)[brandId];
      if (!Array.isArray(recs)) continue;

      // Compute weighted brand_vol for each rec, then derive max
      const brandVols = recs.map((r: any) =>
        calcWeightedBrandVol(r.search_vol_breakdown, brandId),
      );
      const maxVol = Math.max(...brandVols);
      const maxPop = Math.min(
        Math.max(...recs.map((r: any) => r.population || 0)),
        typedConfig.market_demand.population_cap,
      );

      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const brandVol = brandVols[i];

        const tsScore = calcCompositeScore({
          brandVol,
          maxBrandVol: maxVol,
          population: rec.population,
          maxBrandPop: maxPop,
          ownerPct: rec.owner_occupied_pct,
          income: rec.median_household_income,
          yearBuilt: rec.median_year_built,
          compIndex: rec.competition_index,
          sameBrandDist: rec.same_brand_distance_mi ?? Infinity,
          sisterBrands: rec.sister_brands_nearby,
          config: typedConfig,
        });

        const diff = Math.abs(tsScore - rec.composite_score);
        if (diff >= 0.5) {
          mismatches.push(
            `${brandId}/${rec.city_key}: TS=${tsScore.toFixed(2)} Python=${rec.composite_score} diff=${diff.toFixed(2)}`,
          );
        }
        checked++;
      }
    }

    if (mismatches.length > 0) {
      console.warn(`Mismatches (${mismatches.length}):\n${mismatches.slice(0, 10).join('\n')}`);
    }
    expect(mismatches.length).toBe(0);
    expect(checked).toBeGreaterThan(100);
  });
});
