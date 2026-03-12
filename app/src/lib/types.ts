export interface ScoringConfig {
  weights: { market_demand: number; market_quality: number; competitive_opportunity: number };
  market_demand: { search_volume_pct: number; population_pct: number; population_cap: number };
  market_quality: {
    owner_occupied_pct: number; income_pct: number; year_built_pct: number;
    owner_occ_floor: number; owner_occ_ceiling: number;
    income_floor: number; income_ceiling: number;
    year_built_baseline: number; year_built_oldest: number;
  };
  competitive_opportunity: {
    competition_index_pct: number; same_brand_distance_pct: number;
    sister_overlap_pct: number; sister_brand_radius_mi: number;
  };
  portfolio_gap: { max_points: number; density_thresholds: Record<string, number> };
  crm_badges: { proven_threshold: number; signal_threshold: number };
  brand_keyword_weights: Record<string, Record<string, number>>;
  config_hash?: string;
}

export interface Recommendation {
  brand_id: string;
  city_key: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  population: number;
  composite_score: number;
  market_demand_score: number;
  market_quality_score: number;
  competitive_opportunity_score: number;
  portfolio_gap_score: number;
  search_vol_total: number;
  search_vol_breakdown: { foundation: number; basement: number; crawlspace: number; concrete: number };
  owner_occupied_pct: number;
  median_household_income: number;
  median_year_built: number;
  competition_index: number;
  same_brand_distance_mi: number | null;
  sister_brands_nearby: number;
  cross_brand_distance_mi: number | null;
  crm_badge: 'PROVEN' | 'SIGNAL' | null;
  crm_leads: number;
  crm_jobs: number;
  crm_revenue: number;
  rank: number;
  data_confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'SPECULATIVE';
  sensitivity_flag: boolean;
  canonical_composite?: number;
}

export interface Brand {
  brand_id: string;
  display_name: string;
  existing_locations: Array<{ city_key: string; city: string; state: string; lat: number; lng: number }>;
  zip_count: number;
  total_leads: number;
  total_jobs: number;
  total_revenue: number;
  investment_tier: string;
  investment_note: string;
  confidence_tier: 'HIGH' | 'MODERATE' | 'LOW' | 'SPECULATIVE';
  keyword_weights: Record<string, number>;
}
