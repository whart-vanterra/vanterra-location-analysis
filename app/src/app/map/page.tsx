'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Recommendation, Brand, PlanItem } from '@/lib/types';
import RecommendationMap from '@/components/RecommendationMap';

import recommendationsData from '@/data/recommendations.json';
import brandsData from '@/data/brands.json';
import competitorsRaw from '@/data/competitors.json';

const brands = brandsData as unknown as Brand[];
const recommendationsByBrand = recommendationsData as unknown as Record<string, Recommendation[]>;
const competitorData = competitorsRaw as unknown as Record<
  string,
  {
    city: string;
    state: string;
    lat: number;
    lng: number;
    competitor_count: number;
    competitors: {
      place_id: string;
      name: string;
      lat: number;
      lng: number;
      rating: number | null;
      user_ratings_total: number;
      address: string;
      business_status: string;
    }[];
  }
>;

const DEFAULT_CLOSED: ReadonlySet<string> = new Set([
  'SB-golden valley|mn',
  'SB-saint louis park|mn',
  '58-TN-chattanooga|tn',
  'DC-east providence|ri',
]);

function isDefaultClosed(brandId: string, cityKey: string): boolean {
  return DEFAULT_CLOSED.has(`${brandId}-${cityKey}`);
}

export default function MapPage() {
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
            .map((l) => l.city_key),
        ),
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
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('locationPlan', JSON.stringify(locationPlan));
    } catch { /* quota exceeded */ }
  }, [locationPlan]);

  useEffect(() => {
    try {
      const serializable: Record<string, string[]> = {};
      activeOfficesByBrand.forEach((set, brandId) => {
        serializable[brandId] = Array.from(set);
      });
      localStorage.setItem('activeOfficesByBrand', JSON.stringify(serializable));
    } catch { /* quota exceeded */ }
  }, [activeOfficesByBrand]);

  const plannedKeys = useMemo(
    () => new Set(locationPlan.filter((p) => p.action === 'ADD').map((p) => `${p.brand_id}-${p.city_key}`)),
    [locationPlan],
  );

  function handleOfficeToggle(brandId: string, cityKey: string) {
    setActiveOfficesByBrand((prev) => {
      const prevSet = prev.get(brandId) ?? new Set<string>();
      const nextSet = new Set(prevSet);
      if (nextSet.has(cityKey)) nextSet.delete(cityKey);
      else nextSet.add(cityKey);
      return new Map(prev).set(brandId, nextSet);
    });
  }

  function handleAddToPlan(rec: Recommendation) {
    setLocationPlan((prev) => {
      if (prev.some((p) => p.city_key === rec.city_key && p.brand_id === rec.brand_id && p.action === 'ADD')) return prev;
      const brand = brands.find((b) => b.brand_id === rec.brand_id);
      return [
        ...prev,
        {
          action: 'ADD' as const,
          brand_id: rec.brand_id,
          brand_name: brand?.display_name ?? rec.brand_id,
          city_key: rec.city_key,
          city: rec.city,
          state: rec.state,
          lat: rec.lat,
          lng: rec.lng,
          recommendation: rec,
        },
      ];
    });
  }

  function handleRemoveAdd(brandId: string, cityKey: string) {
    setLocationPlan((prev) => prev.filter((p) => !(p.brand_id === brandId && p.city_key === cityKey && p.action === 'ADD')));
  }

  function handleDropPin(lat: number, lng: number) {
    const cityKey = `custom-${lat.toFixed(4)}-${lng.toFixed(4)}`;
    const cityName = `Pin ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
    const selectedId = brands[0]?.brand_id ?? 'CUSTOM';
    const brand = brands.find((b) => b.brand_id === selectedId);
    setLocationPlan((prev) => {
      if (prev.some((p) => p.city_key === cityKey)) return prev;
      return [
        ...prev,
        {
          action: 'ADD' as const,
          brand_id: selectedId,
          brand_name: brand?.display_name ?? selectedId,
          city_key: cityKey,
          city: cityName,
          state: '',
          lat,
          lng,
        },
      ];
    });
  }

  return (
    <RecommendationMap
      brands={brands}
      recommendationsByBrand={recommendationsByBrand}
      activeOfficesByBrand={activeOfficesByBrand}
      plannedKeys={plannedKeys}
      competitorData={competitorData}
      onOfficeToggle={handleOfficeToggle}
      onAddToPlan={handleAddToPlan}
      onRemoveAdd={handleRemoveAdd}
      onDropPin={handleDropPin}
      forceFullscreen
      defaultSearchVolView
      defaultIncomeWeighted
      defaultShowCountyIncome
      defaultShowCompetitors
    />
  );
}
