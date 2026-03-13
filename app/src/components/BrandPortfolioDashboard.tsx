'use client';

import { useState, useMemo } from 'react';
import type { Brand, Recommendation, ScoringConfig } from '@/lib/types';
import { formatCityName } from '@/lib/explain';
import { rescoreRecommendations } from '@/lib/rescore';

interface BrandPortfolioDashboardProps {
  brands: Brand[];
  recommendationsByBrand: Record<string, Recommendation[]>;
  config: ScoringConfig;
  portfolioGapEnabled: boolean;
  onSelectBrand: (brandId: string) => void;
}

type SortOption = 'name' | 'offices' | 'topScore';

const CONFIDENCE_COLORS: Record<string, { text: string; bg: string }> = {
  HIGH: { text: '#2d9e5f', bg: '#e8f7ef' },
  MODERATE: { text: '#d4820a', bg: '#fef3e2' },
  LOW: { text: '#c55a11', bg: '#fdeee5' },
  SPECULATIVE: { text: '#c0392b', bg: '#fdecea' },
};

export default function BrandPortfolioDashboard({
  brands,
  recommendationsByBrand,
  config,
  portfolioGapEnabled,
  onSelectBrand,
}: BrandPortfolioDashboardProps) {
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const brandData = useMemo(() => {
    return brands.map((brand) => {
      const raw = recommendationsByBrand[brand.brand_id] ?? [];
      const recs = rescoreRecommendations(raw, config, portfolioGapEnabled);
      const top3 = recs.slice(0, 3);
      const topScore = top3.length > 0 ? top3[0].composite_score : 0;
      return { brand, recs, top3, topScore };
    });
  }, [brands, recommendationsByBrand, config, portfolioGapEnabled]);

  const sorted = useMemo(() => {
    const data = [...brandData];
    switch (sortBy) {
      case 'name':
        data.sort((a, b) => a.brand.display_name.localeCompare(b.brand.display_name));
        break;
      case 'offices':
        data.sort((a, b) => b.brand.existing_locations.length - a.brand.existing_locations.length);
        break;
      case 'topScore':
        data.sort((a, b) => b.topScore - a.topScore);
        break;
    }
    return data;
  }, [brandData, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Brand Portfolio</h2>
          <p className="text-sm text-gray-500">
            Click a brand card to see full recommendations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort by:</span>
          {([
            { value: 'name', label: 'Name' },
            { value: 'offices', label: 'Offices' },
            { value: 'topScore', label: 'Top Score' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSortBy(value)}
              className="text-xs px-2.5 py-1 rounded border transition-colors"
              style={
                sortBy === value
                  ? { backgroundColor: '#4C9784', color: 'white', borderColor: '#4C9784' }
                  : { backgroundColor: 'white', color: '#4b5563', borderColor: '#d1d5db' }
              }
              onMouseEnter={(e) => {
                if (sortBy !== value) e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                if (sortBy !== value) e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sorted.map(({ brand, recs, top3 }) => {
          const colors = CONFIDENCE_COLORS[brand.confidence_tier] ?? CONFIDENCE_COLORS.LOW;
          return (
            <button
              key={brand.brand_id}
              type="button"
              onClick={() => onSelectBrand(brand.brand_id)}
              className="border border-gray-200 rounded-lg shadow-sm text-left transition-all overflow-hidden"
              style={{ backgroundColor: 'white' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4C9784';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(76, 151, 132, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
              }}
            >
              <div className="px-4 py-2" style={{ backgroundColor: '#4C9784' }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-white">{brand.display_name}</div>
                    <div className="text-xs text-white/60 font-mono">{brand.brand_id}</div>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ color: colors.text, backgroundColor: colors.bg }}
                  >
                    {brand.confidence_tier}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                  <span>{brand.existing_locations.length} offices</span>
                  <span>{recs.length} markets</span>
                </div>

                {top3.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                      Top Markets
                    </div>
                    {top3.map((rec, i) => (
                      <div key={rec.city_key} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate">
                          <span className="text-gray-400 font-mono mr-1">{i + 1}.</span>
                          {formatCityName(rec.city_key)}, {rec.state}
                        </span>
                        <span className="font-mono font-semibold text-gray-900 ml-2">
                          {rec.composite_score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No recommendations</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
