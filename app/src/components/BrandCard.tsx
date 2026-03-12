import type { Brand } from '@/lib/types';

interface BrandCardProps {
  brand: Brand;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-800 border-green-200',
  MODERATE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-orange-100 text-orange-800 border-orange-200',
  SPECULATIVE: 'bg-red-100 text-red-800 border-red-200',
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function BrandCard({ brand }: BrandCardProps) {
  const confidenceStyle = CONFIDENCE_COLORS[brand.confidence_tier] ?? CONFIDENCE_COLORS.LOW;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{brand.display_name}</h2>
          <span className="text-sm text-gray-500 font-mono">{brand.brand_id}</span>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${confidenceStyle}`}
        >
          {brand.confidence_tier}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
        <div>
          <span className="text-gray-500">Investment Tier:</span>{' '}
          <span className="font-semibold text-gray-800">{brand.investment_tier}</span>
          {brand.investment_note && (
            <span className="ml-1 text-gray-500">({brand.investment_note})</span>
          )}
        </div>
        <div>
          <span className="text-gray-500">Existing Offices:</span>{' '}
          <span className="font-semibold text-gray-800">{brand.existing_locations.length}</span>
        </div>
        <div>
          <span className="text-gray-500">Total Leads:</span>{' '}
          <span className="font-semibold text-gray-800">{formatNumber(brand.total_leads)}</span>
        </div>
        <div>
          <span className="text-gray-500">Total Jobs:</span>{' '}
          <span className="font-semibold text-gray-800">{formatNumber(brand.total_jobs)}</span>
        </div>
        <div>
          <span className="text-gray-500">Total Revenue:</span>{' '}
          <span className="font-semibold text-gray-800">{formatCurrency(brand.total_revenue)}</span>
        </div>
      </div>

      {brand.existing_locations.length > 0 && (
        <div className="text-sm">
          <span className="text-gray-500">Existing Locations:</span>{' '}
          <span className="text-gray-700">
            {brand.existing_locations.map((loc) => `${loc.city}, ${loc.state}`).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}
