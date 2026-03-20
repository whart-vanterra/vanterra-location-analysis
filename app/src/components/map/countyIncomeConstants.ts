export const COUNTY_INCOME_SOURCE = 'county-income';
export const COUNTY_INCOME_FILL = 'county-income-fill';
export const COUNTY_INCOME_LINE = 'county-income-line';

export const INCOME_COLOR_STOPS: [number, string][] = [
  [30000, '#f7fbff'],
  [50000, '#c6dbef'],
  [65000, '#6baed6'],
  [80000, '#2171b5'],
  [100000, '#08306b'],
];

export const NO_DATA_COLOR = '#e5e7eb';

export const LEGEND_ITEMS = [
  { label: '<$30K', color: '#f7fbff' },
  { label: '$50K', color: '#c6dbef' },
  { label: '$65K', color: '#6baed6' },
  { label: '$80K', color: '#2171b5' },
  { label: '$100K+', color: '#08306b' },
  { label: 'No data', color: '#e5e7eb' },
];
