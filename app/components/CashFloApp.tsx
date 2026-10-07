"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ingestFinancials } from "../lib/finance-client";
import { generateFinancialInsights, type OperatingInsight } from "../lib/financial-insights";
import { calculateHealthScore } from "../lib/health-score";
import { demoDataset } from "../lib/demo-data";
import type { CalculationTrace, MappingReview, NormalizedDataset, ValidationSummary } from "../lib/types";

type Page = "dashboard" | "upload" | "audit" | "insights" | "reports" | "ai-cfo" | "history" | "companies";
type HistoryItem = { id: string; business_name: string; period_label: string; granularity: string; created_at: string };
type Company = { id: string; name: string; currency: string; fiscal_year_end: string | null; role: string; created_at: string };
type MappingProfile = { id: string; name: string; mappings: Record<string, string>; created_at?: string; updated_at?: string };
type Props = { user: { displayName: string; email: string }; activeCompany: Company; companies: Company[]; initialMappingProfiles: MappingProfile[]; initialData: NormalizedDataset | null; initialSnapshotId: string | null; initialHistory: HistoryItem[] };
type MaybeNumber = number | null | undefined;

const money = (value: MaybeNumber, compact = false) => {
  if (value == null || !Number.isFinite(value)) return "--";
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  if (compact && amount >= 1_000_000) return `${sign}$${(amount / 1_000_000).toFixed(2)}M`;
  if (compact && amount >= 1_000) return `${sign}$${(amount / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(amount).toLocaleString()}`;
};
const percent = (value: MaybeNumber) => value == null ? "--" : `${(value * 100).toFixed(1)}%`;
const multiple = (value: MaybeNumber) => value == null ? "--" : `${value.toFixed(2)}x`;
const days = (value: MaybeNumber) => value == null ? "--" : `${Math.round(value)} days`;

