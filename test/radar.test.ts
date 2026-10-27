import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, count, eq, inArray } from "drizzle-orm";

import { closeDatabase, db } from "../src/lib/db";
import {
  applications,
  companies,
  jobActions,
  jobs,
  sourceListings,
  sources,
} from "../src/lib/db/schema";
import { postedAgeBounds } from "../src/lib/radar/filters";
import {
  listRadarJobs,
  recordApplication,
  saveJobNotes,
  setJobAction,
  updateApplicationStatus,
} from "../src/lib/radar/repository";
import { sanitizeDescriptionHtml } from "../src/lib/radar/sanitize";

const baseFilters = { page: 1, includeAll: true } as const;

after(async () => {
  if (process.env.DATABASE_URL) await closeDatabase();
});

test("parses publication age without substituting first_seen_at", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.deepEqual(postedAgeBounds("0-3", now), {
    from: new Date("2026-10-22T12:00:00Z"),
    to: now,
  });
  assert.deepEqual(postedAgeBounds("30+", now), {
    to: new Date("2026-09-25T12:00:00Z"),
  });
});

test("sanitizes external HTML into inert readable text", () => {
  const dirty = '<h2>About</h2><p>Hello <strong>world</strong>.</p><script>alert("x")</script><a href="javascript:bad()">Apply</a>';
  const clean = sanitizeDescriptionHtml(dirty);
  assert.equal(clean, "About\n\nHello world.\nApply");
  assert.doesNotMatch(clean, /script|javascript|alert/iu);
  assert.doesNotMatch(clean, /<[^>]+>/u);
});

