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
import { parseRadarFilters, postedAgeBounds } from "../src/lib/radar/filters";
import {
  listRadarJobs,
  getJobDetail,
  recordApplication,
  saveJobNotes,
  setJobAction,
  updateApplicationStatus,
} from "../src/lib/radar/repository";
import { formatCountryCodes } from "../src/lib/radar/presentation";
import { sanitizeDescriptionHtml } from "../src/lib/radar/sanitize";

const baseFilters = { page: 1, includeAll: true } as const;

after(async () => {
  if (process.env.DATABASE_URL) await closeDatabase();
});

test("parses publication age without substituting first_seen_at", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.deepEqual(postedAgeBounds("0-3", now), {
    afterExclusive: new Date("2026-10-22T12:00:00Z"),
    throughInclusive: now,
  });
  assert.deepEqual(postedAgeBounds("30+", now), {
    throughInclusive: new Date("2026-09-25T12:00:00Z"),
  });
});

test("formats known countries and preserves an explicit unknown state", () => {
  assert.equal(formatCountryCodes(["pt", "ES", "pt", " "]), "PT, ES");
  assert.equal(formatCountryCodes([]), "Não indicados");
});

test("parses combined URL filters without discarding explicit selections", () => {
  assert.deepEqual(parseRadarFilters({
    eligibility: "ineligible",
    action: "dismissed",
    mode: "remote",
    status: "active",
    age: "4-7",
    company: "company-id",
    source: "source-id",
    q: "backend",
    all: "1",
    page: "3",
  }), {
    eligibility: "ineligible",
    roleFamily: undefined,
    companyId: "company-id",
    remotePolicy: "remote",
    status: "active",
    actionState: "dismissed",
    age: "4-7",
    sourceId: "source-id",
    query: "backend",
    page: 3,
    includeAll: true,
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

type FixtureJob = {
  key: string;
  values?: Partial<typeof jobs.$inferInsert>;
  actionState?: "new" | "saved" | "dismissed" | "applied";
  sourceCount?: 1 | 2;
};

async function withRadarFixture<T>(
  fixtureJobs: FixtureJob[],
  run: (fixture: {
    companyId: string;
    companyName: string;
    ids: Record<string, string>;
    now: Date;
    sourceIds: [string, string];
    token: string;
  }) => Promise<T>,
) {
  const suffix = randomUUID();
  const token = `Focused${suffix.replaceAll("-", "")}`;
  const companyName = `Focused Radar ${suffix}`;
  const now = new Date("2026-10-26T12:00:00Z");
  const [company] = await db.insert(companies).values({
    name: companyName,
    normalizedName: `focused-radar-${suffix}`,
  }).returning({ id: companies.id });
  const createdSources = await db.insert(sources).values([
    { companyId: company.id, type: "greenhouse", name: `Focused A ${suffix}`, baseUrl: "https://example.test", externalKey: `focused-a-${suffix}` },
    { companyId: company.id, type: "lever", name: `Focused B ${suffix}`, baseUrl: "https://example.test", externalKey: `focused-b-${suffix}` },
  ]).returning({ id: sources.id });
  const createdJobs = await db.insert(jobs).values(fixtureJobs.map(({ key, values }) => ({
    companyId: company.id,
    title: `${token} ${key}`,
    normalizedTitle: `${token.toLowerCase()} ${key.toLowerCase()}`,
    eligibility: "uncertain" as const,
    status: "active" as const,
    firstSeenAt: now,
    lastSeenAt: now,
    ...values,
  }))).returning({ id: jobs.id });
  const ids = Object.fromEntries(fixtureJobs.map((job, index) => [job.key, createdJobs[index].id]));
  const listingRows = fixtureJobs.flatMap((job, index) => {
    const jobId = ids[job.key];
    const first = {
      sourceId: createdSources[0].id,
      jobId,
      externalId: `${suffix}-${index}-a`,
      sourceUrl: `https://example.test/${suffix}/${index}/a`,
      rawPayload: {},
      contentHash: `${suffix}-${index}-a`,
    };
    if (job.sourceCount !== 2) return [first];
    return [first, {
      ...first,
      sourceId: createdSources[1].id,
      externalId: `${suffix}-${index}-b`,
      sourceUrl: `https://example.test/${suffix}/${index}/b`,
      contentHash: `${suffix}-${index}-b`,
    }];
  });
  await db.insert(sourceListings).values(listingRows);
  const actionRows = fixtureJobs.flatMap((job) => job.actionState
    ? [{ jobId: ids[job.key], state: job.actionState }]
    : []);
  if (actionRows.length) await db.insert(jobActions).values(actionRows);

  try {
    return await run({
      companyId: company.id,
      companyName,
      ids,
      now,
      sourceIds: [createdSources[0].id, createdSources[1].id],
      token,
    });
  } finally {
    const jobIds = Object.values(ids);
    await db.delete(applications).where(inArray(applications.jobId, jobIds));
    await db.delete(jobActions).where(inArray(jobActions.jobId, jobIds));
    await db.delete(sourceListings).where(inArray(sourceListings.jobId, jobIds));
    await db.delete(sources).where(inArray(sources.id, createdSources.map((source) => source.id)));
    await db.delete(jobs).where(inArray(jobs.id, jobIds));
    await db.delete(companies).where(eq(companies.id, company.id));
  }
}

test(
  "keeps eligibility and personal-state visibility filters independent",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "eligible-visible", values: { eligibility: "eligible" } },
    { key: "eligible-saved", values: { eligibility: "eligible" }, actionState: "saved" },
    { key: "uncertain-dismissed", values: { eligibility: "uncertain" }, actionState: "dismissed" },
    { key: "ineligible-saved", values: { eligibility: "ineligible" }, actionState: "saved" },
    { key: "ineligible-dismissed", values: { eligibility: "ineligible" }, actionState: "dismissed" },
  ], async ({ companyId, ids, now }) => {
    const uncertain = await listRadarJobs({ page: 1, includeAll: false, companyId, eligibility: "uncertain" }, { now });
    assert.deepEqual(uncertain.items.map((job) => job.id), []);

    const ineligible = await listRadarJobs({ page: 1, includeAll: false, companyId, eligibility: "ineligible" }, { now });
    assert.deepEqual(ineligible.items.map((job) => job.id), [ids["ineligible-saved"]]);

    const saved = await listRadarJobs({ page: 1, includeAll: false, companyId, actionState: "saved" }, { now });
    assert.deepEqual(saved.items.map((job) => job.id), [ids["eligible-saved"]]);

    const dismissed = await listRadarJobs({ page: 1, includeAll: false, companyId, actionState: "dismissed" }, { now });
    assert.deepEqual(dismissed.items.map((job) => job.id), [ids["uncertain-dismissed"]]);
  }),
);

test(
  "include-all removes both default exclusions while preserving explicit filters",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "eligible", values: { eligibility: "eligible" } },
    { key: "uncertain-dismissed", values: { eligibility: "uncertain" }, actionState: "dismissed" },
    { key: "ineligible-saved", values: { eligibility: "ineligible" }, actionState: "saved" },
  ], async ({ companyId, ids, now }) => {
    const all = await listRadarJobs({ page: 1, includeAll: true, companyId }, { now });
    assert.equal(all.total, 3);

    const uncertain = await listRadarJobs({ page: 1, includeAll: true, companyId, eligibility: "uncertain" }, { now });
    assert.deepEqual(uncertain.items.map((job) => job.id), [ids["uncertain-dismissed"]]);

    const saved = await listRadarJobs({ page: 1, includeAll: true, companyId, actionState: "saved" }, { now });
    assert.deepEqual(saved.items.map((job) => job.id), [ids["ineligible-saved"]]);
  }),
);

