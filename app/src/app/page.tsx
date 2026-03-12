'use client';

import { useState, useMemo } from 'react';
import type { Recommendation, Brand, ScoringConfig } from '@/lib/types';
import { formatCityName } from '@/lib/explain';
import BrandSelector from '@/components/BrandSelector';
import BrandCard from '@/components/BrandCard';
import RecommendationTable from '@/components/RecommendationTable';

import recommendationsData from '@/data/recommendations.json';
import brandsData from '@/data/brands.json';
import configData from '@/data/config.json';

const brands = brandsData as unknown as Brand[];
const config = configData as unknown as ScoringConfig;
const recommendationsByBrand = recommendationsData as unknown as Record<string, Recommendation[]>;

export default function Home() {
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  const selectedBrand = useMemo(
    () => brands.find((b) => b.brand_id === selectedBrandId) ?? null,
    [selectedBrandId]
  );

  const selectedRecommendations = useMemo(() => {
    if (!selectedBrandId) return [];
    return recommendationsByBrand[selectedBrandId] ?? [];
  }, [selectedBrandId]);

  return (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Brand
        </label>
        <BrandSelector
          brands={brands}
          selectedBrandId={selectedBrandId}
          onSelect={setSelectedBrandId}
        />
      </div>

      {selectedBrand && (
        <div>
          <BrandCard brand={selectedBrand} />
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Recommended Markets ({selectedRecommendations.length})
            </h3>
            <RecommendationTable
              recommendations={selectedRecommendations}
              config={config}
            />
          </div>
        </div>
      )}

      {!selectedBrand && <AllBrandsSummary />}
    </div>
  );
}

function AllBrandsSummary() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">All Brands Overview</h2>
      <p className="text-sm text-gray-500">
        Select a brand above to see full recommendations, or browse the top 3 markets per brand below.
      </p>

      <div className="grid gap-4">
        {brands.map((brand) => {
          const recs = recommendationsByBrand[brand.brand_id] ?? [];
          const top3 = recs.slice(0, 3);

          return (
            <div
              key={brand.brand_id}
              className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-gray-900">{brand.display_name}</span>
                  <span className="ml-2 text-xs text-gray-400 font-mono">{brand.brand_id}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {recs.length} recommendations
                </span>
              </div>

              {top3.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1 text-gray-500 font-medium">Rank</th>
                      <th className="text-left py-1 text-gray-500 font-medium">City</th>
                      <th className="text-right py-1 text-gray-500 font-medium">Score</th>
                      <th className="text-right py-1 text-gray-500 font-medium">Search Vol</th>
                      <th className="text-right py-1 text-gray-500 font-medium">Population</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top3.map((rec) => (
                      <tr key={rec.city_key} className="border-b border-gray-50">
                        <td className="py-1 font-mono text-gray-600">{rec.rank}</td>
                        <td className="py-1 text-gray-800">
                          {formatCityName(rec.city_key)}, {rec.state}
                        </td>
                        <td className="py-1 text-right font-mono font-semibold text-gray-900">
                          {rec.composite_score.toFixed(1)}
                        </td>
                        <td className="py-1 text-right font-mono text-gray-600">
                          {rec.search_vol_total.toLocaleString()}
                        </td>
                        <td className="py-1 text-right font-mono text-gray-600">
                          {rec.population.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-400">No recommendations generated</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
