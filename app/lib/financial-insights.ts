import type { FinancialKpis } from "./types";

export type OperatingInsight = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  recommendation: string;
  impact: "High" | "Medium" | "Low";
};

type MaybeNumber = number | null | undefined;
const money = (value: MaybeNumber) => value == null ? "unavailable" : `$${Math.round(value).toLocaleString()}`;
const percent = (value: MaybeNumber) => value == null ? "unavailable" : `${(value * 100).toFixed(1)}%`;
const days = (value: MaybeNumber) => value == null ? "unavailable" : `${Math.round(value)} days`;
const multiple = (value: MaybeNumber) => value == null ? "unavailable" : `${value.toFixed(1)}x`;

export function generateFinancialInsights(kpis: FinancialKpis): OperatingInsight[] {
  const insights: OperatingInsight[] = [];

  if (kpis.operatingMargin != null && kpis.operatingMargin < 0.05) {
    insights.push({ severity: "high", title: "Operating margin leaves little room for error", detail: `Operating margin is ${percent(kpis.operatingMargin)}, so modest sales or cost pressure could erase operating profit.`, recommendation: "Review pricing, labor efficiency, and the five largest operating expenses; target a 2-3 point improvement within 90 days.", impact: "High" });
  } else if (kpis.operatingMargin != null) {
    insights.push({ severity: "low", title: "Core operations are profitable", detail: `Operating margin is ${percent(kpis.operatingMargin)}.`, recommendation: "Set monthly price, volume, labor, and overhead variance thresholds to protect the margin.", impact: "Medium" });
  }

  if ((kpis.operatingCashFlow ?? 0) <= 0) {
    insights.push({ severity: "high", title: "Operations are consuming cash", detail: `Operating cash flow is ${money(kpis.operatingCashFlow)}.`, recommendation: "Build a 13-week cash forecast, accelerate collections, and delay discretionary spending until operations turn cash positive.", impact: "High" });
  } else {
    insights.push({ severity: "low", title: "Operations are producing cash", detail: `Operating cash flow contributed ${money(kpis.operatingCashFlow)} during the analyzed period.`, recommendation: "Allocate operating cash deliberately among reserves, debt reduction, and measured reinvestment.", impact: "Medium" });
  }

  if (kpis.freeCashFlow != null && kpis.freeCashFlow < 0) {
    insights.push({ severity: "high", title: "Investment is outpacing internally generated cash", detail: `Free cash flow is ${money(kpis.freeCashFlow)} after capital spending.`, recommendation: "Rank capital projects by payback, stage nonessential purchases, and define the funding source before committing.", impact: "High" });
  } else if (kpis.freeCashFlow != null) {
    insights.push({ severity: "low", title: "The business is generating free cash flow", detail: `Free cash flow is ${money(kpis.freeCashFlow)}.`, recommendation: "Maintain a board-approved allocation policy for reserves, debt, owner distributions, and growth investment.", impact: "Medium" });
  }

  if (kpis.currentRatio != null && kpis.currentRatio < 1.2) {
    insights.push({ severity: "high", title: "Short-term liquidity is tight", detail: `Current ratio is ${multiple(kpis.currentRatio)} and quick ratio is ${multiple(kpis.quickRatio)}.`, recommendation: "Freeze nonessential spending and negotiate customer and supplier terms until near-term coverage improves.", impact: "High" });
  } else if (kpis.quickRatio != null && kpis.quickRatio < 1) {
    insights.push({ severity: "medium", title: "Liquidity depends on selling inventory", detail: `The quick ratio is ${multiple(kpis.quickRatio)} despite a current ratio of ${multiple(kpis.currentRatio)}.`, recommendation: "Reduce slow inventory, tighten purchasing, and monitor the weekly cash and receivables position.", impact: "High" });
  }

  if (kpis.daysCashOnHand != null && kpis.daysCashOnHand < 30) {
    insights.push({ severity: "high", title: "Cash reserves cover less than one month of operations", detail: `Estimated days cash on hand is ${days(kpis.daysCashOnHand)}.`, recommendation: "Set a minimum reserve target and prepare trigger actions for collections, purchasing, hiring, and owner distributions.", impact: "High" });
  } else if (kpis.daysCashOnHand != null && kpis.daysCashOnHand < 60) {
    insights.push({ severity: "medium", title: "Cash reserves deserve close monitoring", detail: `Estimated days cash on hand is ${days(kpis.daysCashOnHand)}.`, recommendation: "Extend the reserve toward 60-90 days of operating expense using a rolling 13-week cash plan.", impact: "High" });
  }

  if (kpis.debtToEquity != null && kpis.debtToEquity > 2) {
    insights.push({ severity: "high", title: "Financial leverage is elevated", detail: `Debt to equity is ${multiple(kpis.debtToEquity)}, increasing sensitivity to earnings and interest-rate pressure.`, recommendation: "Pause nonessential borrowing, model covenant headroom, and prioritize debt reduction from free cash flow.", impact: "High" });
  } else if (kpis.debtToEquity != null && kpis.debtToEquity > 1) {
    insights.push({ severity: "medium", title: "Leverage should be managed deliberately", detail: `Debt to equity is ${multiple(kpis.debtToEquity)}.`, recommendation: "Set a leverage ceiling and test debt service under a 10% revenue decline and higher borrowing costs.", impact: "High" });
  }

  if (kpis.interestCoverage != null && kpis.interestCoverage < 2) {
    insights.push({ severity: "high", title: "Interest coverage is thin", detail: `Operating profit covers interest expense ${multiple(kpis.interestCoverage)}.`, recommendation: "Protect covenant headroom and discuss refinancing or principal reduction before coverage deteriorates further.", impact: "High" });
  }

  if (kpis.cashConversionCycle != null && kpis.cashConversionCycle > 75) {
    insights.push({ severity: "high", title: "Working capital is tied up too long", detail: `The estimated cash conversion cycle is ${days(kpis.cashConversionCycle)}.`, recommendation: "Shorten receivable terms, reduce slow inventory, and align supplier terms with the operating cycle.", impact: "High" });
  } else if (kpis.receivableDays != null && kpis.receivableDays > 45) {
    insights.push({ severity: "medium", title: "Collections are slowing cash conversion", detail: `Estimated receivable days is ${days(kpis.receivableDays)}.`, recommendation: "Assign collection owners, invoice immediately, and review aging and disputes every week.", impact: "High" });
  }

  if (kpis.cashConversionRatio != null && kpis.netIncome != null && kpis.netIncome > 0 && kpis.cashConversionRatio < 0.8) {
    insights.push({ severity: "medium", title: "Reported profit is not fully converting to cash", detail: `Operating cash flow equals ${multiple(kpis.cashConversionRatio)} of net income.`, recommendation: "Reconcile profit to cash and focus on receivables, inventory, payables, and noncash adjustments.", impact: "High" });
  }

  if (kpis.netMargin != null && kpis.netMargin < 0.04) {
    insights.push({ severity: "medium", title: "Bottom-line conversion is thin", detail: `Only ${percent(kpis.netMargin)} of revenue reaches net income.`, recommendation: "Test pricing, mix, financing-cost, and overhead changes in a quantified 90-day profit plan.", impact: "High" });
  }

  if ((kpis.cashChange ?? 0) < 0) {
    insights.push({ severity: "medium", title: "Cash declined during the period", detail: `Cash changed by ${money(kpis.cashChange)}.`, recommendation: "Separate recurring operating needs from one-time investments, financing activity, and owner distributions.", impact: "High" });
  }

  if (!insights.length) {
    insights.push({ severity: "low", title: "No immediate financial control issue was detected", detail: "The available metrics do not cross CashFlo's operating risk thresholds.", recommendation: "Continue monthly variance reviews and maintain a rolling cash forecast.", impact: "Medium" });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 6);
}
