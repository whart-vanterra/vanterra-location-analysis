import type { Brand } from '@/lib/types';

interface BrandCardProps {
  brand: Brand;
}

const CONFIDENCE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  HIGH: { text: '#2d9e5f', bg: '#e8f7ef', border: '#2d9e5f' },
  MODERATE: { text: '#d4820a', bg: '#fef3e2', border: '#d4820a' },
  LOW: { text: '#c55a11', bg: '#fdeee5', border: '#c55a11' },
  SPECULATIVE: { text: '#c0392b', bg: '#fdecea', border: '#c0392b' },
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
  const colors = CONFIDENCE_COLORS[brand.confidence_tier] ?? CONFIDENCE_COLORS.LOW;

  return (
    <div className="border border-gray-200 rounded-lg shadow-sm mb-4 overflow-hidden">
      <div className="px-5 py-3" style={{ backgroundColor: '#4C9784' }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{brand.display_name}</h2>
            <span className="text-sm text-white/70 font-mono">{brand.brand_id}</span>
          </div>
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
            style={{ color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }}
          >
            {brand.confidence_tier}
          </span>
        </div>
      </div>

      <div className="bg-white px-5 py-4">
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
    </div>
  );
}
