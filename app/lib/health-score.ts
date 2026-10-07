import type { FinancialKpis } from "./types";

const REQUIRED_HEALTH_METRICS = [
  ["operatingMargin", "operating margin"],
  ["operatingCashFlow", "operating cash flow"],
  ["currentRatio", "current ratio"],
  ["daysCashOnHand", "days cash on hand"],
  ["debtToEquity", "debt to equity"],
] as const;

type HealthMetric = (typeof REQUIRED_HEALTH_METRICS)[number][0];
type HealthInputs = Pick<FinancialKpis, HealthMetric>;
export type HealthScoreStatus = "Healthy" | "Watch" | "Needs attention";

export type HealthScoreResult = {
  score: number | null;
  status: HealthScoreStatus | "Incomplete data";
  completeness: number;
  missingMetrics: HealthMetric[];
  missingMetricLabels: string[];
};

const isAvailable = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Calculates the deterministic CashFlo health score only when every score input
 * is available. Missing inputs are reported instead of replaced with assumptions.
 */
export function calculateHealthScore(kpis: HealthInputs): HealthScoreResult {
  const missing = REQUIRED_HEALTH_METRICS.filter(([metric]) => !isAvailable(kpis[metric]));
  const availableCount = REQUIRED_HEALTH_METRICS.length - missing.length;
  const completeness = Math.round((availableCount / REQUIRED_HEALTH_METRICS.length) * 100);

  if (missing.length > 0) {
    return {
      score: null,
      status: "Incomplete data",
      completeness,
      missingMetrics: missing.map(([metric]) => metric),
      missingMetricLabels: missing.map(([, label]) => label),
    };
  }

  const operatingMargin = kpis.operatingMargin as number;
  const operatingCashFlow = kpis.operatingCashFlow as number;
  const currentRatio = kpis.currentRatio as number;
  const daysCashOnHand = kpis.daysCashOnHand as number;
  const debtToEquity = kpis.debtToEquity as number;

  const rawScore = 66
    + (operatingMargin >= 0.08 ? 8 : operatingMargin > 0 ? 2 : -14)
    + (operatingCashFlow > 0 ? 8 : -16)
    + (currentRatio >= 1.5 ? 6 : currentRatio < 1 ? -12 : 0)
    + (daysCashOnHand >= 60 ? 5 : daysCashOnHand < 30 ? -10 : 0)
    + (debtToEquity < 0 ? -10 : debtToEquity <= 1 ? 4 : debtToEquity > 2 ? -10 : -3);
  const score = Math.max(20, Math.min(95, rawScore));

  return {
    score,
    status: score >= 75 ? "Healthy" : score >= 55 ? "Watch" : "Needs attention",
    completeness,
    missingMetrics: [],
    missingMetricLabels: [],
  };
}
