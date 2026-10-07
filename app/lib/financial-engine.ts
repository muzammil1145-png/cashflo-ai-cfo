import type {
  CalculationInput,
  CalculationTrace,
  FinancialKpis,
  SourceReference,
  StatementType,
  ValidationCheck,
  ValidationSummary,
} from "./types";

export const FORMULA_VERSION = "2026.08.2";

export const FORMULA_REGISTRY = {
  grossProfit: "Revenue - cost of sales when gross profit is not reported",
  grossMargin: "Gross profit / revenue",
  operatingExpenses: "Gross profit - operating income when operating expenses are not reported",
  operatingMargin: "Operating income / revenue",
  interestCoverage: "Operating income / absolute interest expense",
  netMargin: "Net income / revenue",
  currentRatio: "Current assets / current liabilities",
  quickRatio: "(Current assets - inventory) / current liabilities",
  workingCapital: "Current assets - current liabilities",
  debtToEquity: "Total debt / total equity",
  freeCashFlow: "Operating cash flow + normalized capital expenditures",
  freeCashFlowMargin: "Free cash flow / revenue",
  cashConversionRatio: "Operating cash flow / net income",
  daysCashOnHand: "Cash / (operating expenses / period days)",
  cashRunwayMonths: "Cash / monthly operating cash burn",
  receivableDays: "Accounts receivable / revenue * period days",
  inventoryDays: "Inventory / absolute cost of sales * period days",
  payableDays: "Accounts payable / absolute cost of sales * period days",
  cashConversionCycle: "Receivable days + inventory days - payable days",
  returnOnAssets: "Net income / ending total assets",
  returnOnEquity: "Net income / ending total equity",
  assetTurnover: "Revenue / ending total assets",
} as const;

export type FinancialInputs = {
  revenue: number | null;
  costOfSales: number | null;
  grossProfit: number | null;
  operatingExpenses: number | null;
  operatingIncome: number | null;
  interestExpense: number | null;
  netIncome: number | null;
  cashBalanceSheet: number | null;
  beginningCash: number | null;
  endingCashFlow: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  accountsReceivable: number | null;
  inventory: number | null;
  accountsPayable: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  totalDebt: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  netCashChange: number | null;
  exchangeRateEffect: number | null;
  capex: number | null;
  granularity: string;
  periods: string[];
  revenueSeries: number[];
  incomeSeries: number[];
  sources?: Partial<Record<string, SourceReference[]>>;
};

export type ValidationContext = {
  granularities: Record<StatementType, string>;
  duplicates: Array<{ statement: StatementType; metric: string; rows: string[] }>;
  periods?: Record<StatementType, string[]>;
  periodEnds?: Record<StatementType, string | null>;
  currencies?: Record<StatementType, string | null>;
  scales?: Record<StatementType, number>;
  scaleConfirmed?: Record<StatementType, boolean>;
  duplicateStatements?: Array<{ statement: StatementType; sheets: string[] }>;
};

const labels: Record<string, string> = {
  revenue: "Revenue",
  revenueGrowth: "Revenue growth",
  costOfSales: "Cost of sales",
  grossProfit: "Gross profit",
  grossMargin: "Gross margin",
  operatingExpenses: "Operating expenses",
  operatingIncome: "Operating income",
  operatingMargin: "Operating margin",
  interestExpense: "Interest expense",
  interestCoverage: "Interest coverage",
  netIncome: "Net income",
  netMargin: "Net margin",
  cash: "Cash on hand",
  currentAssets: "Current assets",
  currentLiabilities: "Current liabilities",
  currentRatio: "Current ratio",
  quickRatio: "Quick ratio",
  workingCapital: "Working capital",
  accountsReceivable: "Accounts receivable",
  inventory: "Inventory",
  accountsPayable: "Accounts payable",
  totalDebt: "Total debt",
  debtToEquity: "Debt to equity",
  operatingCashFlow: "Operating cash flow",
  investingCashFlow: "Investing cash flow",
  financingCashFlow: "Financing cash flow",
  netCashChangeReported: "Reported net cash change",
  capex: "Capital expenditures",
  freeCashFlow: "Free cash flow",
  freeCashFlowMargin: "Free cash flow margin",
  cashConversionRatio: "Cash conversion ratio",
  daysCashOnHand: "Days cash on hand",
  cashRunwayMonths: "Cash runway months",
  receivableDays: "Receivable days",
  inventoryDays: "Inventory days",
  payableDays: "Payable days",
  cashConversionCycle: "Cash conversion cycle",
  beginningCash: "Beginning cash",
  endingCash: "Ending cash",
  cashChange: "Cash change",
  totalAssets: "Total assets",
  totalLiabilities: "Total liabilities",
  equity: "Total equity",
  returnOnAssets: "Return on assets",
  returnOnEquity: "Return on equity",
  assetTurnover: "Asset turnover",
  periodDays: "Period days",
};

