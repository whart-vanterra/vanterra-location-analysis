import type { Recommendation, ScoringConfig } from './types';

interface ScoreFactor {
  label: string;
  points: number;
  maxPoints: number;
  ratio: number;
}

function getFactors(rec: Recommendation, config: ScoringConfig): ScoreFactor[] {
  const { weights } = config;

  return [
    {
      label: 'Market Demand (search volume + population)',
      points: rec.market_demand_score,
      maxPoints: weights.market_demand,
      ratio: rec.market_demand_score / weights.market_demand,
    },
    {
      label: 'Market Quality (homeownership, income, housing age)',
      points: rec.market_quality_score,
      maxPoints: weights.market_quality,
      ratio: rec.market_quality_score / weights.market_quality,
    },
    {
      label: 'Strategic Fit (market validation, distance, sister brands)',
      points: rec.strategic_fit_score,
      maxPoints: weights.strategic_fit,
      ratio: rec.strategic_fit_score / weights.strategic_fit,
    },
  ];
}

function describeRatio(ratio: number): string {
  if (ratio >= 0.85) return 'highest';
  if (ratio >= 0.65) return 'above average';
  if (ratio >= 0.4) return 'moderate';
  if (ratio >= 0.2) return 'below average';
  return 'low';
}

export function explainScore(rec: Recommendation, config: ScoringConfig): string {
  const factors = getFactors(rec, config);
  const sorted = [...factors].sort((a, b) => b.ratio - a.ratio);

  const top2 = sorted.slice(0, 2);
  const limiting = sorted[sorted.length - 1];

  const cityName = formatCityName(rec.city_key);
  const lines: string[] = [];

  lines.push(
    `${cityName}, ${rec.state} scores ${rec.composite_score.toFixed(1)} out of 100.`
  );

  lines.push(
    `Top contributing factors: ${top2
      .map(
        (f) =>
          `${f.label} is ${describeRatio(f.ratio)} (${f.points.toFixed(1)}/${f.maxPoints} pts)`
      )
      .join('; ')}.`
  );

  if (limiting.ratio < 0.5) {
    lines.push(
      `Main limiting factor: ${limiting.label} is ${describeRatio(limiting.ratio)} (${limiting.points.toFixed(1)}/${limiting.maxPoints} pts).`
    );
  }

  if (rec.crm_badge === 'PROVEN') {
    lines.push('CRM data confirms proven demand in this market.');
  } else if (rec.crm_badge === 'SIGNAL') {
    lines.push('CRM data shows early signals of demand.');
  }

  if (rec.sensitivity_flag) {
    lines.push('Note: This ranking is sensitive to scoring weight changes.');
  }

  return lines.join(' ');
}

export function formatCityName(cityKey: string): string {
  const [city] = cityKey.split('|');
  return city
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
