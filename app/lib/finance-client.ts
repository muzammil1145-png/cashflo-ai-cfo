"use client";

import JSZip from "jszip";
import { calculateFinancials, FORMULA_VERSION, validateFinancials, type FinancialInputs } from "./financial-engine";
import type { MappingReview, NormalizedDataset, SourceReference, StatementType } from "./types";

type Cell = string | number | null | undefined;
type Rows = Cell[][];
type MetricObservation = { values: number[]; sources: SourceReference[]; matchedRows: string[] };
type MetricPoint = { value: number; source: SourceReference; index: number };
type ParsedStatement = {
  name: string;
  rows: Rows;
  labelColumn: number;
  header: { labels: string[]; granularity: string; rowIndex: number };
  metrics: Record<string, MetricObservation>;
  duplicates: Array<{ metric: string; rows: string[] }>;
  metadata: { currency: string | null; scale: number; scaleConfirmed: boolean; periodEnd: string | null };
};

const statementAliases: Record<StatementType, RegExp[]> = {
  income: [/income statement/i, /profit\s*(?:&|and)?\s*loss/i, /\bp\s*&?\s*l\b/i, /statement of operations/i],
  balance: [/balance sheet/i, /financial position/i],
  cashflow: [/cash\s*flow/i, /statement of cash flows/i],
};

