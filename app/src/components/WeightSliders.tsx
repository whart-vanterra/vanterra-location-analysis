'use client';

import { useState } from 'react';
import type { ScoringConfig } from '@/lib/types';

interface WeightSlidersProps {
  config: ScoringConfig;
  onChange: (newConfig: ScoringConfig) => void;
}

const DEFAULT_WEIGHTS = { market_demand: 45, market_quality: 30, competitive_opportunity: 25 };

const WEIGHT_LABELS: { key: keyof typeof DEFAULT_WEIGHTS; label: string }[] = [
  { key: 'market_demand', label: 'Market Demand' },
  { key: 'market_quality', label: 'Market Quality' },
  { key: 'competitive_opportunity', label: 'Competitive Opportunity' },
];

function redistributeWeights(
  current: typeof DEFAULT_WEIGHTS,
  changedKey: keyof typeof DEFAULT_WEIGHTS,
  newValue: number,
): typeof DEFAULT_WEIGHTS {
  const otherKeys = WEIGHT_LABELS.map((w) => w.key).filter((k) => k !== changedKey);
  const remaining = 100 - newValue;
  const otherSum = otherKeys.reduce((sum, k) => sum + current[k], 0);

  if (otherSum === 0) {
    const each = Math.round(remaining / otherKeys.length);
    const result = { ...current, [changedKey]: newValue };
    otherKeys.forEach((k, i) => {
      result[k] = i === otherKeys.length - 1 ? remaining - each * (otherKeys.length - 1) : each;
    });
    return result;
  }

  const result = { ...current, [changedKey]: newValue };
  let allocated = 0;
  otherKeys.forEach((k, i) => {
    if (i === otherKeys.length - 1) {
      result[k] = remaining - allocated;
    } else {
      const proportion = current[k] / otherSum;
      const val = Math.round(remaining * proportion);
      result[k] = val;
      allocated += val;
    }
  });

  return result;
}

export default function WeightSliders({ config, onChange }: WeightSlidersProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleChange(key: keyof typeof DEFAULT_WEIGHTS, value: number) {
    const clamped = Math.max(0, Math.min(100, value));
    const newWeights = redistributeWeights(config.weights, key, clamped);
    onChange({ ...config, weights: newWeights });
  }

  function handleReset() {
    onChange({ ...config, weights: { ...DEFAULT_WEIGHTS } });
  }

  const isDefault =
    config.weights.market_demand === DEFAULT_WEIGHTS.market_demand &&
    config.weights.market_quality === DEFAULT_WEIGHTS.market_quality &&
    config.weights.competitive_opportunity === DEFAULT_WEIGHTS.competitive_opportunity;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Adjust Weights
          {!isDefault && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Modified</span>
          )}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
          {WEIGHT_LABELS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-600">{label}</label>
                <span className="text-sm font-mono font-semibold text-gray-900 w-10 text-right">
                  {config.weights[key]}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights[key]}
                onChange={(e) => handleChange(key, parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-400">
              Total: {config.weights.market_demand + config.weights.market_quality + config.weights.competitive_opportunity}
            </span>
            <button
              type="button"
              onClick={handleReset}
              disabled={isDefault}
              className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