test(
  "assigns every exact publication-age boundary to one bucket only",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const day = 86_400_000;
    const age = (days: number) => new Date(now.getTime() - days * day);
    const justBefore = (days: number) => new Date(age(days).getTime() + 1);
    await withRadarFixture([
      { key: "age-0", values: { postedAt: age(0) } },
      { key: "before-4", values: { postedAt: justBefore(4) } },
      { key: "age-4", values: { postedAt: age(4) } },
      { key: "before-8", values: { postedAt: justBefore(8) } },
      { key: "age-8", values: { postedAt: age(8) } },
      { key: "before-15", values: { postedAt: justBefore(15) } },
      { key: "age-15", values: { postedAt: age(15) } },
      { key: "before-31", values: { postedAt: justBefore(31) } },
      { key: "age-31", values: { postedAt: age(31) } },
      { key: "unknown", values: { postedAt: null } },
    ], async ({ companyId, ids }) => {
      const expected = {
        "0-3": [ids["age-0"], ids["before-4"]],
        "4-7": [ids["age-4"], ids["before-8"]],
        "8-14": [ids["age-8"], ids["before-15"]],
        "15-30": [ids["age-15"], ids["before-31"]],
        "30+": [ids["age-31"]],
      } as const;
      const observed = new Set<string>();
      for (const [bucket, expectedIds] of Object.entries(expected)) {
        const result = await listRadarJobs({ page: 1, includeAll: true, companyId, age: bucket as keyof typeof expected }, { now });
        assert.deepEqual(result.items.map((job) => job.id), expectedIds);
        assert.ok(!result.items.some((job) => job.id === ids.unknown));
        for (const job of result.items) assert.ok(!observed.has(job.id), `${bucket} overlaps another bucket`);
        result.items.forEach((job) => observed.add(job.id));
      }
    });
  },
);