test(
  "lists canonical jobs, combines filters, sorts recency, and persists personal workflow",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const suffix = randomUUID();
    const token = `Radar${suffix.replaceAll("-", "")}`;
    const [company] = await db.insert(companies).values({
      name: `Radar Test ${suffix}`,
      normalizedName: `radar-test-${suffix}`,
    }).returning({ id: companies.id });
    const [sourceA, sourceB] = await db.insert(sources).values([
      { companyId: company.id, type: "greenhouse", name: `Radar A ${suffix}`, baseUrl: "https://example.test", externalKey: `a-${suffix}` },
      { companyId: company.id, type: "lever", name: `Radar B ${suffix}`, baseUrl: "https://example.test", externalKey: `b-${suffix}` },
    ]).returning({ id: sources.id });
    const now = new Date("2026-10-26T12:00:00Z");
    const created = await db.insert(jobs).values([
      { companyId: company.id, title: `${token} Backend Older`, normalizedTitle: `${token.toLowerCase()} backend older`, roleFamily: "backend", eligibility: "eligible", status: "active", postedAt: new Date("2026-10-24T12:00:00Z"), firstSeenAt: new Date("2026-10-20T12:00:00Z"), lastSeenAt: now },
      { companyId: company.id, title: `${token} Backend Newer`, normalizedTitle: `${token.toLowerCase()} backend newer`, roleFamily: "backend", eligibility: "eligible", status: "active", postedAt: new Date("2026-10-25T12:00:00Z"), firstSeenAt: new Date("2026-10-25T12:00:00Z"), lastSeenAt: now },
      { companyId: company.id, title: `${token} Other`, normalizedTitle: `${token.toLowerCase()} other`, roleFamily: "other", eligibility: "uncertain", status: "active", postedAt: null, firstSeenAt: new Date("2026-10-26T12:00:00Z"), lastSeenAt: now },
      { companyId: company.id, title: `${token} Frontend`, normalizedTitle: `${token.toLowerCase()} frontend`, roleFamily: "frontend", eligibility: "ineligible", status: "active", postedAt: new Date("2026-08-01T12:00:00Z"), firstSeenAt: new Date("2026-10-26T12:00:00Z"), lastSeenAt: now },
    ]).returning({ id: jobs.id });
    const [older, newer, unknownPosted, ineligible] = created;
    await db.insert(sourceListings).values([
      { sourceId: sourceA.id, jobId: older.id, externalId: `1-${suffix}`, sourceUrl: `https://example.test/${suffix}/1`, rawPayload: {}, contentHash: `1-${suffix}` },
      { sourceId: sourceB.id, jobId: older.id, externalId: `1b-${suffix}`, sourceUrl: `https://example.test/${suffix}/1b`, rawPayload: {}, contentHash: `1b-${suffix}` },
      { sourceId: sourceA.id, jobId: newer.id, externalId: `2-${suffix}`, sourceUrl: `https://example.test/${suffix}/2`, rawPayload: {}, contentHash: `2-${suffix}` },
      { sourceId: sourceA.id, jobId: unknownPosted.id, externalId: `3-${suffix}`, sourceUrl: `https://example.test/${suffix}/3`, rawPayload: {}, contentHash: `3-${suffix}` },
      { sourceId: sourceA.id, jobId: ineligible.id, externalId: `4-${suffix}`, sourceUrl: `https://example.test/${suffix}/4`, rawPayload: {}, contentHash: `4-${suffix}` },
    ]);

    try {
      const canonical = await listRadarJobs({ ...baseFilters, companyId: company.id }, { now, pageSize: 20 });
      assert.equal(canonical.total, 4, "two source listings must still render one canonical job");
      assert.equal(new Set(canonical.items.map((item) => item.id)).size, 4);

      const eligible = await listRadarJobs({ ...baseFilters, companyId: company.id, eligibility: "eligible" }, { now });
      assert.equal(eligible.total, 2);
      assert.deepEqual(eligible.items.map((item) => item.id), [newer.id, older.id], "same-priority jobs sort by discovery recency");

      const family = await listRadarJobs({ ...baseFilters, companyId: company.id, roleFamily: "other" }, { now });
      assert.deepEqual(family.items.map((item) => item.id), [unknownPosted.id]);

      const bySource = await listRadarJobs({ ...baseFilters, companyId: company.id, sourceId: sourceB.id }, { now });
      assert.deepEqual(bySource.items.map((item) => item.id), [older.id]);

      const combined = await listRadarJobs({ ...baseFilters, companyId: company.id, eligibility: "eligible", roleFamily: "backend", remotePolicy: undefined }, { now });
      assert.equal(combined.total, 2);

      const recent = await listRadarJobs({ ...baseFilters, companyId: company.id, age: "0-3" }, { now });
      assert.deepEqual(new Set(recent.items.map((item) => item.id)), new Set([older.id, newer.id]));
      assert.ok(!recent.items.some((item) => item.id === unknownPosted.id), "missing posted_at must not borrow first_seen_at");

      await setJobAction(older.id, "saved");
      let [action] = await db.select().from(jobActions).where(eq(jobActions.jobId, older.id));
      assert.equal(action.state, "saved");
      await setJobAction(older.id, "dismissed");
      [action] = await db.select().from(jobActions).where(eq(jobActions.jobId, older.id));
      assert.equal(action.state, "dismissed");
      const mainQueue = await listRadarJobs({ page: 1, includeAll: false, companyId: company.id }, { now });
      assert.ok(!mainQueue.items.some((item) => item.id === older.id));
      assert.ok(!mainQueue.items.some((item) => item.id === ineligible.id));
      await setJobAction(older.id, "new");
      await saveJobNotes(older.id, "Follow up next week");
      [action] = await db.select().from(jobActions).where(eq(jobActions.jobId, older.id));
      assert.equal(action.state, "new");
      assert.equal(action.notes, "Follow up next week");

      const appliedAt = new Date("2026-10-25T12:00:00Z");
      await recordApplication({ jobId: newer.id, appliedAt, status: "applied", cvVariant: "backend-v2", notes: "First record" });
      await recordApplication({ jobId: newer.id, appliedAt, status: "screening", cvVariant: "backend-v2", notes: "Updated record" });
      const [{ value: applicationCount }] = await db.select({ value: count() }).from(applications).where(eq(applications.jobId, newer.id));
      assert.equal(Number(applicationCount), 1, "repeated clicks must upsert instead of duplicate");
      const [application] = await db.select().from(applications).where(eq(applications.jobId, newer.id));
      assert.equal(application.status, "screening");
      await updateApplicationStatus(application.id, "interview");
      const [updatedApplication] = await db.select().from(applications).where(eq(applications.id, application.id));
      assert.equal(updatedApplication.status, "interview");

      await db.update(jobs).set({ lastSeenAt: new Date("2026-10-27T12:00:00Z") }).where(eq(jobs.id, older.id));
      const [preserved] = await db.select().from(jobActions).where(eq(jobActions.jobId, older.id));
      assert.equal(preserved.notes, "Follow up next week", "objective job refresh must preserve personal state");
    } finally {
      const jobIds = created.map((job) => job.id);
      await db.delete(applications).where(inArray(applications.jobId, jobIds));
      await db.delete(jobActions).where(inArray(jobActions.jobId, jobIds));
      await db.delete(sourceListings).where(inArray(sourceListings.jobId, jobIds));
      await db.delete(sources).where(and(eq(sources.companyId, company.id), inArray(sources.id, [sourceA.id, sourceB.id])));
      await db.delete(jobs).where(inArray(jobs.id, jobIds));
      await db.delete(companies).where(eq(companies.id, company.id));
    }
  },
);
