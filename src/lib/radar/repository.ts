import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/lib/db";
import {
  applications,
  companies,
  jobActions,
  jobs,
  sourceListings,
  sources,
} from "@/lib/db/schema";

import type { ActionState, ApplicationStatus } from "./constants";
import { hasExplicitVisibilityFilter, postedAgeBounds, type RadarFilters } from "./filters";

export const RADAR_PAGE_SIZE = 20;

function buildConditions(filters: RadarFilters, now: Date) {
  const conditions: SQL[] = [];
  if (filters.eligibility) conditions.push(eq(jobs.eligibility, filters.eligibility));
  if (filters.roleFamily) conditions.push(eq(jobs.roleFamily, filters.roleFamily));
  if (filters.companyId) conditions.push(eq(jobs.companyId, filters.companyId));
  if (filters.remotePolicy) conditions.push(eq(jobs.remotePolicy, filters.remotePolicy));
  if (filters.status) conditions.push(eq(jobs.status, filters.status));
  if (filters.actionState === "new") {
    conditions.push(or(isNull(jobActions.id), eq(jobActions.state, "new"))!);
  } else if (filters.actionState) {
    conditions.push(eq(jobActions.state, filters.actionState));
  }
  if (filters.query) {
    conditions.push(or(ilike(jobs.title, `%${filters.query}%`), ilike(companies.name, `%${filters.query}%`))!);
  }
  if (filters.age) {
    const bounds = postedAgeBounds(filters.age, now);
    if (bounds.from) conditions.push(gte(jobs.postedAt, bounds.from));
    conditions.push(filters.age === "30+" ? lt(jobs.postedAt, bounds.to) : lte(jobs.postedAt, bounds.to));
  }
  if (filters.sourceId) {
    conditions.push(sql`exists (
      select 1 from ${sourceListings} sl
      where sl.job_id = ${jobs.id} and sl.source_id = ${filters.sourceId}
    )`);
  }
  if (!hasExplicitVisibilityFilter(filters)) {
    conditions.push(ne(jobs.eligibility, "ineligible"));
    conditions.push(or(isNull(jobActions.state), ne(jobActions.state, "dismissed"))!);
  }
  return conditions;
}

export async function listRadarJobs(filters: RadarFilters, options: { now?: Date; pageSize?: number } = {}) {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? RADAR_PAGE_SIZE;
  const conditions = buildConditions(filters, now);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(jobActions, eq(jobs.id, jobActions.jobId))
    .where(where);
  const pageCount = Math.max(1, Math.ceil(Number(total) / pageSize));
  const page = Math.min(filters.page, pageCount);

  const items = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      companyName: companies.name,
      locationText: jobs.locationText,
      remotePolicy: jobs.remotePolicy,
      roleFamily: jobs.roleFamily,
      eligibility: jobs.eligibility,
      eligibilityReason: jobs.eligibilityReason,
      status: jobs.status,
      postedAt: jobs.postedAt,
      firstSeenAt: jobs.firstSeenAt,
      actionState: jobActions.state,
      sourceName: sql<string | null>`(
        select s.name from ${sourceListings} sl
        join ${sources} s on s.id = sl.source_id
        where sl.job_id = ${jobs.id}
        order by sl.is_present desc, sl.first_seen_at asc
        limit 1
      )`,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(jobActions, eq(jobs.id, jobActions.jobId))
    .where(where)
    .orderBy(
      sql`case when ${jobActions.state} = 'saved' then 0 when ${jobs.eligibility} = 'eligible' then 1 when ${jobs.eligibility} = 'uncertain' then 2 else 3 end`,
      desc(jobs.firstSeenAt),
      desc(jobs.postedAt),
      asc(jobs.title),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items, total: Number(total), page, pageCount, pageSize };
}

export async function getRadarFacets() {
  const [companyRows, sourceRows, [counts]] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).innerJoin(jobs, eq(companies.id, jobs.companyId)).groupBy(companies.id).orderBy(asc(companies.name)),
    db.select({ id: sources.id, name: sources.name }).from(sources).innerJoin(sourceListings, eq(sources.id, sourceListings.sourceId)).groupBy(sources.id).orderBy(asc(sources.name)),
    db.select({
      all: count(),
      uncertain: sql<number>`count(*) filter (where ${jobs.eligibility} = 'uncertain')`.mapWith(Number),
      other: sql<number>`count(*) filter (where ${jobs.roleFamily} = 'other')`.mapWith(Number),
      saved: sql<number>`count(*) filter (where ${jobActions.state} = 'saved')`.mapWith(Number),
      untouched: sql<number>`count(*) filter (where ${jobActions.id} is null or ${jobActions.state} = 'new')`.mapWith(Number),
    }).from(jobs).leftJoin(jobActions, eq(jobs.id, jobActions.jobId)),
  ]);
  return { companies: companyRows, sources: sourceRows, counts: { ...counts, all: Number(counts.all) } };
}

