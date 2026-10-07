import { redirect } from "next/navigation";
import { ensureWorkspace, latestSnapshot, mappingProfiles, snapshotHistory } from "../../db/cashflo";
import { CashFloApp } from "../components/CashFloApp";
import { chatGPTSignInPath } from "../chatgpt-auth";
import { getAppUser } from "../lib/user";
import type { NormalizedDataset } from "../lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAppUser();
  if (!user) redirect(chatGPTSignInPath("/app"));
  const workspace = await ensureWorkspace(user);
  const [latest, history, profiles] = await Promise.all([
    latestSnapshot(user.id, workspace.activeCompany.id),
    snapshotHistory(user.id, workspace.activeCompany.id),
    mappingProfiles(user.id, workspace.activeCompany.id),
  ]);
  const initialData = latest ? JSON.parse(latest.normalized_json) as NormalizedDataset : null;
  return <CashFloApp user={{ displayName: user.displayName, email: user.email }} activeCompany={workspace.activeCompany} companies={workspace.companies} initialMappingProfiles={profiles.map((profile) => ({ ...profile, mappings: JSON.parse(profile.mappings_json) }))} initialData={initialData} initialSnapshotId={latest?.id ?? null} initialHistory={history} />;
}
