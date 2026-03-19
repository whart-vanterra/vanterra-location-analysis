'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Recommendation, Brand, ScoringConfig, PlanItem } from '@/lib/types';
import { rescoreRecommendations, rescoreWithOfficeToggle } from '@/lib/rescore';
import type { CompetitionMode } from '@/lib/scoring';
import BrandSelector from '@/components/BrandSelector';
import BrandCard from '@/components/BrandCard';
import RecommendationTable from '@/components/RecommendationTable';
import WeightSliders from '@/components/WeightSliders';
import PortfolioGapToggle from '@/components/PortfolioGapToggle';
import OfficeToggle from '@/components/OfficeToggle';
import LocationPlanner from '@/components/LocationPlanner';
import BrandPortfolioDashboard from '@/components/BrandPortfolioDashboard';
import MethodologyPanel from '@/components/MethodologyPanel';
import RecommendationMap from '@/components/RecommendationMap';

import recommendationsData from '@/data/recommendations.json';
import brandsData from '@/data/brands.json';
import configData from '@/data/config.json';

const brands = brandsData as unknown as Brand[];
const defaultConfig = configData as unknown as ScoringConfig;
const recommendationsByBrand = recommendationsData as unknown as Record<string, Recommendation[]>;

const DEFAULT_CLOSED: ReadonlySet<string> = new Set([
  'SB-golden valley|mn',
  'SB-saint louis park|mn',
  '58-TN-chattanooga|tn',
  'DC-east providence|ri',
]);

function isDefaultClosed(brandId: string, cityKey: string): boolean {
  return DEFAULT_CLOSED.has(`${brandId}-${cityKey}`);
}

function buildPlanItems(brand: Brand): PlanItem[] {
  const brandRecs = recommendationsByBrand[brand.brand_id] ?? [];
  const recByCity = new Map(brandRecs.map((r) => [r.city_key, r]));
  return brand.existing_locations.map((loc) => ({
    action: isDefaultClosed(brand.brand_id, loc.city_key) ? 'CLOSE' as const : 'KEEP' as const,
    brand_id: brand.brand_id,
    brand_name: brand.display_name,
    city_key: loc.city_key,
    city: loc.city,
    state: loc.state,
    lat: loc.lat,
    lng: loc.lng,
    is_existing_office: true,
    recommendation: recByCity.get(loc.city_key),
    location: loc,
  }));
}

