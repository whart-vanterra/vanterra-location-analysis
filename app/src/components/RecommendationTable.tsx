'use client';

import { useState, useMemo } from 'react';
import type { Recommendation, ScoringConfig } from '@/lib/types';
import { formatCityName } from '@/lib/explain';
import CrmBadge from './CrmBadge';

interface RecommendationTableProps {
  recommendations: Recommendation[];
  config: ScoringConfig;
  onAddToPlan?: (rec: Recommendation) => void;
  plannedKeys?: Set<string>;
}

type SortKey =
  | 'rank'
  | 'city'
  | 'composite_score'
  | 'market_demand_score'
  | 'market_quality_score'
  | 'strategic_fit_score'
  | 'search_vol_total'
  | 'population'
  | 'competition_index'
  | 'same_brand_distance_mi'
  | 'portfolio_gap_score';

type SortDir = 'asc' | 'desc';

function scoreColor(score: number): string {
  if (score >= 75) return '#2d9e5f';
  if (score >= 50) return '#d4820a';
  return '#c0392b';
}

function compLabel(index: number): string {
  if (index >= 70) return 'Very High — proven market';
  if (index >= 40) return 'High — strong validation';
  if (index >= 15) return 'Moderate — some signal';
  return 'Low — unproven market';
}

function formatIncome(income: number): string {
  if (income >= 1000) return `$${(income / 1000).toFixed(0)}K`;
  return `$${income.toLocaleString()}`;
}

function pctBar(value: number, max: number): string {
  return `${((value / max) * 100).toFixed(0)}%`;
}

