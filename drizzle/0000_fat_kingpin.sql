CREATE TABLE `ai_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text,
	`user_email` text NOT NULL,
	`kind` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analyses_user_created_idx` ON `ai_analyses` (`user_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `financial_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`business_name` text NOT NULL,
	`period_label` text,
	`granularity` text,
	`normalized_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snapshots_user_created_idx` ON `financial_snapshots` (`user_email`,`created_at`);