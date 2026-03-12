'use client';

import { useState, useRef, useEffect } from 'react';
import type { Recommendation, ScoringConfig } from '@/lib/types';
import { explainScore } from '@/lib/explain';

interface ScorePopoverProps {
  recommendation: Recommendation;
  config: ScoringConfig;
  children: React.ReactNode;
}

export default function ScorePopover({ recommendation, config, children }: ScorePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const explanation = explainScore(recommendation, config);
  const { weights } = config;
  const rec = recommendation;

  const rows = [
    { label: 'Market Demand', score: rec.market_demand_score, max: weights.market_demand },
    { label: 'Market Quality', score: rec.market_quality_score, max: weights.market_quality },
    { label: 'Competitive Opportunity', score: rec.competitive_opportunity_score, max: weights.competitive_opportunity },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer hover:underline text-blue-700 font-semibold"
      >
        {children}
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4">
          <p className="text-sm text-gray-700 mb-3 leading-relaxed">{explanation}</p>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1 font-semibold text-gray-600">Component</th>
                <th className="text-right py-1 font-semibold text-gray-600">Score</th>
                <th className="text-right py-1 font-semibold text-gray-600">Max</th>
                <th className="text-right py-1 font-semibold text-gray-600">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-gray-100">
                  <td className="py-1 text-gray-700">{row.label}</td>
                  <td className="py-1 text-right font-mono">{row.score.toFixed(1)}</td>
                  <td className="py-1 text-right font-mono text-gray-400">{row.max}</td>
                  <td className="py-1 text-right font-mono">
                    {((row.score / row.max) * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1 text-gray-900">Composite</td>
                <td className="py-1 text-right font-mono">{rec.composite_score.toFixed(1)}</td>
                <td className="py-1 text-right font-mono text-gray-400">100</td>
                <td className="py-1 text-right font-mono">
                  {rec.composite_score.toFixed(0)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