const available = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value);

export function calculateFinancials(input: FinancialInputs): { kpis: FinancialKpis; calculations: Record<string, CalculationTrace> } {
  const sources = input.sources ?? {};
  const calculations: Record<string, CalculationTrace> = {};

  const sourceInput = (name: string, value: number | null, label = labels[name] ?? name): CalculationInput => {
    const inheritedSources = calculations[name]?.inputs.flatMap((item) => item.sources ?? []);
    return {
      name,
      label,
      value,
      sources: sources[name]?.length ? sources[name] : inheritedSources?.length ? inheritedSources : undefined,
    };
  };

  const record = (
    metric: string,
    value: number | null,
    formulaId: string,
    formula: string,
    inputs: CalculationInput[],
    status: "reported" | "derived" = "derived",
    note?: string,
  ) => {
    calculations[metric] = {
      metric,
      label: labels[metric] ?? metric,
      formulaId,
      formulaVersion: FORMULA_VERSION,
      formula,
      value,
      status: available(value) ? status : "unavailable",
      inputs,
      note,
    };
    return value;
  };

  const reported = (metric: string, value: number | null, inputName = metric) => record(
    metric,
    value,
    `reported.${metric}`,
    "Reported statement value",
    [sourceInput(inputName, value)],
    "reported",
  );

  const revenue = reported("revenue", input.revenue);
  const costOfSales = reported("costOfSales", input.costOfSales);
  const reportedGrossProfit = input.grossProfit;
  const grossProfit = reportedGrossProfit !== null
    ? reported("grossProfit", reportedGrossProfit)
    : record(
      "grossProfit",
      available(revenue) && available(costOfSales) ? revenue - costOfSales : null,
      "profitability.gross_profit",
      FORMULA_REGISTRY.grossProfit,
      [sourceInput("revenue", revenue), sourceInput("costOfSales", costOfSales)],
      "derived",
      "Derived because gross profit was not reported.",
    );
  const operatingIncome = reported("operatingIncome", input.operatingIncome);
  const operatingExpenses = input.operatingExpenses !== null
    ? reported("operatingExpenses", input.operatingExpenses)
    : record(
      "operatingExpenses",
      available(grossProfit) && available(operatingIncome) ? grossProfit - operatingIncome : null,
      "profitability.operating_expenses",
      FORMULA_REGISTRY.operatingExpenses,
      [sourceInput("grossProfit", grossProfit), sourceInput("operatingIncome", operatingIncome)],
      "derived",
      "Derived because total operating expenses were not reported.",
    );
  const interestExpense = reported("interestExpense", input.interestExpense);
  const netIncome = reported("netIncome", input.netIncome);
  const beginningCash = reported("beginningCash", input.beginningCash);
  const endingCash = input.endingCashFlow !== null
    ? reported("endingCash", input.endingCashFlow, "endingCashFlow")
    : record("endingCash", input.cashBalanceSheet, "liquidity.ending_cash_fallback", "Balance-sheet cash used because cash-flow ending cash was unavailable", [sourceInput("cashBalanceSheet", input.cashBalanceSheet, "Balance-sheet cash")], "derived");
  const cash = input.cashBalanceSheet !== null
    ? reported("cash", input.cashBalanceSheet, "cashBalanceSheet")
    : record("cash", endingCash, "liquidity.cash_fallback", "Cash-flow ending cash used because balance-sheet cash was unavailable", [sourceInput("endingCashFlow", input.endingCashFlow, "Cash-flow ending cash")], "derived");
  const currentAssets = reported("currentAssets", input.currentAssets);
  const currentLiabilities = reported("currentLiabilities", input.currentLiabilities);
  const accountsReceivable = reported("accountsReceivable", input.accountsReceivable);
  const inventory = reported("inventory", input.inventory);
  const accountsPayable = reported("accountsPayable", input.accountsPayable);
  const totalAssets = reported("totalAssets", input.totalAssets);
  const totalLiabilities = reported("totalLiabilities", input.totalLiabilities);
  const equity = reported("equity", input.equity);
  const operatingCashFlow = reported("operatingCashFlow", input.operatingCashFlow);
  const investingCashFlow = reported("investingCashFlow", input.investingCashFlow);
  const financingCashFlow = reported("financingCashFlow", input.financingCashFlow);
  const netCashChangeReported = reported("netCashChangeReported", input.netCashChange, "netCashChange");

  let totalDebt: number | null;
  if (input.totalDebt !== null) {
    totalDebt = reported("totalDebt", input.totalDebt);
  } else if (input.shortTermDebt !== null || input.longTermDebt !== null) {
    totalDebt = record(
      "totalDebt",
      (input.shortTermDebt ?? 0) + (input.longTermDebt ?? 0),
      "leverage.total_debt_components",
      "Short-term debt + long-term debt",
      [sourceInput("shortTermDebt", input.shortTermDebt, "Short-term debt"), sourceInput("longTermDebt", input.longTermDebt, "Long-term debt")],
      "derived",
    );
  } else {
    totalDebt = record(
      "totalDebt",
      totalLiabilities,
      "leverage.total_liabilities_proxy",
      "Total liabilities used as a conservative debt proxy",
      [sourceInput("totalLiabilities", totalLiabilities)],
      "derived",
      "Debt accounts were not reported separately, so total liabilities are used as a proxy.",
    );
  }

  const normalizedCapex = record(
    "capex",
    input.capex === null ? null : input.capex > 0 ? -input.capex : input.capex,
    "cash_flow.normalized_capex",
    "Positive capital expenditures are normalized to a cash outflow",
    [sourceInput("capex", input.capex)],
    "derived",
  );

  const periodDays = input.granularity === "Monthly"
    ? Math.max(input.periods.length, 1) * 30.4
    : input.granularity === "Single period" ? 30.4 : 365;
  record("periodDays", periodDays, "period.period_days", "Monthly periods * 30.4; single period = 30.4; otherwise 365", [], "derived", `${input.granularity} coverage across ${input.periods.length || 1} period(s).`);

  const revenueSeries = input.revenueSeries;
  const latestRevenue = revenueSeries.at(-1);
  const priorRevenue = revenueSeries.at(-2);
  const revenueGrowth = record(
    "revenueGrowth",
    available(latestRevenue) && available(priorRevenue) && priorRevenue !== 0 ? (latestRevenue - priorRevenue) / Math.abs(priorRevenue) : null,
    "growth.revenue",
    "(Latest revenue - prior revenue) / absolute prior revenue",
    [
      { name: "latestRevenue", label: "Latest revenue", value: latestRevenue ?? null, sources: sources.revenue?.slice(-1) },
      { name: "priorRevenue", label: "Prior revenue", value: priorRevenue ?? null, sources: sources.revenue?.slice(-2, -1) },
    ],
  );
  const grossMargin = record("grossMargin", revenue !== 0 && available(revenue) && available(grossProfit) ? grossProfit / revenue : null, "profitability.gross_margin", FORMULA_REGISTRY.grossMargin, [sourceInput("grossProfit", grossProfit), sourceInput("revenue", revenue)]);
  const operatingMargin = record("operatingMargin", revenue !== 0 && available(revenue) && available(operatingIncome) ? operatingIncome / revenue : null, "profitability.operating_margin", FORMULA_REGISTRY.operatingMargin, [sourceInput("operatingIncome", operatingIncome), sourceInput("revenue", revenue)]);
  const interestCoverage = record("interestCoverage", interestExpense !== 0 && available(interestExpense) && available(operatingIncome) ? operatingIncome / Math.abs(interestExpense) : null, "leverage.interest_coverage", FORMULA_REGISTRY.interestCoverage, [sourceInput("operatingIncome", operatingIncome), sourceInput("interestExpense", interestExpense)]);
  const netMargin = record("netMargin", revenue !== 0 && available(revenue) && available(netIncome) ? netIncome / revenue : null, "profitability.net_margin", FORMULA_REGISTRY.netMargin, [sourceInput("netIncome", netIncome), sourceInput("revenue", revenue)]);
  const currentRatio = record("currentRatio", currentLiabilities !== 0 && available(currentLiabilities) && available(currentAssets) ? currentAssets / currentLiabilities : null, "liquidity.current_ratio", FORMULA_REGISTRY.currentRatio, [sourceInput("currentAssets", currentAssets), sourceInput("currentLiabilities", currentLiabilities)]);
  const quickRatio = record("quickRatio", currentLiabilities !== 0 && available(currentLiabilities) && available(currentAssets) ? (currentAssets - (inventory ?? 0)) / currentLiabilities : null, "liquidity.quick_ratio", FORMULA_REGISTRY.quickRatio, [sourceInput("currentAssets", currentAssets), sourceInput("inventory", inventory), sourceInput("currentLiabilities", currentLiabilities)]);
  const workingCapital = record("workingCapital", available(currentAssets) && available(currentLiabilities) ? currentAssets - currentLiabilities : null, "liquidity.working_capital", FORMULA_REGISTRY.workingCapital, [sourceInput("currentAssets", currentAssets), sourceInput("currentLiabilities", currentLiabilities)]);
  const debtToEquity = record("debtToEquity", equity !== 0 && available(equity) && available(totalDebt) ? totalDebt / equity : null, "leverage.debt_to_equity", FORMULA_REGISTRY.debtToEquity, [sourceInput("totalDebt", totalDebt), sourceInput("equity", equity)]);
  const freeCashFlow = record("freeCashFlow", available(operatingCashFlow) && available(normalizedCapex) ? operatingCashFlow + normalizedCapex : null, "cash_flow.free_cash_flow", FORMULA_REGISTRY.freeCashFlow, [sourceInput("operatingCashFlow", operatingCashFlow), sourceInput("capex", normalizedCapex)]);
  const freeCashFlowMargin = record("freeCashFlowMargin", revenue !== 0 && available(revenue) && available(freeCashFlow) ? freeCashFlow / revenue : null, "cash_flow.free_cash_flow_margin", FORMULA_REGISTRY.freeCashFlowMargin, [sourceInput("freeCashFlow", freeCashFlow), sourceInput("revenue", revenue)]);
  const cashConversionRatio = record("cashConversionRatio", netIncome !== 0 && available(netIncome) && available(operatingCashFlow) ? operatingCashFlow / netIncome : null, "cash_flow.cash_conversion", FORMULA_REGISTRY.cashConversionRatio, [sourceInput("operatingCashFlow", operatingCashFlow), sourceInput("netIncome", netIncome)]);
  const dailyOperatingCost = available(operatingExpenses) && operatingExpenses > 0 ? operatingExpenses / periodDays : null;
  const daysCashOnHand = record("daysCashOnHand", available(cash) && available(dailyOperatingCost) && dailyOperatingCost > 0 ? cash / dailyOperatingCost : null, "liquidity.days_cash_on_hand", FORMULA_REGISTRY.daysCashOnHand, [sourceInput("cash", cash), sourceInput("operatingExpenses", operatingExpenses), { name: "periodDays", label: "Period days", value: periodDays }]);
  const monthlyBurn = available(operatingCashFlow) && operatingCashFlow < 0 ? Math.abs(operatingCashFlow) / (periodDays / 30.4) : null;
  const cashRunwayMonths = record("cashRunwayMonths", available(cash) && available(monthlyBurn) && monthlyBurn > 0 ? cash / monthlyBurn : null, "liquidity.cash_runway", FORMULA_REGISTRY.cashRunwayMonths, [sourceInput("cash", cash), { name: "monthlyBurn", label: "Monthly operating cash burn", value: monthlyBurn }], "derived", operatingCashFlow !== null && operatingCashFlow >= 0 ? "Runway is not calculated while operating cash flow is non-negative." : undefined);
  const receivableDays = record("receivableDays", revenue !== 0 && available(revenue) && available(accountsReceivable) ? accountsReceivable / revenue * periodDays : null, "working_capital.receivable_days", FORMULA_REGISTRY.receivableDays, [sourceInput("accountsReceivable", accountsReceivable), sourceInput("revenue", revenue), { name: "periodDays", label: "Period days", value: periodDays }]);
  const inventoryDays = record("inventoryDays", costOfSales !== 0 && available(costOfSales) && available(inventory) ? inventory / Math.abs(costOfSales) * periodDays : null, "working_capital.inventory_days", FORMULA_REGISTRY.inventoryDays, [sourceInput("inventory", inventory), sourceInput("costOfSales", costOfSales), { name: "periodDays", label: "Period days", value: periodDays }]);
  const payableDays = record("payableDays", costOfSales !== 0 && available(costOfSales) && available(accountsPayable) ? accountsPayable / Math.abs(costOfSales) * periodDays : null, "working_capital.payable_days", FORMULA_REGISTRY.payableDays, [sourceInput("accountsPayable", accountsPayable), sourceInput("costOfSales", costOfSales), { name: "periodDays", label: "Period days", value: periodDays }]);
  const cashConversionCycle = record("cashConversionCycle", available(receivableDays) && available(inventoryDays) && available(payableDays) ? receivableDays + inventoryDays - payableDays : null, "working_capital.cash_conversion_cycle", FORMULA_REGISTRY.cashConversionCycle, [sourceInput("receivableDays", receivableDays), sourceInput("inventoryDays", inventoryDays), sourceInput("payableDays", payableDays)]);
  const cashChange = record("cashChange", available(beginningCash) && available(endingCash) ? endingCash - beginningCash : null, "cash_flow.cash_change", "Ending cash - beginning cash", [sourceInput("endingCash", endingCash), sourceInput("beginningCash", beginningCash)]);
  const returnOnAssets = record("returnOnAssets", totalAssets !== 0 && available(totalAssets) && available(netIncome) ? netIncome / totalAssets : null, "returns.return_on_assets", FORMULA_REGISTRY.returnOnAssets, [sourceInput("netIncome", netIncome), sourceInput("totalAssets", totalAssets)], "derived", "Uses ending assets because beginning balances are not currently collected.");
  const returnOnEquity = record("returnOnEquity", equity !== 0 && available(equity) && available(netIncome) ? netIncome / equity : null, "returns.return_on_equity", FORMULA_REGISTRY.returnOnEquity, [sourceInput("netIncome", netIncome), sourceInput("equity", equity)], "derived", "Uses ending equity because beginning balances are not currently collected.");
  const assetTurnover = record("assetTurnover", totalAssets !== 0 && available(totalAssets) && available(revenue) ? revenue / totalAssets : null, "efficiency.asset_turnover", FORMULA_REGISTRY.assetTurnover, [sourceInput("revenue", revenue), sourceInput("totalAssets", totalAssets)], "derived", "Uses ending assets because beginning balances are not currently collected.");

  return {
    kpis: {
      revenue, revenueGrowth, costOfSales, grossProfit, grossMargin, operatingExpenses, operatingIncome,
      operatingMargin, interestExpense, interestCoverage, netIncome, netMargin, cash, currentAssets,
      currentLiabilities, currentRatio, quickRatio, workingCapital, accountsReceivable, inventory,
      accountsPayable, totalDebt, debtToEquity, operatingCashFlow, investingCashFlow, financingCashFlow,
      netCashChangeReported, capex: normalizedCapex, freeCashFlow,
      freeCashFlowMargin, cashConversionRatio, daysCashOnHand, cashRunwayMonths, receivableDays,
      inventoryDays, payableDays, cashConversionCycle, beginningCash, endingCash, cashChange, totalAssets,
      totalLiabilities, equity, returnOnAssets, returnOnEquity, assetTurnover, periodDays,
      granularity: input.granularity, periods: input.periods, revenueSeries, incomeSeries: input.incomeSeries,
    },
    calculations,
  };
}

