import { NextResponse } from "next/server";
import { createCompany, ensureWorkspace, selectCompany } from "../../../db/cashflo";
import { getAppUser } from "../../lib/user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json(await ensureWorkspace(user));
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { action?: "create" | "select"; companyId?: string; name?: string; currency?: string; fiscalYearEnd?: string | null };
  try {
    if (body.action === "select" && body.companyId) {
      await selectCompany(user, body.companyId);
      return NextResponse.json({ selected: body.companyId });
    }
    const name = body.name?.trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    const currency = /^[A-Z]{3}$/.test(body.currency ?? "") ? body.currency : "USD";
    return NextResponse.json(await createCompany(user, { name, currency, fiscalYearEnd: body.fiscalYearEnd?.slice(0, 10) ?? null }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Company operation failed." }, { status: 403 });
  }
}