const metricRules: Record<StatementType, Record<string, RegExp[]>> = {
  income: {
    revenue: [/^total revenue$/i, /^net sales(?:\s*\/\s*turnover)?$/i, /^sales$/i, /^revenue$/i, /^net turnover$/i, /^turnover$/i],
    costOfSales: [/^total cost of (?:sales|goods sold)$/i, /^cost of (?:sales|goods sold)$/i, /^cogs$/i, /^inventory used(?:\s*\+\s*freight)?$/i, /^job materials?(?:\s*\+\s*freight)?$/i],
    grossProfit: [/^gross profit$/i],
    operatingExpenses: [/^total operating (?:expenses?|costs?)$/i, /^operating expenses?$/i, /^total overhead(?:\s*\/\s*opex)?$/i, /^overhead(?:\s*\/\s*opex)?$/i],
    operatingIncome: [/^operating income$/i, /^income from operations$/i, /^operating profit(?:\s*\(ebit\))?$/i, /^ebit$/i],
    interestExpense: [/^interest expense$/i, /^interest and finance (?:expense|costs?)$/i, /^finance costs?$/i],
    netIncome: [/^net income$/i, /^net profit$/i, /^profit after tax$/i, /^net earnings(?: after tax)?$/i, /^bottom line(?:\s*\/\s*net earnings)?$/i],
  },
  balance: {
    cash: [/^cash(?: and cash equivalents)?$/i, /^bank\s*\+\s*(?:cash drawers|till cash)$/i, /^cash at bank and in hand$/i],
    accountsReceivable: [/^accounts? receivable(?:,? net)?$/i, /^trade receivables?(?:,? net)?$/i, /^customer balances(?:\s*\(trade debtors\))?$/i, /^trade debtors?(?:\s*\(a\/?r\))?$/i],
    inventory: [/^inventor(?:y|ies)(?:,? net)?$/i, /^merchandise on hand$/i, /^parts on hand(?:\s*\/\s*stock)?$/i, /^stock$/i],
    currentAssets: [/^total current assets$/i, /^current assets\s*[—–-]\s*total$/i],
    totalAssets: [/^total assets$/i, /^assets total$/i],
    accountsPayable: [/^accounts? payable$/i, /^trade payables?$/i, /^supplier invoices unpaid$/i, /^vendors? payable(?:\s*\/\s*a\.?p\.?)?$/i],
    shortTermDebt: [/^short[- ]term (?:debt|borrowings)$/i, /^current portion of (?:long[- ]term )?debt$/i, /^current slice\s*[—–-]\s*debt$/i, /^loc\s*[—–-]\s*current$/i],
    longTermDebt: [/^long[- ]term (?:debt|borrowings)(?:,? net)?$/i, /^notes payable$/i, /^term loan,? noncurrent$/i, /^term note payable\s*\(lt\)$/i],
    totalDebt: [/^total debt$/i, /^total borrowings$/i],
    currentLiabilities: [/^total current liabilities$/i, /^current liab\.?$/i, /^total current obligations$/i],
    totalLiabilities: [/^total liabilities$/i],
    equity: [/^total (?:owner'?s? )?equity$/i, /^shareholders'? equity$/i, /^owner capital\s*\+\s*retained profit$/i, /^members?' capital(?:\s*\+\s*retained earnings)?$/i],
  },
  cashflow: {
    operatingCashFlow: [/^net cash (?:from|provided by) operating activities$/i, /^cash flow from operations$/i, /^cash from operations$/i, /^net cash\s*[—–-]\s*operations$/i],
    investingCashFlow: [/^net cash (?:from|used in|provided by) investing activities$/i, /^cash flow from investing activities$/i, /^cash from investing$/i, /^net cash\s*[—–-]\s*investing$/i],
    financingCashFlow: [/^net cash (?:from|used in|provided by) financing activities$/i, /^cash flow from financing activities$/i, /^cash from financing$/i, /^net cash\s*[—–-]\s*financing$/i],
    netCashChange: [/^net (?:increase|decrease|change) in cash(?: and cash equivalents)?$/i, /^increase \(decrease\) in cash(?: and cash equivalents)?$/i, /^net (?:change|movement)(?:\s*\/\s*movement)?$/i, /^net movement in cash$/i],
    exchangeRateEffect: [/^effect of exchange rates? on cash/i, /^foreign exchange effect/i],
    capex: [/^capital expenditures?$/i, /^purchase of property/i, /^equipment purchases?$/i],
    beginningCash: [/^beginning cash(?: balance)?$/i, /^opening cash$/i, /^cash\s*[—–-]\s*opening$/i],
    endingCash: [/^ending cash(?: balance)?$/i, /^cash at end/i, /^closing cash(?:\s*\/\s*bank)?$/i, /^cash at end\s*\(bank\)$/i],
  },
};

const metricLabels: Record<string, string> = {
  revenue: "Revenue", costOfSales: "Cost of sales", grossProfit: "Gross profit", operatingExpenses: "Operating expenses",
  operatingIncome: "Operating income", interestExpense: "Interest expense", netIncome: "Net income", cash: "Cash and equivalents",
  accountsReceivable: "Accounts receivable", inventory: "Inventory", currentAssets: "Total current assets", totalAssets: "Total assets",
  accountsPayable: "Accounts payable", shortTermDebt: "Short-term debt", longTermDebt: "Long-term debt", totalDebt: "Total debt",
  currentLiabilities: "Total current liabilities", totalLiabilities: "Total liabilities", equity: "Total equity",
  operatingCashFlow: "Operating cash flow", investingCashFlow: "Investing cash flow", financingCashFlow: "Financing cash flow",
  netCashChange: "Net cash change", exchangeRateEffect: "Exchange-rate effect", capex: "Capital expenditures",
  beginningCash: "Beginning cash", endingCash: "Ending cash",
};

const requiredMappings = new Set(["income:revenue", "income:netIncome", "balance:totalAssets", "balance:totalLiabilities", "balance:equity", "cashflow:operatingCashFlow"]);

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizedLabel = (value: unknown) => clean(value)
  .replace(/&/g, " and ")
  .replace(/[’']/g, "'")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/[^a-z0-9+()\-/. ]/gi, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase();

const numberValue = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const original = clean(value);
  if (!original) return null;
  if (original === "-") return 0;
  let valueText = original.replace(/[$,%\s,]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(valueText)) {
    negative = true;
    valueText = valueText.slice(1, -1);
  }
  const parsed = Number(valueText);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
};

const columnIndex = (reference: string) => {
  const letters = (reference.match(/[A-Z]+/i) ?? ["A"])[0].toUpperCase();
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
};

const columnName = (index: number) => {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

function parseXml(xmlText: string, description: string) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = Array.from(xml.getElementsByTagName("parsererror"))[0];
  if (parserError) throw new Error(`The ${description} XML is not readable.`);
  return xml;
}

function elements(root: Document | Element, name: string): Element[] {
  const namespaced = root.getElementsByTagNameNS?.("*", name);
  if (namespaced?.length) return Array.from(namespaced);
  const found: Element[] = [];
  const visit = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 1) {
        const element = child as Element;
        if (element.localName === name || element.tagName.split(":").at(-1) === name) found.push(element);
        visit(element);
      }
    });
  };
  visit(root);
  return found;
}