const toleranceForScale = (scale: number | undefined) => Math.max(1, Math.abs(scale ?? 1));
export const VALIDATION_VERSION = "2.0.0";

export function validateFinancials(input: FinancialInputs, context: ValidationContext): ValidationSummary {
  const checks: ValidationCheck[] = [];
  const add = (check: ValidationCheck) => checks.push(check);
  const notRun = (id: string, label: string, message: string) => add({ id, label, severity: "not_run", stage: "accounting", message });
  const reconcile = (id: string, label: string, actual: number, expected: number, scale: number | undefined, failureMessage: string) => {
    const difference = actual - expected;
    const tolerance = toleranceForScale(scale);
    add(Math.abs(difference) <= tolerance
      ? { id, label, severity: "pass", stage: "accounting", message: `Reconciled using a deterministic ±${tolerance.toLocaleString(undefined, { maximumFractionDigits: 2 })} tolerance based on the statement's declared unit scale.`, difference, tolerance }
      : { id, label, severity: "error", stage: "accounting", message: failureMessage, difference, tolerance });
  };

  const required: Array<[keyof FinancialInputs, string]> = [
    ["revenue", "Revenue"], ["netIncome", "Net income"], ["totalAssets", "Total assets"],
    ["totalLiabilities", "Total liabilities"], ["equity", "Total equity"],
    ["operatingCashFlow", "Operating cash flow"],
  ];
  const missing = required.filter(([key]) => !available(input[key] as number | null)).map(([, label]) => label);
  add(missing.length
    ? { id: "required_accounts", label: "Required financial accounts", severity: "error", stage: "mapping", message: `Could not identify: ${missing.join(", ")}. Map these rows before relying on KPIs or saving.` }
    : { id: "required_accounts", label: "Required financial accounts", severity: "pass", stage: "mapping", message: "All essential financial accounts were identified through deterministic aliases or confirmed manual mappings." });

  if (available(input.totalAssets) && available(input.totalLiabilities) && available(input.equity)) {
    reconcile("balance_sheet", "Balance-sheet equation", input.totalAssets, input.totalLiabilities + input.equity, context.scales?.balance, "Total assets do not equal total liabilities plus equity within the declared unit scale.");
  } else {
    notRun("balance_sheet", "Balance-sheet equation", "Not run: total assets, total liabilities, and total equity are all required.");
  }

  if (available(input.grossProfit) && available(input.revenue) && available(input.costOfSales)) {
    reconcile("gross_profit", "Gross-profit reconciliation", input.grossProfit, input.revenue - input.costOfSales, context.scales?.income, "Reported gross profit does not equal revenue less cost of sales within the declared unit scale.");
  } else if (available(input.revenue) && available(input.costOfSales)) {
    add({ id: "gross_profit", label: "Gross-profit reconciliation", severity: "pass", stage: "accounting", message: "Gross profit was not reported and will be deterministically derived as revenue less cost of sales." });
  } else {
    notRun("gross_profit", "Gross-profit reconciliation", "Not run: revenue and cost of sales are required.");
  }

  if (available(input.grossProfit) && available(input.operatingExpenses) && available(input.operatingIncome)) {
    reconcile("operating_income", "Operating-income reconciliation", input.operatingIncome, input.grossProfit - input.operatingExpenses, context.scales?.income, "Operating income does not equal gross profit less operating expenses within the declared unit scale.");
  } else {
    notRun("operating_income", "Operating-income reconciliation", "Not run: reported gross profit, operating expenses, and operating income are required.");
  }

  if (available(input.cashBalanceSheet) && available(input.endingCashFlow)) {
    reconcile("cash_agreement", "Cash agreement", input.cashBalanceSheet, input.endingCashFlow, Math.max(context.scales?.balance ?? 1, context.scales?.cashflow ?? 1), "Balance-sheet cash does not agree with ending cash on the cash-flow statement within the declared unit scale.");
  } else {
    notRun("cash_agreement", "Cash agreement", "Not run: balance-sheet cash and cash-flow ending cash are both required.");
  }

  if (available(input.beginningCash) && available(input.netCashChange) && available(input.endingCashFlow)) {
    reconcile("cash_rollforward", "Cash rollforward", input.endingCashFlow, input.beginningCash + input.netCashChange, context.scales?.cashflow, "Beginning cash plus the reported net cash change does not equal ending cash within the declared unit scale.");
  } else {
    notRun("cash_rollforward", "Cash rollforward", "Not run: beginning cash, reported net cash change, and ending cash are all required.");
  }

  if (available(input.operatingCashFlow) && available(input.investingCashFlow) && available(input.financingCashFlow) && available(input.netCashChange)) {
    reconcile(
      "cash_activity",
      "Cash-activity reconciliation",
      input.netCashChange,
      input.operatingCashFlow + input.investingCashFlow + input.financingCashFlow + (input.exchangeRateEffect ?? 0),
      context.scales?.cashflow,
      "Operating, investing, financing, and exchange-rate cash flows do not reconcile to the reported net cash change within the declared unit scale.",
    );
  } else {
    notRun("cash_activity", "Cash-activity reconciliation", "Not run: operating, investing, financing, and reported net cash change subtotals are all required.");
  }

  if (available(input.currentAssets) && available(input.totalAssets)) {
    add(input.currentAssets <= input.totalAssets
      ? { id: "asset_hierarchy", label: "Asset hierarchy", severity: "pass", stage: "accounting", message: "Current assets do not exceed total assets." }
      : { id: "asset_hierarchy", label: "Asset hierarchy", severity: "error", stage: "accounting", message: "Current assets exceed total assets." });
  } else {
    notRun("asset_hierarchy", "Asset hierarchy", "Not run: current assets and total assets are both required.");
  }

  if (available(input.currentLiabilities) && available(input.totalLiabilities)) {
    add(input.currentLiabilities <= input.totalLiabilities
      ? { id: "liability_hierarchy", label: "Liability hierarchy", severity: "pass", stage: "accounting", message: "Current liabilities do not exceed total liabilities." }
      : { id: "liability_hierarchy", label: "Liability hierarchy", severity: "error", stage: "accounting", message: "Current liabilities exceed total liabilities." });
  } else {
    notRun("liability_hierarchy", "Liability hierarchy", "Not run: current liabilities and total liabilities are both required.");
  }

  const negativeBalanceItems = [
    ["Total assets", input.totalAssets], ["Current assets", input.currentAssets],
    ["Total liabilities", input.totalLiabilities], ["Current liabilities", input.currentLiabilities],
  ].filter((item): item is [string, number] => typeof item[1] === "number" && item[1] < 0);
  const expenseRawSigns = ["costOfSales", "operatingExpenses", "interestExpense"]
    .map((key) => input.sources?.[key]?.at(-1)?.rawValue)
    .filter((value): value is number => typeof value === "number" && value !== 0)
    .map((value) => Math.sign(value));
  const mixedExpenseSigns = new Set(expenseRawSigns).size > 1;
  const hasSignInputs = [input.totalAssets, input.currentAssets, input.totalLiabilities, input.currentLiabilities].some(available) || expenseRawSigns.length > 0;
  add(!hasSignInputs
    ? { id: "sign_convention", label: "Financial sign conventions", severity: "not_run", stage: "accounting", message: "Not run: no balance-sheet totals or raw expense signs were available." }
    : negativeBalanceItems.length
    ? { id: "sign_convention", label: "Financial sign conventions", severity: "error", stage: "accounting", message: `Unexpected negative balance-sheet totals: ${negativeBalanceItems.map(([label]) => label).join(", ")}.` }
    : mixedExpenseSigns
      ? { id: "sign_convention", label: "Financial sign conventions", severity: "warning", stage: "accounting", message: "Expense totals use mixed positive and negative signs. CashFlo normalized their magnitude, but the presentation should be confirmed." }
      : { id: "sign_convention", label: "Financial sign conventions", severity: "pass", stage: "accounting", message: expenseRawSigns.some((sign) => sign < 0) ? "Expense signs were consistently normalized to positive magnitudes." : "No inconsistent financial sign convention was detected." });

  const knownEnds = Object.entries(context.periodEnds ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (knownEnds.length >= 2) {
    const uniqueEnds = new Set(knownEnds.map(([, end]) => end));
    add(uniqueEnds.size === 1
      ? { id: "period_alignment", label: "Statement-period alignment", severity: "pass", stage: "metadata", message: `The statements share the same detected period end: ${knownEnds[0][1]}.` }
      : { id: "period_alignment", label: "Statement-period alignment", severity: "error", stage: "metadata", message: `Detected period ends differ: ${knownEnds.map(([statement, end]) => `${statement}=${end}`).join(", ")}. Use statements covering the same reporting date.` });
  } else {
    const incomeGranularity = context.granularities.income;
    const cashflowGranularity = context.granularities.cashflow;
    add(incomeGranularity === cashflowGranularity
      ? { id: "period_alignment", label: "Statement-period alignment", severity: "warning", stage: "metadata", message: `Income and cash-flow statements are both ${incomeGranularity.toLowerCase()}, but exact dates were not machine-readable. Confirm they cover the same period.` }
      : { id: "period_alignment", label: "Statement-period alignment", severity: "warning", stage: "metadata", message: `Income and cash-flow period structures differ (${incomeGranularity} versus ${cashflowGranularity}). Confirm they cover the same dates.` });
  }

  const currencies = Object.entries(context.currencies ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const uniqueCurrencies = new Set(currencies.map(([, currency]) => currency));
  add(uniqueCurrencies.size > 1
    ? { id: "currency_consistency", label: "Currency consistency", severity: "error", stage: "metadata", message: `Multiple currencies were detected: ${currencies.map(([statement, currency]) => `${statement}=${currency}`).join(", ")}. Currency conversion is required before analysis.` }
    : currencies.length === 3
      ? { id: "currency_consistency", label: "Currency consistency", severity: "pass", stage: "metadata", message: `All statements use ${currencies[0][1]}.` }
      : { id: "currency_consistency", label: "Currency consistency", severity: "warning", stage: "metadata", message: currencies.length ? `Detected ${currencies[0][1]}, but currency was not explicit on every statement.` : "No explicit currency was detected. Confirm all statements use the same currency." });

  const scales = Object.entries(context.scales ?? {});
  const uniqueScales = new Set(scales.map(([, scale]) => scale));
  const unconfirmedScales = (Object.entries(context.scaleConfirmed ?? {}) as Array<[StatementType, boolean]>)
    .filter(([, confirmed]) => !confirmed)
    .map(([statement]) => statement);
  add(!scales.length
    ? { id: "unit_scale", label: "Statement units", severity: "not_run", stage: "metadata", message: "Not run: statement unit metadata was not supplied." }
    : unconfirmedScales.length
      ? { id: "unit_scale", label: "Statement units", severity: "warning", stage: "metadata", message: `Base units were assumed for ${unconfirmedScales.join(", ")} because the workbook did not state a scale. Confirm these statements are not reported in thousands or millions.` }
    : uniqueScales.size <= 1
      ? { id: "unit_scale", label: "Statement units", severity: "pass", stage: "metadata", message: `Statement values use a consistent ${scales[0][1] === 1_000_000 ? "millions" : scales[0][1] === 1_000 ? "thousands" : "base-unit"} scale.` }
      : { id: "unit_scale", label: "Statement units", severity: "warning", stage: "metadata", message: `Different statement scales were detected and normalized: ${scales.map(([statement, scale]) => `${statement}=x${scale.toLocaleString()}`).join(", ")}. Review the detected units.` });

  add(context.duplicateStatements?.length
    ? { id: "duplicate_statements", label: "Duplicate statement candidates", severity: "error", stage: "ingestion", message: context.duplicateStatements.map((item) => `${item.statement}: ${item.sheets.join(", ")}`).join("; ") }
    : { id: "duplicate_statements", label: "Duplicate statement candidates", severity: "pass", stage: "ingestion", message: "One unambiguous sheet or file was selected for each financial statement." });

  add(context.duplicates.length
    ? { id: "duplicate_accounts", label: "Duplicate account matches", severity: "warning", stage: "mapping", message: context.duplicates.map((item) => `${item.statement}: ${item.metric} (${item.rows.join(", ")})`).join("; ") }
    : { id: "duplicate_accounts", label: "Duplicate account matches", severity: "pass", stage: "mapping", message: "No duplicate KPI account rows were detected." });

  const errorCount = checks.filter((check) => check.severity === "error").length;
  const warningCount = checks.filter((check) => check.severity === "warning").length;
  const notRunCount = checks.filter((check) => check.severity === "not_run").length;
  return {
    status: errorCount ? "review_required" : "ready",
    validationVersion: VALIDATION_VERSION,
    passCount: checks.filter((check) => check.severity === "pass").length,
    warningCount,
    errorCount,
    notRunCount,
    checks,
  };
}