function DetailRow({ rec, config, colSpan }: { rec: Recommendation; config: ScoringConfig; colSpan: number }) {
  const w = config.weights;
  return (
    <tr>
      <td colSpan={colSpan} className="px-0 py-0">
        <div className="bg-gray-50 border-t border-b border-gray-200 px-4 py-3">
          <div className="grid grid-cols-4 gap-6 text-xs">
            {/* Market Demand breakdown */}
            <div>
              <div className="font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                Market Demand
                <span className="font-mono text-gray-500">{rec.market_demand_score.toFixed(1)}/{w.market_demand}</span>
                <span className="text-[10px] text-gray-400">{pctBar(rec.market_demand_score, w.market_demand)}</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Search Volume</span>
                  <span className="font-mono font-medium text-gray-900">{rec.search_vol_total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Foundation</span>
                  <span className="font-mono">{rec.search_vol_breakdown.foundation.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Basement</span>
                  <span className="font-mono">{rec.search_vol_breakdown.basement.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Crawlspace</span>
                  <span className="font-mono">{rec.search_vol_breakdown.crawlspace.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Concrete</span>
                  <span className="font-mono">{rec.search_vol_breakdown.concrete.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Population</span>
                  <span className="font-mono font-medium text-gray-900">{rec.population.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Market Quality breakdown */}
            <div>
              <div className="font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                Market Quality
                <span className="font-mono text-gray-500">{rec.market_quality_score.toFixed(1)}/{w.market_quality}</span>
                <span className="text-[10px] text-gray-400">{pctBar(rec.market_quality_score, w.market_quality)}</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Owner-Occupied</span>
                  <span className="font-mono font-medium text-gray-900">{(rec.owner_occupied_pct * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Floor/Ceiling</span>
                  <span className="font-mono">{(config.market_quality.owner_occ_floor * 100).toFixed(0)}%–{(config.market_quality.owner_occ_ceiling * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Median Income</span>
                  <span className="font-mono font-medium text-gray-900">{formatIncome(rec.median_household_income)}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Floor/Ceiling</span>
                  <span className="font-mono">{formatIncome(config.market_quality.income_floor)}–{formatIncome(config.market_quality.income_ceiling)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Median Year Built</span>
                  <span className="font-mono font-medium text-gray-900">{rec.median_year_built}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Oldest/Baseline</span>
                  <span className="font-mono">{config.market_quality.year_built_oldest}–{config.market_quality.year_built_baseline}</span>
                </div>
              </div>
            </div>

            {/* Strategic Fit breakdown */}
            <div>
              <div className="font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                Strategic Fit
                <span className="font-mono text-gray-500">{rec.strategic_fit_score.toFixed(1)}/{w.strategic_fit}</span>
                <span className="text-[10px] text-gray-400">{pctBar(rec.strategic_fit_score, w.strategic_fit)}</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Competition Index</span>
                  <span className="font-mono font-medium text-gray-900">{rec.competition_index.toFixed(1)}</span>
                </div>
                <div className="flex justify-between pl-3 text-gray-400">
                  <span>Tier</span>
                  <span className="font-mono">{compLabel(rec.competition_index)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Nearest Same-Brand</span>
                  <span className="font-mono font-medium text-gray-900">
                    {rec.same_brand_distance_mi != null ? `${rec.same_brand_distance_mi.toFixed(0)} mi` : 'None'}
                  </span>
                </div>
                {rec.nearest_same_brand_office && (
                  <div className="flex justify-between pl-3 text-gray-400">
                    <span>Office</span>
                    <span>{rec.nearest_same_brand_office}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Sister Brands Nearby</span>
                  <span className="font-mono font-medium text-gray-900">{rec.sister_brands_nearby}</span>
                </div>
              </div>
            </div>

            {/* Portfolio Gap + CRM */}
            <div>
              <div className="font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                Portfolio Gap
                <span className="font-mono text-gray-500">{rec.portfolio_gap_score.toFixed(1)}/25</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Cross-Brand Distance</span>
                  <span className="font-mono font-medium text-gray-900">
                    {rec.cross_brand_distance_mi != null ? `${rec.cross_brand_distance_mi.toFixed(0)} mi` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Density Class</span>
                  <span className="font-mono font-medium text-gray-900">
                    {rec.population > 300000 ? 'Urban' : rec.population > 100000 ? 'Suburban' : 'Rural/Small'}
                  </span>
                </div>
              </div>

              <div className="font-semibold text-gray-900 mt-3 mb-1.5">CRM Performance</div>
              {(rec.crm_leads > 0 || rec.crm_jobs > 0 || rec.crm_revenue > 0) ? (
                <div className="space-y-1 text-gray-600">
                  <div className="flex justify-between">
                    <span>Leads</span>
                    <span className="font-mono font-medium text-gray-900">{rec.crm_leads.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jobs</span>
                    <span className="font-mono font-medium text-gray-900">{rec.crm_jobs.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Revenue</span>
                    <span className="font-mono font-medium text-gray-900">
                      {rec.crm_revenue > 0 ? `$${rec.crm_revenue.toLocaleString()}` : '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">No CRM data for this market</div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function RecommendationTable({
  recommendations,
  config,
  onAddToPlan,
  plannedKeys,
}: RecommendationTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [minPopulation, setMinPopulation] = useState('');
  const [minSearchVol, setMinSearchVol] = useState('');
  const [minScore, setMinScore] = useState('');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'asc' : 'desc');
    }
  }

  const filtered = useMemo(() => {
    const minPop = minPopulation ? parseInt(minPopulation, 10) : 0;
    const minSv = minSearchVol ? parseInt(minSearchVol, 10) : 0;
    const minSc = minScore ? parseFloat(minScore) : 0;
    return recommendations.filter((rec) =>
      rec.population >= minPop &&
      rec.search_vol_total >= minSv &&
      rec.composite_score >= minSc
    );
  }, [recommendations, minPopulation, minSearchVol, minScore]);

  const sorted = useMemo(() => {
    const data = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;

    data.sort((a, b) => {
      let av: number | string;
      let bv: number | string;

      if (sortKey === 'city') {
        av = formatCityName(a.city_key);
        bv = formatCityName(b.city_key);
        return av < bv ? -dir : av > bv ? dir : 0;
      }

      av = a[sortKey] ?? 0;
      bv = b[sortKey] ?? 0;
      return ((av as number) - (bv as number)) * dir;
    });

    return data;
  }, [filtered, sortKey, sortDir]);

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    const arrow = active ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
    return (
      <th
        className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none whitespace-nowrap"
        onClick={() => handleSort(col)}
      >
        {label}{arrow}
      </th>
    );
  }

  if (recommendations.length === 0) {
    return <p className="text-gray-500 text-sm py-4">No recommendations available.</p>;
  }

  const hasFilters = minPopulation !== '' || minSearchVol !== '' || minScore !== '';
  const colCount = 10 + (onAddToPlan ? 1 : 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Filters:</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Min Pop.</label>
          <input
            type="number"
            value={minPopulation}
            onChange={(e) => setMinPopulation(e.target.value)}
            placeholder="0"
            className="w-24 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#4C9784] font-mono"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Min Search Vol.</label>
          <input
            type="number"
            value={minSearchVol}
            onChange={(e) => setMinSearchVol(e.target.value)}
            placeholder="0"
            className="w-24 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#4C9784] font-mono"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Min Score</label>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="0"
            step="5"
            className="w-20 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#4C9784] font-mono"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setMinPopulation(''); setMinSearchVol(''); setMinScore(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear
          </button>
        )}
        {hasFilters && (
          <span className="text-xs text-gray-400">
            {sorted.length} of {recommendations.length} markets
          </span>
        )}
      </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200" style={{ backgroundColor: '#f1f5f9' }}>
            <SortHeader label="Rank" col="rank" />
            <SortHeader label="City / State" col="city" />
            <SortHeader label="Score" col="composite_score" />
            <SortHeader label="Demand" col="market_demand_score" />
            <SortHeader label="Quality" col="market_quality_score" />
            <SortHeader label="Strat. Fit" col="strategic_fit_score" />
            <SortHeader label="Search Vol" col="search_vol_total" />
            <SortHeader label="Pop." col="population" />
            <SortHeader label="Comp. Idx" col="competition_index" />
            <SortHeader label="Distance" col="same_brand_distance_mi" />
            <SortHeader label="Gap" col="portfolio_gap_score" />
            {onAddToPlan && (
              <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((rec) => {
            const cityName = formatCityName(rec.city_key);
            const planKey = `${rec.brand_id}-${rec.city_key}`;
            const isPlanned = plannedKeys?.has(planKey) ?? false;
            const isExpanded = expandedKey === planKey;
            return (
              <>
                <tr
                  key={planKey}
                  className="border-b border-gray-100 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: isExpanded ? '#f0faf7' : isPlanned ? '#e8f4f1' : undefined,
                    borderLeft: isPlanned ? '3px solid #4C9784' : isExpanded ? '3px solid #93c5b8' : '3px solid transparent',
                  }}
                  onClick={() => setExpandedKey(isExpanded ? null : planKey)}
                  onMouseEnter={(e) => {
                    if (!isPlanned && !isExpanded) e.currentTarget.style.backgroundColor = '#f8fffd';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isExpanded ? '#f0faf7' : isPlanned ? '#e8f4f1' : '';
                  }}
                >
                  <td className="px-2 py-2 font-mono text-gray-600">
                    <span className="flex items-center gap-1">
                      <svg
                        className={`h-3 w-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {rec.rank}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-gray-900">{cityName}, {rec.state}</span>
                    <CrmBadge badge={rec.crm_badge} />
                  </td>
                  <td className="px-2 py-2">
                    <span style={{ color: scoreColor(rec.composite_score) }} className="font-bold">
                      {rec.composite_score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.market_demand_score.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.market_quality_score.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.strategic_fit_score.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.search_vol_total.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.population.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.competition_index.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.same_brand_distance_mi != null
                      ? `${rec.same_brand_distance_mi.toFixed(0)} mi`
                      : '\u2014'}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-700 text-xs">
                    {rec.portfolio_gap_score.toFixed(1)}
                  </td>
                  {onAddToPlan && (
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      {isPlanned ? (
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full"
                          style={{ backgroundColor: '#e8f7ef', color: '#2d9e5f' }}
                          title="Added to plan"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAddToPlan(rec)}
                          className="text-xs px-2.5 py-1 text-white rounded transition-colors"
                          style={{ backgroundColor: '#4C9784' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3a7868'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4C9784'; }}
                        >
                          + Plan
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <DetailRow key={`${planKey}-detail`} rec={rec} config={config} colSpan={colCount} />
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
