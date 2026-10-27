import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, asc, eq, inArray } from "drizzle-orm";

import type {
  ConnectorResult,
  ConnectorSource,
  JobConnector,
  NormalizedJobListing,
} from "../src/lib/connectors/types";
import { closeDatabase, db } from "../src/lib/db";
import {
  applications,
  companies,
  jobActions,
  jobs,
  sourceListings,
  sourceRuns,
  sources,
} from "../src/lib/db/schema";
import { backfillCanonicalJobs } from "../src/lib/jobs/backfill";
import { reclassifyJobs } from "../src/lib/jobs/classification";
import { collectSource } from "../src/lib/sources/collect-source";
import { setSourceActive } from "../src/lib/sources/repository";
import {
  listingContentHash,
  stableExternalId,
} from "../src/lib/sources/listing-identity";

class FakeConnector implements JobConnector {
  readonly provider = "greenhouse" as const;

  constructor(
    private readonly implementation: (
      source: ConnectorSource,
    ) => Promise<ConnectorResult>,
  ) {}

  fetch(source: ConnectorSource) {
    return this.implementation(source);
  }
}

function listing(
  description: string,
  overrides: Partial<NormalizedJobListing> = {},
): NormalizedJobListing {
  return {
    externalId: "job-1",
    title: "Software Engineer",
    sourceUrl: "https://example.test/jobs/job-1",
    canonicalUrl: "https://example.test/jobs/job-1",
    description,
    postedAt: new Date("2026-10-01T10:00:00Z"),
    rawPayload: { id: "job-1", title: "Software Engineer", description },
    ...overrides,
  };
}

function successfulConnector(
  fetchedAt: Date,
  listings: NormalizedJobListing[],
  complete = true,
) {
  return new FakeConnector(async (source) => ({
    provider: "greenhouse",
    sourceId: source.id,
    requestUrl: "https://example.test/jobs",
    fetchedAt,
    complete,
    listings,
  }));
}

test("content hashes are deterministic and fallback IDs are stable", () => {
  const first = listing("same");
  const reordered: NormalizedJobListing = {
    ...first,
    rawPayload: {
      description: "same",
      title: "Software Engineer",
      id: "job-1",
    },
  };

  assert.equal(listingContentHash(first), listingContentHash(reordered));
  assert.notEqual(listingContentHash(first), listingContentHash(listing("changed")));

  const missingId = { ...first, externalId: " " };
  assert.equal(
    stableExternalId("source-1", missingId),
    stableExternalId("source-1", missingId),
  );
  assert.match(stableExternalId("source-1", missingId), /^fallback:[a-f0-9]{64}$/);
});

