'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Brand, Recommendation } from '@/lib/types';
import { useCountyIncomeLayer } from './map/useCountyIncomeLayer';
import { LEGEND_ITEMS } from './map/countyIncomeConstants';

interface CompetitorCity {
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

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

function cityName(rec: { city: string; city_key: string }): string {
  if (rec.city) return rec.city;
  const parts = rec.city_key.split('|');
  return parts[0].replace(/\b\w/g, (c) => c.toUpperCase());
}

const BRAND_COLORS = [
  '#e6194b', '#1a8c3b', '#4363d8', '#e05500', '#7b2d8e',
  '#0e7c9a', '#c41690', '#5a7d00', '#b34700', '#2d7d7d',
  '#8855cc', '#9A6324', '#800000', '#2a6e2a', '#7a7a00',
  '#000075', '#555555', '#6633aa', '#b89800', '#c46030',
];

const PRIORITY_COLORS: Record<string, string> = {
  MUST: '#2d9e5f',
  SHOULD: '#d4820a',
  COULD: '#6c757d',
};

function priorityFromScore(score: number): string {
  if (score >= 70) return 'MUST';
  if (score >= 55) return 'SHOULD';
  return 'COULD';
}

function makeCircleCoords(lng: number, lat: number, radiusMiles: number): [number, number][] {
  const km = radiusMiles * 1.60934;
  const coords: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    const dx = km * Math.cos(angle);
    const dy = km * Math.sin(angle);
    const dlat = dy / 110.574;
    const dlng = dx / (111.320 * Math.cos((lat * Math.PI) / 180));
    coords.push([lng + dlng, lat + dlat]);
  }
  return coords;
}

interface Props {
  brands: Brand[];
  recommendationsByBrand: Record<string, Recommendation[]>;
  activeOfficesByBrand: Map<string, Set<string>>;
  plannedKeys: Set<string>;
  competitorData?: Record<string, CompetitorCity>;
  onOfficeToggle: (brandId: string, cityKey: string) => void;
  onAddToPlan: (rec: Recommendation) => void;
  onRemoveAdd: (brandId: string, cityKey: string) => void;
  onDropPin?: (lat: number, lng: number) => void;
  /** Lock into fullscreen mode (no toggle, fills viewport) */
  forceFullscreen?: boolean;
  /** Override default toggle states */
  defaultSearchVolView?: boolean;
  defaultIncomeWeighted?: boolean;
  defaultShowCountyIncome?: boolean;
  defaultShowCompetitors?: boolean;
}

