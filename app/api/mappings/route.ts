import { NextResponse } from "next/server";
import { deleteMappingProfile, ensureWorkspace, mappingProfiles, saveMappingProfile } from "../../../db/cashflo";
import { getAppUser } from "../../lib/user";
import { sanitizeMappingProfile } from "../../lib/mapping-profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspace = await ensureWorkspace(user);
  const companyId = new URL(request.url).searchParams.get("companyId") ?? workspace.activeCompany.id;
  try {
    const profiles = await mappingProfiles(user.id, companyId);
    return NextResponse.json({ profiles: profiles.map((profile) => ({ ...profile, mappings: JSON.parse(profile.mappings_json) })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load mappings." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspace = await ensureWorkspace(user);
  const body = await request.json() as { companyId?: string; name?: string; mappings?: unknown };
  const name = body.name?.trim().slice(0, 80);
  if (!name || !body.mappings || typeof body.mappings !== "object") return NextResponse.json({ error: "Profile name and mappings are required." }, { status: 400 });
  try {
    const mappings = sanitizeMappingProfile(body.mappings);
    return NextResponse.json(await saveMappingProfile(user.id, body.companyId ?? workspace.activeCompany.id, name, mappings), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save mappings." }, { status: 403 });
  }
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const workspace = await ensureWorkspace(user);
  const body = await request.json() as { companyId?: string; profileId?: string };
  if (!body.profileId) return NextResponse.json({ error: "Profile id is required." }, { status: 400 });
  try {
    await deleteMappingProfile(user.id, body.companyId ?? workspace.activeCompany.id, body.profileId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete mappings." }, { status: 403 });
  }
}
