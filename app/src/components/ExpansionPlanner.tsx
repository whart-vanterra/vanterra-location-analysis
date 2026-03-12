'use client';

import type { Recommendation } from '@/lib/types';
import { formatCityName } from '@/lib/explain';

interface ExpansionPlannerProps {
  plan: Recommendation[];
  onRemove: (cityKey: string, brandId: string) => void;
}

function exportToCsv(plan: Recommendation[]) {
  const headers = ['Brand', 'City', 'State', 'Score', 'Search Volume', 'Population', 'Competition Index', 'CRM Badge'];
  const rows = plan.map((rec) => [
    rec.brand_id,
    formatCityName(rec.city_key),
    rec.state,
    rec.composite_score.toFixed(1),
    rec.search_vol_total.toString(),
    rec.population.toString(),
    rec.competition_index.toFixed(1),
    rec.crm_badge ?? '',
  ]);

  const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'expansion-plan.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExpansionPlanner({ plan, onRemove }: ExpansionPlannerProps) {
  if (plan.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Expansion Plan</h3>
        <p className="text-xs text-gray-400">
          Add markets from the table to build your expansion plan.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Expansion Plan ({plan.length})
        </h3>
        <button
          type="button"
          onClick={() => exportToCsv(plan)}
          className="text-xs px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
        {plan.map((rec) => (
          <div
            key={`${rec.brand_id}-${rec.city_key}`}
            className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 truncate">
                {formatCityName(rec.city_key)}, {rec.state}
              </div>
              <div className="text-xs text-gray-500">
                {rec.brand_id} — Score: {rec.composite_score.toFixed(1)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(rec.city_key, rec.brand_id)}
              className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove from plan"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
