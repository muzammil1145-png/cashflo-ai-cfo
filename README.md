# CashFlo

**AI CFO for Small Businesses · Created by Muzammil Paracha**

[Live demo](https://cashflo-owner-cfo.muzammil1145.chatgpt.site) · [GitHub repository](https://github.com/muzammil1145-png/cashflo-ai-cfo)

CashFlo is a private AI CFO workspace for small businesses. Owners can upload an Income Statement, Balance Sheet, and Cash Flow Statement in one Excel workbook or as three separate Excel/CSV files.

The application detects single-month, annual, and multi-period statement layouts; normalizes financial metrics in the browser; and produces an executive dashboard, operating concerns, recommendations, AI CFO answers, reporting history, CSV exports, and print-ready management reports.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev
```

Run the complete validation suite with `pnpm test`.

## Features

- Excel and CSV statement ingestion with layout detection and account mapping.
- Deterministic financial KPIs with validation and calculation traces.
- Financial health scoring, operating concerns, and actionable recommendations.
- AI CFO questions and analysis through an optional server-side OpenAI integration.
- Company workspaces, reporting history, CSV exports, and print-ready management reports.

## Technology and project structure

React 19, TypeScript, Next.js-compatible routing through Vinext, Vite, Cloudflare Workers and D1, and Drizzle ORM.

| Directory | Purpose |
| --- | --- |
| `app/components` | Dashboard and statement upload interface |
| `app/lib` | Financial calculations, validation, mapping, health scoring, and demo data |
| `app/api` | Company, snapshot, mapping, and AI insight endpoints |
| `db` and `drizzle` | Database schema, queries, and migrations |
| `tests` | Financial engine, client parsing, health score, and mapping tests |
| `worker` and `build` | Cloudflare runtime and Sites build integration |

## Hosting

This repository contains the source exported from the existing ChatGPT Sites application. The live demo remains hosted at the link above. GitHub Pages cannot run its server routes, authentication, or D1 database.

The `.openai/hosting.json` file retains the existing Site's non-secret deployment metadata. Production authentication depends on the hosting platform's trusted authentication headers; another hosting provider requires its own authentication integration. Local development uses a demo owner.

## Privacy and services

- Sign in is handled by the hosting platform's ChatGPT authentication flow.
- Normalized statement summaries are stored per signed-in user in Cloudflare D1.
- Raw workbook bytes stay in the browser and are not persisted by CashFlo.
- `OPENAI_API_KEY` is optional. Without it, the application uses deterministic financial controls; with it, AI analysis uses GPT-5.6 Sol.

CashFlo is management-planning software and is not a substitute for professional accounting, tax, legal, or investment advice.
