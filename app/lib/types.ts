export type FinancialKpis = {
  revenue: number | null;
  revenueGrowth: number | null;
  costOfSales: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingExpenses: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  interestExpense: number | null;
  interestCoverage: number | null;
  netIncome: number | null;
  netMargin: number | null;
  cash: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  workingCapital: number | null;
  accountsReceivable: number | null;
  inventory: number | null;
  accountsPayable: number | null;
  totalDebt: number | null;
  debtToEquity: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  netCashChangeReported: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  freeCashFlowMargin: number | null;
  cashConversionRatio: number | null;
  daysCashOnHand: number | null;
  cashRunwayMonths: number | null;
  receivableDays: number | null;
  inventoryDays: number | null;
  payableDays: number | null;
  cashConversionCycle: number | null;
  beginningCash: number | null;
  endingCash: number | null;
  cashChange: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  assetTurnover: number | null;
  periodDays: number;
  granularity: string;
  periods: string[];
  revenueSeries: number[];
  incomeSeries: number[];
};

export type StatementType = "income" | "balance" | "cashflow";

export type SourceReference = {
  statement: StatementType;
  sheet: string;
  cell: string;
  label: string;
  period: string;
  rawValue?: number;
  scale?: number;
  currency?: string | null;
};

export type StatementMetadata = {
  sheet: string;
  granularity: string;
  periods: string[];
  periodEnd: string | null;
  currency: string | null;
  scale: number;
  scaleConfirmed: boolean;
  labelColumn: number;
  labelColumnName: string;
};

export type MappingCandidate = {
  id: string;
  statement: StatementType;
  label: string;
  rowReference: string;
  numericCellCount: number;
  labelColumn: number;
  sampleValue: number | null;
};

export type MappingAssignment = {
  metric: string;
  metricLabel: string;
  statement: StatementType;
  sourceLabel: string | null;
  sourceReference: string | null;
  confidence: "high" | "manual" | "unmapped";
  required: boolean;
};

export type MappingReview = {
  candidates: MappingCandidate[];
  assignments: MappingAssignment[];
  overrides: Record<string, string>;
  statementCandidates: Record<StatementType, string[]>;
  selectedSheets: Record<StatementType, string>;
};

export type CalculationInput = {
  name: string;
  label: string;
  value: number | null;
  sources?: SourceReference[];
};

export type CalculationTrace = {
  metric: string;
  label: string;
  formulaId: string;
  formulaVersion: string;
  formula: string;
  value: number | null;
  status: "reported" | "derived" | "unavailable";
  inputs: CalculationInput[];
  note?: string;
};

export type ValidationCheck = {
  id: string;
  label: string;
  severity: "pass" | "warning" | "error" | "not_run";
  stage: "ingestion" | "mapping" | "accounting" | "metadata";
  message: string;
  difference?: number;
  tolerance?: number;
};

export type ValidationSummary = {
  status: "ready" | "review_required";
  validationVersion?: string;
  passCount: number;
  warningCount: number;
  errorCount: number;
  notRunCount: number;
  checks: ValidationCheck[];
};

export type NormalizedDataset = {
  createdAt: string;
  businessName: string;
  periodLabel: string;
  kpis: FinancialKpis;
  coverage: { income: string; balance: string; cashflow: string };
  formulaVersion?: string;
  calculations?: Record<string, CalculationTrace>;
  validation?: ValidationSummary;
  statementMetadata?: Record<StatementType, StatementMetadata>;
  mappingReview?: MappingReview;
};
