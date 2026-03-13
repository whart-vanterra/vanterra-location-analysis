import type { ScoringConfig } from './types';

export function clamp(val: number, lo: number, hi: number): number {
  if (val < lo) return lo;
  if (val > hi) return hi;
  return val;
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function calcMarketDemand(
  brandVol: number,
  maxBrandVol: number,
  population: number,
  maxBrandPop: number,
  config: ScoringConfig,
): number {
  const w = config.weights.market_demand;
  const md = config.market_demand;

  const ratio = maxBrandVol > 0 ? brandVol / maxBrandVol : 0;
  const searchScore = Math.sqrt(ratio) * w * md.search_volume_pct;

  const popCap = md.population_cap;
  const cappedPop = Math.min(population, popCap);
  const maxPop = Math.min(maxBrandPop, popCap);
  const popRatio = maxPop > 0 ? cappedPop / maxPop : 0;
  const popScore = Math.sqrt(popRatio) * w * md.population_pct;

  return searchScore + popScore;
}

export function calcMarketQuality(
  ownerPct: number,
  income: number,
  yearBuilt: number,
  config: ScoringConfig,
): number {
  const w = config.weights.market_quality;
  const mq = config.market_quality;

  const floor = mq.owner_occ_floor;
  const ceiling = mq.owner_occ_ceiling;
  const rawOwner = clamp((ownerPct - floor) / (ceiling - floor), 0, 1);
  const ownerScore = rawOwner * w * mq.owner_occupied_pct;

  const incFloor = mq.income_floor;
  const incCeiling = mq.income_ceiling;
  const rawIncome = clamp((income - incFloor) / (incCeiling - incFloor), 0, 1);
  const incomeScore = rawIncome * w * mq.income_pct;

  const baseline = mq.year_built_baseline;
  const oldest = mq.year_built_oldest;
  const rawYear = clamp((baseline - yearBuilt) / (baseline - oldest), 0, 1);
  const yearScore = rawYear * w * mq.year_built_pct;

  return ownerScore + incomeScore + yearScore;
}

export type CompetitionMode = 'validation' | 'opportunity';

export function calcStrategicFit(
  compIndex: number,
  sameBrandDist: number,
  sisterBrands: number,
  config: ScoringConfig,
  competitionMode: CompetitionMode = 'validation',
): number {
  const w = config.weights.strategic_fit;
  const sf = config.strategic_fit;

  let rawComp: number;
  if (competitionMode === 'validation') {
    if (compIndex >= 70) rawComp = 1.0;
    else if (compIndex >= 40) rawComp = 0.7;
    else if (compIndex >= 15) rawComp = 0.4;
    else rawComp = 0.15;
  } else {
    if (compIndex < 15) rawComp = 1.0;
    else if (compIndex < 40) rawComp = 0.7;
    else if (compIndex < 70) rawComp = 0.4;
    else rawComp = 0.15;
  }
  const compScore = rawComp * w * sf.market_validation_pct;

  let rawDist: number;
  if (sameBrandDist < 15) {
    rawDist = 0;
  } else if (sameBrandDist < 30) {
    rawDist = (sameBrandDist - 15) / 15;
  } else if (sameBrandDist < 60) {
    rawDist = 1.0;
  } else {
    rawDist = 0.8;
  }
  const sameBrandScore = rawDist * w * sf.same_brand_distance_pct;

  let rawSister: number;
  if (sisterBrands === 0) {
    rawSister = 1.0;
  } else if (sisterBrands <= 2) {
    rawSister = 0.7;
  } else {
    rawSister = 0.4;
  }
  const sisterScore = rawSister * w * sf.sister_overlap_pct;

  return compScore + sameBrandScore + sisterScore;
}

export function calcPortfolioGap(
  crossBrandDist: number,
  density: number,
  config: ScoringConfig,
): number {
  const pg = config.portfolio_gap;
  const maxPts = pg.max_points;
  const dt = pg.density_thresholds;

  let threshold: number;
  if (density > 3000) {
    threshold = dt['urban'];
  } else if (density > 1000) {
    threshold = dt['suburban'];
  } else {
    threshold = dt['rural'];
  }

  const half = threshold * 0.5;
  if (crossBrandDist < half) {
    return 0;
  } else if (crossBrandDist < threshold) {
    return maxPts * (crossBrandDist - half) / half;
  } else {
    return maxPts;
  }
}

export function calcCrmBadge(
  jobs: number,
  config: ScoringConfig,
): 'PROVEN' | 'SIGNAL' | null {
  const badges = config.crm_badges;
  if (jobs >= badges.proven_threshold) {
    return 'PROVEN';
  } else if (jobs >= badges.signal_threshold) {
    return 'SIGNAL';
  }
  return null;
}

interface CompositeScoreInput {
  brandVol: number;
  maxBrandVol: number;
  population: number;
  maxBrandPop: number;
  ownerPct: number;
  income: number;
  yearBuilt: number;
  compIndex: number;
  sameBrandDist: number;
  sisterBrands: number;
  config: ScoringConfig;
  competitionMode?: CompetitionMode;
}

export function calcCompositeScore(input: CompositeScoreInput): number {
  const {
    brandVol, maxBrandVol, population, maxBrandPop,
    ownerPct, income, yearBuilt,
    compIndex, sameBrandDist, sisterBrands, config,
    competitionMode = 'validation',
  } = input;

  const demand = calcMarketDemand(brandVol, maxBrandVol, population, maxBrandPop, config);
  const quality = calcMarketQuality(ownerPct, income, yearBuilt, config);
  const strategicFit = calcStrategicFit(compIndex, sameBrandDist, sisterBrands, config, competitionMode);

  return demand + quality + strategicFit;
}
