import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureWorkspace, saveAnalysis } from "../../../db/cashflo";
import { generateFinancialInsights } from "../../lib/financial-insights";
import type { CalculationTrace, FinancialKpis, ValidationSummary } from "../../lib/types";
import { getAppUser } from "../../lib/user";

export const dynamic = "force-dynamic";

type ConversationTurn = { role: "user" | "assistant"; text: string };
type InsightRequest = {
  kind?: "analysis" | "question";
  question?: string;
  kpis?: FinancialKpis;
  snapshotId?: string | null;
  history?: ConversationTurn[];
  deepReasoning?: boolean;
  companyId?: string;
  formulaVersion?: string;
  calculations?: Record<string, CalculationTrace>;
  validation?: ValidationSummary;
};

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => typeof item === "object" && item && Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: Array<{ text?: string }> }).content
      : [])
    .map((item) => item.text ?? "")
    .join("");
}

function localQuestion(question: string, kpis: FinancialKpis) {
  const concerns = generateFinancialInsights(kpis).slice(0, 3);
  const evidence = [
    `cash on hand: $${Math.round(kpis.cash ?? 0).toLocaleString()}`,
    `operating margin: ${kpis.operatingMargin == null ? "unavailable" : `${(kpis.operatingMargin * 100).toFixed(1)}%`}`,
    `free cash flow: ${kpis.freeCashFlow == null ? "unavailable" : `$${Math.round(kpis.freeCashFlow).toLocaleString()}`}`,
    `debt to equity: ${kpis.debtToEquity == null ? "unavailable" : `${kpis.debtToEquity.toFixed(2)}x`}`,
    `days cash on hand: ${kpis.daysCashOnHand == null ? "unavailable" : `${Math.round(kpis.daysCashOnHand)} days`}`,
  ].join("; ");
  const actions = concerns.map((item, index) => `${index + 1}. ${item.recommendation}`).join("\n");
  return `Decision view for: ${question || "the business's current operating position"}\n\nBased on the available statements, the strongest evidence is ${evidence}. The leading concern is ${concerns[0]?.title.toLowerCase() ?? "not identifiable from the available data"}.\n\nRecommended decision process:\n${actions}\n\nFor a complex scenario, provide the decision being considered, timing, expected revenue or cost change, financing terms, and acceptable downside. CashFlo can then compare the base, upside, and downside cases. Advanced natural-language reasoning requires the OpenAI connection to be configured.`;
}

function developerInstructions(kind: "analysis" | "question") {
  const output = kind === "analysis"
    ? 'Return only JSON shaped as {"insights":[{"severity":"high|medium|low","title":"...","detail":"...","recommendation":"...","impact":"High|Medium|Low"}],"actions":[{"title":"...","detail":"...","impact":"High|Medium|Low"}]}. Provide 3-5 prioritized, evidence-based items.'
    : `Answer the owner's question directly. Use this structure when it helps: conclusion; supporting financial evidence; reasoning and dependencies; options and trade-offs; recommended next actions; assumptions or missing inputs. For scenarios, compare base, upside, and downside cases when inputs allow it. Do not force a rigid template when a simpler answer is clearer.`;

  return `You are CashFlo, a senior AI CFO for a small business. Your job is to reason across profitability, liquidity, leverage, working capital, cash conversion, operating efficiency, returns, and financial risk using only the normalized metrics supplied by the application and the conversation.

Treat reported and derived metrics as deterministic financial facts only when their audit status is available and the validation summary has no related error. Distinguish known facts, calculated implications, and assumptions. Quantify conclusions whenever possible. If missing information could materially change the answer, say exactly what is missing and either provide a conditional answer or ask one focused follow-up question. Never invent transactions, forecasts, benchmarks, industry facts, or accounting details. Explain trade-offs and second-order effects. Challenge a risky premise respectfully. Do not present accounting, tax, legal, lending, or investment conclusions as professional advice.

${output}`;
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json() as InsightRequest;
  if (!body.kpis) return NextResponse.json({ error: "Financial metrics are required." }, { status: 400 });
  const kind = body.kind ?? "analysis";
  const question = (body.question ?? "").trim().slice(0, 6000);
  if (kind === "question" && !question) return NextResponse.json({ error: "Ask a financial or operating question." }, { status: 400 });

  const local = generateFinancialInsights(body.kpis);
  const workspace = await ensureWorkspace(user);
  const companyId = body.companyId ?? workspace.activeCompany.id;
  const key = (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  if (!key) {
    const result = kind === "question"
      ? { configured: false, answer: localQuestion(question, body.kpis) }
      : { configured: false, insights: local, actions: local.map(({ recommendation, impact }) => ({ title: recommendation, detail: "Assign an owner and review progress within 30 days.", impact })) };
    await saveAnalysis(user, companyId, body.snapshotId ?? null, kind, result);
    return NextResponse.json(result);
  }

  const history = Array.isArray(body.history)
    ? body.history
      .filter((turn): turn is ConversationTurn => (turn?.role === "user" || turn?.role === "assistant") && typeof turn.text === "string")
      .slice(-10)
      .map((turn) => ({ role: turn.role, content: turn.text.slice(0, 6000) }))
    : [];
  const input = [
    { role: "developer", content: developerInstructions(kind) },
    ...history,
    { role: "user", content: `${kind === "question" ? question : "Generate an operating assessment and a 90-day action plan."}\n\nNormalized financial metrics:\n${JSON.stringify(body.kpis)}\n\nFormula version: ${body.formulaVersion ?? "legacy"}\nValidation summary:\n${JSON.stringify(body.validation ?? null)}\n\nCalculation status and formula identifiers:\n${JSON.stringify(Object.fromEntries(Object.entries(body.calculations ?? {}).map(([key, trace]) => [key, { value: trace.value, status: trace.status, formulaId: trace.formulaId }])))}` },
  ];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.email));
  const safetyIdentifier = `cashflo-${Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const reasoning = body.deepReasoning && kind === "question"
    ? { mode: "pro", effort: "high" }
    : { effort: kind === "question" ? "medium" : "medium" };

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      input,
      reasoning,
      text: { verbosity: body.deepReasoning ? "high" : "medium" },
      max_output_tokens: body.deepReasoning ? 5000 : 3000,
      safety_identifier: safetyIdentifier,
      store: false,
    }),
  });
  const apiResult = await apiResponse.json() as Record<string, unknown>;
  if (!apiResponse.ok) {
    return NextResponse.json({ error: (apiResult.error as { message?: string } | undefined)?.message ?? "AI analysis failed." }, { status: 502 });
  }

  const text = outputText(apiResult).trim();
  let result: unknown;
  if (kind === "question") {
    result = { configured: true, answer: text, deepReasoning: Boolean(body.deepReasoning) };
  } else {
    try {
      result = { configured: true, ...JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) };
    } catch {
      result = { configured: true, insights: [{ severity: "medium", title: "AI assessment", detail: text, recommendation: "Review the assessment with the accountable owner.", impact: "Medium" }], actions: [] };
    }
  }
  await saveAnalysis(user, companyId, body.snapshotId ?? null, kind, result);
  return NextResponse.json(result);
}
