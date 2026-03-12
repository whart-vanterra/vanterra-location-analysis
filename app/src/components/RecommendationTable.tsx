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
}

type SortKey =
  | 'rank'
  | 'city'
  | 'composite_score'
  | 'search_vol_total'
  | 'population'
  | 'competition_index'
  | 'same_brand_distance_mi';

type SortDir = 'asc' | 'desc';

const INITIAL_ROWS = 25;

function rowColor(score: number): string {
  if (score >= 75) return 'bg-green-50';
  if (score >= 50) return 'bg-yellow-50';
  return 'bg-red-50';
}

export default function RecommendationTable({
  recommendations,
  config,
  onAddToPlan,
}: RecommendationTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showAll, setShowAll] = useState(false);

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

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_ROWS);

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    const arrow = active ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none whitespace-nowrap"
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
          <tr className="border-b-2 border-gray-200 bg-gray-50">
            <SortHeader label="Rank" col="rank" />
            <SortHeader label="City / State" col="city" />
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
              Breakdown
            </th>
            <SortHeader label="Score" col="composite_score" />
            <SortHeader label="Search Vol" col="search_vol_total" />
            <SortHeader label="Population" col="population" />
            <SortHeader label="Competition" col="competition_index" />
            <SortHeader label="Distance" col="same_brand_distance_mi" />
            {onAddToPlan && (
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((rec) => {
            const cityName = formatCityName(rec.city_key);
            return (
              <tr
                key={`${rec.brand_id}-${rec.city_key}`}
                className={`border-b border-gray-100 ${rowColor(rec.composite_score)} hover:bg-gray-100 transition-colors`}
              >
                <td className="px-3 py-2 font-mono text-gray-600">{rec.rank}</td>
                <td className="px-3 py-2">
                  <span className="font-medium text-gray-900">{cityName}, {rec.state}</span>
                  <CrmBadge badge={rec.crm_badge} />
                  <SensitivityIndicator sensitive={rec.sensitivity_flag} />
                </td>
                <td className="px-3 py-2">
                  <div className="w-24">
                    <ScoreSparkline
                      demand={rec.market_demand_score}
                      quality={rec.market_quality_score}
                      competition={rec.competitive_opportunity_score}
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <ScorePopover recommendation={rec} config={config}>
                    {rec.composite_score.toFixed(1)}
                  </ScorePopover>
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">
                  {rec.search_vol_total.toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">
                  {rec.population.toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">
                  {rec.competition_index.toFixed(1)}
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">
                  {rec.same_brand_distance_mi != null
                    ? `${rec.same_brand_distance_mi.toFixed(0)} mi`
                    : '\u2014'}
                </td>
                {onAddToPlan && (
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onAddToPlan(rec)}
                      className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      + Plan
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {!showAll && recommendations.length > INITIAL_ROWS && (
        <div className="text-center py-3">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Show all {recommendations.length} recommendations
          </button>
        </div>
      )}

      {showAll && recommendations.length > INITIAL_ROWS && (
        <div className="text-center py-3">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Show top {INITIAL_ROWS} only
          </button>
        </div>
      )}
    </div>
  );
}