export async function getJobDetail(id: string) {
  const [job] = await db
    .select({
      id: jobs.id, title: jobs.title, companyName: companies.name,
      locationText: jobs.locationText, countryCodes: jobs.countryCodes,
      remotePolicy: jobs.remotePolicy, roleFamily: jobs.roleFamily,
      eligibility: jobs.eligibility, eligibilityReason: jobs.eligibilityReason,
      status: jobs.status, description: jobs.description, canonicalUrl: jobs.canonicalUrl,
      postedAt: jobs.postedAt, firstSeenAt: jobs.firstSeenAt, lastSeenAt: jobs.lastSeenAt,
      actionState: jobActions.state, actionNotes: jobActions.notes,
      applicationId: applications.id, appliedAt: applications.appliedAt,
      applicationStatus: applications.status, cvVariant: applications.cvVariant,
      applicationNotes: applications.notes,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(jobActions, eq(jobs.id, jobActions.jobId))
    .leftJoin(applications, eq(jobs.id, applications.jobId))
    .where(eq(jobs.id, id)).limit(1);
  if (!job) return null;
  const listingSources = await db
    .select({ id: sources.id, name: sources.name, type: sources.type, url: sourceListings.sourceUrl, firstSeenAt: sourceListings.firstSeenAt, lastSeenAt: sourceListings.lastSeenAt, isPresent: sourceListings.isPresent })
    .from(sourceListings)
    .innerJoin(sources, eq(sourceListings.sourceId, sources.id))
    .where(eq(sourceListings.jobId, id))
    .orderBy(desc(sourceListings.isPresent), asc(sourceListings.firstSeenAt));
  return { ...job, sources: listingSources };
}

export async function listApplications(filters: { status?: ApplicationStatus; companyId?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(applications.status, filters.status));
  if (filters.companyId) conditions.push(eq(jobs.companyId, filters.companyId));
  return db.select({
    id: applications.id, jobId: jobs.id, title: jobs.title, companyId: companies.id,
    companyName: companies.name, appliedAt: applications.appliedAt, status: applications.status,
    cvVariant: applications.cvVariant, notes: applications.notes,
  }).from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(applications.appliedAt), asc(companies.name));
}

export async function setJobAction(jobId: string, state: ActionState) {
  const [existingJob] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!existingJob) throw new Error("Vaga não encontrada");
  await db.insert(jobActions).values({ jobId, state }).onConflictDoUpdate({
    target: jobActions.jobId,
    set: { state, updatedAt: new Date() },
  });
}

export async function saveJobNotes(jobId: string, notes: string | null) {
  await db.insert(jobActions).values({ jobId, state: "new", notes }).onConflictDoUpdate({
    target: jobActions.jobId,
    set: { notes, updatedAt: new Date() },
  });
}

export async function recordApplication(input: { jobId: string; appliedAt: Date; cvVariant: string | null; notes: string | null; status: ApplicationStatus }) {
  await db.transaction(async (tx) => {
    await tx.insert(applications).values(input).onConflictDoUpdate({
      target: applications.jobId,
      set: { appliedAt: input.appliedAt, cvVariant: input.cvVariant, notes: input.notes, status: input.status, updatedAt: new Date() },
    });
    await tx.insert(jobActions).values({ jobId: input.jobId, state: "applied" }).onConflictDoUpdate({
      target: jobActions.jobId,
      set: { state: "applied", updatedAt: new Date() },
    });
  });
}

export async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  await db.update(applications).set({ status, updatedAt: new Date() }).where(eq(applications.id, applicationId));
}

export async function deleteTestRadarRecords(jobIds: string[]) {
  if (!jobIds.length) return;
  await db.delete(applications).where(inArray(applications.jobId, jobIds));
  await db.delete(jobActions).where(inArray(jobActions.jobId, jobIds));
}
