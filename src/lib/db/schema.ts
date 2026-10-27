import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const sourceTypeEnum = pgEnum("source_type", [
  "greenhouse",
  "lever",
  "ashby",
  "rss",
  "personio",
  "recruitee",
  "teamtailor",
  "pinpoint",
  "remoteok",
  "wwr",
  "other",
]);

export const sourceRunStatusEnum = pgEnum("source_run_status", [
  "running",
  "success",
  "partial",
  "failed",
]);

export const remotePolicyEnum = pgEnum("remote_policy", [
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);

export const eligibilityEnum = pgEnum("eligibility", [
  "eligible",
  "uncertain",
  "ineligible",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "active",
  "closed",
  "unknown",
]);

export const roleFamilyEnum = pgEnum("role_family", [
  "fullstack",
  "backend",
  "frontend",
  "product_engineering",
  "software_engineering",
  "integration_implementation",
  "applied_ai",
  "other",
]);

export const jobActionStateEnum = pgEnum("job_action_state", [
  "new",
  "saved",
  "dismissed",
  "applied",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "screening",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    websiteUrl: text("website_url"),
    careersUrl: text("careers_url"),
    country: text("country"),
    isTarget: boolean("is_target").default(false).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("companies_normalized_name_uidx").on(table.normalizedName)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    type: sourceTypeEnum("type").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    externalKey: text("external_key"),
    configJson: jsonb("config_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("sources_company_id_idx").on(table.companyId)],
);

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: sourceRunStatusEnum("status").default("running").notNull(),
    recordsFound: integer("records_found").default(0).notNull(),
    recordsCreated: integer("records_created").default(0).notNull(),
    recordsUpdated: integer("records_updated").default(0).notNull(),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("source_runs_source_id_idx").on(table.sourceId),
    index("source_runs_started_at_idx").on(table.startedAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    roleFamily: roleFamilyEnum("role_family").default("other").notNull(),
    description: text("description"),
    locationText: text("location_text"),
    countryCodes: text("country_codes")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    remotePolicy: remotePolicyEnum("remote_policy").default("unknown").notNull(),
    eligibility: eligibilityEnum("eligibility").default("uncertain").notNull(),
    eligibilityReason: text("eligibility_reason"),
    status: jobStatusEnum("status").default("unknown").notNull(),
    canonicalUrl: text("canonical_url"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("jobs_company_id_idx").on(table.companyId),
    index("jobs_canonical_url_idx").on(table.canonicalUrl),
    index("jobs_company_title_idx").on(table.companyId, table.normalizedTitle),
    index("jobs_status_last_seen_idx").on(table.status, table.lastSeenAt),
    index("jobs_eligibility_idx").on(table.eligibility),
  ],
);

export const sourceListings = pgTable(
  "source_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    externalId: text("external_id"),
    sourceUrl: text("source_url").notNull(),
    canonicalUrl: text("canonical_url"),
    rawPayload: jsonb("raw_payload").$type<unknown>().notNull(),
    contentHash: text("content_hash").notNull(),
    sourcePostedAt: timestamp("source_posted_at", { withTimezone: true }),
    sourceValidThrough: timestamp("source_valid_through", { withTimezone: true }),
    rawFetchedAt: timestamp("raw_fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isPresent: boolean("is_present").default(true).notNull(),
    consecutiveMisses: integer("consecutive_misses").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("source_listings_source_external_id_uidx").on(
      table.sourceId,
      table.externalId,
    ),
    index("source_listings_job_id_idx").on(table.jobId),
    index("source_listings_last_seen_idx").on(table.lastSeenAt),
  ],
);

export const jobActions = pgTable(
  "job_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    state: jobActionStateEnum("state").default("new").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [uniqueIndex("job_actions_job_id_uidx").on(table.jobId)],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    status: applicationStatusEnum("status").default("applied").notNull(),
    cvVariant: text("cv_variant"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("applications_job_id_uidx").on(table.jobId),
    index("applications_status_idx").on(table.status),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type Job = typeof jobs.$inferSelect;