export default function RecommendationMap({
  brands,
  recommendationsByBrand,
  activeOfficesByBrand,
  plannedKeys,
  competitorData,
  onOfficeToggle,
  onAddToPlan,
  onRemoveAdd,
  onDropPin,
  forceFullscreen = false,
  defaultSearchVolView = false,
  defaultIncomeWeighted = false,
  defaultShowCountyIncome = false,
  defaultShowCompetitors = false,
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const radiusFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const prevFilterRef = useRef<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(forceFullscreen);
  const [filterBrand, setFilterBrand] = useState('all');
  const [showOffices, setShowOffices] = useState(true);
  const [radiusMiles, setRadiusMiles] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mapRadiusMiles');
      if (saved) return Number(saved);
    }
    return 20;
  });
  const [showCompetitors, setShowCompetitors] = useState(defaultShowCompetitors);
  const [dropPinMode, setDropPinMode] = useState(false);
  const [searchVolView, setSearchVolView] = useState(defaultSearchVolView);
  const [incomeWeighted, setIncomeWeighted] = useState(defaultIncomeWeighted);
  const [showCountyIncome, setShowCountyIncome] = useState(defaultShowCountyIncome);
  const competitorMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const dropPinMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const searchVolMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const selectedCompRadiiRef = useRef<GeoJSON.Feature[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useCountyIncomeLayer(mapRef, showCountyIncome, mapReady);

  useEffect(() => {
    try { localStorage.setItem('mapRadiusMiles', String(radiusMiles)); } catch { /* */ }
  }, [radiusMiles]);

  const brandColorMap = useRef(
    Object.fromEntries(brands.map((b, i) => [b.brand_id, BRAND_COLORS[i % BRAND_COLORS.length]]))
  ).current;

  const highlightRadius = useCallback((markerId: string | null) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('radius-highlight') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    // Show only the hovered feature in highlight layer (nothing persistent here)
    const features: GeoJSON.Feature[] = [];
    if (markerId) {
      const hovered = radiusFeaturesRef.current.find(
        (f) => f.properties && (f.properties as Record<string, string>).id === markerId
      );
      if (hovered) features.push(hovered);
    }

    src.setData({
      type: 'FeatureCollection',
      features,
    });
  }, []);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const addMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;
    const radiusFeatures: GeoJSON.Feature[] = [];

    brands.forEach((brand) => {
      if (filterBrand !== 'all' && brand.brand_id !== filterBrand) return;
      const bColor = brandColorMap[brand.brand_id];
      const activeSet = activeOfficesByBrand.get(brand.brand_id) ?? new Set<string>();

      // Existing offices
      if (showOffices) {
        brand.existing_locations.forEach((loc) => {
          if (!loc.lat || !loc.lng) return;
          const isActive = activeSet.has(loc.city_key);
          const pinColor = isActive ? bColor : '#adb5bd';

          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
          if (!isActive) wrap.style.opacity = '0.5';

          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '24');
          svg.setAttribute('height', '32');
          svg.setAttribute('viewBox', '0 0 24 32');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z');
          path.setAttribute('fill', pinColor);
          svg.appendChild(path);
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', '12');
          circle.setAttribute('cy', '11');
          circle.setAttribute('r', '5');
          circle.setAttribute('fill', '#fff');
          svg.appendChild(circle);
          wrap.appendChild(svg);

          const lbl = document.createElement('div');
          lbl.textContent = brand.brand_id;
          lbl.style.cssText = `font-size:9px;font-weight:700;color:#fff;background:${pinColor};padding:1px 5px;border-radius:3px;margin-top:-4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2)`;
          wrap.appendChild(lbl);

          const popupDiv = document.createElement('div');
          popupDiv.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;';

          const titleEl = document.createElement('div');
          titleEl.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:2px';
          titleEl.textContent = `${loc.city}, ${loc.state}`;
          popupDiv.appendChild(titleEl);

          const subEl = document.createElement('div');
          subEl.style.cssText = 'font-size:11px;color:#6b7280;margin-bottom:6px';
          subEl.textContent = `${brand.brand_id} \u2014 ${brand.display_name} \u00b7 Existing Office`;
          popupDiv.appendChild(subEl);

          const officeRows: [string, string][] = [];
          if (loc.population) officeRows.push(['Population', loc.population.toLocaleString()]);
          if (loc.search_vol_total) officeRows.push(['Search Vol', `${loc.search_vol_total}/mo`]);
          if (loc.owner_occupied_pct != null) officeRows.push(['Owner-Occ', `${Math.round(loc.owner_occupied_pct * 100)}%`]);
          if (loc.median_household_income) officeRows.push(['Med Income', `$${Math.round(loc.median_household_income / 1000)}K`]);
          if (loc.median_year_built) officeRows.push(['Med Year Built', String(loc.median_year_built)]);
          officeRows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:2px 0';
            const lblEl = document.createElement('span');
            lblEl.style.color = '#6b7280';
            lblEl.textContent = label;
            const valEl = document.createElement('span');
            valEl.style.fontWeight = '600';
            valEl.style.textAlign = 'right';
            valEl.textContent = value;
            row.appendChild(lblEl);
            row.appendChild(valEl);
            popupDiv.appendChild(row);
          });

          const btn = document.createElement('button');
          btn.style.cssText = `display:block;width:100%;padding:6px 0;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;text-align:center;transition:all 0.15s;border:1px solid ${isActive ? '#2d9e5f' : '#c0392b'};background:${isActive ? '#e8f7ef' : '#fff'};color:${isActive ? '#2d9e5f' : '#c0392b'}`;
          btn.textContent = isActive ? '\u2713 Active Office' : 'Deactivated';
          btn.addEventListener('click', () => {
            onOfficeToggle(brand.brand_id, loc.city_key);
          });
          popupDiv.appendChild(btn);

          const markerId = `${brand.brand_id}-${loc.city_key}`;
          wrap.addEventListener('mouseenter', () => highlightRadius(markerId));
          wrap.addEventListener('mouseleave', () => highlightRadius(null));

          const popup = new mapboxgl.Popup({ offset: 28, closeButton: false }).setDOMContent(popupDiv);
          const marker = new mapboxgl.Marker({ element: wrap, anchor: 'bottom' })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(popup)
            .addTo(map);
          (marker as unknown as Record<string, string>)._markerKind = 'office';
          markersRef.current.push(marker);
          bounds.extend([loc.lng, loc.lat]);
          hasPoints = true;

          radiusFeatures.push({
            type: 'Feature',
            properties: { color: pinColor, kind: 'existing', id: `${brand.brand_id}-${loc.city_key}` },
            geometry: { type: 'Polygon', coordinates: [makeCircleCoords(loc.lng, loc.lat, radiusMiles)] },
          });
        });
      }

      // Top 10 recommendations
      const recs = (recommendationsByBrand[brand.brand_id] ?? []).slice(0, 10);
      recs.forEach((rec, idx) => {
        if (!rec.lat || !rec.lng) return;
        const planKey = `${rec.brand_id}-${rec.city_key}`;
        const inPlan = plannedKeys.has(planKey);
        // In search vol view, skip unplanned recommendations entirely
        if (searchVolView && !inPlan) return;
        const priority = priorityFromScore(rec.composite_score);
        const pColor = PRIORITY_COLORS[priority] ?? '#6c757d';
        const opacity = 1 - idx * 0.05;

        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:pointer;opacity:${opacity};`;

        const scoreLbl = document.createElement('div');
        if (inPlan) {
          scoreLbl.textContent = `\u2713 ${cityName(rec)} ${Math.round(rec.composite_score)}`;
          scoreLbl.style.cssText = 'font-size:10px;font-weight:700;color:#fff;background:#2d9e5f;padding:1px 5px;border-radius:3px;white-space:nowrap;line-height:14px;box-shadow:0 1px 4px rgba(45,158,95,0.4);margin-bottom:2px';
        } else {
          scoreLbl.textContent = `${cityName(rec)} ${Math.round(rec.composite_score)}`;
          scoreLbl.style.cssText = 'font-size:10px;font-weight:700;color:#333;background:rgba(255,255,255,0.92);padding:0 3px;border-radius:3px;white-space:nowrap;line-height:14px;box-shadow:0 1px 2px rgba(0,0,0,0.15);margin-bottom:2px';
        }
        wrap.appendChild(scoreLbl);

        const dot = document.createElement('div');
        const dotBg = inPlan ? '#2d9e5f' : pColor;
        dot.style.cssText = `width:${inPlan ? 12 : 10}px;height:${inPlan ? 12 : 10}px;border-radius:50%;background:${dotBg};box-shadow:0 1px 4px rgba(0,0,0,0.3);${inPlan ? 'border:2px solid #fff;' : ''}`;
        wrap.appendChild(dot);

        const popupDiv = document.createElement('div');
        popupDiv.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;max-width:240px';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:2px';
        titleEl.textContent = `${cityName(rec)}, ${rec.state}`;
        popupDiv.appendChild(titleEl);

        const subEl = document.createElement('div');
        subEl.style.cssText = 'font-size:11px;color:#6b7280;margin-bottom:6px';
        subEl.textContent = `${brand.brand_id} \u2014 ${brand.display_name} \u00b7 `;
        const badge = document.createElement('span');
        badge.textContent = priority;
        badge.style.cssText = `padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;background:${pColor}15;color:${pColor}`;
        subEl.appendChild(badge);
        popupDiv.appendChild(subEl);

        const rows: [string, string | number][] = [
          ['Score', rec.composite_score],
          ['Search Vol', `${rec.search_vol_total}/mo`],
          ['Demand', rec.market_demand_score],
          ['Quality', rec.market_quality_score],
          ['Strategic Fit', rec.strategic_fit_score],
          ['Portfolio Gap', rec.portfolio_gap_score],
        ];
        if (rec.same_brand_distance_mi != null) {
          rows.push(['Nearest Office', `${rec.same_brand_distance_mi.toFixed(1)}mi`]);
        }

        rows.forEach(([label, value]) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:2px 0';
          const lblEl = document.createElement('span');
          lblEl.style.color = '#6b7280';
          lblEl.textContent = label;
          const valEl = document.createElement('span');
          valEl.style.fontWeight = '600';
          valEl.style.textAlign = 'right';
          valEl.textContent = String(typeof value === 'number' ? Math.round(value * 10) / 10 : value);
          row.appendChild(lblEl);
          row.appendChild(valEl);
          popupDiv.appendChild(row);
        });

        const btn = document.createElement('button');
        const isInPlan = inPlan;
        btn.style.cssText = `display:block;width:100%;margin-top:8px;padding:6px 0;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;text-align:center;transition:all 0.15s;border:1px solid ${isInPlan ? '#2d9e5f' : '#4C9784'};background:${isInPlan ? '#e8f7ef' : '#fff'};color:${isInPlan ? '#2d9e5f' : '#4C9784'}`;
        btn.textContent = isInPlan ? '\u2713 In Plan' : '+ Add to Plan';
        btn.addEventListener('click', () => {
          if (plannedKeys.has(planKey)) {
            onRemoveAdd(rec.brand_id, rec.city_key);
          } else {
            onAddToPlan(rec);
          }
        });
        popupDiv.appendChild(btn);

        const markerId = `${rec.brand_id}-${rec.city_key}`;
        wrap.addEventListener('mouseenter', () => highlightRadius(markerId));
        wrap.addEventListener('mouseleave', () => highlightRadius(null));

        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: '280px' }).setDOMContent(popupDiv);
        const marker = new mapboxgl.Marker({ element: wrap, anchor: 'bottom' })
          .setLngLat([rec.lng, rec.lat])
          .setPopup(popup)
          .addTo(map);
        (marker as unknown as Record<string, string>)._markerKind = inPlan ? 'planned' : 'recommendation';
        markersRef.current.push(marker);
        bounds.extend([rec.lng, rec.lat]);
        hasPoints = true;

        const radiusColor = inPlan ? '#2d9e5f' : pColor;
        const radiusKind = inPlan ? 'planned' : 'recommendation';
        radiusFeatures.push({
          type: 'Feature',
          properties: { color: radiusColor, kind: radiusKind, id: `${rec.brand_id}-${rec.city_key}` },
          geometry: { type: 'Polygon', coordinates: [makeCircleCoords(rec.lng, rec.lat, radiusMiles)] },
        });
      });
    });

    // Only fitBounds when brand filter changes, not on every data update
    const filterChanged = prevFilterRef.current !== filterBrand;
    prevFilterRef.current = filterBrand;
    if (hasPoints && filterChanged) {
      map.fitBounds(bounds, { padding: 50, maxZoom: 10, duration: 600 });
    }

    // Store for hover highlight
    radiusFeaturesRef.current = radiusFeatures;

    // Update radius circles source
    const src = map.getSource('radius-circles') as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      const updateRadius = () => {
        const zoom = map.getZoom();
        src.setData({
          type: 'FeatureCollection',
          features: [
            ...(zoom >= 6
              ? searchVolView
                ? radiusFeatures.filter((f) => {
                    const kind = (f.properties as Record<string, string>)?.kind;
                    return kind === 'existing' || kind === 'planned';
                  })
                : radiusFeatures
              : []),
            ...selectedCompRadiiRef.current,
          ],
        });
      };
      updateRadius();
      map.off('zoom', updateRadius);
      map.on('zoom', updateRadius);
    }
  }, [brands, recommendationsByBrand, activeOfficesByBrand, plannedKeys, filterBrand, showOffices, radiusMiles, searchVolView, brandColorMap, clearMarkers, highlightRadius, onOfficeToggle, onAddToPlan, onRemoveAdd]);

  // Competitor markers
  const updateCompetitors = useCallback(() => {
    competitorMarkersRef.current.forEach((m) => m.remove());
    competitorMarkersRef.current = [];
    const map = mapRef.current;
    if (!map || !showCompetitors || !competitorData) return;

    // Find top competitor by reviews per state
    const topByState: Record<string, { place_id: string; reviews: number }> = {};
    Object.values(competitorData).forEach((cityData) => {
      cityData.competitors.forEach((comp) => {
        if (!comp.lat || !comp.lng || comp.business_status !== 'OPERATIONAL') return;
        const st = cityData.state;
        const reviews = comp.user_ratings_total || 0;
        if (!topByState[st] || reviews > topByState[st].reviews) {
          topByState[st] = { place_id: comp.place_id, reviews };
        }
      });
    });
    const topPlaceIds = new Set(Object.values(topByState).map((t) => t.place_id));

    Object.values(competitorData).forEach((cityData) => {
      cityData.competitors.forEach((comp) => {
        if (!comp.lat || !comp.lng || comp.business_status !== 'OPERATIONAL') return;
        const reviews = comp.user_ratings_total || 0;
        const isTopInState = topPlaceIds.has(comp.place_id);
        const size = isTopInState ? 14 : reviews > 500 ? 10 : reviews > 100 ? 8 : 6;
        const bg = isTopInState ? '#f59e0b' : '#dc2626';
        const border = isTopInState ? '2.5px solid #fff' : '1.5px solid #fff';

        const el = document.createElement('div');
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${border};cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);${isTopInState ? 'z-index:10;' : ''}`;

        const popupDiv = document.createElement('div');
        popupDiv.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;max-width:240px';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = `font-weight:700;font-size:13px;margin-bottom:2px;color:${isTopInState ? '#f59e0b' : '#dc2626'}`;
        titleEl.textContent = comp.name;
        popupDiv.appendChild(titleEl);

        if (isTopInState) {
          const badgeEl = document.createElement('div');
          badgeEl.style.cssText = 'display:inline-block;font-size:10px;font-weight:700;color:#92400e;background:#fef3c7;padding:1px 6px;border-radius:4px;margin-bottom:4px';
          badgeEl.textContent = `\u2B50 #1 in ${cityData.state} by reviews`;
          popupDiv.appendChild(badgeEl);
        }

        const addrEl = document.createElement('div');
        addrEl.style.cssText = 'font-size:11px;color:#6b7280;margin-bottom:4px';
        addrEl.textContent = comp.address;
        popupDiv.appendChild(addrEl);

        if (comp.rating != null) {
          const ratingEl = document.createElement('div');
          ratingEl.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0';
          const rLbl = document.createElement('span');
          rLbl.style.color = '#6b7280';
          rLbl.textContent = 'Rating';
          const rVal = document.createElement('span');
          rVal.style.fontWeight = '600';
          rVal.textContent = `${comp.rating} \u2605 (${comp.user_ratings_total})`;
          ratingEl.appendChild(rLbl);
          ratingEl.appendChild(rVal);
          popupDiv.appendChild(ratingEl);
        }

        // Click to toggle radius
        el.addEventListener('click', () => {
          const compId = `comp-${comp.place_id}`;
          const isSame = selectedCompRadiiRef.current.length === 1
            && selectedCompRadiiRef.current[0].properties
            && (selectedCompRadiiRef.current[0].properties as Record<string, string>).id === compId;
          if (isSame) {
            selectedCompRadiiRef.current = [];
          } else {
            selectedCompRadiiRef.current = [{
              type: 'Feature',
              properties: { color: isTopInState ? '#f59e0b' : '#dc2626', kind: 'existing', id: compId },
              geometry: { type: 'Polygon', coordinates: [makeCircleCoords(comp.lng, comp.lat, radiusMiles)] },
            }];
          }
          // Merge into main radius source
          const mainSrc = map.getSource('radius-circles') as mapboxgl.GeoJSONSource | undefined;
          if (mainSrc) {
            const zoom = map.getZoom();
            const base = zoom >= 6 ? radiusFeaturesRef.current : [];
            mainSrc.setData({
              type: 'FeatureCollection',
              features: [...base, ...selectedCompRadiiRef.current],
            });
          }
        });

        const popup = new mapboxgl.Popup({ offset: 8, closeButton: false, maxWidth: '260px' }).setDOMContent(popupDiv);
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([comp.lng, comp.lat])
          .setPopup(popup)
          .addTo(map);
        competitorMarkersRef.current.push(marker);
      });
    });
  }, [showCompetitors, competitorData, radiusMiles]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.loaded()) return;
    updateCompetitors();
  }, [updateCompetitors, mapReady]);

  // Search volume view — top 20 per state, brand-agnostic
  const updateSearchVolView = useCallback(() => {
    searchVolMarkersRef.current.forEach((m) => m.remove());
    searchVolMarkersRef.current = [];
    const map = mapRef.current;
    if (!map || !searchVolView) return;

    // Normal markers already filtered by addMarkers when searchVolView is on

    // Dedupe cities across brands, keep highest search vol + income
    const cityMap: Record<string, { city_key: string; city: string; state: string; lat: number; lng: number; vol: number; income: number; weighted: number }> = {};
    Object.values(recommendationsByBrand).forEach((recs) => {
      recs.forEach((r) => {
        const vol = r.search_vol_total || 0;
        const income = r.median_household_income || 0;
        // Continuous income factor: log curve centered at $75K = 1.0x
        // $40K ≈ 0.6x, $75K = 1.0x, $120K ≈ 1.3x, $200K ≈ 1.5x
        const incomeFactor = income > 0 ? Math.log(income / 75000) / Math.log(2) * 0.5 + 1 : 0.5;
        const weighted = Math.round(vol * incomeFactor);
        if (!cityMap[r.city_key] || vol > cityMap[r.city_key].vol) {
          cityMap[r.city_key] = { city_key: r.city_key, city: cityName(r), state: r.state, lat: r.lat, lng: r.lng, vol, income, weighted };
        }
      });
    });

    // Group by state, take top 20
    const useWeighted = incomeWeighted;
    const byState: Record<string, typeof cityMap[string][]> = {};
    Object.values(cityMap).forEach((c) => {
      if (!byState[c.state]) byState[c.state] = [];
      byState[c.state].push(c);
    });

    const sortKey = useWeighted ? 'weighted' : 'vol';
    const maxVal = Math.max(...Object.values(cityMap).map((c) => c[sortKey]), 1);

    Object.entries(byState).forEach(([, cities]) => {
      cities.sort((a, b) => b[sortKey] - a[sortKey]);
      const top20 = cities.slice(0, 20);

      top20.forEach((c, idx) => {
        if (!c.lat || !c.lng || c.vol === 0) return;
        const displayVal = c[sortKey];
        const intensity = displayVal / maxVal;
        const hue = intensity > 0.6 ? '#dc2626' : intensity > 0.3 ? '#f59e0b' : '#3b82f6';
        const fontSize = intensity > 0.6 ? 13 : intensity > 0.3 ? 11 : 10;

        const el = document.createElement('div');
        el.textContent = String(displayVal);
        el.style.cssText = `font-size:${fontSize}px;font-weight:700;color:#fff;background:${hue};padding:2px 6px;border-radius:4px;white-space:nowrap;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.25);text-align:center;line-height:1.3;opacity:${0.7 + intensity * 0.3}`;

        const popup = new mapboxgl.Popup({ offset: 10, closeButton: false, maxWidth: '220px' });
        const popupDiv = document.createElement('div');
        popupDiv.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;';
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;font-size:14px';
        titleEl.textContent = `${c.city}, ${c.state}`;
        popupDiv.appendChild(titleEl);
        const volEl = document.createElement('div');
        volEl.style.cssText = 'font-size:20px;font-weight:800;margin:4px 0';
        volEl.textContent = `${c.vol}`;
        popupDiv.appendChild(volEl);
        if (c.income > 0) {
          const incEl = document.createElement('div');
          incEl.style.cssText = 'font-size:12px;color:#6b7280;margin-bottom:2px';
          incEl.textContent = `Income: $${Math.round(c.income / 1000)}K`;
          popupDiv.appendChild(incEl);
        }
        if (useWeighted) {
          const wEl = document.createElement('div');
          wEl.style.cssText = 'font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:2px';
          wEl.textContent = `Weighted: ${c.weighted}`;
          popupDiv.appendChild(wEl);
        }
        const rankEl = document.createElement('div');
        rankEl.style.cssText = 'font-size:11px;color:#6b7280';
        rankEl.textContent = `#${idx + 1} in ${c.state}`;
        popupDiv.appendChild(rankEl);
        popup.setDOMContent(popupDiv);

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([c.lng, c.lat])
          .setPopup(popup)
          .addTo(map);
        searchVolMarkersRef.current.push(marker);

      });
    });
  }, [searchVolView, incomeWeighted, recommendationsByBrand]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    updateSearchVolView();
    // Markers are rebuilt by addMarkers when searchVolView toggles
  }, [updateSearchVolView, searchVolView, mapReady]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-98.5795, 39.8283],
      zoom: 3.5,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => {
      map.addSource('radius-circles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Existing office radii — solid, more opaque
      map.addLayer({
        id: 'radius-fill-existing',
        type: 'fill',
        source: 'radius-circles',
        filter: ['==', ['get', 'kind'], 'existing'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: 'radius-stroke-existing',
        type: 'line',
        source: 'radius-circles',
        filter: ['==', ['get', 'kind'], 'existing'],
        paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.4, 'line-width': 2 },
      });
      // Recommendation radii — dashed, lighter
      map.addLayer({
        id: 'radius-fill-rec',
        type: 'fill',
        source: 'radius-circles',
        filter: ['==', ['get', 'kind'], 'recommendation'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.04 },
      });
      map.addLayer({
        id: 'radius-stroke-rec',
        type: 'line',
        source: 'radius-circles',
        filter: ['==', ['get', 'kind'], 'recommendation'],
        paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.2, 'line-width': 1, 'line-dasharray': [4, 3] },
      });
      // Planned radii — solid green, locked in
      map.addLayer({
        id: 'radius-fill-planned',
        type: 'fill',
        source: 'radius-circles',
        filter: ['==', ['get', 'kind'], 'planned'],
        paint: { 'fill-color': '#2d9e5f', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'radius-stroke-planned',
        type: 'line',
        source: 'radius-circles',
        filter: ['==', ['get', 'kind'], 'planned'],
        paint: { 'line-color': '#2d9e5f', 'line-opacity': 0.5, 'line-width': 2.5 },
      });
      // Highlight layer for hover
      map.addSource('radius-highlight', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'radius-highlight-fill',
        type: 'fill',
        source: 'radius-highlight',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'radius-highlight-stroke',
        type: 'line',
        source: 'radius-highlight',
        paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.6, 'line-width': 2.5 },
      });
      addMarkers();
      updateCompetitors();
      updateSearchVolView();
      setMapReady(true);
    });

    map.on('click', (e) => {
      // Drop pin mode OR Shift+Click
      const isDropMode = map.getContainer().dataset.dropPin === 'true';
      const isShiftClick = e.originalEvent?.metaKey || e.originalEvent?.ctrlKey;
      if (!isDropMode && !isShiftClick) return;
      // Don't fire if clicking a marker
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target && target.closest('.mapboxgl-marker')) return;

      const { lng, lat } = e.lngLat;

      // Visual pin
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '28');
      svg.setAttribute('height', '36');
      svg.setAttribute('viewBox', '0 0 24 32');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z');
      path.setAttribute('fill', '#7c3aed');
      svg.appendChild(path);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '11');
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', '#fff');
      svg.appendChild(circle);
      el.appendChild(svg);
      const lbl = document.createElement('div');
      lbl.textContent = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
      lbl.style.cssText = 'font-size:9px;font-weight:700;color:#fff;background:#7c3aed;padding:1px 5px;border-radius:3px;margin-top:-4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2)';
      el.appendChild(lbl);

      const popupDiv = document.createElement('div');
      popupDiv.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;min-width:180px';

      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-weight:700;font-size:13px;color:#7c3aed;margin-bottom:6px';
      titleEl.textContent = 'Dropped Pin';
      popupDiv.appendChild(titleEl);

      const coordEl = document.createElement('div');
      coordEl.style.cssText = 'font-size:12px;color:#333;font-family:monospace;margin-bottom:8px';
      coordEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      popupDiv.appendChild(coordEl);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;flex-direction:column;gap:4px';

      const copyBtn = document.createElement('button');
      copyBtn.style.cssText = 'display:block;width:100%;padding:5px 0;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;text-align:center;border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed';
      copyBtn.textContent = 'Copy Coordinates';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Coordinates'; }, 1500);
      });
      btnRow.appendChild(copyBtn);

      const lookupBtn = document.createElement('button');
      lookupBtn.style.cssText = 'display:block;width:100%;padding:5px 0;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;text-align:center;border:1px solid #4C9784;background:#e8f4f1;color:#3a7868';
      lookupBtn.textContent = 'Lookup City';
      lookupBtn.addEventListener('click', () => {
        lookupBtn.textContent = 'Looking up...';
        fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&access_token=${mapboxgl.accessToken}`)
          .then((r) => r.json())
          .then((data) => {
            const feature = data.features?.[0];
            if (feature) {
              const city = feature.text || '';
              const state = (feature.context || []).find((c: { id: string }) => c.id.startsWith('region'))?.short_code?.replace('US-', '') || '';
              titleEl.textContent = `${city}, ${state}`;
              lbl.textContent = `${city}, ${state}`;
              lookupBtn.textContent = `${city}, ${state}`;
              lookupBtn.style.borderColor = '#2d9e5f';
              lookupBtn.style.color = '#2d9e5f';
              lookupBtn.style.background = '#e8f7ef';
            } else {
              lookupBtn.textContent = 'No city found';
            }
          })
          .catch(() => { lookupBtn.textContent = 'Lookup failed'; });
      });
      btnRow.appendChild(lookupBtn);

      const removeBtn = document.createElement('button');
      removeBtn.style.cssText = 'display:block;width:100%;padding:5px 0;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;text-align:center;border:1px solid #dc2626;background:#fef2f2;color:#dc2626';
      removeBtn.textContent = 'Remove Pin';
      removeBtn.addEventListener('click', () => {
        // Remove radius
        const rf = (marker as unknown as Record<string, unknown>)._radiusFeature as GeoJSON.Feature | undefined;
        if (rf) {
          radiusFeaturesRef.current = radiusFeaturesRef.current.filter((f) => f !== rf);
          const mainSrc2 = map.getSource('radius-circles') as mapboxgl.GeoJSONSource | undefined;
          if (mainSrc2) {
            const zoom = map.getZoom();
            mainSrc2.setData({
              type: 'FeatureCollection',
              features: [
                ...(zoom >= 6 ? radiusFeaturesRef.current : []),
                ...selectedCompRadiiRef.current,
              ],
            });
          }
        }
        marker.remove();
        dropPinMarkersRef.current = dropPinMarkersRef.current.filter((m) => m !== marker);
        const cityKey = `custom-${lat.toFixed(4)}-${lng.toFixed(4)}`;
        if (onRemoveAdd) {
          // Find which brand it was added under
          const selectedId = filterBrand !== 'all' ? filterBrand : brands[0]?.brand_id ?? '';
          onRemoveAdd(selectedId, cityKey);
        }
      });
      btnRow.appendChild(removeBtn);

      popupDiv.appendChild(btnRow);

      const popup = new mapboxgl.Popup({ offset: 28, closeButton: true, maxWidth: '220px' }).setDOMContent(popupDiv);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);
      dropPinMarkersRef.current.push(marker);

      // Add radius to main source
      const pinRadiusFeature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { color: '#7c3aed', kind: 'planned', id: `pin-${lat.toFixed(4)}-${lng.toFixed(4)}` },
        geometry: { type: 'Polygon', coordinates: [makeCircleCoords(lng, lat, radiusMiles)] },
      };
      radiusFeaturesRef.current.push(pinRadiusFeature);
      const mainSrc = map.getSource('radius-circles') as mapboxgl.GeoJSONSource | undefined;
      if (mainSrc) {
        const zoom = map.getZoom();
        mainSrc.setData({
          type: 'FeatureCollection',
          features: [
            ...(zoom >= 6 ? radiusFeaturesRef.current : []),
            ...selectedCompRadiiRef.current,
          ],
        });
      }

      // Store ref on marker for cleanup
      (marker as unknown as Record<string, unknown>)._radiusFeature = pinRadiusFeature;

      // Notify parent
      if (onDropPin) onDropPin(lat, lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-add markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.loaded()) return;
    addMarkers();
  }, [addMarkers]);

  const mapHeight = forceFullscreen
    ? 'calc(100vh - 56px)'
    : fullscreen
      ? 'calc(100vh - 100px)'
      : '700px';

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current?.resize(), 350);
    }
  }, [fullscreen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().dataset.dropPin = dropPinMode ? 'true' : 'false';
    map.getCanvas().style.cursor = dropPinMode ? 'crosshair' : '';

    // Preview radius on mousemove
    if (!map.getSource('drop-preview')) {
      if (map.loaded()) {
        map.addSource('drop-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'drop-preview-fill', type: 'fill', source: 'drop-preview', paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.08 } });
        map.addLayer({ id: 'drop-preview-stroke', type: 'line', source: 'drop-preview', paint: { 'line-color': '#7c3aed', 'line-opacity': 0.4, 'line-width': 2, 'line-dasharray': [4, 3] } });
      }
    }

    const onMove = (e: mapboxgl.MapMouseEvent) => {
      const src = map.getSource('drop-preview') as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      if (!dropPinMode) {
        src.setData({ type: 'FeatureCollection', features: [] });
        return;
      }
      const { lng, lat } = e.lngLat;
      src.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [makeCircleCoords(lng, lat, radiusMiles)] },
        }],
      });
    };

    if (dropPinMode) {
      map.on('mousemove', onMove);
    } else {
      const src = map.getSource('drop-preview') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    }

    return () => {
      map.off('mousemove', onMove);
    };
  }, [dropPinMode, radiusMiles]);

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-4 ${
        fullscreen ? 'fixed inset-0 z-50 m-0 rounded-none' : ''
      }`}
    >
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setCollapsed((p) => !p)}
      >
        <h2 className="text-base font-bold" style={{ color: '#4C9784' }}>
          Recommendation Map
        </h2>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            className={`text-xs px-2 py-1 border rounded-md ${
              showOffices
                ? 'border-teal-600 bg-teal-50 text-teal-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => setShowOffices((p) => !p)}
            title="Toggle existing office markers"
          >
            Offices
          </button>
          <button
            className={`text-xs px-2 py-1 border rounded-md ${
              searchVolView
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => setSearchVolView((p) => !p)}
            title="Simple view: top 20 search volume cities per state"
          >
            Vol View
          </button>
          {searchVolView && (
            <button
              className={`text-xs px-2 py-1 border rounded-md ${
                incomeWeighted
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setIncomeWeighted((p) => !p)}
              title="Weight search volume by household income (vol × income factor)"
            >
              $ Weighted
            </button>
          )}
          <button
            className={`text-xs px-2 py-1 border rounded-md ${
              showCountyIncome
                ? 'border-blue-800 bg-blue-50 text-blue-800'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => setShowCountyIncome((p) => !p)}
            title="Toggle county-level median household income choropleth"
          >
            $ Income Map
          </button>
          {competitorData && (
            <button
              className={`text-xs px-2 py-1 border rounded-md ${
                showCompetitors
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setShowCompetitors((p) => !p)}
              title="Toggle competitor markers"
            >
              Competitors
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>{radiusMiles}mi</span>
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(Number(e.target.value))}
              className="w-16 h-1 accent-[#4C9784]"
            />
          </label>
          <select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white text-gray-700"
          >
            <option value="all">All Brands (Top 10 each)</option>
            {brands.map((b) => (
              <option key={b.brand_id} value={b.brand_id}>
                {b.brand_id} — {b.display_name}
              </option>
            ))}
          </select>
          <button
            className={`text-xs px-2 py-1 border rounded-md ${
              dropPinMode
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => setDropPinMode((p) => !p)}
            title={dropPinMode ? 'Exit drop pin mode' : 'Drop a pin to add custom location (or Cmd/Ctrl+Click)'}
          >
            📍 {dropPinMode ? 'Done' : 'Pin'}
          </button>
          {!forceFullscreen && (
            <button
              className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white text-gray-700 hover:bg-gray-100"
              onClick={() => setFullscreen((p) => !p)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? '⤓ Exit' : '⤢ Full'}
            </button>
          )}
          <button
            className={`text-lg text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            onClick={() => setCollapsed((p) => !p)}
            title="Toggle map"
          >
            &#9660;
          </button>
        </div>
      </div>

      <div
        className="transition-all duration-300 overflow-hidden"
        style={{ height: collapsed ? 0 : mapHeight, opacity: collapsed ? 0 : 1 }}
      >
        <div ref={mapContainer} className="w-full h-full" style={{ minHeight: collapsed ? 0 : 700 }} />
      </div>

      <div className="flex items-center gap-4 px-5 py-2 border-t border-gray-200 text-xs text-gray-500 flex-wrap">
        <span className="font-semibold">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-4 rounded-full" style={{ background: '#4C9784' }} /> Existing Office
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#2d9e5f' }} /> MUST
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#d4820a' }} /> SHOULD
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#6c757d' }} /> COULD
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#dc2626' }} /> Competitor
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#f59e0b', border: '2px solid #fff' }} /> Top in State
        </span>
      </div>
      {showCountyIncome && (
        <div className="flex items-center gap-3 px-5 py-2 border-t border-gray-200 text-xs text-gray-500">
          <span className="font-semibold text-blue-800">County Income:</span>
          {LEGEND_ITEMS.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-gray-300"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
      {searchVolView && incomeWeighted && (
        <div className="px-5 py-2 border-t border-gray-200 text-xs text-gray-500 leading-relaxed">
          <span className="font-semibold text-purple-700">Income Weighting:</span>{' '}
          vol &times; log&#8322;(income / $75K) &times; 0.5 + 1 &mdash;{' '}
          $33K &rarr; 0.4x, $50K &rarr; 0.7x, $75K &rarr; 1.0x, $100K &rarr; 1.2x, $120K &rarr; 1.3x, $200K &rarr; 1.5x.{' '}
          Continuous curve, no hard cutoffs. Higher income = more likely to afford $5K&ndash;$30K foundation repair.
        </div>
      )}
    </div>
  );
}
