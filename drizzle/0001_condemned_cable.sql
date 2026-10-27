ALTER TABLE "jobs" ALTER COLUMN "company_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_canonical_url_idx" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "jobs_company_title_idx" ON "jobs" USING btree ("company_id","normalized_title");