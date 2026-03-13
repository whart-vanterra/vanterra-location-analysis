'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Recommendation, ScoringConfig } from '@/lib/types';

interface ScorePopoverProps {
  recommendation: Recommendation;
  config: ScoringConfig;
  children: React.ReactNode;
}

function compLabel(index: number): string {
  if (index >= 70) return 'Very High';
  if (index >= 40) return 'High';
  if (index >= 15) return 'Moderate';
  return 'Low';
}

function formatIncome(income: number): string {
  if (income >= 1000) return `$${(income / 1000).toFixed(0)}K`;
  return `$${income.toLocaleString()}`;
}

function densityLabel(population: number): string {
  if (population > 300000) return 'Urban';
  if (population > 100000) return 'Suburban';
  return 'Rural/Small';
}

export default function ScorePopover({ recommendation, config, children }: ScorePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.left - 180),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    function handleClickOutside(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, updatePosition]);

  const rec = recommendation;
  const { weights } = config;

  const scoreRows = [
    { label: 'Market Demand', score: rec.market_demand_score, max: weights.market_demand },
    { label: 'Market Quality', score: rec.market_quality_score, max: weights.market_quality },
    { label: 'Strategic Fit', score: rec.strategic_fit_score, max: weights.strategic_fit },
  ];

  const popoverContent = isOpen && pos ? (
    <div
      ref={popoverRef}
      className="fixed z-[9999] w-[420px] rounded-lg shadow-2xl p-4 text-xs"
      style={{
        top: pos.top,
        left: pos.left,
        backgroundColor: '#1a1a2e',
        color: '#ffffff',
      }}
    >
      {/* Score breakdown */}
      <table className="w-full mb-3">
        <thead>
          <tr className="border-b border-white/20">
            <th className="text-left py-1 font-semibold text-white/70">Component</th>
            <th className="text-right py-1 font-semibold text-white/70">Score</th>
            <th className="text-right py-1 font-semibold text-white/70">Max</th>
            <th className="text-right py-1 font-semibold text-white/70">%</th>
          </tr>
        </thead>
        <tbody>
          {scoreRows.map((row) => (
            <tr key={row.label} className="border-b border-white/10">
              <td className="py-1">{row.label}</td>
              <td className="py-1 text-right font-mono">{row.score.toFixed(1)}</td>
              <td className="py-1 text-right font-mono text-white/50">{row.max}</td>
              <td className="py-1 text-right font-mono">
                {((row.score / row.max) * 100).toFixed(0)}%
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1">Composite</td>
            <td className="py-1 text-right font-mono">{rec.composite_score.toFixed(1)}</td>
            <td className="py-1 text-right font-mono text-white/50">100</td>
            <td className="py-1 text-right font-mono">
              {rec.composite_score.toFixed(0)}%
            </td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-3 text-[11px]">
        {/* Market / Demand */}
        <div className="space-y-1">
          <div className="font-semibold text-white/80 uppercase tracking-wider text-[10px] mb-1">Market</div>
          <div className="flex justify-between">
            <span className="text-white/60">Search Volume</span>
            <span className="font-mono">{rec.search_vol_total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-white/40">Foundation</span>
            <span className="font-mono text-white/70">{rec.search_vol_breakdown.foundation.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-white/40">Basement</span>
            <span className="font-mono text-white/70">{rec.search_vol_breakdown.basement.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-white/40">Crawlspace</span>
            <span className="font-mono text-white/70">{rec.search_vol_breakdown.crawlspace.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-white/40">Concrete</span>
            <span className="font-mono text-white/70">{rec.search_vol_breakdown.concrete.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Population</span>
            <span className="font-mono">{rec.population.toLocaleString()}</span>
          </div>
        </div>

        {/* Quality */}
        <div className="space-y-1">
          <div className="font-semibold text-white/80 uppercase tracking-wider text-[10px] mb-1">Quality</div>
          <div className="flex justify-between">
            <span className="text-white/60">Owner-Occupied</span>
            <span className="font-mono">{(rec.owner_occupied_pct * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Median Income</span>
            <span className="font-mono">{formatIncome(rec.median_household_income)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Median Year Built</span>
            <span className="font-mono">{rec.median_year_built}</span>
          </div>
        </div>

        {/* Strategic Fit */}
        <div className="space-y-1">
          <div className="font-semibold text-white/80 uppercase tracking-wider text-[10px] mb-1">Strategic Fit</div>
          <div className="flex justify-between">
            <span className="text-white/60">Competition Index</span>
            <span className="font-mono">{rec.competition_index.toFixed(1)} ({compLabel(rec.competition_index)})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Nearest Same-Brand</span>
            <span className="font-mono">
              {rec.same_brand_distance_mi != null
                ? `${rec.same_brand_distance_mi.toFixed(0)} mi`
                : 'None'}
            </span>
          </div>
          {rec.nearest_same_brand_office && (
            <div className="flex justify-between pl-2">
              <span className="text-white/40">Office</span>
              <span className="text-white/70">{rec.nearest_same_brand_office}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-white/60">Sister Brands Nearby</span>
            <span className="font-mono">{rec.sister_brands_nearby}</span>
          </div>
        </div>

        {/* Portfolio Gap + CRM */}
        <div className="space-y-1">
          <div className="font-semibold text-white/80 uppercase tracking-wider text-[10px] mb-1">Portfolio Gap</div>
          <div className="flex justify-between">
            <span className="text-white/60">Cross-Brand Dist</span>
            <span className="font-mono">
              {rec.cross_brand_distance_mi != null
                ? `${rec.cross_brand_distance_mi.toFixed(0)} mi`
                : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Density Class</span>
            <span className="font-mono">{densityLabel(rec.population)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Gap Score</span>
            <span className="font-mono">{rec.portfolio_gap_score.toFixed(1)}/25</span>
          </div>

          <div className="font-semibold text-white/80 uppercase tracking-wider text-[10px] mt-2 mb-1">CRM</div>
          {(rec.crm_leads > 0 || rec.crm_jobs > 0 || rec.crm_revenue > 0) ? (
            <>
              <div className="flex justify-between">
                <span className="text-white/60">Leads</span>
                <span className="font-mono">{rec.crm_leads}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Jobs</span>
                <span className="font-mono">{rec.crm_jobs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Revenue</span>
                <span className="font-mono">{rec.crm_revenue > 0 ? `$${rec.crm_revenue.toLocaleString()}` : '--'}</span>
              </div>
            </>
          ) : (
            <div className="text-white/40">No CRM data</div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer hover:underline font-semibold"
        style={{ color: '#4C9784' }}
      >
        {children}
      </button>
      {typeof document !== 'undefined' && popoverContent && createPortal(popoverContent, document.body)}
    </>
  );
}