test(
  "filters by work modality",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "remote", values: { remotePolicy: "remote" } },
    { key: "hybrid", values: { remotePolicy: "hybrid" } },
  ], async ({ companyId, ids, now }) => {
    const result = await listRadarJobs({ page: 1, includeAll: true, companyId, remotePolicy: "remote" }, { now });
    assert.deepEqual(result.items.map((job) => job.id), [ids.remote]);
  }),
);

test(
  "filters by objective status",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "active", values: { status: "active" } },
    { key: "closed", values: { status: "closed" } },
  ], async ({ companyId, ids, now }) => {
    const result = await listRadarJobs({ page: 1, includeAll: true, companyId, status: "closed" }, { now });
    assert.deepEqual(result.items.map((job) => job.id), [ids.closed]);
  }),
);

test(
  "searches case-insensitively by title and company",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "needle-role", values: { title: "Rare Needle Engineer", normalizedTitle: "rare needle engineer" } },
    { key: "other-role" },
  ], async ({ companyId, companyName, ids, now }) => {
    const byTitle = await listRadarJobs({ page: 1, includeAll: true, companyId, query: "NEEDLE" }, { now });
    assert.deepEqual(byTitle.items.map((job) => job.id), [ids["needle-role"]]);
    const byCompany = await listRadarJobs({ page: 1, includeAll: true, companyId, query: companyName.toLowerCase() }, { now });
    assert.equal(byCompany.total, 2);
  }),
);

test(
  "paginates canonical jobs on the server",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "one", values: { firstSeenAt: new Date("2026-10-26T10:00:00Z") } },
    { key: "two", values: { firstSeenAt: new Date("2026-10-26T09:00:00Z") } },
    { key: "three", values: { firstSeenAt: new Date("2026-10-26T08:00:00Z") } },
  ], async ({ companyId, now }) => {
    const firstPage = await listRadarJobs({ page: 1, includeAll: true, companyId }, { now, pageSize: 2 });
    const secondPage = await listRadarJobs({ page: 2, includeAll: true, companyId }, { now, pageSize: 2 });
    assert.equal(firstPage.total, 3);
    assert.equal(firstPage.pageCount, 2);
    assert.equal(firstPage.items.length, 2);
    assert.equal(secondPage.items.length, 1);
    assert.equal(new Set([...firstPage.items, ...secondPage.items].map((job) => job.id)).size, 3);
  }),
);

test(
  "orders saved, eligible, uncertain, and remaining jobs before recency tie-breaks",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "saved", values: { eligibility: "ineligible", firstSeenAt: new Date("2026-10-01T12:00:00Z") }, actionState: "saved" },
    { key: "eligible-new", values: { eligibility: "eligible", firstSeenAt: new Date("2026-10-25T12:00:00Z") } },
    { key: "eligible-old", values: { eligibility: "eligible", firstSeenAt: new Date("2026-10-20T12:00:00Z") } },
    { key: "uncertain-new", values: { eligibility: "uncertain", firstSeenAt: new Date("2026-10-26T12:00:00Z") } },
    { key: "uncertain-old", values: { eligibility: "uncertain", firstSeenAt: new Date("2026-10-19T12:00:00Z") } },
    { key: "remaining", values: { eligibility: "ineligible", firstSeenAt: new Date("2026-10-26T12:00:00Z") } },
  ], async ({ companyId, ids, now }) => {
    const result = await listRadarJobs({ page: 1, includeAll: true, companyId }, { now });
    assert.deepEqual(result.items.map((job) => job.id), [
      ids.saved,
      ids["eligible-new"],
      ids["eligible-old"],
      ids["uncertain-new"],
      ids["uncertain-old"],
      ids.remaining,
    ]);
  }),
);

test(
  "returns every associated source in canonical job detail",
  { skip: !process.env.DATABASE_URL },
  async () => withRadarFixture([
    { key: "multi-source", values: { countryCodes: ["PT", "ES"] }, sourceCount: 2 },
  ], async ({ ids }) => {
    const detail = await getJobDetail(ids["multi-source"]);
    assert.ok(detail);
    assert.equal(detail.sources.length, 2);
    assert.deepEqual(detail.countryCodes, ["PT", "ES"]);
    assert.ok(detail.sources.every((source) => source.url.startsWith("https://example.test/")));
  }),
);
