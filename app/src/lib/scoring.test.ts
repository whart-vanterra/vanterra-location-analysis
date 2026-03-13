import { describe, it, expect } from 'vitest';
import { calcMarketDemand, calcMarketQuality, calcStrategicFit, calcPortfolioGap, calcCrmBadge, calcCompositeScore } from './scoring';
import type { ScoringConfig } from './types';

import config from '../../../pipeline/config.json';

const typedConfig = config as unknown as ScoringConfig;

describe('scoring engine unit tests', () => {
  it('Philadelphia beats Levittown', () => {
    const philly = calcCompositeScore({
      brandVol: 780, maxBrandVol: 780, population: 500000, maxBrandPop: 500000,
      ownerPct: 0.47, income: 57000, yearBuilt: 1949,
      compIndex: 8.2, sameBrandDist: 45, sisterBrands: 2,
      config: typedConfig,
    });
    const levittown = calcCompositeScore({
      brandVol: 60, maxBrandVol: 780, population: 63000, maxBrandPop: 500000,
      ownerPct: 0.85, income: 98000, yearBuilt: 1956,
      compIndex: 22.1, sameBrandDist: 45, sisterBrands: 1,
      config: typedConfig,
    });
    expect(philly).toBeGreaterThan(levittown);
    expect(philly - levittown).toBeGreaterThan(10);
  });

  it('market demand uses sqrt dampening', () => {
    const high = calcMarketDemand(1000, 1000, 100000, 500000, typedConfig);
    const low = calcMarketDemand(100, 1000, 100000, 500000, typedConfig);
    const ratio = high / low;
    expect(ratio).toBeGreaterThan(2.0);
    expect(ratio).toBeLessThan(5.0);
  });

  it('CRM badges are correct', () => {
    expect(calcCrmBadge(15, typedConfig)).toBe('PROVEN');
    expect(calcCrmBadge(5, typedConfig)).toBe('SIGNAL');
    expect(calcCrmBadge(0, typedConfig)).toBeNull();
  });

  it('portfolio gap toggle changes scores', () => {
    const withGap = calcPortfolioGap(100, 1000, typedConfig);
    const noGap = calcPortfolioGap(3, 5000, typedConfig);
    expect(withGap).toBe(25);
    expect(noGap).toBe(0);
  });

  it('market quality clamps at boundaries', () => {
    const maxQuality = calcMarketQuality(0.90, 120000, 1940, typedConfig);
    const minQuality = calcMarketQuality(0.30, 40000, 2025, typedConfig);
    expect(maxQuality).toBe(30);
    expect(minQuality).toBe(0);
  });

  it('strategic fit rewards high competition as market validation', () => {
    const highComp = calcStrategicFit(80, 45, 0, typedConfig);
    const lowComp = calcStrategicFit(5, 45, 0, typedConfig);
    expect(highComp).toBeGreaterThan(lowComp);
  });

  it('strategic fit handles distance thresholds', () => {
    const tooClose = calcStrategicFit(50, 10, 0, typedConfig);
    const sweetSpot = calcStrategicFit(50, 45, 0, typedConfig);
    const tooFar = calcStrategicFit(50, 100, 0, typedConfig);
    expect(sweetSpot).toBeGreaterThan(tooClose);
    expect(sweetSpot).toBeGreaterThan(tooFar);
  });

  it('strategic fit tiered competition values', () => {
    const veryHigh = calcStrategicFit(70, 45, 0, typedConfig);
    const high = calcStrategicFit(40, 45, 0, typedConfig);
    const moderate = calcStrategicFit(15, 45, 0, typedConfig);
    const low = calcStrategicFit(5, 45, 0, typedConfig);
    expect(veryHigh).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(low);
  });
});
