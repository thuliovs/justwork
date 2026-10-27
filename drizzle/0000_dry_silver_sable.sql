CREATE TYPE "public"."application_status" AS ENUM('applied', 'screening', 'interview', 'rejected', 'offer', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."eligibility" AS ENUM('eligible', 'uncertain', 'ineligible');--> statement-breakpoint
CREATE TYPE "public"."job_action_state" AS ENUM('new', 'saved', 'dismissed', 'applied');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'closed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."remote_policy" AS ENUM('remote', 'hybrid', 'onsite', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."role_family" AS ENUM('fullstack', 'backend', 'frontend', 'product_engineering', 'software_engineering', 'integration_implementation', 'applied_ai', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_run_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('greenhouse', 'lever', 'ashby', 'rss', 'personio', 'recruitee', 'teamtailor', 'pinpoint', 'remoteok', 'wwr', 'other');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "application_status" DEFAULT 'applied' NOT NULL,
	"cv_variant" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"website_url" text,
	"careers_url" text,
	"country" text,
	"is_target" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"state" "job_action_state" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"role_family" "role_family" DEFAULT 'other' NOT NULL,
	"description" text,
	"location_text" text,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"remote_policy" "remote_policy" DEFAULT 'unknown' NOT NULL,
	"eligibility" "eligibility" DEFAULT 'uncertain' NOT NULL,
	"eligibility_reason" text,
	"status" "job_status" DEFAULT 'unknown' NOT NULL,
	"canonical_url" text,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"job_id" uuid,
	"external_id" text,
	"source_url" text NOT NULL,
	"canonical_url" text,
	"raw_payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"source_posted_at" timestamp with time zone,
	"source_valid_through" timestamp with time zone,
	"raw_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_present" boolean DEFAULT true NOT NULL,
	"consecutive_misses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "source_run_status" DEFAULT 'running' NOT NULL,
	"records_found" integer DEFAULT 0 NOT NULL,
	"records_created" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"type" "source_type" NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"external_key" text,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_actions" ADD CONSTRAINT "job_actions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_listings" ADD CONSTRAINT "source_listings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_listings" ADD CONSTRAINT "source_listings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_id_uidx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_normalized_name_uidx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "job_actions_job_id_uidx" ON "job_actions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_status_last_seen_idx" ON "jobs" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "jobs_eligibility_idx" ON "jobs" USING btree ("eligibility");--> statement-breakpoint
CREATE UNIQUE INDEX "source_listings_source_external_id_uidx" ON "source_listings" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "source_listings_job_id_idx" ON "source_listings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "source_listings_last_seen_idx" ON "source_listings" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "source_runs_source_id_idx" ON "source_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_runs_started_at_idx" ON "source_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "sources_company_id_idx" ON "sources" USING btree ("company_id");