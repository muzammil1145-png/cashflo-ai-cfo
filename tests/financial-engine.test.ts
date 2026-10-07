import assert from "node:assert/strict";
import test from "node:test";
import { calculateFinancials, FORMULA_VERSION, validateFinancials, type FinancialInputs } from "../app/lib/financial-engine";

function completeInput(overrides: Partial<FinancialInputs> = {}): FinancialInputs {
  return {
    revenue: 1_000_000,
    costOfSales: 400_000,
    grossProfit: 600_000,
    operatingExpenses: 450_000,
    operatingIncome: 150_000,
    interestExpense: 30_000,
    netIncome: 90_000,
    cashBalanceSheet: 120_000,
    beginningCash: 100_000,
    endingCashFlow: 120_000,
    currentAssets: 300_000,
    currentLiabilities: 150_000,
    accountsReceivable: 80_000,
    inventory: 60_000,
    accountsPayable: 50_000,
    shortTermDebt: 40_000,
    longTermDebt: 160_000,
    totalDebt: 200_000,
    totalAssets: 600_000,
    totalLiabilities: 350_000,
    equity: 250_000,
    operatingCashFlow: 130_000,
    investingCashFlow: -50_000,
    financingCashFlow: -10_000,
    netCashChange: 20_000,
    exchangeRateEffect: -50_000,
    capex: -50_000,
    granularity: "Annual",
    periods: ["FY 2025"],
    revenueSeries: [900_000, 1_000_000],
    incomeSeries: [70_000, 90_000],
    ...overrides,
  };
}

const alignedContext = {
  granularities: { income: "Annual", balance: "Annual", cashflow: "Annual" } as const,
  duplicates: [],
};

test("the calculation engine is deterministic for identical normalized inputs", () => {
  const input = completeInput();
  assert.deepEqual(calculateFinancials(input), calculateFinancials(input));
});

test("calculates core profitability, liquidity, leverage, and cash-flow formulas", () => {
  const { kpis, calculations } = calculateFinancials(completeInput());
  assert.equal(kpis.grossMargin, 0.6);
  assert.equal(kpis.operatingMargin, 0.15);
  assert.equal(kpis.currentRatio, 2);
  assert.equal(kpis.quickRatio, 1.6);
  assert.equal(kpis.workingCapital, 150_000);
  assert.equal(kpis.debtToEquity, 0.8);
  assert.equal(kpis.interestCoverage, 5);
  assert.equal(kpis.freeCashFlow, 80_000);
  assert.equal(kpis.cashConversionRatio, 130_000 / 90_000);
  assert.equal(calculations.debtToEquity.formulaVersion, FORMULA_VERSION);
  assert.equal(calculations.debtToEquity.formulaId, "leverage.debt_to_equity");
});

test("derives gross profit and operating expenses when totals are not reported", () => {
  const { kpis, calculations } = calculateFinancials(completeInput({ grossProfit: null, operatingExpenses: null }));
  assert.equal(kpis.grossProfit, 600_000);
  assert.equal(kpis.operatingExpenses, 450_000);
  assert.equal(calculations.grossProfit.status, "derived");
  assert.equal(calculations.operatingExpenses.status, "derived");
});

test("normalizes positive capital expenditure values as cash outflows", () => {
  const { kpis } = calculateFinancials(completeInput({ capex: 50_000 }));
  assert.equal(kpis.capex, -50_000);
  assert.equal(kpis.freeCashFlow, 80_000);
});

test("returns null instead of infinity for zero denominators", () => {
  const { kpis } = calculateFinancials(completeInput({ revenue: 0, currentLiabilities: 0, equity: 0, netIncome: 0 }));
  assert.equal(kpis.grossMargin, null);
  assert.equal(kpis.currentRatio, null);
  assert.equal(kpis.debtToEquity, null);
  assert.equal(kpis.cashConversionRatio, null);
});

test("records the conservative total-liabilities debt fallback", () => {
  const { kpis, calculations } = calculateFinancials(completeInput({ totalDebt: null, shortTermDebt: null, longTermDebt: null }));
  assert.equal(kpis.totalDebt, 350_000);
  assert.equal(calculations.totalDebt.formulaId, "leverage.total_liabilities_proxy");
  assert.match(calculations.totalDebt.note ?? "", /proxy/i);
});

