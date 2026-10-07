import { calculateFinancials, FORMULA_VERSION, validateFinancials, type FinancialInputs } from "./financial-engine";
import type { NormalizedDataset, SourceReference, StatementType } from "./types";

const periods = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const revenueSeries = [82000, 87000, 90000, 98000, 105000, 114000, 110000, 107000, 116000, 132000, 168000, 194000];
const incomeSeries = [-10250, -7250, -5850, -3450, 950, 4350, 1850, -150, 3750, 10050, 24150, 34650];

const source = (statement: StatementType, sheet: string, cell: string, label: string, period = "FY 2025"): SourceReference => ({
  statement,
  sheet,
  cell,
  label,
  period,
});

const inputs: FinancialInputs = {
  revenue: 1403000,
  costOfSales: 632000,
  grossProfit: 771000,
  operatingExpenses: 638200,
  operatingIncome: 132800,
  interestExpense: 40000,
  netIncome: 52800,
  cashBalanceSheet: 107800,
  beginningCash: 100000,
  endingCashFlow: 107800,
  currentAssets: 260000,
  currentLiabilities: 105000,
  accountsReceivable: 78000,
  inventory: 56000,
  accountsPayable: 46000,
  shortTermDebt: 35000,
  longTermDebt: 120000,
  totalDebt: 155000,
  totalAssets: 487800,
  totalLiabilities: 240000,
  equity: 247800,
  operatingCashFlow: 72800,
  investingCashFlow: -65000,
  financingCashFlow: 0,
  netCashChange: 7800,
  exchangeRateEffect: 0,
  capex: -65000,
  granularity: "Monthly",
  periods,
  revenueSeries,
  incomeSeries,
  sources: {
    revenue: periods.map((period, index) => source("income", "Income Statement", `${String.fromCharCode(66 + index)}3`, "Revenue", period)),
    costOfSales: [source("income", "Income Statement", "M4", "Cost of Sales")],
    grossProfit: [source("income", "Income Statement", "M5", "Gross Profit")],
    operatingExpenses: [source("income", "Income Statement", "M8", "Total Operating Expenses")],
    operatingIncome: [source("income", "Income Statement", "M9", "Operating Income")],
    interestExpense: [source("income", "Income Statement", "M10", "Interest Expense")],
    netIncome: [source("income", "Income Statement", "M12", "Net Income")],
    cashBalanceSheet: [source("balance", "Balance Sheet", "B3", "Cash and Cash Equivalents")],
    currentAssets: [source("balance", "Balance Sheet", "B7", "Total Current Assets")],
    accountsReceivable: [source("balance", "Balance Sheet", "B4", "Accounts Receivable")],
    inventory: [source("balance", "Balance Sheet", "B5", "Inventory")],
    totalAssets: [source("balance", "Balance Sheet", "B10", "Total Assets")],
    accountsPayable: [source("balance", "Balance Sheet", "B12", "Accounts Payable")],
    currentLiabilities: [source("balance", "Balance Sheet", "B15", "Total Current Liabilities")],
    shortTermDebt: [source("balance", "Balance Sheet", "B14", "Short-term Debt")],
    longTermDebt: [source("balance", "Balance Sheet", "B17", "Long-term Debt")],
    totalDebt: [source("balance", "Balance Sheet", "B18", "Total Debt")],
    totalLiabilities: [source("balance", "Balance Sheet", "B19", "Total Liabilities")],
    equity: [source("balance", "Balance Sheet", "B22", "Total Equity")],
    beginningCash: [source("cashflow", "Cash Flow Statement", "B3", "Beginning Cash")],
    operatingCashFlow: [source("cashflow", "Cash Flow Statement", "B8", "Net Cash from Operating Activities")],
    investingCashFlow: [source("cashflow", "Cash Flow Statement", "B12", "Net Cash used in Investing Activities")],
    financingCashFlow: [source("cashflow", "Cash Flow Statement", "B15", "Net Cash from Financing Activities")],
    netCashChange: [source("cashflow", "Cash Flow Statement", "B17", "Net Increase in Cash")],
    exchangeRateEffect: [source("cashflow", "Cash Flow Statement", "B16", "Effect of Exchange Rates on Cash")],
    capex: [source("cashflow", "Cash Flow Statement", "B11", "Capital Expenditures")],
    endingCashFlow: [source("cashflow", "Cash Flow Statement", "B18", "Ending Cash")],
  },
};

const analysis = calculateFinancials(inputs);
const validation = validateFinancials(inputs, {
  granularities: { income: "Monthly", balance: "Monthly", cashflow: "Monthly" },
  periods: { income: periods, balance: ["Dec 2025"], cashflow: periods },
  periodEnds: { income: "2025-12", balance: "2025-12", cashflow: "2025-12" },
  currencies: { income: "USD", balance: "USD", cashflow: "USD" },
  scales: { income: 1, balance: 1, cashflow: 1 },
  scaleConfirmed: { income: true, balance: true, cashflow: true },
  duplicateStatements: [],
  duplicates: [],
});

export const demoDataset: NormalizedDataset = {
  createdAt: "2025-12-31T23:59:59.000Z",
  businessName: "Northstar Home Goods",
  periodLabel: "FY 2025",
  coverage: { income: "Income Statement", balance: "Balance Sheet", cashflow: "Cash Flow Statement" },
  formulaVersion: FORMULA_VERSION,
  calculations: analysis.calculations,
  validation,
  statementMetadata: {
    income: { sheet: "Income Statement", granularity: "Monthly", periods, periodEnd: "2025-12", currency: "USD", scale: 1, scaleConfirmed: true, labelColumn: 0, labelColumnName: "A" },
    balance: { sheet: "Balance Sheet", granularity: "Single period", periods: ["Dec 2025"], periodEnd: "2025-12", currency: "USD", scale: 1, scaleConfirmed: true, labelColumn: 0, labelColumnName: "A" },
    cashflow: { sheet: "Cash Flow Statement", granularity: "Monthly", periods, periodEnd: "2025-12", currency: "USD", scale: 1, scaleConfirmed: true, labelColumn: 0, labelColumnName: "A" },
  },
  kpis: analysis.kpis,
};
