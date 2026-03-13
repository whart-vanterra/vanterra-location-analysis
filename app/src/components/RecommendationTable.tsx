'use client';

import { useState, useMemo } from 'react';
import type { Recommendation, ScoringConfig } from '@/lib/types';
import { formatCityName } from '@/lib/explain';
import CrmBadge from './CrmBadge';
import SensitivityIndicator from './SensitivityIndicator';
import ScoreSparkline from './ScoreSparkline';
import ScorePopover from './ScorePopover';

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

export default function RecommendationTable({
  recommendations,
  config,
  onAddToPlan,
  plannedKeys,
}: RecommendationTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'asc' : 'desc');
    }
  }

  const sorted = useMemo(() => {
    const data = [...recommendations];
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
  }, [recommendations, sortKey, sortDir]);

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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200" style={{ backgroundColor: '#f1f5f9' }}>
            <SortHeader label="Rank" col="rank" />
            <SortHeader label="City / State" col="city" />
            <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wider w-20">
              Breakdown
            </th>
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
            return (
              <tr
                key={planKey}
                className="border-b border-gray-100 transition-colors"
                style={{
                  backgroundColor: isPlanned ? '#e8f4f1' : undefined,
                  borderLeft: isPlanned ? '3px solid #4C9784' : '3px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isPlanned) e.currentTarget.style.backgroundColor = '#f8fffd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isPlanned ? '#e8f4f1' : '';
                }}
              >
                <td className="px-2 py-2 font-mono text-gray-600">{rec.rank}</td>
                <td className="px-2 py-2">
                  <span className="font-medium text-gray-900">{cityName}, {rec.state}</span>
                  <CrmBadge badge={rec.crm_badge} />
                  <SensitivityIndicator sensitive={rec.sensitivity_flag} />
                </td>
                <td className="px-2 py-2">
                  <div className="w-20">
                    <ScoreSparkline
                      demand={rec.market_demand_score}
                      quality={rec.market_quality_score}
                      strategicFit={rec.strategic_fit_score}
                    />
                  </div>
                </td>
                <td className="px-2 py-2">
                  <ScorePopover recommendation={rec} config={config}>
                    <span style={{ color: scoreColor(rec.composite_score) }} className="font-bold">
                      {rec.composite_score.toFixed(1)}
                    </span>
                  </ScorePopover>
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
                  <td className="px-2 py-2">
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
