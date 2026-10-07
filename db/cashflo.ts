import { env } from "cloudflare:workers";

let initialized = false;

export type AppIdentity = { id: string; email: string; displayName: string };
export type CompanySummary = { id: string; name: string; currency: string; fiscal_year_end: string | null; role: string; created_at: string };
export type SnapshotHistoryRow = { id: string; business_name: string; period_label: string; granularity: string; created_at: string };
export type MappingProfileRow = { id: string; name: string; mappings_json: string; created_at: string; updated_at: string };
type FinancialSnapshotRow = SnapshotHistoryRow & { normalized_json: string };

function db(): D1Database {
  if (!env.DB) throw new Error("Financial storage is unavailable.");
  return env.DB;
}

export async function ensureCashFloSchema() {
  if (initialized) return;
  const d1 = db();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      active_company_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
      fiscal_year_end TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS company_memberships (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS memberships_company_user_uidx ON company_memberships (company_id, user_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS memberships_user_idx ON company_memberships (user_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS mapping_profiles (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL, mappings_json TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS mapping_profiles_company_name_uidx ON mapping_profiles (company_id, name)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS mapping_profiles_company_idx ON mapping_profiles (company_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS financial_snapshots (
      id TEXT PRIMARY KEY, user_email TEXT NOT NULL, company_id TEXT, mapping_profile_id TEXT,
      business_name TEXT NOT NULL, period_label TEXT, granularity TEXT, file_metadata_json TEXT,
      normalized_json TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS snapshots_user_created_idx ON financial_snapshots (user_email, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS snapshots_company_created_idx ON financial_snapshots (company_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS ai_analyses (
      id TEXT PRIMARY KEY, snapshot_id TEXT, user_email TEXT NOT NULL, company_id TEXT,
      kind TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS analyses_user_created_idx ON ai_analyses (user_email, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS analyses_company_created_idx ON ai_analyses (company_id, created_at)"),
  ]);
  initialized = true;
}

async function companiesForUser(userId: string) {
  const result = await db().prepare(`SELECT c.id, c.name, c.currency, c.fiscal_year_end, m.role, c.created_at
    FROM companies c JOIN company_memberships m ON m.company_id = c.id
    WHERE m.user_id = ? ORDER BY c.created_at ASC`).bind(userId).all<CompanySummary>();
  return result.results;
}

export async function ensureWorkspace(user: AppIdentity) {
  await ensureCashFloSchema();
  const now = new Date().toISOString();
  await db().prepare(`INSERT INTO app_users (id, email, display_name, active_company_id, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(user.id, user.email, user.displayName, now, now).run();

  let companies = await companiesForUser(user.id);
  if (!companies.length) {
    const legacy = await db().prepare("SELECT business_name FROM financial_snapshots WHERE user_email = ? ORDER BY created_at DESC LIMIT 1")
      .bind(user.email).first<{ business_name: string }>();
    const companyId = crypto.randomUUID();
    const companyName = legacy?.business_name?.trim() || "My Business";
    await db().batch([
      db().prepare("INSERT INTO companies (id, name, currency, fiscal_year_end, created_by, created_at, updated_at) VALUES (?, ?, 'USD', NULL, ?, ?, ?)")
        .bind(companyId, companyName, user.id, now, now),
      db().prepare("INSERT INTO company_memberships (id, company_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)")
        .bind(crypto.randomUUID(), companyId, user.id, now),
      db().prepare("UPDATE app_users SET active_company_id = ? WHERE id = ?").bind(companyId, user.id),
      db().prepare("UPDATE financial_snapshots SET company_id = ? WHERE user_email = ? AND company_id IS NULL").bind(companyId, user.email),
      db().prepare("UPDATE ai_analyses SET company_id = ? WHERE user_email = ? AND company_id IS NULL").bind(companyId, user.email),
    ]);
    companies = await companiesForUser(user.id);
  }

  const record = await db().prepare("SELECT active_company_id FROM app_users WHERE id = ?").bind(user.id).first<{ active_company_id: string | null }>();
  const active = companies.find((company) => company.id === record?.active_company_id) ?? companies[0];
  if (active.id !== record?.active_company_id) {
    await db().prepare("UPDATE app_users SET active_company_id = ?, updated_at = ? WHERE id = ?").bind(active.id, now, user.id).run();
  }
  return { activeCompany: active, companies };
}

async function requireMembership(userId: string, companyId: string) {
  const member = await db().prepare("SELECT role FROM company_memberships WHERE user_id = ? AND company_id = ?")
    .bind(userId, companyId).first<{ role: string }>();
  if (!member) throw new Error("Company access denied.");
  return member;
}

export async function createCompany(user: AppIdentity, input: { name: string; currency?: string; fiscalYearEnd?: string | null }) {
  await ensureWorkspace(user);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db().batch([
    db().prepare("INSERT INTO companies (id, name, currency, fiscal_year_end, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, input.name, input.currency ?? "USD", input.fiscalYearEnd ?? null, user.id, now, now),
    db().prepare("INSERT INTO company_memberships (id, company_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)")
      .bind(crypto.randomUUID(), id, user.id, now),
    db().prepare("UPDATE app_users SET active_company_id = ?, updated_at = ? WHERE id = ?").bind(id, now, user.id),
  ]);
  return { id, name: input.name, currency: input.currency ?? "USD", fiscal_year_end: input.fiscalYearEnd ?? null, role: "owner", created_at: now } satisfies CompanySummary;
}

export async function selectCompany(user: AppIdentity, companyId: string) {
  await ensureWorkspace(user);
  await requireMembership(user.id, companyId);
  await db().prepare("UPDATE app_users SET active_company_id = ?, updated_at = ? WHERE id = ?")
    .bind(companyId, new Date().toISOString(), user.id).run();
}

export async function latestSnapshot(userId: string, companyId: string) {
  await ensureCashFloSchema();
  await requireMembership(userId, companyId);
  return db().prepare(`SELECT id, business_name, period_label, granularity, normalized_json, created_at
    FROM financial_snapshots WHERE company_id = ? ORDER BY created_at DESC LIMIT 1`).bind(companyId).first<FinancialSnapshotRow>();
}

export async function snapshotHistory(userId: string, companyId: string) {
  await ensureCashFloSchema();
  await requireMembership(userId, companyId);
  const result = await db().prepare(`SELECT id, business_name, period_label, granularity, created_at
    FROM financial_snapshots WHERE company_id = ? ORDER BY created_at DESC LIMIT 50`).bind(companyId).all<SnapshotHistoryRow>();
  return result.results;
}

export async function snapshotById(userId: string, companyId: string, snapshotId: string) {
  await ensureCashFloSchema();
  await requireMembership(userId, companyId);
  return db().prepare(`SELECT id, business_name, period_label, granularity, normalized_json, created_at
    FROM financial_snapshots WHERE company_id = ? AND id = ? LIMIT 1`).bind(companyId, snapshotId).first<FinancialSnapshotRow>();
}

export async function saveSnapshot(user: AppIdentity, companyId: string, input: {
  businessName: string; periodLabel?: string; granularity?: string; normalized: unknown;
  mappingProfileId?: string | null; fileMetadata?: unknown;
}) {
  await ensureWorkspace(user);
  await requireMembership(user.id, companyId);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db().prepare(`INSERT INTO financial_snapshots
    (id, user_email, company_id, mapping_profile_id, business_name, period_label, granularity, file_metadata_json, normalized_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.email, companyId, input.mappingProfileId ?? null, input.businessName, input.periodLabel ?? null,
      input.granularity ?? null, input.fileMetadata ? JSON.stringify(input.fileMetadata) : null, JSON.stringify(input.normalized), createdAt).run();
  return { id, createdAt };
}

export async function mappingProfiles(userId: string, companyId: string) {
  await ensureCashFloSchema();
  await requireMembership(userId, companyId);
  const result = await db().prepare("SELECT id, name, mappings_json, created_at, updated_at FROM mapping_profiles WHERE company_id = ? ORDER BY updated_at DESC")
    .bind(companyId).all<MappingProfileRow>();
  return result.results;
}

export async function saveMappingProfile(userId: string, companyId: string, name: string, mappings: unknown) {
  await ensureCashFloSchema();
  await requireMembership(userId, companyId);
  const now = new Date().toISOString();
  const existing = await db().prepare("SELECT id, created_at FROM mapping_profiles WHERE company_id = ? AND name = ?")
    .bind(companyId, name).first<{ id: string; created_at: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  await db().prepare(`INSERT INTO mapping_profiles (id, company_id, name, mappings_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, name) DO UPDATE SET mappings_json = excluded.mappings_json, updated_at = excluded.updated_at`)
    .bind(id, companyId, name, JSON.stringify(mappings), userId, existing?.created_at ?? now, now).run();
  return { id, name, mappings, createdAt: existing?.created_at ?? now, updatedAt: now };
}

export async function deleteMappingProfile(userId: string, companyId: string, profileId: string) {
  await ensureCashFloSchema();
  const member = await requireMembership(userId, companyId);
  if (member.role !== "owner" && member.role !== "admin") throw new Error("Only an owner or admin can delete mapping profiles.");
  await db().prepare("DELETE FROM mapping_profiles WHERE id = ? AND company_id = ?").bind(profileId, companyId).run();
}

export async function saveAnalysis(user: AppIdentity, companyId: string, snapshotId: string | null, kind: string, result: unknown) {
  await ensureWorkspace(user);
  await requireMembership(user.id, companyId);
  await db().prepare(`INSERT INTO ai_analyses
    (id, snapshot_id, user_email, company_id, kind, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), snapshotId, user.email, companyId, kind, JSON.stringify(result), new Date().toISOString()).run();
}
