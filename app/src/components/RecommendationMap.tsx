'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Brand, Recommendation } from '@/lib/types';

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
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const radiusFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const prevFilterRef = useRef<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [filterBrand, setFilterBrand] = useState('all');
  const [showOffices, setShowOffices] = useState(true);
  const [radiusMiles, setRadiusMiles] = useState(20);
  const [showCompetitors, setShowCompetitors] = useState(false);
  const competitorMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const brandColorMap = useRef(
    Object.fromEntries(brands.map((b, i) => [b.brand_id, BRAND_COLORS[i % BRAND_COLORS.length]]))
  ).current;

  const highlightRadius = useCallback((markerId: string | null) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('radius-highlight') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    if (!markerId) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const feature = radiusFeaturesRef.current.find(
      (f) => f.properties && (f.properties as Record<string, string>).id === markerId
    );
    src.setData({
      type: 'FeatureCollection',
      features: feature ? [feature] : [],
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
        const priority = priorityFromScore(rec.composite_score);
        const pColor = PRIORITY_COLORS[priority] ?? '#6c757d';
        const opacity = 1 - idx * 0.05;
        const planKey = `${rec.brand_id}-${rec.city_key}`;
        const inPlan = plannedKeys.has(planKey);

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
          features: zoom >= 6 ? radiusFeatures : [],
        });
      };
      updateRadius();
      map.off('zoom', updateRadius);
      map.on('zoom', updateRadius);
    }
  }, [brands, recommendationsByBrand, activeOfficesByBrand, plannedKeys, filterBrand, showOffices, radiusMiles, brandColorMap, clearMarkers, highlightRadius, onOfficeToggle, onAddToPlan, onRemoveAdd]);

  // Competitor markers
  const updateCompetitors = useCallback(() => {
    competitorMarkersRef.current.forEach((m) => m.remove());
    competitorMarkersRef.current = [];
    const map = mapRef.current;
    if (!map || !showCompetitors || !competitorData) return;

    Object.values(competitorData).forEach((cityData) => {
      cityData.competitors.forEach((comp) => {
        if (!comp.lat || !comp.lng || comp.business_status !== 'OPERATIONAL') return;

        const el = document.createElement('div');
        el.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#dc2626;border:1.5px solid #fff;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);';

        const popupDiv = document.createElement('div');
        popupDiv.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;max-width:240px';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:2px;color:#dc2626';
        titleEl.textContent = comp.name;
        popupDiv.appendChild(titleEl);

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

        const popup = new mapboxgl.Popup({ offset: 8, closeButton: false, maxWidth: '260px' }).setDOMContent(popupDiv);
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([comp.lng, comp.lat])
          .setPopup(popup)
          .addTo(map);
        competitorMarkersRef.current.push(marker);
      });
    });
  }, [showCompetitors, competitorData]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.loaded()) return;
    updateCompetitors();
  }, [updateCompetitors]);

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

  const mapHeight = fullscreen ? 'calc(100vh - 100px)' : '700px';

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current?.resize(), 350);
    }
  }, [fullscreen]);

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
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showOffices}
              onChange={(e) => setShowOffices(e.target.checked)}
              className="rounded"
            />
            Offices
          </label>
          {competitorData && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompetitors}
                onChange={(e) => setShowCompetitors(e.target.checked)}
                className="rounded"
              />
              Competitors
            </label>
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
            className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white text-gray-700 hover:bg-gray-100"
            onClick={() => setFullscreen((p) => !p)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? '⤓ Exit' : '⤢ Full'}
          </button>
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
      </div>
    </div>
  );
}
