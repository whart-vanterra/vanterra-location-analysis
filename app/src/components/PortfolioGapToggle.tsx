'use client';

interface PortfolioGapToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function PortfolioGapToggle({ enabled, onToggle }: PortfolioGapToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <div>
        <span className="text-sm font-medium text-gray-700">Portfolio Gap Bonus</span>
        <p className="text-xs text-gray-400">
          {enabled
            ? 'Scores include portfolio gap bonus (max 25 pts)'
            : 'Base scoring only (100-point scale)'}
        </p>
      </div>
    </div>
  );
}