function normalizeZipPath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function parseWorksheet(xmlText: string, shared: string[]): Rows {
  const xml = parseXml(xmlText, "worksheet");
  const rows: Rows = [];
  elements(xml, "row").forEach((row, sequentialIndex) => {
    const values: Cell[] = [];
    elements(row, "c").forEach((cell) => {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw = elements(cell, "v")[0]?.textContent ?? "";
      const inline = elements(cell, "t").map((node) => node.textContent ?? "").join("");
      values[index] = type === "s" ? shared[Number(raw)] : type === "inlineStr" ? inline : numberValue(raw) ?? raw;
    });
    const rowNumber = Number(row.getAttribute("r"));
    rows[Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : sequentialIndex] = values;
  });
  return Array.from({ length: rows.length }, (_, index) => rows[index] ?? []);
}

async function parseXlsx(file: File): Promise<Record<string, Rows>> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbook = zip.file("xl/workbook.xml");
  const relationships = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbook || !relationships) throw new Error("This is not a readable Excel workbook.");

  const sharedEntry = zip.file("xl/sharedStrings.xml");
  let shared: string[] = [];
  if (sharedEntry) {
    const xml = parseXml(await sharedEntry.async("text"), "shared strings");
    shared = elements(xml, "si").map((item) =>
      elements(item, "t").map((node) => node.textContent ?? "").join(""),
    );
  }

  const workbookXml = parseXml(await workbook.async("text"), "workbook");
  const relationshipXml = parseXml(await relationships.async("text"), "workbook relationship");
  const targets: Record<string, string> = {};
  elements(relationshipXml, "Relationship").forEach((item) => {
    targets[item.getAttribute("Id") ?? ""] = item.getAttribute("Target") ?? "";
  });

  const sheets: Record<string, Rows> = {};
  for (const sheet of elements(workbookXml, "sheet")) {
    const name = sheet.getAttribute("name") ?? "Sheet";
    const relationshipId = sheet.getAttribute("r:id")
      ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
      ?? "";
    const target = targets[relationshipId];
    if (!target) continue;
    const location = normalizeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    const entry = zip.file(location);
    if (entry) sheets[name] = parseWorksheet(await entry.async("text"), shared);
  }
  return sheets;
}

function parseCsv(text: string): Rows {
  const rows: Rows = [];
  let row: Cell[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => clean(cell))) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => clean(cell))) rows.push(row);
  return rows;
}

