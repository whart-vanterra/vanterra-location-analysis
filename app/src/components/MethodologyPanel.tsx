'use client';

import { useState } from 'react';

export default function MethodologyPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Scoring Methodology
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-5 border-t border-gray-100 pt-4 text-sm text-gray-700 space-y-4">
          <p>
            Each market receives a composite score out of 100 points, built from three components.
            Higher scores indicate stronger expansion candidates. Scores are calculated per-brand,
            reflecting each brand&apos;s unique keyword demand and existing footprint.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScoreComponent
              title="Market Demand"
              points={45}
              color={{ bg: '#e8f4f1', border: '#4C9784' }}
              description="Measures the size of the addressable market."
              signals={[
                'Branded search volume (70%) — Google searches for brand-related services in the metro, weighted by keyword relevance',
                'Metro population (30%) — Total population, capped at 500K to avoid over-weighting mega-metros',
              ]}
            />
            <ScoreComponent
              title="Market Quality"
              points={30}
              color={{ bg: '#e8f7ef', border: '#2d9e5f' }}
              description="Evaluates whether the local housing stock and demographics fit the service model."
              signals={[
                'Owner-occupied housing rate (55%) — Higher ownership correlates with demand for structural repair services',
                'Median household income (30%) — Markets within the sweet spot can afford the investment',
                'Housing age (15%) — Older homes are more likely to need foundation and waterproofing work',
              ]}
            />
            <ScoreComponent
              title="Strategic Fit"
              points={25}
              color={{ bg: '#fef3e2', border: '#d4820a' }}
              description="Assesses market validation and brand positioning opportunities."
              signals={[
                'Market validation (50%) — Higher competition validates proven demand in the market',
                'Distance from nearest same-brand office (30%) — Ideal range is 30-60 miles; too close risks cannibalization',
                'Sister brand overlap (20%) — Fewer sister brands nearby means less internal competition',
              ]}
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="font-semibold text-gray-900 text-sm">Additional Indicators</h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded p-3">
                <div className="font-semibold text-gray-800 mb-1">CRM Badges</div>
                <p className="text-gray-600">
                  Markets where the brand already has CRM activity receive a badge.
                  <strong> PROVEN</strong> means significant job history.
                  <strong> SIGNAL</strong> means early leads or jobs are present.
                  These validate market potential but do not change the numeric score.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded p-3">
                <div className="font-semibold text-gray-800 mb-1">Portfolio Gap Bonus</div>
                <p className="text-gray-600">
                  An optional bonus (up to 25 points) added for markets that are far from any
                  existing brand office, adjusted by population density thresholds. Enabling this
                  rescales scores to a 0-100 range from the combined 125-point scale.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded p-3">
                <div className="font-semibold text-gray-800 mb-1">Sensitivity Flag</div>
                <p className="text-gray-600">
                  Markets flagged as &quot;sensitive&quot; would change rank significantly if scoring
                  weights were adjusted. This helps identify recommendations that depend heavily
                  on the current weight configuration rather than being universally strong.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreComponent({
  title,
  points,
  color,
  description,
  signals,
}: {
  title: string;
  points: number;
  color: { bg: string; border: string };
  description: string;
  signals: string[];
}) {
  return (
    <div
      className="border rounded-lg p-3"
      style={{ backgroundColor: color.bg, borderColor: color.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-900 text-sm">{title}</h4>
        <span className="text-xs font-mono font-semibold text-gray-600">{points} pts</span>
      </div>
      <p className="text-xs text-gray-600 mb-2">{description}</p>
      <ul className="space-y-1">
        {signals.map((signal, i) => (
          <li key={i} className="text-xs text-gray-600 pl-3 relative">
            <span className="absolute left-0 text-gray-400">-</span>
            {signal}
          </li>
        ))}
      </ul>
    </div>
  );
}
