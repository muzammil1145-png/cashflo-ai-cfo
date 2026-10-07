import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { DOMParser } from "linkedom";
import { ingestFinancials } from "../app/lib/finance-client";

globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;

type TestCell = string | number | null;

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cell(reference: string, value: TestCell) {
  if (value === null) return "";
  return typeof value === "number"
    ? `<x:c r="${reference}"><x:v>${value}</x:v></x:c>`
    : `<x:c r="${reference}" t="inlineStr"><x:is><x:t>${escapeXml(value)}</x:t></x:is></x:c>`;
}

function worksheet(rows: TestCell[][]) {
  const body = rows.map((values, rowIndex) => {
    const cells = values.map((value, columnIndex) => cell(`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, value)).join("");
    return `<x:row r="${rowIndex + 1}">${cells}</x:row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>${body}</x:sheetData></x:worksheet>`;
}

async function messyWorkbook() {
  const zip = new JSZip();
  const sheets = [
    {
      name: "Income Statement FY25",
      rows: [
        ["Profit & Loss (USD, amounts in thousands)"],
        ["GL", "Account Description", "FY 2025", "FY2025 total", "Variance?", "Mapping hint", "comments"],
        [4000, "Net Sales / Turnover", 1_000, 1_000, 0, "revenue", null],
        [5000, "Inventory Used + Freight", 400, 400, 0, "cost of goods sold", null],
        [null, "Gross Profit", 600, 600, 0, "gross profit", null],
        [6000, "Total Overhead / Opex", 450, 450, 0, "operating expenses", null],
        [null, "Operating Profit (EBIT)", 150, 150, 0, "operating income", null],
        [7000, "Finance Costs", 30, 30, 0, "interest expense", null],
        [null, "Net Earnings After Tax", 90, 90, 0, "net income", null],
      ],
    },
    {
      name: "Statement of Financial Position",
      rows: [
        ["Balance Sheet (USD, amounts in thousands)"],
        ["Code", "Account Description", "FY 2025"],
        [1010, "Bank + Till Cash", 120],
        [1100, "Customer Balances (Trade Debtors)", 80],
        [1200, "Parts on Hand / Stock", 60],
        [null, "Current Assets — Total", 300],
        [2000, "Supplier Invoices Unpaid", 50],
        [2100, "Current Slice — Debt", 40],
        [null, "Total Current Obligations", 150],
        [2500, "Term Loan, Noncurrent", 160],
        [null, "Total Debt", 200],
        [null, "Total Liabilities", 350],
        [null, "Owner Capital + Retained Profit", 250],
        [null, "Assets Total", 600],
      ],
    },
    {
      name: "Cash Flow Statement",
      rows: [
        ["Cash Flow (USD, amounts in thousands)"],
        ["Ref", "Account Description", "FY 2025"],
        ["A", "Cash — Opening", 100],
        ["B", "Cash From Operations", 130],
        ["C", "Equipment Purchases", -50],
        ["D", "Net Cash — Investing", -50],
        ["E", "Net Cash — Financing", -10],
        ["F", "Foreign Exchange Effect", -50],
        [null, "Net Movement in Cash", 20],
        [null, "Cash at End (Bank)", 120],
      ],
    },
  ];

  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets>${sheets.map((sheet, index) => `<x:sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</x:sheets></x:workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<r:Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</r:Relationships>`);
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet.rows)));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([Uint8Array.from(bytes).buffer], "messy-three-statements.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

test("ingests namespace-prefixed messy workbooks and discovers description column B", async () => {
  const workbook = await messyWorkbook();
  const result = await ingestFinancials({ workbook }, "Messy Books LLC");

  assert.equal(result.statementMetadata?.income.labelColumnName, "B");
  assert.equal(result.statementMetadata?.balance.labelColumnName, "B");
  assert.equal(result.statementMetadata?.cashflow.labelColumnName, "B");
  assert.equal(result.kpis.revenue, 1_000_000);
  assert.equal(result.kpis.revenueGrowth, null);
  assert.equal(result.kpis.totalAssets, 600_000);
  assert.equal(result.kpis.operatingCashFlow, 130_000);
  assert.equal(result.validation?.errorCount, 0);
  assert.equal(result.mappingReview?.assignments.filter((assignment) => assignment.required && !assignment.sourceLabel).length, 0);
  assert.equal(result.mappingReview?.assignments.find((assignment) => assignment.metric === "revenue")?.sourceReference, "Income Statement FY25!D3");
  assert.equal(result.calculations?.revenue.inputs[0].sources?.[0]?.cell, "D3");
  assert.equal(result.calculations?.revenue.inputs[0].sources?.[0]?.period, "FY2025 total");
  assert.equal(result.mappingReview?.assignments.find((assignment) => assignment.metric === "totalAssets")?.sourceReference, "Statement of Financial Position!C14");
  assert.ok(result.mappingReview?.candidates.some((candidate) => candidate.rowReference === "Statement of Financial Position!B14"));
});

test("produces identical KPI and validation results for identical messy workbook input", async () => {
  const workbook = await messyWorkbook();
  const first = await ingestFinancials({ workbook }, "Messy Books LLC");
  const second = await ingestFinancials({ workbook }, "Messy Books LLC");
  assert.deepEqual(first.kpis, second.kpis);
  assert.deepEqual(first.validation, second.validation);
  assert.deepEqual(first.mappingReview, second.mappingReview);
});