export default function Home() {
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<ScoringConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('scoringConfig');
        if (saved) return JSON.parse(saved) as ScoringConfig;
      } catch { /* ignore */ }
    }
    return defaultConfig;
  });
  const [portfolioGapEnabled, setPortfolioGapEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('portfolioGapEnabled');
        if (saved) return JSON.parse(saved) as boolean;
      } catch { /* ignore */ }
    }
    return false;
  });
  const [competitionMode, setCompetitionMode] = useState<CompetitionMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('competitionMode');
        if (saved) return saved as CompetitionMode;
      } catch { /* ignore */ }
    }
    return 'validation';
  });
  const [activeOfficesByBrand, setActiveOfficesByBrand] = useState<Map<string, Set<string>>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('activeOfficesByBrand');
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, string[]>;
          const map = new Map<string, Set<string>>();
          for (const [brandId, keys] of Object.entries(parsed)) {
            map.set(brandId, new Set(keys));
          }
          return map;
        }
      } catch { /* ignore */ }
    }
    const map = new Map<string, Set<string>>();
    for (const brand of brands) {
      map.set(
        brand.brand_id,
        new Set(
          brand.existing_locations
            .filter((l) => !isDefaultClosed(brand.brand_id, l.city_key))
            .map((l) => l.city_key)
        )
      );
    }
    return map;
  });
  const [locationPlan, setLocationPlan] = useState<PlanItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('locationPlan');
        if (saved) return JSON.parse(saved) as PlanItem[];
      } catch { /* ignore */ }
    }
    return brands.flatMap(buildPlanItems);
  });

  useEffect(() => {
    try {
      localStorage.setItem('locationPlan', JSON.stringify(locationPlan));
    } catch { /* quota exceeded */ }
  }, [locationPlan]);

  useEffect(() => {
    try { localStorage.setItem('scoringConfig', JSON.stringify(currentConfig)); } catch { /* */ }
  }, [currentConfig]);

  useEffect(() => {
    try { localStorage.setItem('portfolioGapEnabled', JSON.stringify(portfolioGapEnabled)); } catch { /* */ }
  }, [portfolioGapEnabled]);

  useEffect(() => {
    try { localStorage.setItem('competitionMode', competitionMode); } catch { /* */ }
  }, [competitionMode]);

  useEffect(() => {
    try {
      const serializable: Record<string, string[]> = {};
      activeOfficesByBrand.forEach((set, brandId) => {
        serializable[brandId] = Array.from(set);
      });
      localStorage.setItem('activeOfficesByBrand', JSON.stringify(serializable));
    } catch { /* quota exceeded */ }
  }, [activeOfficesByBrand]);

  const selectedBrand = useMemo(
    () => brands.find((b) => b.brand_id === selectedBrandId) ?? null,
    [selectedBrandId]
  );

  const activeOffices = useMemo(() => {
    if (!selectedBrandId) return new Set<string>();
    return activeOfficesByBrand.get(selectedBrandId) ?? new Set<string>();
  }, [selectedBrandId, activeOfficesByBrand]);

  function handleBrandSelect(brandId: string | null) {
    setSelectedBrandId(brandId);
  }

  function handleOfficeToggle(brandId: string, cityKey: string) {
    setActiveOfficesByBrand((prev) => {
      const prevSet = prev.get(brandId) ?? new Set<string>();
      const nextSet = new Set(prevSet);
      if (nextSet.has(cityKey)) {
        nextSet.delete(cityKey);
      } else {
        nextSet.add(cityKey);
      }
      return new Map(prev).set(brandId, nextSet);
    });

    setLocationPlan((prev) => {
      const isCurrentlyActive = (activeOfficesByBrand.get(brandId) ?? new Set()).has(cityKey);
      const newAction: 'KEEP' | 'CLOSE' = isCurrentlyActive ? 'CLOSE' : 'KEEP';
      return prev.map((item) =>
        item.brand_id === brandId && item.city_key === cityKey && item.is_existing_office
          ? { ...item, action: newAction }
          : item
      );
    });
  }

  function handleAddToPlan(rec: Recommendation) {
    setLocationPlan((prev) => {
      const exists = prev.some(
        (p) => p.city_key === rec.city_key && p.brand_id === rec.brand_id && p.action === 'ADD'
      );
      if (exists) return prev;
      const brand = brands.find((b) => b.brand_id === rec.brand_id);
      const newItem: PlanItem = {
        action: 'ADD',
        brand_id: rec.brand_id,
        brand_name: brand?.display_name ?? rec.brand_id,
        city_key: rec.city_key,
        city: rec.city,
        state: rec.state,
        lat: rec.lat,
        lng: rec.lng,
        recommendation: rec,
      };
      return [...prev, newItem];
    });
  }

  function handleChangePlanAction(brandId: string, cityKey: string, action: 'KEEP' | 'CLOSE') {
    setLocationPlan((prev) =>
      prev.map((item) =>
        item.brand_id === brandId && item.city_key === cityKey && item.is_existing_office
          ? { ...item, action }
          : item
      )
    );

    setActiveOfficesByBrand((prev) => {
      const prevSet = prev.get(brandId) ?? new Set<string>();
      const nextSet = new Set(prevSet);
      if (action === 'CLOSE') {
        nextSet.delete(cityKey);
      } else {
        nextSet.add(cityKey);
      }
      return new Map(prev).set(brandId, nextSet);
    });
  }

  function handleRemoveAdd(brandId: string, cityKey: string) {
    setLocationPlan((prev) =>
      prev.filter((p) => !(p.brand_id === brandId && p.city_key === cityKey && p.action === 'ADD'))
    );
  }

  function handleClearAdds() {
    setLocationPlan((prev) => prev.filter((p) => p.action !== 'ADD'));
  }

  const plannedKeys = useMemo(() => {
    return new Set(
      locationPlan.filter((p) => p.action === 'ADD').map((p) => `${p.brand_id}-${p.city_key}`)
    );
  }, [locationPlan]);

  const selectedRecommendations = useMemo(() => {
    if (!selectedBrandId || !selectedBrand) return [];
    const raw = recommendationsByBrand[selectedBrandId] ?? [];

    const allActive = selectedBrand.existing_locations.every((loc) =>
      activeOffices.has(loc.city_key)
    );

    if (allActive) {
      return rescoreRecommendations(raw, currentConfig, portfolioGapEnabled, competitionMode);
    }

    return rescoreWithOfficeToggle(raw, currentConfig, portfolioGapEnabled, selectedBrand, activeOffices, competitionMode);
  }, [selectedBrandId, selectedBrand, currentConfig, portfolioGapEnabled, activeOffices, competitionMode]);

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="flex-1">
        <div className="mb-4">
          <MethodologyPanel />
        </div>

        <div className="mb-4 flex items-start gap-4">
          <div className="flex-1">
            <WeightSliders config={currentConfig} onChange={setCurrentConfig} />
          </div>
          <div className="pt-2.5 flex flex-col gap-3">
            <PortfolioGapToggle enabled={portfolioGapEnabled} onToggle={setPortfolioGapEnabled} />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Competition:</span>
              <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5">
                {([
                  { value: 'validation' as CompetitionMode, label: 'Validation', tip: 'High competition = proven market' },
                  { value: 'opportunity' as CompetitionMode, label: 'Opportunity', tip: 'Low competition = underserved market' },
                ] as const).map(({ value, label, tip }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCompetitionMode(value)}
                    title={tip}
                    className="text-xs px-2.5 py-1 rounded-md transition-colors"
                    style={
                      competitionMode === value
                        ? { backgroundColor: '#4C9784', color: 'white' }
                        : { backgroundColor: 'transparent', color: '#6b7280' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400">
                {competitionMode === 'validation'
                  ? 'High = proven market'
                  : 'Low = underserved market'}
              </span>
            </div>
          </div>
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

        <RecommendationMap
          brands={brands}
          recommendationsByBrand={recommendationsByBrand}
          activeOfficesByBrand={activeOfficesByBrand}
          plannedKeys={plannedKeys}
          onOfficeToggle={handleOfficeToggle}
          onAddToPlan={handleAddToPlan}
          onRemoveAdd={handleRemoveAdd}
        />

        {selectedBrand && (
          <div>
            <BrandCard brand={selectedBrand} />
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-4">
              <OfficeToggle
                locations={selectedBrand.existing_locations}
                activeLocations={activeOffices}
                onToggle={(cityKey) => handleOfficeToggle(selectedBrand.brand_id, cityKey)}
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
                plannedKeys={plannedKeys}
              />
            </div>
          </div>
        )}

        {!selectedBrand && (
          <BrandPortfolioDashboard
            brands={brands}
            recommendationsByBrand={recommendationsByBrand}
            config={currentConfig}
            portfolioGapEnabled={portfolioGapEnabled}
            competitionMode={competitionMode}
            onSelectBrand={handleBrandSelect}
            onAddToPlan={handleAddToPlan}
            plannedKeys={plannedKeys}
            activeOfficesByBrand={activeOfficesByBrand}
            onOfficeToggle={handleOfficeToggle}
          />
        )}
      </div>

      <div className="sticky bottom-0 z-20">
        <LocationPlanner
          plan={locationPlan}
          onChangeAction={handleChangePlanAction}
          onRemoveAdd={handleRemoveAdd}
          onClearAdds={handleClearAdds}
        />
      </div>
    </div>
  );
}
