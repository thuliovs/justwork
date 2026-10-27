import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { sourceListings, sources } from "@/lib/db/schema";

import { canonicalizeListing } from "./canonicalize";
import { classifyAndPersistJob } from "./classification";
import { parseStoredListing } from "./stored-listing";

export type BackfillSummary = {
  found: number;
  processed: number;
  jobsCreated: number;
  jobsMatched: number;
  skipped: number;
  failures: Array<{ listingId: string; error: string }>;
};

export async function backfillCanonicalJobs(options: { sourceIds?: string[] } = {}): Promise<BackfillSummary> {
  const pendingCondition = options.sourceIds?.length
    ? and(
        isNull(sourceListings.jobId),
        inArray(sourceListings.sourceId, options.sourceIds),
      )
    : isNull(sourceListings.jobId);
  const pending = await db
    .select({ listing: sourceListings, source: sources })
    .from(sourceListings)
    .innerJoin(sources, eq(sourceListings.sourceId, sources.id))
    .where(pendingCondition);

  const summary: BackfillSummary = {
    found: pending.length,
    processed: 0,
    jobsCreated: 0,
    jobsMatched: 0,
    skipped: 0,
    failures: [],
  };

  for (const { listing: row, source } of pending) {
    try {
      const listing = parseStoredListing(source.type, row.rawPayload);
      listing.sourceUrl = row.sourceUrl;
      listing.canonicalUrl = row.canonicalUrl ?? undefined;
      listing.postedAt = row.sourcePostedAt ?? listing.postedAt;
      listing.validThrough = row.sourceValidThrough ?? listing.validThrough;

      const outcome = await db.transaction(async (tx) => {
        const [fresh] = await tx
          .select()
          .from(sourceListings)
          .where(eq(sourceListings.id, row.id))
          .limit(1);
        if (!fresh || fresh.jobId) return "skipped" as const;

        const result = await canonicalizeListing(tx, source, listing, {
          id: fresh.id,
          jobId: fresh.jobId,
          firstSeenAt: fresh.firstSeenAt,
          lastSeenAt: fresh.lastSeenAt,
        });
        await tx
          .update(sourceListings)
          .set({ jobId: result.jobId, updatedAt: new Date() })
          .where(
            and(eq(sourceListings.id, fresh.id), isNull(sourceListings.jobId)),
          );
        await classifyAndPersistJob(tx, result.jobId);
        return result.outcome;
      });

      if (outcome === "skipped") summary.skipped += 1;
      else {
        summary.processed += 1;
        if (outcome === "created") summary.jobsCreated += 1;
        else summary.jobsMatched += 1;
      }
    } catch (error) {
      summary.failures.push({
        listingId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
