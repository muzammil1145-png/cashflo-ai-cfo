# Example datasets

These fictional financial statements are for Northstar Home Goods, the business used by CashFlo's built-in demo. All amounts are USD in whole dollars. They contain no real customer data.

## Try the upload workflow

1. Download all three CSV files in `northstar-home-goods/` using GitHub's **Download raw file** option, or clone the repository.
2. Open [CashFlo](https://cashflo-owner-cfo.muzammil1145.chatgpt.site) and sign in.
3. Upload the Income Statement, Balance Sheet, and Cash Flow Statement together.
4. Confirm the statement mapping, USD currency, and whole-dollar scale if prompted.
5. Review the KPIs, calculation traces, operating recommendations, and management report.

The income and cash flow statements cover FY 2025. The balance sheet is the closing position at December 2025. Expense lines are positive in the income statement. Cash outflows are negative in the cash flow statement.

## Expected results

| Measure | Expected value |
| --- | ---: |
| Revenue | $1,403,000 |
| Gross profit | $771,000 |
| Operating income | $132,800 |
| Net income | $52,800 |
| Ending cash | $107,800 |
| Operating cash flow | $72,800 |
| Capital expenditures, cash outflow | $65,000 |
| Free cash flow | $7,800 |
| Current ratio | 2.48x |
| Debt to equity | 0.63x |

The annual files reproduce the demo's annual totals. They do not include its monthly trend series.

## Reconciliation

- Assets: $487,800 = liabilities $240,000 + equity $247,800.
- Net income: $132,800 operating income − $40,000 interest − $40,000 tax = $52,800.
- Operating cash flow: $52,800 net income + $35,000 depreciation − $15,000 working capital = $72,800.
- Ending cash: $100,000 opening cash + $72,800 operating cash flow − $65,000 investing cash flow = $107,800.