test("passes a balanced, aligned three-statement dataset", () => {
  const result = validateFinancials(completeInput(), alignedContext);
  assert.equal(result.status, "ready");
  assert.equal(result.errorCount, 0);
  assert.ok(result.passCount >= 6);
});

test("blocks saving when the balance sheet does not reconcile", () => {
  const result = validateFinancials(completeInput({ totalAssets: 650_000 }), alignedContext);
  assert.equal(result.status, "review_required");
  assert.ok(result.errorCount > 0);
  assert.equal(result.checks.find((check) => check.id === "balance_sheet")?.severity, "error");
});

test("flags missing essential accounts and duplicate matches", () => {
  const result = validateFinancials(completeInput({ revenue: null }), {
    ...alignedContext,
    duplicates: [{ statement: "income", metric: "revenue", rows: ["Income!A3", "Income!A9"] }],
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.checks.find((check) => check.id === "required_accounts")?.severity, "error");
  assert.equal(result.checks.find((check) => check.id === "duplicate_accounts")?.severity, "warning");
});

test("warns when statement period granularities differ", () => {
  const result = validateFinancials(completeInput(), {
    granularities: { income: "Monthly", balance: "Annual", cashflow: "Annual" },
    duplicates: [],
  });
  assert.equal(result.checks.find((check) => check.id === "period_alignment")?.severity, "warning");
});

test("blocks saving when the reported cash rollforward does not reconcile", () => {
  const result = validateFinancials(completeInput({ netCashChange: 5_000 }), alignedContext);
  assert.equal(result.checks.find((check) => check.id === "cash_rollforward")?.severity, "error");
  assert.equal(result.status, "review_required");
});

test("blocks saving when operating, investing, and financing cash do not reconcile", () => {
  const result = validateFinancials(completeInput({ financingCashFlow: 50_000 }), alignedContext);
  assert.equal(result.checks.find((check) => check.id === "cash_activity")?.severity, "error");
});

test("blocks mixed-currency statements", () => {
  const result = validateFinancials(completeInput(), {
    ...alignedContext,
    currencies: { income: "USD", balance: "CAD", cashflow: "USD" },
  });
  assert.equal(result.checks.find((check) => check.id === "currency_consistency")?.severity, "error");
});

test("blocks ambiguous duplicate statement sheets", () => {
  const result = validateFinancials(completeInput(), {
    ...alignedContext,
    duplicateStatements: [{ statement: "income", sheets: ["P&L", "Income Statement"] }],
  });
  assert.equal(result.checks.find((check) => check.id === "duplicate_statements")?.severity, "error");
});

test("flags impossible negative balance-sheet totals", () => {
  const result = validateFinancials(completeInput({ totalAssets: -600_000 }), alignedContext);
  assert.equal(result.checks.find((check) => check.id === "sign_convention")?.severity, "error");
});

test("warns when statement unit scales differ after normalization", () => {
  const result = validateFinancials(completeInput(), {
    ...alignedContext,
    scales: { income: 1_000, balance: 1, cashflow: 1_000 },
  });
  assert.equal(result.checks.find((check) => check.id === "unit_scale")?.severity, "warning");
});

test("marks dependent accounting checks as not run when prerequisites are missing", () => {
  const result = validateFinancials(completeInput({ totalAssets: null, totalLiabilities: null }), alignedContext);
  assert.equal(result.checks.find((check) => check.id === "required_accounts")?.severity, "error");
  assert.equal(result.checks.find((check) => check.id === "balance_sheet")?.severity, "not_run");
  assert.ok(result.notRunCount >= 1);
});

test("uses the declared statement scale instead of a percentage tolerance", () => {
  const withinDisplayedUnit = validateFinancials(completeInput({ totalAssets: 601_000 }), {
    ...alignedContext,
    scales: { income: 1_000, balance: 1_000, cashflow: 1_000 },
  });
  const outsideDisplayedUnit = validateFinancials(completeInput({ totalAssets: 601_001 }), {
    ...alignedContext,
    scales: { income: 1_000, balance: 1_000, cashflow: 1_000 },
  });
  assert.equal(withinDisplayedUnit.checks.find((check) => check.id === "balance_sheet")?.severity, "pass");
  assert.equal(withinDisplayedUnit.checks.find((check) => check.id === "balance_sheet")?.tolerance, 1_000);
  assert.equal(outsideDisplayedUnit.checks.find((check) => check.id === "balance_sheet")?.severity, "error");
});
