import { NextResponse } from "next/server";
import { ensureWorkspace, latestSnapshot, saveSnapshot, snapshotById, snapshotHistory } from "../../../db/cashflo";
import { getAppUser } from "../../lib/user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspace = await ensureWorkspace(user);
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId") ?? workspace.activeCompany.id;
  const snapshotId = params.get("snapshotId");
  if (snapshotId) {
    const snapshot = await snapshotById(user.id, companyId, snapshotId);
    if (!snapshot) return NextResponse.json({ error: "Financial analysis not found." }, { status: 404 });
    return NextResponse.json({ snapshot: { id: snapshot.id, businessName: snapshot.business_name, periodLabel: snapshot.period_label, granularity: snapshot.granularity, normalized: JSON.parse(snapshot.normalized_json), createdAt: snapshot.created_at } });
  }
  const [latest, history] = await Promise.all([latestSnapshot(user.id, companyId), snapshotHistory(user.id, companyId)]);
  return NextResponse.json({
    latest: latest ? { id: latest.id, businessName: latest.business_name, periodLabel: latest.period_label, granularity: latest.granularity, normalized: JSON.parse(latest.normalized_json), createdAt: latest.created_at } : null,
    history,
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { companyId?: string; businessName?: string; periodLabel?: string; granularity?: string; normalized?: unknown; mappingProfileId?: string | null; fileMetadata?: unknown };
  if (!body.normalized || !body.businessName?.trim()) return NextResponse.json({ error: "Business name and normalized financial data are required." }, { status: 400 });
  const serialized = JSON.stringify(body.normalized);
  if (serialized.length > 750_000) return NextResponse.json({ error: "The normalized dataset is too large." }, { status: 413 });
  const workspace = await ensureWorkspace(user);
  const saved = await saveSnapshot(user, body.companyId ?? workspace.activeCompany.id, { businessName: body.businessName.trim().slice(0, 120), periodLabel: body.periodLabel?.slice(0, 100), granularity: body.granularity?.slice(0, 40), normalized: body.normalized, mappingProfileId: body.mappingProfileId, fileMetadata: body.fileMetadata });
  return NextResponse.json(saved, { status: 201 });
}
