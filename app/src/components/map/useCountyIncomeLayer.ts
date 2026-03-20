import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import {
  COUNTY_INCOME_SOURCE,
  COUNTY_INCOME_FILL,
  COUNTY_INCOME_LINE,
  INCOME_COLOR_STOPS,
  NO_DATA_COLOR,
} from './countyIncomeConstants';

export function useCountyIncomeLayer(
  mapRef: React.MutableRefObject<mapboxgl.Map | null>,
  visible: boolean,
  mapReady?: boolean,
) {
  const dataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const ensureSource = useCallback((map: mapboxgl.Map) => {
    if (map.getSource(COUNTY_INCOME_SOURCE)) return;

    map.addSource(COUNTY_INCOME_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Insert fill BEFORE radius layers so counties render underneath
    const firstRadiusLayer = 'radius-fill-existing';
    const beforeLayer = map.getLayer(firstRadiusLayer) ? firstRadiusLayer : undefined;

    map.addLayer(
      {
        id: COUNTY_INCOME_FILL,
        type: 'fill',
        source: COUNTY_INCOME_SOURCE,
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'income'], null],
            NO_DATA_COLOR,
            [
              'interpolate',
              ['linear'],
              ['get', 'income'],
              ...INCOME_COLOR_STOPS.flatMap(([val, color]) => [val, color]),
            ],
          ],
          'fill-opacity': 0.55,
        },
      },
      beforeLayer,
    );

    map.addLayer(
      {
        id: COUNTY_INCOME_LINE,
        type: 'line',
        source: COUNTY_INCOME_SOURCE,
        paint: {
          'line-color': '#9ca3af',
          'line-width': 0.5,
          'line-opacity': 0.4,
        },
      },
      beforeLayer,
    );
  }, []);

  const loadData = useCallback(async (map: mapboxgl.Map) => {
    if (dataRef.current || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const resp = await fetch('/county_income.json');
      const geo = await resp.json();
      dataRef.current = geo;
      const src = map.getSource(COUNTY_INCOME_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geo);
    } catch (err) {
      console.error('Failed to load county income data:', err);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Set up hover popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    });
    popupRef.current = popup;

    const onMove = (e: mapboxgl.MapMouseEvent) => {
      if (!map.getLayer(COUNTY_INCOME_FILL)) return;
      const vis = map.getLayoutProperty(COUNTY_INCOME_FILL, 'visibility');
      if (vis === 'none') {
        popup.remove();
        return;
      }

      const features = map.queryRenderedFeatures(e.point, { layers: [COUNTY_INCOME_FILL] });
      if (!features.length) {
        popup.remove();
        map.getCanvas().style.cursor = '';
        return;
      }

      map.getCanvas().style.cursor = 'pointer';
      const props = features[0].properties!;
      const income = props.income;
      const incomeStr = income && income > 0
        ? `$${Math.round(income / 1000).toLocaleString()}K`
        : 'No data';

      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.4;padding:2px 0">` +
          `<div style="font-weight:700">${props.name || 'Unknown'}, ${props.state || ''}</div>` +
          `<div style="color:#6b7280">Median Income: <span style="font-weight:600;color:#1e3a5f">${incomeStr}</span></div>` +
          `</div>`,
        )
        .addTo(map);
    };

    const onLeave = () => {
      popup.remove();
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', COUNTY_INCOME_FILL, onMove);
    map.on('mouseleave', COUNTY_INCOME_FILL, onLeave);

    return () => {
      map.off('mousemove', COUNTY_INCOME_FILL, onMove);
      map.off('mouseleave', COUNTY_INCOME_FILL, onLeave);
      popup.remove();
    };
  }, [mapRef]);

  // Toggle visibility and lazy-load data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    const apply = () => {
      ensureSource(map);
      if (visible) {
        loadData(map);
        map.setLayoutProperty(COUNTY_INCOME_FILL, 'visibility', 'visible');
        map.setLayoutProperty(COUNTY_INCOME_LINE, 'visibility', 'visible');
      } else {
        map.setLayoutProperty(COUNTY_INCOME_FILL, 'visibility', 'none');
        map.setLayoutProperty(COUNTY_INCOME_LINE, 'visibility', 'none');
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('idle', apply);
    }
  }, [visible, mapRef, ensureSource, loadData, mapReady]);
}
