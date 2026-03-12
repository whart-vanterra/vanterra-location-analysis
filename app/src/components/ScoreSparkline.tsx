interface ScoreSparklineProps {
  demand: number;
  quality: number;
  competition: number;
}

export default function ScoreSparkline({ demand, quality, competition }: ScoreSparklineProps) {
  const total = demand + quality + competition;
  const maxScore = 100;
  const widthPct = Math.min((total / maxScore) * 100, 100);

  const demandPct = total > 0 ? (demand / total) * 100 : 0;
  const qualityPct = total > 0 ? (quality / total) * 100 : 0;
  const competitionPct = total > 0 ? (competition / total) * 100 : 0;

  return (
    <div
      className="inline-flex h-3 rounded-sm overflow-hidden bg-gray-100"
      style={{ width: `${widthPct}%`, minWidth: '4px' }}
      title={`Demand: ${demand.toFixed(1)} | Quality: ${quality.toFixed(1)} | Competition: ${competition.toFixed(1)}`}
    >
      <div
        className="bg-green-500 h-full"
        style={{ width: `${demandPct}%` }}
      />
      <div
        className="bg-blue-500 h-full"
        style={{ width: `${qualityPct}%` }}
      />
      <div
        className="bg-orange-400 h-full"
        style={{ width: `${competitionPct}%` }}
      />
    </div>
  );
}