test(
  "persists observations idempotently and handles failures and absence conservatively",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const suffix = randomUUID();
    const normalizedName = `persistence-test-${suffix}`;
    const [company] = await db
      .insert(companies)
      .values({
        name: `Persistence Test ${suffix}`,
        normalizedName,
        country: "PT",
      })
      .returning({ id: companies.id });
    const [source] = await db
      .insert(sources)
      .values({
        companyId: company.id,
        type: "greenhouse",
        name: `Persistence Test ${suffix}`,
        baseUrl: "https://example.test",
        externalKey: `test-${suffix}`,
      })
      .returning();

    const firstObservedAt = new Date("2026-10-20T10:00:00Z");
    const secondObservedAt = new Date("2026-10-21T10:00:00Z");
    const changedObservedAt = new Date("2026-10-22T10:00:00Z");
    const partialObservedAt = new Date("2026-10-23T10:00:00Z");
    const absentObservedAt = new Date("2026-10-24T10:00:00Z");

    try {
      await db.insert(sourceRuns).values({
        sourceId: source.id,
        status: "running",
        startedAt: new Date("2099-01-01T00:00:00Z"),
      });
      const concurrent = await collectSource(source.id, {
        connector: successfulConnector(new Date("2099-01-01T00:00:01Z"), []),
        now: () => new Date("2099-01-01T00:00:01Z"),
      });
      assert.equal(concurrent.status, "skipped");
      assert.equal(concurrent.runId, null);
      await db.delete(sourceRuns).where(eq(sourceRuns.sourceId, source.id));

      await setSourceActive(source.id, false);
      const [disabled] = await db.select().from(sources).where(eq(sources.id, source.id));
      assert.equal(disabled.isActive, false);
      await setSourceActive(source.id, true);
      const [enabled] = await db.select().from(sources).where(eq(sources.id, source.id));
      assert.equal(enabled.isActive, true);

      const first = await collectSource(source.id, {
        connector: successfulConnector(firstObservedAt, [listing("version 1")]),
        now: () => firstObservedAt,
      });
      assert.equal(first.status, "success");
      assert.equal(first.created, 1);
      assert.equal(first.updated, 0);
      assert.equal(first.unchanged, 0);

      const [afterFirst] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, source.id));
      assert.ok(afterFirst.jobId);
      assert.equal(afterFirst.firstSeenAt.toISOString(), firstObservedAt.toISOString());
      assert.equal(afterFirst.lastSeenAt.toISOString(), firstObservedAt.toISOString());
      const firstHash = afterFirst.contentHash;
      const [canonicalAfterFirst] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, afterFirst.jobId));
      assert.equal(canonicalAfterFirst.status, "active");
      assert.equal(canonicalAfterFirst.roleFamily, "software_engineering");
      assert.equal(canonicalAfterFirst.eligibility, "uncertain");
      assert.ok(canonicalAfterFirst.eligibilityReason);
      assert.equal(canonicalAfterFirst.firstSeenAt.toISOString(), firstObservedAt.toISOString());
      assert.equal(canonicalAfterFirst.lastSeenAt.toISOString(), firstObservedAt.toISOString());

      await db.insert(jobActions).values({
        jobId: afterFirst.jobId,
        state: "saved",
        notes: "keep action",
      });
      await db.insert(applications).values({
        jobId: afterFirst.jobId,
        status: "applied",
        notes: "keep application",
      });

      const second = await collectSource(source.id, {
        connector: successfulConnector(secondObservedAt, [listing("version 1")]),
        now: () => secondObservedAt,
      });
      assert.equal(second.created, 0);
      assert.equal(second.updated, 0);
      assert.equal(second.unchanged, 1);

      const [afterSecond] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, source.id));
      assert.equal(afterSecond.firstSeenAt.toISOString(), firstObservedAt.toISOString());
      assert.equal(afterSecond.lastSeenAt.toISOString(), secondObservedAt.toISOString());
      assert.equal(afterSecond.contentHash, firstHash);
      assert.equal(afterSecond.jobId, afterFirst.jobId);
      const [canonicalAfterSecond] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, afterFirst.jobId));
      assert.equal(canonicalAfterSecond.firstSeenAt.toISOString(), firstObservedAt.toISOString());
      assert.equal(canonicalAfterSecond.lastSeenAt.toISOString(), secondObservedAt.toISOString());

      const changed = await collectSource(source.id, {
        connector: successfulConnector(changedObservedAt, [
          listing("version 2 with more detail"),
        ]),
        now: () => changedObservedAt,
      });
      assert.equal(changed.updated, 1);
      assert.equal(changed.unchanged, 0);

      const [afterChange] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, source.id));
      assert.equal(afterChange.firstSeenAt.toISOString(), firstObservedAt.toISOString());
      assert.equal(afterChange.lastSeenAt.toISOString(), changedObservedAt.toISOString());
      assert.notEqual(afterChange.contentHash, firstHash);
      assert.equal(afterChange.jobId, afterFirst.jobId);
      const [canonicalAfterChange] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, afterFirst.jobId));
      assert.equal(canonicalAfterChange.description, "version 2 with more detail");
      assert.equal(canonicalAfterChange.lastSeenAt.toISOString(), changedObservedAt.toISOString());

      const [secondSource] = await db
        .insert(sources)
        .values({
          companyId: company.id,
          type: "greenhouse",
          name: `Second Persistence Test ${suffix}`,
          baseUrl: "https://example.test",
          externalKey: `second-${suffix}`,
        })
        .returning();
      const crossSource = await collectSource(secondSource.id, {
        connector: successfulConnector(changedObservedAt, [
          listing("cross-source", { externalId: "other-external-id" }),
        ]),
        now: () => changedObservedAt,
      });
      assert.equal(crossSource.jobsCreated, 0);
      assert.equal(crossSource.jobsMatched, 1);
      const [crossSourceListing] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, secondSource.id));
      assert.equal(crossSourceListing.jobId, afterFirst.jobId);

      const partial = await collectSource(source.id, {
        connector: successfulConnector(partialObservedAt, [], false),
        now: () => partialObservedAt,
      });
      assert.equal(partial.status, "partial");
      assert.equal(partial.missing, 0);

      const [afterPartial] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, source.id));
      assert.equal(afterPartial.isPresent, true);
      assert.equal(afterPartial.consecutiveMisses, 0);

      const absent = await collectSource(source.id, {
        connector: successfulConnector(absentObservedAt, [], true),
        now: () => absentObservedAt,
      });
      assert.equal(absent.status, "success");
      assert.equal(absent.missing, 1);

      const [afterAbsence] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, source.id));
      assert.equal(afterAbsence.isPresent, false);
      assert.equal(afterAbsence.consecutiveMisses, 1);
      assert.equal(afterAbsence.lastSeenAt.toISOString(), changedObservedAt.toISOString());

      const failedAt = new Date("2026-10-25T10:00:00Z");
      const failed = await collectSource(source.id, {
        connector: new FakeConnector(async () => {
          throw new Error("fixture source unavailable");
        }),
        now: () => failedAt,
      });
      assert.equal(failed.status, "failed");
      assert.equal(failed.failures, 1);
      assert.match(failed.error ?? "", /fixture source unavailable/);

      const [afterFailure] = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.sourceId, source.id));
      assert.equal(afterFailure.isPresent, false);
      assert.equal(afterFailure.consecutiveMisses, 1);
      assert.equal(afterFailure.lastSeenAt.toISOString(), changedObservedAt.toISOString());

      const failedCanonicalization = await collectSource(source.id, {
        connector: successfulConnector(failedAt, [
          listing("invalid", {
            externalId: "job-invalid",
            title: "   ",
            sourceUrl: "https://example.test/jobs/job-invalid",
            canonicalUrl: "https://example.test/jobs/job-invalid",
          }),
        ]),
        now: () => failedAt,
      });
      assert.equal(failedCanonicalization.status, "failed");
      const invalidRows = await db
        .select()
        .from(sourceListings)
        .where(
          and(
            eq(sourceListings.sourceId, source.id),
            eq(sourceListings.externalId, "job-invalid"),
          ),
        );
      assert.equal(invalidRows.length, 0);

      const [backfillSource] = await db
        .insert(sources)
        .values({
          companyId: company.id,
          type: "greenhouse",
          name: `Backfill Test ${suffix}`,
          baseUrl: "https://example.test",
          externalKey: `backfill-${suffix}`,
        })
        .returning();
      const backfillRaw = {
        id: "backfill-1",
        title: "Unique Backfill Engineer",
        absolute_url: `https://example.test/jobs/backfill-${suffix}`,
        content: "Backfill description",
        location: { name: "Lisbon, Portugal" },
      };
      await db.insert(sourceListings).values({
        sourceId: backfillSource.id,
        externalId: "backfill-1",
        sourceUrl: backfillRaw.absolute_url,
        canonicalUrl: backfillRaw.absolute_url,
        rawPayload: backfillRaw,
        contentHash: "backfill-test",
        firstSeenAt: firstObservedAt,
        lastSeenAt: secondObservedAt,
      });
      const firstBackfill = await backfillCanonicalJobs({
        sourceIds: [backfillSource.id],
      });
      assert.equal(firstBackfill.found, 1);
      assert.equal(firstBackfill.processed, 1);
      assert.equal(firstBackfill.jobsCreated, 1);
      const secondBackfill = await backfillCanonicalJobs({
        sourceIds: [backfillSource.id],
      });
      assert.equal(secondBackfill.found, 0);
      assert.equal(secondBackfill.jobsCreated, 0);

      const forcedUpdatedAt = new Date("2026-10-19T10:00:00Z");
      await db
        .update(jobs)
        .set({
          roleFamily: "other",
          eligibility: "uncertain",
          eligibilityReason: null,
          remotePolicy: "unknown",
          updatedAt: forcedUpdatedAt,
        })
        .where(eq(jobs.id, afterFirst.jobId));
      const firstClassification = await reclassifyJobs({
        jobIds: [afterFirst.jobId],
      });
      assert.equal(firstClassification.updated, 1);
      const [afterFirstClassification] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, afterFirst.jobId));
      assert.equal(afterFirstClassification.roleFamily, "software_engineering");
      assert.ok(afterFirstClassification.eligibilityReason);

      const secondClassification = await reclassifyJobs({
        jobIds: [afterFirst.jobId],
      });
      assert.equal(secondClassification.updated, 0);
      assert.equal(secondClassification.unchanged, 1);
      const [afterSecondClassification] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, afterFirst.jobId));
      assert.equal(
        afterSecondClassification.updatedAt.toISOString(),
        afterFirstClassification.updatedAt.toISOString(),
      );

      const actionsAfter = await db
        .select()
        .from(jobActions)
        .where(eq(jobActions.jobId, afterFirst.jobId));
      const applicationsAfter = await db
        .select()
        .from(applications)
        .where(eq(applications.jobId, afterFirst.jobId));
      assert.equal(actionsAfter[0]?.notes, "keep action");
      assert.equal(applicationsAfter[0]?.notes, "keep application");

      const runs = await db
        .select()
        .from(sourceRuns)
        .where(eq(sourceRuns.sourceId, source.id))
        .orderBy(asc(sourceRuns.startedAt));
      assert.deepEqual(
        runs.map((run) => run.status),
        [
          "success",
          "success",
          "success",
          "partial",
          "success",
          "failed",
          "failed",
        ],
      );
      assert.deepEqual(
        runs.slice(0, 3).map((run) => [
          run.recordsFound,
          run.recordsCreated,
          run.recordsUpdated,
        ]),
        [
          [1, 1, 0],
          [1, 0, 0],
          [1, 0, 1],
        ],
      );
      assert.ok(
        runs.some((run) => run.errorMessage === "fixture source unavailable"),
      );
      assert.ok(
        runs.some((run) => run.errorMessage === "Listing title cannot be empty"),
      );
    } finally {
      const companyJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.companyId, company.id));
      const jobIds = companyJobs.map((job) => job.id);
      if (jobIds.length) {
        await db.delete(applications).where(inArray(applications.jobId, jobIds));
        await db.delete(jobActions).where(inArray(jobActions.jobId, jobIds));
      }
      await db.delete(sources).where(eq(sources.companyId, company.id));
      if (jobIds.length) await db.delete(jobs).where(inArray(jobs.id, jobIds));
      await db.delete(companies).where(eq(companies.id, company.id));
      await closeDatabase();
    }
  },
);
