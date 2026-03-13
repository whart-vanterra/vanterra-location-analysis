'use client';

import { useState } from 'react';
import type { Recommendation } from '@/lib/types';
import { formatCityName } from '@/lib/explain';

interface ExpansionPlannerProps {
  plan: Recommendation[];
  onRemove: (cityKey: string, brandId: string) => void;
  onClearAll: () => void;
}

const EXPANSION_PROMPT = `# EXPANSION PLAN RESEARCH PROMPT
# Paste the location data below into Claude with this prompt:
#
# "You are helping identify the best specific office location within each city
# for a home services company (foundation repair, basement waterproofing, crawl space repair).
# For each city in my expansion plan, recommend 2-3 specific neighborhoods or areas
# that would be ideal for a physical office location. Consider:
# - Proximity to neighborhoods with older homes (median year built data provided)
# - Areas with high homeownership rates (owner-occupied % provided)
# - Middle-to-upper income areas (median household income provided)
# - Population density and visibility from major roads
# - Distance from our existing offices (coordinates provided)
# - Commercial real estate availability in the area
#
# For each recommended area, explain WHY it's a good fit based on the data."`;

function exportToCsv(plan: Recommendation[]) {
  const headers = [
    'city', 'state', 'brand', 'composite_score',
    'market_demand_score', 'market_quality_score', 'strategic_fit_score', 'portfolio_gap_score',
    'search_vol_total', 'search_vol_foundation', 'search_vol_basement', 'search_vol_crawlspace', 'search_vol_concrete',
    'population', 'owner_occupied_pct', 'median_household_income', 'median_year_built',
    'competition_index', 'same_brand_distance_mi', 'sister_brands_nearby', 'cross_brand_distance_mi',
    'crm_badge', 'crm_leads', 'crm_jobs', 'crm_revenue',
    'data_confidence', 'sensitivity_flag', 'lat', 'lng',
  ];

  const rows = plan.map((rec) => [
    formatCityName(rec.city_key),
    rec.state,
    rec.brand_id,
    rec.composite_score.toFixed(1),
    rec.market_demand_score.toFixed(1),
    rec.market_quality_score.toFixed(1),
    rec.strategic_fit_score.toFixed(1),
    rec.portfolio_gap_score.toFixed(1),
    rec.search_vol_total.toString(),
    rec.search_vol_breakdown.foundation.toString(),
    rec.search_vol_breakdown.basement.toString(),
    rec.search_vol_breakdown.crawlspace.toString(),
    rec.search_vol_breakdown.concrete.toString(),
    rec.population.toString(),
    rec.owner_occupied_pct.toString(),
    rec.median_household_income.toString(),
    rec.median_year_built.toString(),
    rec.competition_index.toFixed(1),
    rec.same_brand_distance_mi?.toFixed(1) ?? '',
    rec.sister_brands_nearby.toString(),
    rec.cross_brand_distance_mi?.toFixed(1) ?? '',
    rec.crm_badge ?? '',
    rec.crm_leads.toString(),
    rec.crm_jobs.toString(),
    rec.crm_revenue.toString(),
    rec.data_confidence,
    rec.sensitivity_flag ? 'YES' : 'NO',
    rec.lat.toString(),
    rec.lng.toString(),
  ]);

  const promptLines = EXPANSION_PROMPT.split('\n').map((line) => `"${line}"`).join('\n');
  const headerLine = headers.map((h) => `"${h}"`).join(',');
  const dataLines = rows.map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const csv = `${promptLines}\n${headerLine}\n${dataLines}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'expansion-plan.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExpansionPlanner({ plan, onRemove, onClearAll }: ExpansionPlannerProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (plan.length === 0) {
    return (
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Expansion Plan</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: '#e8f4f1', color: '#4C9784' }}>0</span>
          <span className="text-xs text-gray-400">Add markets from the table to build your expansion plan.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="px-6 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3"
        >
          <h3 className="text-sm font-semibold text-gray-900">Expansion Plan</h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold"
            style={{ backgroundColor: '#e8f4f1', color: '#4C9784' }}
          >
            {plan.length}
          </span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={() => exportToCsv(plan)}
            className="text-xs px-3 py-1.5 text-white rounded transition-colors font-semibold"
            style={{ backgroundColor: '#4C9784' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3a7868'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4C9784'; }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="px-6 pb-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left py-1.5 px-2">Brand</th>
                <th className="text-left py-1.5 px-2">City</th>
                <th className="text-left py-1.5 px-2">State</th>
                <th className="text-right py-1.5 px-2">Score</th>
                <th className="text-right py-1.5 px-2">Demand</th>
                <th className="text-right py-1.5 px-2">Quality</th>
                <th className="text-right py-1.5 px-2">Strat. Fit</th>
                <th className="text-right py-1.5 px-2">Search Vol</th>
                <th className="text-right py-1.5 px-2">Pop.</th>
                <th className="text-center py-1.5 px-2">CRM</th>
                <th className="text-center py-1.5 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {plan.map((rec) => (
                <tr key={`${rec.brand_id}-${rec.city_key}`} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 px-2 font-mono text-xs text-gray-600">{rec.brand_id}</td>
                  <td className="py-1.5 px-2 font-medium text-gray-900">{formatCityName(rec.city_key)}</td>
                  <td className="py-1.5 px-2 text-gray-600">{rec.state}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-semibold">{rec.composite_score.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs">{rec.market_demand_score.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs">{rec.market_quality_score.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs">{rec.strategic_fit_score.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs">{rec.search_vol_total.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs">{rec.population.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-center text-xs">
                    {rec.crm_badge ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${rec.crm_badge === 'PROVEN' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {rec.crm_badge}
                      </span>
                    ) : '--'}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove(rec.city_key, rec.brand_id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove from plan"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