async function parseFile(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB upload limit.`);
  if (file.name.toLowerCase().endsWith(".xlsx")) return parseXlsx(file);
  if (file.name.toLowerCase().endsWith(".csv")) return { [file.name.replace(/\.csv$/i, "")]: parseCsv(await file.text()) };
  throw new Error("Use .xlsx or .csv files. Save legacy .xls files as .xlsx first.");
}

function detectType(name: string, rows: Rows): StatementType | null {
  const fromName = (Object.keys(statementAliases) as StatementType[]).find((type) =>
    statementAliases[type].some((pattern) => pattern.test(name)),
  );
  if (fromName) return fromName;
  const labels = rows.slice(0, 50).flatMap((row) => row.slice(0, 4).map(clean)).join(" ");
  if (/assets|liabilities|equity/i.test(labels)) return "balance";
  if (/operating activities|investing activities|financing activities/i.test(labels)) return "cashflow";
  if (/revenue|gross profit|net income/i.test(labels)) return "income";
  return null;
}

function matchesAnyMetric(type: StatementType, label: string) {
  return Object.values(metricRules[type]).some((patterns) => patterns.some((pattern) => pattern.test(label)));
}

function looksLikeCode(label: string) {
  return /^(?:\d{1,8}(?:[-./]\d+)*|[a-z]{1,3}\d{0,4}|\d{1,4}[a-z]{1,2})$/i.test(label.trim());
}

export function detectLabelColumn(type: StatementType, rows: Rows) {
  const widest = Math.min(4, Math.max(1, ...rows.slice(0, 120).map((row) => row.length)));
  let best = { column: 0, score: Number.NEGATIVE_INFINITY };
  for (let column = 0; column < widest; column += 1) {
    let score = 0;
    rows.slice(0, 120).forEach((row) => {
      const label = clean(row[column]);
      if (!label || numberValue(label) !== null) return;
      const numericCells = row.filter((cell, index) => index !== column && numberValue(cell) !== null).length;
      if (!numericCells) return;
      score += 2 + Math.min(3, numericCells);
      if (matchesAnyMetric(type, label)) score += 30;
      if (/total|revenue|sales|profit|income|assets?|liabilit|equity|cash|debt|receivable|payable|inventor|operat|invest|financ/i.test(label)) score += 4;
      if (label.length >= 8) score += 2;
      if (looksLikeCode(label)) score -= 8;
    });
    if (score > best.score) best = { column, score };
  }
  return best.column;
}

function headerInfo(rows: Rows, labelColumn: number) {
  let best = { labels: [] as string[], score: Number.NEGATIVE_INFINITY, rowIndex: 0 };
  rows.slice(0, 25).forEach((row, rowIndex) => {
    const labels = row.slice(labelColumn + 1).map(clean);
    const nonEmpty = labels.filter(Boolean);
    const periodLabels = nonEmpty.filter((value) => /\b(?:fy\s*)?20\d{2}\b|\bjan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec\b|month|quarter|period|actual|budget|total/i.test(value));
    const score = periodLabels.length * 8 + nonEmpty.filter((value) => numberValue(value) === null).length * 2 - nonEmpty.filter((value) => numberValue(value) !== null).length * 3;
    if (score > best.score) best = { labels, score, rowIndex };
  });
  const visibleLabels = best.labels.filter(Boolean);
  const monthCount = visibleLabels.filter((label) => /\bjan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec\b/i.test(label)).length;
  return {
    labels: best.labels,
    rowIndex: best.rowIndex,
    granularity: monthCount >= 2
      ? "Monthly"
      : visibleLabels.length > 1 ? "Multi-period" : /\b20\d{2}\b/.test(visibleLabels[0] ?? "") ? "Annual" : "Single period",
  };
}

function detectedPeriodEnd(labels: string[]) {
  const label = [...labels].reverse().find((value) => Boolean(value) && !/total/i.test(value)) ?? labels.filter(Boolean).at(-1) ?? "";
  const normalized = label.trim();
  const iso = normalized.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const usDate = normalized.match(/\b(0?[1-9]|1[0-2])[/.](0?[1-9]|[12]\d|3[01])[/.](20\d{2})\b/);
  if (usDate) return `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`;
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const monthYear = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,/-]+(20\d{2})\b/i);
  if (monthYear) return `${monthYear[2]}-${months[monthYear[1].slice(0, 3).toLowerCase()]}`;
  const year = normalized.match(/\b(?:fy\s*)?(20\d{2})\b/i);
  return year?.[1] ?? null;
}

function statementMetadata(rows: Rows, labels: string[]) {
  const text = rows.slice(0, 25).flat().map(clean).filter(Boolean).join(" ");
  const explicitCurrencies = [
    ["CAD", /\bCAD\b|Canadian dollars?/i], ["AUD", /\bAUD\b|Australian dollars?/i],
    ["USD", /\bUSD\b|US dollars?/i], ["EUR", /\bEUR\b|euros?/i],
    ["GBP", /\bGBP\b|pounds sterling/i],
  ] as const;
  const currency = explicitCurrencies.find(([, pattern]) => pattern.test(text))?.[0]
    ?? (text.includes("€") ? "EUR" : text.includes("£") ? "GBP" : text.includes("$") ? "USD" : null);
  const millions = /\b(?:in |amounts? in )millions?\b|\bmm\b/i.test(text);
  const thousands = /\b(?:in |amounts? in )thousands?\b|\b000s\b/i.test(text);
  const explicitBaseUnits = /\b(?:in |amounts? in )(?:whole )?(?:units?|dollars?)\b/i.test(text);
  const scale = millions
    ? 1_000_000
    : thousands ? 1_000 : 1;
  return { currency, scale, scaleConfirmed: millions || thousands || explicitBaseUnits, periodEnd: detectedPeriodEnd(labels) };
}

function normalize(type: StatementType, name: string, rows: Rows, overrides: Record<string, string>): ParsedStatement {
  const labelColumn = detectLabelColumn(type, rows);
  const header = headerInfo(rows, labelColumn);
  const metadata = statementMetadata(rows, header.labels);
  const metrics: Record<string, MetricObservation> = {};
  const duplicates: ParsedStatement["duplicates"] = [];

  Object.entries(metricRules[type]).forEach(([metric, patterns]) => {
    const override = clean(overrides[`${type}:${metric}`]);
    const matchingIndexes = rows
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => override
        ? normalizedLabel(candidate[labelColumn]) === normalizedLabel(override)
        : patterns.some((pattern) => pattern.test(clean(candidate[labelColumn]))));
    if (!matchingIndexes.length) return;
    if (matchingIndexes.length > 1) {
      duplicates.push({ metric, rows: matchingIndexes.map(({ index }) => `${name}!${columnName(labelColumn)}${index + 1}`) });
    }

    const { candidate: row, index: rowIndex } = matchingIndexes[0];
    const values: number[] = [];
    const sources: SourceReference[] = [];
    row.slice(labelColumn + 1).forEach((cell, offset) => {
      const parsed = numberValue(cell);
      if (parsed === null) return;
      values.push(parsed * metadata.scale);
      sources.push({
        statement: type,
        sheet: name,
        cell: `${columnName(offset + labelColumn + 1)}${rowIndex + 1}`,
        label: clean(row[labelColumn]),
        period: header.labels[offset] ?? `Column ${columnName(offset + 1)}`,
        rawValue: parsed,
        scale: metadata.scale,
        currency: metadata.currency,
      });
    });
    metrics[metric] = { values, sources, matchedRows: matchingIndexes.map(({ index }) => `${name}!${columnName(labelColumn)}${index + 1}`) };
  });

  return { name, rows, labelColumn, header, metrics, duplicates, metadata };
}

function mappingReview(statements: Record<StatementType, ParsedStatement>, overrides: Record<string, string>, statementCandidates: Record<StatementType, string[]>): MappingReview {
  const candidates = (["income", "balance", "cashflow"] as StatementType[]).flatMap((statement) =>
    statements[statement].rows.map((row, index) => ({ row, index })).filter(({ row }) => clean(row[statements[statement].labelColumn]) && row.slice(statements[statement].labelColumn + 1).some((cell) => numberValue(cell) !== null)).map(({ row, index }) => ({
      id: `${statement}:${index + 1}`,
      statement,
      label: clean(row[statements[statement].labelColumn]),
      rowReference: `${statements[statement].name}!${columnName(statements[statement].labelColumn)}${index + 1}`,
      numericCellCount: row.slice(statements[statement].labelColumn + 1).filter((cell) => numberValue(cell) !== null).length,
      labelColumn: statements[statement].labelColumn,
      sampleValue: row.slice(statements[statement].labelColumn + 1).map(numberValue).filter((value): value is number => value !== null).at(-1) ?? null,
    })),
  );
  const assignments = (["income", "balance", "cashflow"] as StatementType[]).flatMap((statement) =>
    Object.keys(metricRules[statement]).map((metric) => {
      const flow = statement === "income" || (statement === "cashflow" && !["beginningCash", "endingCash"].includes(metric));
      const source = metricValue(statements[statement], metric, flow).sources.at(-1);
      const key = `${statement}:${metric}`;
      return {
        metric,
        metricLabel: metricLabels[metric] ?? metric,
        statement,
        sourceLabel: source?.label ?? null,
        sourceReference: source ? `${source.sheet}!${source.cell}` : null,
        confidence: overrides[key] ? "manual" as const : source ? "high" as const : "unmapped" as const,
        required: requiredMappings.has(key),
      };
    }),
  );
  return {
    candidates, assignments, overrides, statementCandidates,
    selectedSheets: { income: statements.income.name, balance: statements.balance.name, cashflow: statements.cashflow.name },
  };
}

const nonReportingHeader = /(?:^|\b)(?:variance|var\.?|budget|forecast|mapping|hint|comment|comments|note|notes|difference|delta)(?:\b|$)|%/i;
const summaryHeader = /(?:^|\b)(?:total|final|annual|year[- ]?to[- ]?date|ytd)(?:\b|$)/i;
const datedPeriodHeader = /\b(?:fy\s*)?20\d{2}\b|\b(?:q[1-4]|quarter\s*[1-4])\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b20\d{2}[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?\b/i;

function reportingPoints(observation: MetricObservation | undefined): MetricPoint[] {
  if (!observation) return [];
  return observation.values.map((value, index) => ({ value, source: observation.sources[index], index }))
    .filter((point): point is MetricPoint => Boolean(point.source) && !nonReportingHeader.test(point.source.period));
}

function pointSemanticScore(point: MetricPoint) {
  const header = clean(point.source.period);
  let score = 10;
  if (summaryHeader.test(header)) score += 100;
  if (/\bsigned amount\b/i.test(header)) score += 120;
  if (/\bactuals?\b/i.test(header)) score += 80;
  if (datedPeriodHeader.test(header)) score += 70;
  if (/\bactivity\b/i.test(header)) score += 40;
  return score;
}

function bestPoint(points: MetricPoint[]) {
  const highestSemanticScore = Math.max(...points.map(pointSemanticScore));
  if (points.length > 1 && highestSemanticScore <= 10) return null;
  return [...points].sort((left, right) =>
    pointSemanticScore(right) - pointSemanticScore(left) || right.index - left.index,
  )[0] ?? null;
}

function metricValue(statement: ParsedStatement, key: string, flow: boolean) {
  const observation = statement.metrics[key];
  const points = reportingPoints(observation);
  if (!points.length) return { value: null, sources: [] as SourceReference[] };
  const summaryPoints = points.filter((point) => summaryHeader.test(point.source.period));
  if (flow && statement.header.granularity === "Monthly" && !summaryPoints.length) {
    return {
      value: points.reduce((sum, point) => sum + point.value, 0),
      sources: points.map((point) => point.source),
    };
  }
  const selected = bestPoint(summaryPoints.length ? summaryPoints : points);
  return {
    value: selected?.value ?? null,
    sources: selected ? [selected.source] : [],
  };
}

function metricSeries(statement: ParsedStatement, key: string) {
  const points = reportingPoints(statement.metrics[key]);
  const periodicPoints = points.filter((point) => !summaryHeader.test(point.source.period));
  if (statement.header.granularity === "Monthly") return periodicPoints.map((point) => point.value);
  return (periodicPoints.length ? periodicPoints : points).map((point) => point.value);
}

function buildInputs(statements: Record<StatementType, ParsedStatement>): FinancialInputs {
  const income = statements.income;
  const balance = statements.balance;
  const cashflow = statements.cashflow;
  const observations = {
    revenue: metricValue(income, "revenue", true),
    costOfSales: metricValue(income, "costOfSales", true),
    grossProfit: metricValue(income, "grossProfit", true),
    operatingExpenses: metricValue(income, "operatingExpenses", true),
    operatingIncome: metricValue(income, "operatingIncome", true),
    interestExpense: metricValue(income, "interestExpense", true),
    netIncome: metricValue(income, "netIncome", true),
    cashBalanceSheet: metricValue(balance, "cash", false),
    beginningCash: metricValue(cashflow, "beginningCash", false),
    endingCashFlow: metricValue(cashflow, "endingCash", false),
    currentAssets: metricValue(balance, "currentAssets", false),
    currentLiabilities: metricValue(balance, "currentLiabilities", false),
    accountsReceivable: metricValue(balance, "accountsReceivable", false),
    inventory: metricValue(balance, "inventory", false),
    accountsPayable: metricValue(balance, "accountsPayable", false),
    shortTermDebt: metricValue(balance, "shortTermDebt", false),
    longTermDebt: metricValue(balance, "longTermDebt", false),
    totalDebt: metricValue(balance, "totalDebt", false),
    totalAssets: metricValue(balance, "totalAssets", false),
    totalLiabilities: metricValue(balance, "totalLiabilities", false),
    equity: metricValue(balance, "equity", false),
    operatingCashFlow: metricValue(cashflow, "operatingCashFlow", true),
    investingCashFlow: metricValue(cashflow, "investingCashFlow", true),
    financingCashFlow: metricValue(cashflow, "financingCashFlow", true),
    netCashChange: metricValue(cashflow, "netCashChange", true),
    exchangeRateEffect: metricValue(cashflow, "exchangeRateEffect", true),
    capex: metricValue(cashflow, "capex", true),
  };

  const values = Object.fromEntries(Object.entries(observations).map(([key, observation]) => [key, observation.value])) as Record<string, number | null>;
  for (const expense of ["costOfSales", "operatingExpenses", "interestExpense"]) {
    if (values[expense] !== null) values[expense] = Math.abs(values[expense]);
  }

  return {
    ...values,
    granularity: income.header.granularity,
    periods: income.header.labels,
    revenueSeries: metricSeries(income, "revenue"),
    incomeSeries: metricSeries(income, "netIncome"),
    sources: Object.fromEntries(Object.entries(observations).map(([key, observation]) => [key, observation.sources])),
  } as FinancialInputs;
}

export async function ingestFinancials(
  files: { workbook?: File; income?: File; balance?: File; cashflow?: File },
  businessName: string,
  mappingOverrides: Record<string, string> = {},
): Promise<NormalizedDataset> {
  const statements = {} as Record<StatementType, ParsedStatement>;
  const statementCandidates: Record<StatementType, string[]> = { income: [], balance: [], cashflow: [] };
  for (const [hint, file] of Object.entries(files)) {
    if (!file) continue;
    const sheets = await parseFile(file);
    for (const [name, rows] of Object.entries(sheets)) {
      const automaticType = hint === "workbook" ? detectType(name, rows) : hint as StatementType;
      if (hint === "workbook" && automaticType) statementCandidates[automaticType].push(name);
      const forcedType = hint === "workbook"
        ? (["income", "balance", "cashflow"] as StatementType[]).find((type) => mappingOverrides[`sheet:${type}`] === name)
        : undefined;
      const type = forcedType ?? automaticType;
      if (type && mappingOverrides[`sheet:${type}`] && mappingOverrides[`sheet:${type}`] !== name) continue;
      if (type && !statements[type]) statements[type] = normalize(type, name, rows, mappingOverrides);
    }
  }

  const missing = (["income", "balance", "cashflow"] as StatementType[]).filter((type) => !statements[type]);
  if (missing.length) {
    const display = { income: "Income Statement", balance: "Balance Sheet", cashflow: "Cash Flow Statement" };
    throw new Error(`Missing ${missing.map((type) => display[type]).join(", ")}.`);
  }

  const inputs = buildInputs(statements);
  const { kpis, calculations } = calculateFinancials(inputs);
  const validation = validateFinancials(inputs, {
    granularities: {
      income: statements.income.header.granularity,
      balance: statements.balance.header.granularity,
      cashflow: statements.cashflow.header.granularity,
    },
    periods: {
      income: statements.income.header.labels,
      balance: statements.balance.header.labels,
      cashflow: statements.cashflow.header.labels,
    },
    periodEnds: {
      income: statements.income.metadata.periodEnd,
      balance: statements.balance.metadata.periodEnd,
      cashflow: statements.cashflow.metadata.periodEnd,
    },
    currencies: {
      income: statements.income.metadata.currency,
      balance: statements.balance.metadata.currency,
      cashflow: statements.cashflow.metadata.currency,
    },
    scales: {
      income: statements.income.metadata.scale,
      balance: statements.balance.metadata.scale,
      cashflow: statements.cashflow.metadata.scale,
    },
    scaleConfirmed: {
      income: statements.income.metadata.scaleConfirmed,
      balance: statements.balance.metadata.scaleConfirmed,
      cashflow: statements.cashflow.metadata.scaleConfirmed,
    },
    duplicateStatements: (Object.entries(statementCandidates) as Array<[StatementType, string[]]>)
      .filter(([statement, sheets]) => sheets.length > 1 && !mappingOverrides[`sheet:${statement}`])
      .map(([statement, sheets]) => ({ statement, sheets })),
    duplicates: (["income", "balance", "cashflow"] as StatementType[]).flatMap((statement) =>
      statements[statement].duplicates.map((duplicate) => ({ statement, ...duplicate })),
    ),
  });
  const lastPeriod = kpis.periods.at(-1) ?? kpis.granularity;

  return {
    createdAt: new Date().toISOString(),
    businessName: businessName.trim() || "My Business",
    periodLabel: lastPeriod,
    kpis,
    calculations,
    validation,
    formulaVersion: FORMULA_VERSION,
    statementMetadata: {
      income: { sheet: statements.income.name, granularity: statements.income.header.granularity, periods: statements.income.header.labels, labelColumn: statements.income.labelColumn, labelColumnName: columnName(statements.income.labelColumn), ...statements.income.metadata },
      balance: { sheet: statements.balance.name, granularity: statements.balance.header.granularity, periods: statements.balance.header.labels, labelColumn: statements.balance.labelColumn, labelColumnName: columnName(statements.balance.labelColumn), ...statements.balance.metadata },
      cashflow: { sheet: statements.cashflow.name, granularity: statements.cashflow.header.granularity, periods: statements.cashflow.header.labels, labelColumn: statements.cashflow.labelColumn, labelColumnName: columnName(statements.cashflow.labelColumn), ...statements.cashflow.metadata },
    },
    mappingReview: mappingReview(statements, mappingOverrides, statementCandidates),
    coverage: {
      income: statements.income.name,
      balance: statements.balance.name,
      cashflow: statements.cashflow.name,
    },
  };
}
