import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  activeCompanyId: text("active_company_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("users_email_uidx").on(table.email)]);

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  fiscalYearEnd: text("fiscal_year_end"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const companyMemberships = sqliteTable("company_memberships", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("memberships_company_user_uidx").on(table.companyId, table.userId),
  index("memberships_user_idx").on(table.userId),
]);

export const mappingProfiles = sqliteTable("mapping_profiles", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  mappingsJson: text("mappings_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("mapping_profiles_company_name_uidx").on(table.companyId, table.name),
  index("mapping_profiles_company_idx").on(table.companyId),
]);

export const financialSnapshots = sqliteTable("financial_snapshots", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  companyId: text("company_id"),
  mappingProfileId: text("mapping_profile_id"),
  businessName: text("business_name").notNull(),
  periodLabel: text("period_label"),
  granularity: text("granularity"),
  fileMetadataJson: text("file_metadata_json"),
  normalizedJson: text("normalized_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("snapshots_user_created_idx").on(table.userEmail, table.createdAt),
  index("snapshots_company_created_idx").on(table.companyId, table.createdAt),
]);

export const aiAnalyses = sqliteTable("ai_analyses", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id"),
  userEmail: text("user_email").notNull(),
  companyId: text("company_id"),
  kind: text("kind").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("analyses_user_created_idx").on(table.userEmail, table.createdAt),
  index("analyses_company_created_idx").on(table.companyId, table.createdAt),
]);
