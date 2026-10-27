import { and, eq, or, sql } from "drizzle-orm";

import type { NormalizedJobListing } from "@/lib/connectors";
import { db } from "@/lib/db";
import { companies, jobs, type Source } from "@/lib/db/schema";

import { selectCanonicalMatch } from "./matching";
import {
  normalizeCompanyName,
  normalizeDate,
  normalizeDescription,
  normalizeDisplayText,
  normalizeTitle,
  normalizeUrl,
} from "./normalization";

export type CanonicalizationTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type ListingObservation = {
  id: string;
  jobId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type CanonicalizationResult = {
  jobId: string;
  outcome: "created" | "matched" | "preserved";
};

async function resolveCompanyId(
  tx: CanonicalizationTransaction,
  source: Source,
  listing: NormalizedJobListing,
) {
  if (source.companyId) return source.companyId;

  const name = normalizeDisplayText(listing.companyName);
  const normalizedName = normalizeCompanyName(name);
  if (!name || !normalizedName) return null;

  await tx
    .insert(companies)
    .values({ name, normalizedName })
    .onConflictDoNothing({ target: companies.normalizedName });
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.normalizedName, normalizedName))
    .limit(1);
  return company?.id ?? null;
}

function preferDescription(current: string | null, incoming: string | null) {
  if (!incoming) return current;
  if (!current || incoming.length > current.length) return incoming;
  return current;
}

function earlierDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left <= right ? left : right;
}

function laterDate(left: Date, right: Date) {
  return left >= right ? left : right;
}

async function updateCanonicalJob(
  tx: CanonicalizationTransaction,
  jobId: string,
  listing: NormalizedJobListing,
  observation: ListingObservation,
  canonicalUrl: string | null,
  description: string | null,
) {
  const [current] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!current) throw new Error(`Canonical job not found: ${jobId}`);

  const incomingLocation = normalizeDisplayText(listing.locationText);
  const nextDescription = preferDescription(current.description, description);
  const nextLocation = current.locationText ?? incomingLocation;
  const nextUrl = current.canonicalUrl ?? canonicalUrl;
  const nextPostedAt = earlierDate(current.postedAt, normalizeDate(listing.postedAt));
  const nextFirstSeenAt = earlierDate(current.firstSeenAt, observation.firstSeenAt)!;
  const nextLastSeenAt = laterDate(current.lastSeenAt, observation.lastSeenAt);
  const changed =
    nextDescription !== current.description ||
    nextLocation !== current.locationText ||
    nextUrl !== current.canonicalUrl ||
    nextPostedAt?.getTime() !== current.postedAt?.getTime() ||
    nextFirstSeenAt.getTime() !== current.firstSeenAt.getTime() ||
    nextLastSeenAt.getTime() !== current.lastSeenAt.getTime();

  if (changed) {
    await tx
      .update(jobs)
      .set({
        description: nextDescription,
        locationText: nextLocation,
        canonicalUrl: nextUrl,
        postedAt: nextPostedAt,
        firstSeenAt: nextFirstSeenAt,
        lastSeenAt: nextLastSeenAt,
        updatedAt: observation.lastSeenAt,
      })
      .where(eq(jobs.id, jobId));
  }
}

export async function canonicalizeListing(
  tx: CanonicalizationTransaction,
  source: Source,
  listing: NormalizedJobListing,
  observation: ListingObservation,
): Promise<CanonicalizationResult> {
  const title = normalizeDisplayText(listing.title);
  const normalizedTitle = normalizeTitle(title);
  if (!title || !normalizedTitle) throw new Error("Listing title cannot be empty");

  const companyId = await resolveCompanyId(tx, source, listing);
  const canonicalUrl = normalizeUrl(listing.canonicalUrl ?? listing.sourceUrl);
  const locationText = normalizeDisplayText(listing.locationText);
  const description = normalizeDescription(listing.description, {
    decodeHtml: source.type === "greenhouse",
  });

  const lockKey = companyId ?? canonicalUrl ?? observation.id;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`job:${lockKey}`}))`);

  if (observation.jobId) {
    await updateCanonicalJob(
      tx,
      observation.jobId,
      listing,
      observation,
      canonicalUrl,
      description,
    );
    return { jobId: observation.jobId, outcome: "preserved" };
  }

  const candidateCondition = companyId
    ? or(
        canonicalUrl ? eq(jobs.canonicalUrl, canonicalUrl) : undefined,
        and(eq(jobs.companyId, companyId), eq(jobs.normalizedTitle, normalizedTitle)),
      )
    : canonicalUrl
      ? eq(jobs.canonicalUrl, canonicalUrl)
      : undefined;
  const candidates = candidateCondition
    ? await tx.select().from(jobs).where(candidateCondition)
    : [];
  const matched = selectCanonicalMatch(
    {
      companyId,
      companyName: listing.companyName,
      title,
      locationText,
      canonicalUrl,
    },
    candidates,
  );

  if (matched) {
    await updateCanonicalJob(
      tx,
      matched.id,
      listing,
      observation,
      canonicalUrl,
      description,
    );
    return { jobId: matched.id, outcome: "matched" };
  }

  const [created] = await tx
    .insert(jobs)
    .values({
      companyId,
      title,
      normalizedTitle,
      description,
      locationText,
      remotePolicy: "unknown",
      eligibility: "uncertain",
      roleFamily: "other",
      status: "active",
      canonicalUrl,
      postedAt: normalizeDate(listing.postedAt),
      firstSeenAt: observation.firstSeenAt,
      lastSeenAt: observation.lastSeenAt,
      createdAt: observation.firstSeenAt,
      updatedAt: observation.lastSeenAt,
    })
    .returning({ id: jobs.id });

  return { jobId: created.id, outcome: "created" };
}
