'use client';

import { useState } from 'react';
import type { PlanItem } from '@/lib/types';
import { formatCityName } from '@/lib/explain';

interface LocationPlannerProps {
  plan: PlanItem[];
  onChangeAction: (brandId: string, cityKey: string, action: 'KEEP' | 'CLOSE') => void;
  onRemoveAdd: (brandId: string, cityKey: string) => void;
  onClearAdds: () => void;
}

const ACTION_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  KEEP: { label: 'KEEP', bg: '#f3f4f6', text: '#6b7280' },
  CLOSE: { label: 'CLOSE', bg: '#fee2e2', text: '#ef4444' },
  ADD: { label: 'ADD', bg: '#e8f4f1', text: '#4C9784' },
};

const LOCATION_PLAN_PROMPT = `# LOCATION PLAN RESEARCH PROMPT
# Paste the location data below into Claude with this prompt:
#
# "You are helping evaluate a full location portfolio plan for a home services company
# (foundation repair, basement waterproofing, crawl space repair). The plan includes
# KEEP (retain office), CLOSE (close office), and ADD (new market) decisions.
# For each ADD item, recommend 2-3 specific neighborhoods or areas within that city
# that would be ideal for a physical office. For CLOSE items, suggest whether the
# market could be served remotely or by a nearby office.
# Consider:
# - Proximity to neighborhoods with older homes (median year built data provided)
# - Areas with high homeownership rates (owner-occupied % provided)
# - Middle-to-upper income areas (median household income provided)
# - Population density and visibility from major roads
# - Distance from existing offices (coordinates provided)
# - Commercial real estate availability in the area
#
# For each recommended area, explain WHY it's a good fit based on the data."`;

function exportToCsv(plan: PlanItem[]) {
  const headers = [
    'action', 'brand', 'city', 'state',
    'composite_score', 'market_demand_score', 'market_quality_score', 'strategic_fit_score', 'portfolio_gap_score',
    'search_vol_total', 'population', 'owner_occupied_pct', 'median_household_income', 'median_year_built',
    'crm_badge', 'crm_leads', 'crm_jobs', 'crm_revenue',
    'data_confidence', 'sensitivity_flag', 'lat', 'lng',
  ];

  const rows = plan.map((item) => {
    const rec = item.recommendation;
    return [
      item.action,
      item.brand_id,
      formatCityName(item.city_key),
      item.state,
      rec ? rec.composite_score.toFixed(1) : '',
      rec ? rec.market_demand_score.toFixed(1) : '',
      rec ? rec.market_quality_score.toFixed(1) : '',
      rec ? rec.strategic_fit_score.toFixed(1) : '',
      rec ? rec.portfolio_gap_score.toFixed(1) : '',
      rec ? rec.search_vol_total.toString() : '',
      rec ? rec.population.toString() : '',
      rec ? rec.owner_occupied_pct.toString() : '',
      rec ? rec.median_household_income.toString() : '',
      rec ? rec.median_year_built.toString() : '',
      rec ? (rec.crm_badge ?? '') : '',
      rec ? rec.crm_leads.toString() : '',
      rec ? rec.crm_jobs.toString() : '',
      rec ? rec.crm_revenue.toString() : '',
      rec ? rec.data_confidence : '',
      rec ? (rec.sensitivity_flag ? 'YES' : 'NO') : '',
      item.lat.toString(),
      item.lng.toString(),
    ];
  });

  const promptLines = LOCATION_PLAN_PROMPT.split('\n').map((line) => `"${line}"`).join('\n');
  const headerLine = headers.map((h) => `"${h}"`).join(',');
  const dataLines = rows.map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const csv = `${promptLines}\n${headerLine}\n${dataLines}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'location-plan.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function LocationPlanner({
  plan,
  onChangeAction,
  onRemoveAdd,
  onClearAdds,
}: LocationPlannerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const closeCount = plan.filter((p) => p.action === 'CLOSE').length;
  const addCount = plan.filter((p) => p.action === 'ADD').length;
  const keepCount = plan.filter((p) => p.action === 'KEEP').length;

  const totalVisible = plan.length;

  const closeItems = plan.filter((p) => p.action === 'CLOSE');
  const addItems = plan.filter((p) => p.action === 'ADD');
  const keepItems = plan.filter((p) => p.action === 'KEEP');
  const orderedPlan = [...closeItems, ...addItems, ...keepItems];

  if (totalVisible === 0) {
    return (
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Location Plan</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: '#e8f4f1', color: '#4C9784' }}>0</span>
          <span className="text-xs text-gray-400">Select a brand to track offices, or add markets from the table.</span>
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
          <h3 className="text-sm font-semibold text-gray-900">Location Plan</h3>
          <div className="flex items-center gap-1.5">
            {closeCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold" style={{ backgroundColor: '#fee2e2', color: '#ef4444' }}>
                {closeCount} CLOSE
              </span>
            )}
            {addCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold" style={{ backgroundColor: '#e8f4f1', color: '#4C9784' }}>
                {addCount} ADD
              </span>
            )}
            {keepCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold" style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                {keepCount} KEEP
              </span>
            )}
          </div>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          {addCount > 0 && (
            <button
              type="button"
              onClick={onClearAdds}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Clear Adds
            </button>
          )}
          <button
            type="button"
            onClick={() => exportToCsv(orderedPlan)}
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
                <th className="text-left py-1.5 px-2">Action</th>
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
              {orderedPlan.map((item) => {
                const style = ACTION_STYLES[item.action];
                const rec = item.recommendation;
                const rowBg = item.action === 'CLOSE' ? '#fff5f5' : item.action === 'ADD' ? '#f0faf7' : undefined;
                return (
                  <tr
                    key={`${item.brand_id}-${item.city_key}`}
                    className="border-b border-gray-50"
                    style={{ backgroundColor: rowBg }}
                  >
                    <td className="py-1.5 px-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold font-mono"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 font-mono text-xs text-gray-600">{item.brand_id}</td>
                    <td className="py-1.5 px-2 font-medium text-gray-900">{formatCityName(item.city_key)}</td>
                    <td className="py-1.5 px-2 text-gray-600">{item.state}</td>
                    <td className="py-1.5 px-2 text-right font-mono font-semibold">
                      {rec ? rec.composite_score.toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs">
                      {rec ? rec.market_demand_score.toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs">
                      {rec ? rec.market_quality_score.toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs">
                      {rec ? rec.strategic_fit_score.toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs">
                      {rec ? rec.search_vol_total.toLocaleString() : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs">
                      {rec ? rec.population.toLocaleString() : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-center text-xs">
                      {rec?.crm_badge ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${rec.crm_badge === 'PROVEN' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {rec.crm_badge}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {item.action === 'KEEP' && (
                        <button
                          type="button"
                          onClick={() => onChangeAction(item.brand_id, item.city_key, 'CLOSE')}
                          className="text-[10px] px-2 py-0.5 rounded border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
                        >
                          Close
                        </button>
                      )}
                      {item.action === 'CLOSE' && (
                        <button
                          type="button"
                          onClick={() => onChangeAction(item.brand_id, item.city_key, 'KEEP')}
                          className="text-[10px] px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Restore
                        </button>
                      )}
                      {item.action === 'ADD' && (
                        <button
                          type="button"
                          onClick={() => onRemoveAdd(item.brand_id, item.city_key)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove from plan"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
