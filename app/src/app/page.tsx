'use client';

import { useState, useMemo } from 'react';
import type { Recommendation, Brand, ScoringConfig } from '@/lib/types';
import { rescoreRecommendations } from '@/lib/rescore';
import BrandSelector from '@/components/BrandSelector';
import BrandCard from '@/components/BrandCard';
import RecommendationTable from '@/components/RecommendationTable';
import WeightSliders from '@/components/WeightSliders';
import PortfolioGapToggle from '@/components/PortfolioGapToggle';
import OfficeToggle from '@/components/OfficeToggle';
import ExpansionPlanner from '@/components/ExpansionPlanner';
import BrandPortfolioDashboard from '@/components/BrandPortfolioDashboard';
import MethodologyPanel from '@/components/MethodologyPanel';

import recommendationsData from '@/data/recommendations.json';
import brandsData from '@/data/brands.json';
import configData from '@/data/config.json';

const brands = brandsData as unknown as Brand[];
const defaultConfig = configData as unknown as ScoringConfig;
const recommendationsByBrand = recommendationsData as unknown as Record<string, Recommendation[]>;

export default function Home() {
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<ScoringConfig>(defaultConfig);
  const [portfolioGapEnabled, setPortfolioGapEnabled] = useState(false);
  const [activeOffices, setActiveOffices] = useState<Set<string>>(new Set());
  const [expansionPlan, setExpansionPlan] = useState<Recommendation[]>([]);

  const selectedBrand = useMemo(
    () => brands.find((b) => b.brand_id === selectedBrandId) ?? null,
    [selectedBrandId]
  );

  function handleBrandSelect(brandId: string | null) {
    setSelectedBrandId(brandId);
    if (brandId) {
      const brand = brands.find((b) => b.brand_id === brandId);
      setActiveOffices(new Set(brand?.existing_locations.map((l) => l.city_key) ?? []));
    } else {
      setActiveOffices(new Set());
    }
  }

  function handleOfficeToggle(cityKey: string) {
    setActiveOffices((prev) => {
      const next = new Set(prev);
      if (next.has(cityKey)) {
        next.delete(cityKey);
      } else {
        next.add(cityKey);
      }
      return next;
    });
  }

  function handleAddToPlan(rec: Recommendation) {
    setExpansionPlan((prev) => {
      const exists = prev.some((p) => p.city_key === rec.city_key && p.brand_id === rec.brand_id);
      if (exists) return prev;
      return [...prev, rec];
    });
  }

  function handleRemoveFromPlan(cityKey: string, brandId: string) {
    setExpansionPlan((prev) => prev.filter((p) => !(p.city_key === cityKey && p.brand_id === brandId)));
  }

  const selectedRecommendations = useMemo(() => {
    if (!selectedBrandId) return [];
    const raw = recommendationsByBrand[selectedBrandId] ?? [];
    return rescoreRecommendations(raw, currentConfig, portfolioGapEnabled);
  }, [selectedBrandId, currentConfig, portfolioGapEnabled]);

  return (
    <div>
      <div className="mb-4">
        <MethodologyPanel />
      </div>

      <div className="mb-4">
        <WeightSliders config={currentConfig} onChange={setCurrentConfig} />
      </div>

      <div className="mb-4">
        <PortfolioGapToggle enabled={portfolioGapEnabled} onToggle={setPortfolioGapEnabled} />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Brand
        </label>
        <BrandSelector
          brands={brands}
          selectedBrandId={selectedBrandId}
          onSelect={handleBrandSelect}
        />
      </div>

      {selectedBrand && (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <BrandCard brand={selectedBrand} />
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-4">
              <OfficeToggle
                locations={selectedBrand.existing_locations}
                activeLocations={activeOffices}
                onToggle={handleOfficeToggle}
              />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Recommended Markets ({selectedRecommendations.length})
              </h3>
              <RecommendationTable
                recommendations={selectedRecommendations}
                config={currentConfig}
                onAddToPlan={handleAddToPlan}
              />
            </div>
          </div>
          <div className="w-72 flex-shrink-0 sticky top-20 self-start">
            <ExpansionPlanner plan={expansionPlan} onRemove={handleRemoveFromPlan} />
          </div>
        </div>
      )}

      {!selectedBrand && (
        <BrandPortfolioDashboard
          brands={brands}
          recommendationsByBrand={recommendationsByBrand}
          config={currentConfig}
          portfolioGapEnabled={portfolioGapEnabled}
          onSelectBrand={handleBrandSelect}
        />
      )}
    </div>
  );
}
