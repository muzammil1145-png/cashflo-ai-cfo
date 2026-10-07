CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`active_company_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uidx` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`fiscal_year_end` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_company_user_uidx` ON `company_memberships` (`company_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `company_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `mapping_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`mappings_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_profiles_company_name_uidx` ON `mapping_profiles` (`company_id`,`name`);--> statement-breakpoint
CREATE INDEX `mapping_profiles_company_idx` ON `mapping_profiles` (`company_id`);--> statement-breakpoint
ALTER TABLE `ai_analyses` ADD `company_id` text;--> statement-breakpoint
CREATE INDEX `analyses_company_created_idx` ON `ai_analyses` (`company_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `financial_snapshots` ADD `company_id` text;--> statement-breakpoint
ALTER TABLE `financial_snapshots` ADD `mapping_profile_id` text;--> statement-breakpoint
ALTER TABLE `financial_snapshots` ADD `file_metadata_json` text;--> statement-breakpoint
CREATE INDEX `snapshots_company_created_idx` ON `financial_snapshots` (`company_id`,`created_at`);