export function CashFloApp({ user, activeCompany, companies, initialMappingProfiles, initialData, initialSnapshotId, initialHistory }: Props) {
  const [page, setPage] = useState<Page>("dashboard");
  const [dataset, setDataset] = useState(initialData ?? demoDataset);
  const [snapshotId, setSnapshotId] = useState(initialSnapshotId);
  const [history, setHistory] = useState(initialHistory);
  const [mobileNav, setMobileNav] = useState(false);
  const [uploadMode, setUploadMode] = useState<"workbook" | "separate">("workbook");
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [separate, setSeparate] = useState<{ income: File | null; balance: File | null; cashflow: File | null }>({ income: null, balance: null, cashflow: null });
  const [businessName, setBusinessName] = useState(dataset.businessName);
  const [uploadStatus, setUploadStatus] = useState("");
  const [pendingDataset, setPendingDataset] = useState<NormalizedDataset | null>(null);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [mappingProfiles, setMappingProfiles] = useState(initialMappingProfiles);
  const [mappingProfileName, setMappingProfileName] = useState("Default mapping");
  const [selectedMappingProfile, setSelectedMappingProfile] = useState<string>("");
  const [mappingDirty, setMappingDirty] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyCurrency, setCompanyCurrency] = useState("USD");
  const [companyStatus, setCompanyStatus] = useState("");
  const [selectedCalculation, setSelectedCalculation] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deepReasoning, setDeepReasoning] = useState(false);
  const [insights, setInsights] = useState<OperatingInsight[]>(() => generateFinancialInsights(dataset.kpis));
  const [aiStatus, setAiStatus] = useState("Built-in financial controls are ready.");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: "Ask any financial or operating question. I can connect profitability, cash, leverage, working capital, operating efficiency, and scenario trade-offs using your latest statements." },
  ]);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const localInsights = useMemo(() => generateFinancialInsights(dataset.kpis), [dataset]);
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  const drawChart = useCallback(() => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const kpis = dataset.kpis;
    const revenue = kpis.revenueSeries.length ? kpis.revenueSeries : [kpis.revenue ?? 0];
    const income = kpis.incomeSeries.length ? kpis.incomeSeries : [kpis.netIncome ?? 0];
    const labels = kpis.periods.length === revenue.length ? kpis.periods : revenue.map((_, index) => `P${index + 1}`);
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const padding = { left: 45, right: 10, top: 14, bottom: 27 };
    const values = [...revenue, ...income];
    const max = Math.max(...values, 1) * 1.12;
    const min = Math.min(...values, 0) * 1.15;
    const x = (index: number) => labels.length === 1 ? (width + padding.left - padding.right) / 2 : padding.left + index * (width - padding.left - padding.right) / (labels.length - 1);
    const y = (value: number) => padding.top + (max - value) * (height - padding.top - padding.bottom) / (max - min || 1);
    context.font = "9px system-ui";
    context.fillStyle = "#8490a0";
    context.strokeStyle = "#e7edf3";
    [0, 0.25, 0.5, 0.75, 1].forEach((step) => {
      const value = min + (max - min) * step;
      context.beginPath();
      context.moveTo(padding.left, y(value));
      context.lineTo(width - padding.right, y(value));
      context.stroke();
      context.fillText(money(value, true), 1, y(value) + 3);
    });
    labels.forEach((label, index) => {
      if (labels.length < 14 || index % Math.ceil(labels.length / 12) === 0) context.fillText(label.slice(0, 6), x(index) - 8, height - 7);
    });
    const line = (series: number[], color: string) => {
      context.beginPath();
      series.forEach((value, index) => index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value)));
      context.strokeStyle = color;
      context.lineWidth = 2.4;
      context.stroke();
      series.forEach((value, index) => {
        context.beginPath();
        context.arc(x(index), y(value), 2.5, 0, Math.PI * 2);
        context.fillStyle = "#fff";
        context.fill();
        context.strokeStyle = color;
        context.stroke();
      });
    };
    line(revenue, "#2b73ba");
    line(income, "#54ab7f");
  }, [dataset]);

  useEffect(() => {
    if (page !== "dashboard") return;
    const frame = requestAnimationFrame(drawChart);
    return () => cancelAnimationFrame(frame);
  }, [page, drawChart]);

  useEffect(() => {
    const resize = () => page === "dashboard" && drawChart();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [page, drawChart]);

  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const kpis = dataset.kpis;
  const healthScore = calculateHealthScore(kpis);

  const operatingMetrics = [
    { metric: "debtToEquity", label: "Debt to equity", value: multiple(kpis.debtToEquity), note: "Total debt / owner equity; liabilities proxy used if debt is not listed" },
    { metric: "daysCashOnHand", label: "Days cash on hand", value: days(kpis.daysCashOnHand), note: "Cash coverage of average daily operating expense" },
    { metric: "workingCapital", label: "Working capital", value: money(kpis.workingCapital, true), note: "Current assets less current liabilities" },
    { metric: "quickRatio", label: "Quick ratio", value: multiple(kpis.quickRatio), note: "Near-term liquidity excluding inventory" },
    { metric: "freeCashFlow", label: "Free cash flow", value: money(kpis.freeCashFlow, true), note: "Operating cash flow after capital spending" },
    { metric: "cashConversionCycle", label: "Cash conversion cycle", value: days(kpis.cashConversionCycle), note: "Receivables + inventory - payable days" },
    { metric: "receivableDays", label: "Receivable days", value: days(kpis.receivableDays), note: "Estimated collection speed" },
    { metric: "inventoryDays", label: "Inventory days", value: days(kpis.inventoryDays), note: "Estimated inventory holding period" },
    { metric: "interestCoverage", label: "Interest coverage", value: multiple(kpis.interestCoverage), note: "Operating profit / interest expense" },
    { metric: "cashConversionRatio", label: "Cash conversion", value: multiple(kpis.cashConversionRatio), note: "Operating cash flow / net income" },
    { metric: "returnOnAssets", label: "Return on assets", value: percent(kpis.returnOnAssets), note: "Profit generated by the asset base" },
    { metric: "assetTurnover", label: "Asset turnover", value: multiple(kpis.assetTurnover), note: "Revenue generated per dollar of assets" },
  ];

  async function saveData(data: NormalizedDataset, mappingProfileId: string | null) {
    const response = await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompany.id, businessName: data.businessName, periodLabel: data.periodLabel, granularity: data.kpis.granularity, normalized: data, mappingProfileId, fileMetadata: uploadMode === "workbook" ? [{ name: workbook?.name, size: workbook?.size, type: "workbook" }] : Object.entries(separate).map(([type, file]) => ({ name: file?.name, size: file?.size, type })) }),
    });
    const result = await response.json() as { error?: string; id: string; createdAt: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to save financial data.");
    setSnapshotId(result.id);
    setHistory((items) => [{ id: result.id, business_name: data.businessName, period_label: data.periodLabel, granularity: data.kpis.granularity, created_at: result.createdAt }, ...items]);
  }

  function clearPendingValidation() {
    setPendingDataset(null);
    setMappingDirty(false);
    setUploadStatus("");
  }

  async function validateUpload() {
    setWorking(true);
    setPendingDataset(null);
    setUploadStatus("Reading, tracing, and reconciling the three statements...");
    try {
      const files = uploadMode === "workbook"
        ? { workbook: workbook ?? undefined }
        : { income: separate.income ?? undefined, balance: separate.balance ?? undefined, cashflow: separate.cashflow ?? undefined };
      const data = await ingestFinancials(files, businessName, mappingOverrides);
      setPendingDataset(data);
      setMappingDirty(false);
      const summary = data.validation;
      setUploadStatus(summary?.errorCount
        ? `Validation found ${summary.errorCount} blocking issue${summary.errorCount === 1 ? "" : "s"}; ${summary.notRunCount ?? 0} dependent check${summary.notRunCount === 1 ? " was" : "s were"} not run. Correct the source or mapping before saving.`
        : `Validation complete: ${summary?.passCount ?? 0} passed, ${summary?.warningCount ?? 0} warning${summary?.warningCount === 1 ? "" : "s"}, and ${summary?.notRunCount ?? 0} check${summary?.notRunCount === 1 ? "" : "s"} not run.`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "The statements could not be analyzed.");
    } finally {
      setWorking(false);
    }
  }

  async function confirmSave() {
    if (!pendingDataset || (pendingDataset.validation?.errorCount ?? 0) > 0) return;
    setWorking(true);
    setUploadStatus("Saving the validated financial analysis...");
    try {
      let mappingProfileId = selectedMappingProfile || null;
      if (Object.keys(mappingOverrides).length) {
        const mappingResponse = await fetch("/api/mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: activeCompany.id, name: mappingProfileName || "Default mapping", mappings: mappingOverrides }) });
        const mappingResult = await mappingResponse.json() as { id?: string; name?: string; mappings?: Record<string, string>; error?: string };
        if (!mappingResponse.ok || !mappingResult.id) throw new Error(mappingResult.error ?? "Unable to save the mapping profile.");
        mappingProfileId = mappingResult.id;
        setSelectedMappingProfile(mappingResult.id);
        setMappingProfiles((items) => [{ id: mappingResult.id!, name: mappingResult.name ?? mappingProfileName, mappings: mappingResult.mappings ?? mappingOverrides }, ...items.filter((item) => item.id !== mappingResult.id)]);
      }
      await saveData(pendingDataset, mappingProfileId);
      setDataset(pendingDataset);
      setInsights(generateFinancialInsights(pendingDataset.kpis));
      setUploadStatus(`Saved successfully with formula version ${pendingDataset.formulaVersion}.`);
      setPendingDataset(null);
      setTimeout(() => navigate("dashboard"), 650);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "The validated analysis could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  function loadDemo() {
    setDataset(demoDataset);
    setBusinessName(demoDataset.businessName);
    setInsights(generateFinancialInsights(demoDataset.kpis));
    setUploadStatus("Example business loaded. Upload your statements whenever you are ready.");
    navigate("dashboard");
  }

  async function generateAi() {
    setWorking(true);
    setAiStatus("Generating an owner-ready assessment...");
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "analysis", companyId: activeCompany.id, snapshotId, kpis, calculations: dataset.calculations, validation: dataset.validation, formulaVersion: dataset.formulaVersion }),
      });
      const result = await response.json() as { error?: string; configured?: boolean; insights?: OperatingInsight[] };
      if (!response.ok) throw new Error(result.error ?? "AI analysis is unavailable.");
      if (Array.isArray(result.insights)) {
        setInsights(result.insights.map((item) => ({
          ...item,
          recommendation: item.recommendation ?? "Review this issue with the accountable owner.",
          impact: item.impact ?? "Medium",
        })));
      }
      setAiStatus(result.configured ? "Generated by GPT-5.6 Sol from your normalized metrics." : "OpenAI is not configured, so CashFlo used its expanded financial control engine.");
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : "AI analysis failed.");
    } finally {
      setWorking(false);
    }
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    const priorHistory = messages.slice(-10);
    setAsking(true);
    setMessages((items) => [...items, { role: "user", text: trimmed }, { role: "assistant", text: deepReasoning ? "Running a deeper financial analysis..." : "Reviewing the financial relationships..." }]);
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "question", question: trimmed, companyId: activeCompany.id, snapshotId, kpis, history: priorHistory, deepReasoning, calculations: dataset.calculations, validation: dataset.validation, formulaVersion: dataset.formulaVersion }),
      });
      const result = await response.json() as { answer?: string; error?: string };
      setMessages((items) => [...items.slice(0, -1), {
        role: "assistant",
        text: response.ok ? result.answer ?? "No answer was returned." : result.error ?? "The analysis could not be completed.",
      }]);
    } catch {
      setMessages((items) => [...items.slice(0, -1), { role: "assistant", text: "I could not complete that analysis. Please try again." }]);
    } finally {
      setAsking(false);
    }
  }

  function exportCsv() {
    const rows = [["Metric", "Value"], ...Object.entries(kpis).filter(([, value]) => typeof value === "number").map(([key, value]) => [key, value])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${dataset.businessName.replace(/\W+/g, "-").toLowerCase()}-cashflo-kpis.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function applyMappingProfile(profileId: string) {
    setSelectedMappingProfile(profileId);
    const profile = mappingProfiles.find((item) => item.id === profileId);
    setMappingOverrides(profile?.mappings ?? {});
    if (profile) setMappingProfileName(profile.name);
    setPendingDataset(null);
    setMappingDirty(false);
    setUploadStatus(profile ? `${profile.name} selected. Run validation to apply it.` : "Automatic mapping selected.");
  }

  async function removeMappingProfile() {
    if (!selectedMappingProfile) return;
    setWorking(true);
    try {
      const response = await fetch("/api/mappings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: activeCompany.id, profileId: selectedMappingProfile }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to delete the mapping profile.");
      setMappingProfiles((items) => items.filter((item) => item.id !== selectedMappingProfile));
      setSelectedMappingProfile("");
      setMappingOverrides({});
      setPendingDataset(null);
      setUploadStatus("Mapping profile deleted. Automatic mapping is active.");
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Unable to delete the mapping profile.");
    } finally {
      setWorking(false);
    }
  }

  async function switchCompany(companyId: string) {
    if (companyId === activeCompany.id) return;
    setWorking(true);
    try {
      const response = await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select", companyId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to switch companies.");
      window.location.reload();
    } catch (error) {
      setCompanyStatus(error instanceof Error ? error.message : "Unable to switch companies.");
      setWorking(false);
    }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!companyName.trim()) return;
    setWorking(true);
    setCompanyStatus("Creating the company workspace...");
    try {
      const response = await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name: companyName.trim(), currency: companyCurrency }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create the company.");
      window.location.reload();
    } catch (error) {
      setCompanyStatus(error instanceof Error ? error.message : "Unable to create the company.");
      setWorking(false);
    }
  }

  async function loadSnapshot(snapshot: HistoryItem) {
    setWorking(true);
    try {
      const response = await fetch(`/api/snapshots?companyId=${encodeURIComponent(activeCompany.id)}&snapshotId=${encodeURIComponent(snapshot.id)}`);
      const result = await response.json() as { snapshot?: { id: string; normalized: NormalizedDataset }; error?: string };
      if (!response.ok || !result.snapshot) throw new Error(result.error ?? "Unable to load the analysis.");
      setDataset(result.snapshot.normalized);
      setSnapshotId(result.snapshot.id);
      setBusinessName(result.snapshot.normalized.businessName);
      setInsights(generateFinancialInsights(result.snapshot.normalized.kpis));
      navigate("dashboard");
    } catch (error) {
      setCompanyStatus(error instanceof Error ? error.message : "Unable to load the analysis.");
    } finally {
      setWorking(false);
    }
  }

  const navItems: Array<[Page, string, string]> = [
    ["dashboard", "01", "Overview"], ["upload", "02", "Upload financials"], ["audit", "03", "Data audit"],
    ["insights", "04", "Insights"], ["reports", "05", "Reports"], ["history", "06", "History"], ["companies", "07", "Companies"], ["ai-cfo", "AI", "AI CFO"],
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <button className="brand brand-button" onClick={() => navigate("dashboard")}><span>C</span>CashFlo</button>
      <p className="workspace">{activeCompany.name.toUpperCase()}<small>{user.displayName} / {activeCompany.role}</small></p>
      <label className="company-switcher"><span>Company workspace</span><select value={activeCompany.id} disabled={working} onChange={(event) => void switchCompany(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <nav>{navItems.map(([key, icon, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => navigate(key)}><b>{icon}</b>{label}</button>)}</nav>
      <div className="secure-card"><span>{"\u2713"}</span><div><strong>Private workspace</strong><small>Only your signed-in account can access saved financial summaries and AI history.</small></div></div>
      <a className="sign-out" href="/signout-with-chatgpt?return_to=/">Sign out</a>
    </aside>
    <div className="mobile-header"><button className="brand brand-button" onClick={() => navigate("dashboard")}><span>C</span>CashFlo</button><button aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}>Menu</button></div>
    <main>
      {page === "dashboard" && <section className="page">
        <PageHeader eyebrow="EXECUTIVE OVERVIEW" title={`Good morning, ${user.displayName.split(" ")[0]}`} description={`Here is what ${dataset.businessName}'s financial statements are signaling.`} right={<><span className="period-pill">{kpis.granularity} / {dataset.periodLabel}</span><span className="avatar">{initials}</span></>} />
        <div className="hero"><div><span>FINANCIAL HEALTH</span><h2>{healthScore.score == null ? "Additional financial data is required" : localInsights[0]?.title ?? "Your financial picture is ready."}</h2><p>{healthScore.score == null ? `Health score unavailable. Missing: ${healthScore.missingMetricLabels.join(", ")}.` : localInsights[0]?.detail}</p></div><div className={`score ${healthScore.score == null ? "incomplete" : ""}`}><b>{healthScore.score == null ? "--" : Math.round(healthScore.score)}</b><small>{healthScore.score == null ? `${healthScore.completeness}% data available` : "out of 100"}</small><strong>{healthScore.score == null ? "Not scored" : healthScore.status}</strong></div></div>
        <div className="kpi-grid">
          <Kpi label="Cash on hand" badge={days(kpis.daysCashOnHand)} value={money(kpis.cash, true)} note="Available liquidity" onAudit={() => { setSelectedCalculation("cash"); navigate("audit"); }} />
          <Kpi label="Revenue" badge={percent(kpis.revenueGrowth)} value={money(kpis.revenue, true)} note="Latest reporting period" onAudit={() => { setSelectedCalculation("revenue"); navigate("audit"); }} />
          <Kpi label="Operating cash flow" badge="Cash quality" value={money(kpis.operatingCashFlow, true)} note="Generated from operations" onAudit={() => { setSelectedCalculation("operatingCashFlow"); navigate("audit"); }} />
          <Kpi label="Free cash flow" badge={percent(kpis.freeCashFlowMargin)} value={money(kpis.freeCashFlow, true)} note="After capital spending" onAudit={() => { setSelectedCalculation("freeCashFlow"); navigate("audit"); }} />
        </div>
        <div className={`assurance-banner ${(dataset.validation?.errorCount ?? 0) > 0 ? "blocked" : "verified"}`}>
          <div><i>{(dataset.validation?.errorCount ?? 0) > 0 ? "!" : "\u2713"}</i><p><b>{dataset.validation ? `${dataset.validation.passCount} financial checks passed` : "Legacy analysis"}</b><small>{dataset.validation ? `${dataset.validation.warningCount} warnings / ${dataset.validation.notRunCount ?? 0} not run / formula ${dataset.formulaVersion}` : "Upload the statements again to create an auditable calculation trail."}</small></p></div>
          <button className="text-button" onClick={() => navigate("audit")}>Review data audit</button>
        </div>
        <article className="panel operating-scorecard">
          <PanelHead eyebrow="OPERATING SCORECARD" title="Liquidity, leverage, and efficiency" right={<button className="text-button" onClick={() => navigate("ai-cfo")}>Ask AI CFO</button>} />
          <div className="operating-metric-grid">{operatingMetrics.map(({ metric, ...item }) => <MetricTile key={metric} {...item} onAudit={() => { setSelectedCalculation(metric); navigate("audit"); }} />)}</div>
        </article>
        <div className="content-grid">
          <article className="panel chart-panel"><PanelHead eyebrow="TREND" title="Revenue and net income" /><div className="chart-wrap"><canvas ref={chartRef} /></div><div className="metric-strip"><span><b>{percent(kpis.grossMargin)}</b>Gross margin</span><span><b>{percent(kpis.operatingMargin)}</b>Operating margin</span><span><b>{percent(kpis.netMargin)}</b>Net margin</span><span><b>{multiple(kpis.currentRatio)}</b>Current ratio</span></div></article>
          <article className="panel"><PanelHead eyebrow="AI CFO BRIEF" title="What needs attention" right={<em className="ai-chip">GPT-5.6 Sol</em>} />{insights.slice(0, 3).map((item) => <Brief key={item.title} item={item} />)}<button className="wide-button" onClick={() => navigate("insights")}>View recommendations <span>{"\u2192"}</span></button></article>
        </div>
        <div className="content-grid bottom-grid">
          <article className="panel"><PanelHead eyebrow="CASH MOVEMENT" title="Three-activity cash bridge" /><div className="cash-bridge"><Bridge label="Beginning cash" value={money(kpis.beginningCash, true)} /><i>+</i><Bridge className={(kpis.operatingCashFlow ?? 0) < 0 ? "negative" : "positive"} label="Operations" value={money(kpis.operatingCashFlow, true)} /><i>+</i><Bridge className={(kpis.investingCashFlow ?? kpis.capex ?? 0) < 0 ? "negative" : "positive"} label="Investing" value={money(kpis.investingCashFlow ?? kpis.capex, true)} /><i>+</i><Bridge className={(kpis.financingCashFlow ?? 0) < 0 ? "negative" : "positive"} label="Financing" value={money(kpis.financingCashFlow, true)} /><i>=</i><Bridge className="ending" label="Ending cash" value={money(kpis.endingCash ?? kpis.cash, true)} /></div></article>
          <article className="panel"><PanelHead eyebrow="DATA COVERAGE" title="Three-statement status" right={<button className="text-button" onClick={() => navigate("upload")}>Replace</button>} /><div className="status-list">{Object.entries(dataset.coverage).map(([key, value]) => <div key={key}><i>{"\u2713"}</i><p><b>{key === "income" ? "Income Statement" : key === "balance" ? "Balance Sheet" : "Cash Flow Statement"}</b><small>{value}</small></p></div>)}</div></article>
        </div>
      </section>}

      {page === "upload" && <section className="page">
        <PageHeader eyebrow="FINANCIAL DATA" title="Upload your three statements" description="Single month, full year, or monthly columns are supported." right={<span className="avatar">{initials}</span>} />
        <div className="upload-card">
          <div className="steps"><span className="active">1</span>Upload<i /><span className={pendingDataset ? "active" : ""}>2</span>Validate<i /><span>3</span>Save</div>
          <label className="business-field">Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={120} /></label>
          <div className="mapping-profile-control"><label><span>Saved account mapping</span><div className="profile-select"><select value={selectedMappingProfile} onChange={(event) => applyMappingProfile(event.target.value)}><option value="">Automatic mapping</option>{mappingProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>{selectedMappingProfile && <button type="button" disabled={working} onClick={() => void removeMappingProfile()}>Delete</button>}</div></label><label><span>Save corrections as</span><input value={mappingProfileName} onChange={(event) => setMappingProfileName(event.target.value)} maxLength={80} /></label></div>
          <div className="mode-tabs"><button className={uploadMode === "workbook" ? "active" : ""} onClick={() => { setUploadMode("workbook"); clearPendingValidation(); }}>One Excel workbook<small>Three statements as sheets</small></button><button className={uploadMode === "separate" ? "active" : ""} onClick={() => { setUploadMode("separate"); clearPendingValidation(); }}>Three separate files<small>One statement per file</small></button></div>
          {uploadMode === "workbook" ? <><div className="info-bar"><b>Required sheets</b><span>Income Statement</span><span>Balance Sheet</span><span>Cash Flow Statement</span></div><label className="dropzone"><input type="file" accept=".xlsx" onChange={(event) => { setWorkbook(event.target.files?.[0] ?? null); clearPendingValidation(); }} /><span>{"\u2191"}</span><b>{workbook?.name ?? "Choose your Excel workbook"}</b><p>CashFlo checks sheet names, account lines, formulas, and source cells</p><small>.xlsx / up to 20 MB</small></label></> : <div className="statement-upload-grid">{(["income", "balance", "cashflow"] as const).map((type, index) => <label key={type} className={separate[type] ? "complete" : ""}><span>{index + 1}</span><b>{type === "income" ? "Income Statement" : type === "balance" ? "Balance Sheet" : "Cash Flow Statement"}</b><small>{type === "income" ? "P&L or Statement of Operations" : type === "balance" ? "Assets, liabilities, and equity" : "Operating, investing, and financing"}</small><input type="file" accept=".xlsx,.csv" onChange={(event) => { setSeparate({ ...separate, [type]: event.target.files?.[0] ?? null }); clearPendingValidation(); }} /><em>Choose file</em><p>{separate[type]?.name ?? "No file selected"}</p></label>)}</div>}
          {uploadStatus && <div className={`upload-message ${(pendingDataset?.validation?.errorCount ?? 0) > 0 || (!pendingDataset && !working) ? "error" : "success"}`}>{uploadStatus}</div>}
          {pendingDataset?.mappingReview && <MappingPanel review={pendingDataset.mappingReview} overrides={mappingOverrides} setOverrides={(next) => { setMappingOverrides(next); setMappingDirty(true); setUploadStatus("Mapping changes are ready. Run validation again before saving."); }} />}
          {pendingDataset?.validation && <ValidationPanel summary={pendingDataset.validation} compact />}
          <div className="upload-actions"><button className="ghost" onClick={loadDemo}>Use example data</button><div className="upload-action-group"><button className="ghost" disabled={working || (uploadMode === "workbook" ? !workbook : !Object.values(separate).every(Boolean))} onClick={validateUpload}>{working ? "Processing..." : pendingDataset ? mappingDirty ? "Apply mappings and revalidate" : "Run validation again" : "Validate statements"}</button>{pendingDataset && <button className="primary" disabled={working || mappingDirty || (pendingDataset.validation?.errorCount ?? 0) > 0} onClick={confirmSave}>{mappingDirty ? "Revalidate before saving" : "Save validated analysis"}</button>}</div></div>
        </div>
        <div className="format-help"><InfoCard title="Reusable mappings" text="Confirm unfamiliar account labels once, save the mapping profile, and reuse it for future uploads to this company." /><InfoCard title="Reconciliation first" text="CashFlo validates mapped accounts, statement equations, cash movement, dates, currency, and scale before saving." /><InfoCard title="Company-scoped storage" text="Normalized datasets, mapping profiles, reports, and AI analyses remain isolated inside the selected company workspace." /></div>
      </section>}

      {page === "audit" && <AuditPage dataset={dataset} selectedMetric={selectedCalculation} setSelectedMetric={setSelectedCalculation} navigateUpload={() => navigate("upload")} />}

      {page === "insights" && <section className="page">
        <PageHeader eyebrow="OPERATING INTELLIGENCE" title="Insights and recommendations" description="Prioritized issues translated into owner actions." right={<button className="primary" disabled={working} onClick={generateAi}>{working ? "Analyzing..." : "Generate AI analysis"}</button>} />
        <div className="notice">{aiStatus}</div>
        <div className="insight-layout"><div><h2>Operating concerns</h2><div className="recommendation-list">{insights.map((item) => <article key={item.title}><i className={`risk-dot ${item.severity}`} /><div><h3>{item.title}</h3><p>{item.detail}</p><strong className="inline-recommendation">Recommendation: {item.recommendation}</strong></div><em>{item.severity.toUpperCase()}</em></article>)}</div></div><aside className="action-plan"><span>90-DAY ACTION PLAN</span><h2>Recommended priorities</h2>{insights.map((item, index) => <div className="action-item" key={item.title}><b>{index + 1}. {item.recommendation}</b><p>Assign an owner, define the success metric, and review within 30 days.</p><small>{item.impact} impact</small></div>)}</aside></div>
      </section>}

      {page === "reports" && <section className="page report-page">
        <PageHeader eyebrow="MANAGEMENT REPORTING" title="Operating report" description="An owner-ready report from the latest saved statements." right={<div className="header-actions"><button className="ghost" onClick={exportCsv}>Export KPI CSV</button><button className="primary" onClick={() => window.print()}>Print / Save PDF</button></div>} />
        <article className="report"><div className="report-title"><div><span>CASHFLO OPERATING REPORT</span><h2>{dataset.businessName}</h2><p>{kpis.granularity} analysis / {dataset.periodLabel}</p></div><div><small>Prepared</small><b>{new Date().toLocaleDateString()}</b></div></div><div className="report-summary">The business generated {money(kpis.revenue)} in revenue, {money(kpis.netIncome)} in net income, and {money(kpis.freeCashFlow)} in free cash flow. It holds {money(kpis.cash)} in cash, with debt to equity of {multiple(kpis.debtToEquity)} and estimated days cash on hand of {days(kpis.daysCashOnHand)}. The leading management issue is {insights[0]?.title.toLowerCase()}.</div><h3>Financial scorecard</h3><div className="report-table"><div className="report-row"><span>Metric</span><span>Result</span><span>Purpose</span></div>{[
          ["Revenue", money(kpis.revenue), "Scale"], ["Gross margin", percent(kpis.grossMargin), "Unit economics"], ["Operating margin", percent(kpis.operatingMargin), "Core profitability"], ["Free cash flow", money(kpis.freeCashFlow), "Spend capacity"], ["Cash on hand", money(kpis.cash), "Liquidity"], ["Days cash on hand", days(kpis.daysCashOnHand), "Reserve coverage"], ["Current ratio", multiple(kpis.currentRatio), "Near-term coverage"], ["Debt to equity", multiple(kpis.debtToEquity), "Leverage"], ["Working capital", money(kpis.workingCapital), "Operating liquidity"], ["Cash conversion cycle", days(kpis.cashConversionCycle), "Working-capital speed"],
        ].map((row) => <div className="report-row" key={row[0]}>{row.map((value) => <span key={value}>{value}</span>)}</div>)}</div><h3>Operating assessment</h3>{insights.map((item) => <p className="report-paragraph" key={item.title}><b>{item.title}:</b> {item.detail}</p>)}<h3>Management actions</h3><ol>{insights.map((item) => <li key={item.title}><b>{item.recommendation}</b></li>)}</ol><p className="report-disclaimer">For management planning only. CashFlo is not a substitute for professional accounting, tax, legal, lending, or investment advice.</p></article>
      </section>}

      {page === "history" && <section className="page"><PageHeader eyebrow="FINANCIAL HISTORY" title="Saved statement analyses" description={`Review periods stored inside ${activeCompany.name}.`} right={<button className="primary" onClick={() => navigate("upload")}>Add new period</button>} />{companyStatus && <div className="notice">{companyStatus}</div>}<div className="history-list">{history.length ? history.map((item) => <article key={item.id}><div><span>{item.granularity}</span><h3>{item.business_name}</h3><p>{item.period_label || "Unlabeled period"}</p></div><div><small>Saved {new Date(item.created_at).toLocaleDateString()}</small><button className="ghost" disabled={working} onClick={() => void loadSnapshot(item)}>Open analysis</button></div></article>) : <div className="empty-state"><h3>No saved uploads yet</h3><p>Upload your three financial statements to start a private operating history.</p><button className="primary" onClick={() => navigate("upload")}>Upload statements</button></div>}</div></section>}
      {page === "companies" && <section className="page"><PageHeader eyebrow="COMPANY WORKSPACES" title="Companies and access" description="Each company has isolated financial history, mapping profiles, reports, and AI analysis." right={<span className="avatar">{initials}</span>} /><div className="company-layout"><div className="company-list"><h2>Your companies</h2>{companies.map((company) => <article className={company.id === activeCompany.id ? "active" : ""} key={company.id}><div><span>{company.role.toUpperCase()}</span><h3>{company.name}</h3><p>{company.currency}{company.fiscal_year_end ? ` / fiscal year ends ${company.fiscal_year_end}` : " / fiscal year end not set"}</p></div>{company.id === activeCompany.id ? <b>Current workspace</b> : <button className="ghost" disabled={working} onClick={() => void switchCompany(company.id)}>Open company</button>}</article>)}</div><form className="company-create" onSubmit={createWorkspace}><span>NEW COMPANY</span><h2>Create an isolated workspace</h2><p>Use a separate workspace for every legal entity or independently managed business.</p><label>Company name<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={120} required /></label><label>Reporting currency<select value={companyCurrency} onChange={(event) => setCompanyCurrency(event.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option><option>AUD</option></select></label>{companyStatus && <div className="notice">{companyStatus}</div>}<button className="primary" disabled={working || !companyName.trim()}>{working ? "Creating..." : "Create company workspace"}</button><small>Membership and authorization are checked on the server for every company-scoped request.</small></form></div></section>}
      {page === "ai-cfo" && <AiCfo dataset={dataset} messages={messages} ask={ask} asking={asking} deepReasoning={deepReasoning} setDeepReasoning={setDeepReasoning} />}
    </main>
  </div>;
}

function PageHeader({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: React.ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="header-right">{right}</div></header>;
}
function PanelHead({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return <div className="panel-head"><div><span>{eyebrow}</span><h3>{title}</h3></div>{right}</div>;
}
function Kpi({ label, badge, value, note, onAudit }: { label: string; badge: string; value: string; note: string; onAudit?: () => void }) {
  return <article className="kpi"><div><span>{label}</span><i>{badge}</i></div><b>{value}</b><small>{note}</small>{onAudit && <button className="audit-link" onClick={onAudit}>How calculated</button>}</article>;
}
function MetricTile({ label, value, note, onAudit }: { label: string; value: string; note: string; onAudit?: () => void }) {
  return <div className="operating-metric"><span>{label}</span><b>{value}</b><small>{note}</small>{onAudit && <button className="audit-link" onClick={onAudit}>View formula</button>}</div>;
}
function Brief({ item }: { item: OperatingInsight }) {
  return <div className={`brief-item ${item.severity === "high" ? "bad" : item.severity === "medium" ? "warn" : "good"}`}><i>{item.severity === "high" ? "!" : item.severity === "medium" ? ">" : "+"}</i><div><b>{item.title}</b><p>{item.detail}</p></div></div>;
}
function Bridge({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className={className}><small>{label}</small><b>{value}</b></div>;
}
function InfoCard({ title, text }: { title: string; text: string }) {
  return <div><b>{title}</b><p>{text}</p></div>;
}

function MappingPanel({ review, overrides, setOverrides }: { review: MappingReview; overrides: Record<string, string>; setOverrides: (mappings: Record<string, string>) => void }) {
  const assignments = [...review.assignments].sort((a, b) => Number(b.required) - Number(a.required) || a.statement.localeCompare(b.statement) || a.metricLabel.localeCompare(b.metricLabel));
  const mapped = assignments.filter((assignment) => assignment.sourceLabel).length;
  const requiredMissing = assignments.filter((assignment) => assignment.required && !assignment.sourceLabel).length;
  function change(key: string, value: string, automatic: string | null) {
    const next = { ...overrides };
    if (value === (automatic ?? "")) delete next[key];
    else next[key] = value;
    setOverrides(next);
  }
  return <section className="mapping-review">
    <header><div><span>ACCOUNT MAPPING REVIEW</span><h3>Confirm how statement rows feed the financial model</h3><p>{mapped} accounts mapped. {requiredMissing ? `${requiredMissing} required account${requiredMissing === 1 ? " is" : "s are"} missing.` : "All required accounts are mapped."}</p></div><div className={requiredMissing ? "mapping-badge missing" : "mapping-badge"}>{requiredMissing ? "REVIEW REQUIRED" : "READY"}</div></header>
    <div className="sheet-mapping">{(["income", "balance", "cashflow"] as const).map((statement) => <label key={statement}><span>{statement === "income" ? "Income statement sheet" : statement === "balance" ? "Balance-sheet sheet" : "Cash-flow sheet"}</span><select value={overrides[`sheet:${statement}`] ?? review.selectedSheets[statement]} onChange={(event) => setOverrides({ ...overrides, [`sheet:${statement}`]: event.target.value })}>{Array.from(new Set([review.selectedSheets[statement], ...review.statementCandidates[statement]])).map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label>)}</div>
    <div className="mapping-table"><div className="mapping-row mapping-head"><span>Financial metric</span><span>Statement</span><span>Source account</span><span>Status</span></div>{assignments.map((assignment) => {
      const key = `${assignment.statement}:${assignment.metric}`;
      const automatic = review.overrides[key] ? null : assignment.sourceLabel;
      const selected = overrides[key] ?? assignment.sourceLabel ?? "__ignore__";
      const candidates = review.candidates.filter((candidate) => candidate.statement === assignment.statement);
      return <div className={`mapping-row ${assignment.required ? "required" : ""}`} key={key}><span><b>{assignment.metricLabel}</b>{assignment.required && <small>Required</small>}</span><span>{assignment.statement === "income" ? "Income statement" : assignment.statement === "balance" ? "Balance sheet" : "Cash flow"}</span><label><select aria-label={`Source account for ${assignment.metricLabel}`} value={selected} onChange={(event) => change(key, event.target.value, automatic)}><option value="__ignore__">Not mapped</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.label}>{candidate.label} ({candidate.rowReference}{candidate.sampleValue === null ? "" : `; sample ${candidate.sampleValue.toLocaleString()}`})</option>)}</select></label><span><i className={overrides[key] ? "manual" : assignment.confidence}>{overrides[key] ? overrides[key] === "__ignore__" ? "ignored" : "manual" : assignment.confidence}</i></span></div>;
    })}</div>
  </section>;
}

function ValidationPanel({ summary, compact = false }: { summary: ValidationSummary; compact?: boolean }) {
  const heading = summary.errorCount ? "Corrections required before saving" : summary.notRunCount ? "Validation completed with checks not run" : summary.warningCount ? "Validation completed with review items" : "Financial validation passed";
  return <section className={`validation-panel ${compact ? "compact" : ""}`}>
    <header><div><span>VALIDATION RESULTS{summary.validationVersion ? ` / V${summary.validationVersion}` : ""}</span><h3>{heading}</h3></div><div className="validation-counts"><b className="pass">{summary.passCount} passed</b><b className="warning">{summary.warningCount} warnings</b><b className="error">{summary.errorCount} errors</b><b className="not_run">{summary.notRunCount ?? 0} not run</b></div></header>
    <div className="validation-checks">{summary.checks.map((check) => <article className={check.severity} key={check.id}><i>{check.severity === "pass" ? "\u2713" : check.severity === "warning" ? "!" : check.severity === "error" ? "\u00d7" : "\u2014"}</i><div><small className="validation-stage">{check.stage?.toUpperCase() ?? "VALIDATION"}</small><b>{check.label}</b><p>{check.message}</p>{check.difference !== undefined && <small>Difference: {check.difference.toLocaleString(undefined, { maximumFractionDigits: 2 })} / tolerance: {check.tolerance?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</small>}</div></article>)}</div>
  </section>;
}

function rawNumber(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function CalculationDetail({ trace }: { trace: CalculationTrace }) {
  const sources = trace.inputs.flatMap((input) => input.sources ?? []);
  return <article className="calculation-detail">
    <header><div><span>{trace.status.toUpperCase()}</span><h2>{trace.label}</h2></div><b>{rawNumber(trace.value)}</b></header>
    <div className="formula-block"><small>FORMULA</small><code>{trace.formula}</code><p>{trace.formulaId} / version {trace.formulaVersion}</p></div>
    {trace.note && <div className="calculation-note">{trace.note}</div>}
    <h3>Raw inputs</h3>
    <div className="calculation-inputs">{trace.inputs.length ? trace.inputs.map((input) => <div key={input.name}><span>{input.label}</span><b>{rawNumber(input.value)}</b></div>) : <p>No numeric inputs are required for this calculation.</p>}</div>
    <h3>Statement sources</h3>
    {sources.length ? <div className="source-list">{sources.slice(0, 14).map((source, index) => <div key={`${source.sheet}-${source.cell}-${index}`}><code>{source.sheet}!{source.cell}</code><span>{source.label}</span><small>{source.period}{source.rawValue !== undefined ? ` / raw ${source.rawValue.toLocaleString()}` : ""}{source.scale && source.scale !== 1 ? ` x ${source.scale.toLocaleString()}` : ""}</small></div>)}{sources.length > 14 && <p>Plus {sources.length - 14} additional period cells.</p>}</div> : <p className="no-sources">This value is derived from other calculated metrics or its source was not available in a legacy dataset.</p>}
  </article>;
}

function AuditPage({ dataset, selectedMetric, setSelectedMetric, navigateUpload }: {
  dataset: NormalizedDataset;
  selectedMetric: string | null;
  setSelectedMetric: (metric: string) => void;
  navigateUpload: () => void;
}) {
  const calculations = Object.values(dataset.calculations ?? {}).sort((a, b) => a.label.localeCompare(b.label));
  const selected = dataset.calculations?.[selectedMetric ?? ""] ?? calculations.find((trace) => trace.metric === "debtToEquity") ?? calculations[0];
  return <section className="page">
    <PageHeader eyebrow="DATA AUDIT" title="Reconciliations and calculation trail" description="Verify every financial check, formula, raw input, fallback, and spreadsheet source." right={<span className="period-pill">Formula {dataset.formulaVersion ?? "legacy"}</span>} />
    {!dataset.validation || !calculations.length ? <div className="empty-state"><h3>This saved analysis predates audit trails</h3><p>Upload the statements again to produce source-cell references, reconciliation checks, and versioned formula records.</p><button className="primary" onClick={navigateUpload}>Upload statements again</button></div> : <>
      {dataset.statementMetadata && <div className="statement-metadata">{Object.entries(dataset.statementMetadata).map(([statement, metadata]) => <article key={statement}><span>{statement === "income" ? "INCOME STATEMENT" : statement === "balance" ? "BALANCE SHEET" : "CASH FLOW"}</span><b>{metadata.sheet}</b><p>{metadata.currency ?? "Currency unconfirmed"} / {metadata.scale === 1_000_000 ? "millions" : metadata.scale === 1_000 ? "thousands" : "base units"}{metadata.scaleConfirmed === false ? " (assumed)" : ""}</p><small>{metadata.periodEnd ? `Period end ${metadata.periodEnd}` : `${metadata.granularity}; date unconfirmed`} / labels in column {metadata.labelColumnName ?? "A"}</small></article>)}</div>}
      <ValidationPanel summary={dataset.validation} />
      <div className="audit-layout"><aside className="calculation-index"><span>CALCULATIONS</span><p>{calculations.filter((trace) => trace.status !== "unavailable").length} metrics are reproducible from the saved inputs.</p>{calculations.map((trace) => <button className={selected?.metric === trace.metric ? "active" : ""} key={trace.metric} onClick={() => setSelectedMetric(trace.metric)}><span>{trace.label}</span><i className={trace.status}>{trace.status}</i></button>)}</aside>{selected && <CalculationDetail trace={selected} />}</div>
    </>}
  </section>;
}

function AiCfo({ dataset, messages, ask, asking, deepReasoning, setDeepReasoning }: {
  dataset: NormalizedDataset;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  ask: (question: string) => Promise<void>;
  asking: boolean;
  deepReasoning: boolean;
  setDeepReasoning: (value: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const kpis = dataset.kpis;
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = question;
    setQuestion("");
    void ask(next);
  }
  const context = [
    ["Revenue", money(kpis.revenue, true)], ["Operating margin", percent(kpis.operatingMargin)], ["Free cash flow", money(kpis.freeCashFlow, true)],
    ["Cash on hand", money(kpis.cash, true)], ["Days cash", days(kpis.daysCashOnHand)], ["Debt / equity", multiple(kpis.debtToEquity)],
    ["Working capital", money(kpis.workingCapital, true)], ["Quick ratio", multiple(kpis.quickRatio)], ["Cash cycle", days(kpis.cashConversionCycle)],
  ];
  return <section className="page">
    <PageHeader eyebrow="AI CFO" title="Reason through any financial decision" description="Ask open-ended questions, compare scenarios, test assumptions, and explore trade-offs using your latest statements." right={<em className="ai-chip">GPT-5.6 Sol</em>} />
    <div className="reasoning-control"><div><b>Reasoning level</b><span>Standard is faster. Deep analysis uses more model work for complex, high-value decisions.</span></div><div className="reasoning-options"><button className={!deepReasoning ? "active" : ""} onClick={() => setDeepReasoning(false)}>Standard</button><button className={deepReasoning ? "active" : ""} onClick={() => setDeepReasoning(true)}>Deep analysis</button></div></div>
    <div className="cfo-layout">
      <div className="chat-panel">
        <div className="chat-messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><b>{message.role === "assistant" ? "CashFlo AI CFO" : "You"}</b><p>{message.text}</p></div>)}</div>
        <div className="suggestions"><span>Examples, not limits:</span>{[
          "Should I finance new equipment or preserve cash?",
          "Model the risks of hiring before revenue grows.",
          "What could make this business run out of cash?",
          "Where is working capital getting trapped?",
        ].map((prompt) => <button disabled={asking} key={prompt} onClick={() => void ask(prompt)}>{prompt}</button>)}</div>
        <form onSubmit={submit}><textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a complex question about pricing, hiring, financing, growth, margins, cash, or operational trade-offs..." aria-label="Question for AI CFO" /><button disabled={asking || !question.trim()}>{asking ? "Analyzing..." : deepReasoning ? "Run deep analysis" : "Ask AI CFO"}</button></form>
      </div>
      <aside className="context-panel"><span>ANALYSIS CONTEXT</span><h3>{dataset.businessName}</h3>{context.map(([label, value]) => <div className="context-metric" key={label}><span>{label}</span><b>{value}</b></div>)}<p>Answers use normalized financial metrics and the conversation, not raw workbook files. Material decisions should be verified with the appropriate professional adviser.</p></aside>
    </div>
  </section>;
}
