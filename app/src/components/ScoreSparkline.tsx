interface ScoreSparklineProps {
  demand: number;
  quality: number;
  strategicFit: number;
}

export default function ScoreSparkline({ demand, quality, strategicFit }: ScoreSparklineProps) {
  const total = demand + quality + strategicFit;
  const maxScore = 100;
  const widthPct = Math.min((total / maxScore) * 100, 100);

  const demandPct = total > 0 ? (demand / total) * 100 : 0;
  const qualityPct = total > 0 ? (quality / total) * 100 : 0;
  const fitPct = total > 0 ? (strategicFit / total) * 100 : 0;

  return (
    <div
      className="inline-flex h-3 rounded-sm overflow-hidden"
      style={{ width: `${widthPct}%`, minWidth: '4px', backgroundColor: '#e5e7eb' }}
      title={`Demand: ${demand.toFixed(1)} | Quality: ${quality.toFixed(1)} | Strategic Fit: ${strategicFit.toFixed(1)}`}
    >
      <div
        style={{ width: `${demandPct}%`, backgroundColor: '#4C9784' }}
        className="h-full"
      />
      <div
        style={{ width: `${qualityPct}%`, backgroundColor: '#2d9e5f' }}
        className="h-full"
      />
      <div
        style={{ width: `${fitPct}%`, backgroundColor: '#d4820a' }}
        className="h-full"
      />
    </div>
  );
}
