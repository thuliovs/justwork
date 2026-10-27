import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";

import {
  getConnector,
  type ConnectorResult,
  type JobConnector,
} from "@/lib/connectors";
import { db } from "@/lib/db";
import {
  sourceListings,
  sourceRuns,
  sources,
  type Source,
} from "@/lib/db/schema";
import { canonicalizeListing } from "@/lib/jobs/canonicalize";
import { classifyAndPersistJob } from "@/lib/jobs/classification";

import { listingContentHash, stableExternalId } from "./listing-identity";

export type CollectionSummary = {
  runId: string | null;
  sourceId: string;
  sourceName: string;
  provider: Source["type"];
  status: "success" | "partial" | "failed" | "skipped";
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  failures: number;
  jobsCreated: number;
  jobsMatched: number;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  error?: string;
};

export const SOURCE_RUN_STALE_AFTER_MS = 2 * 60 * 60 * 1_000;

type CollectSourceOptions = {
  connector?: JobConnector;
  now?: () => Date;
};

type PreparedListing = {
  listing: ConnectorResult["listings"][number];
  externalId: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  rawPayload: unknown;
  contentHash: string;
  sourcePostedAt: Date | null;
  sourceValidThrough: Date | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function prepareListings(sourceId: string, result: ConnectorResult) {
  const unique = new Map<string, PreparedListing>();
  let duplicates = 0;

  for (const listing of result.listings) {
    const externalId = stableExternalId(sourceId, listing);
    if (unique.has(externalId)) duplicates += 1;

    unique.set(externalId, {
      listing,
      externalId,
      sourceUrl: listing.sourceUrl,
      canonicalUrl: listing.canonicalUrl ?? null,
      rawPayload: listing.rawPayload,
      contentHash: listingContentHash(listing),
      sourcePostedAt: listing.postedAt ?? null,
      sourceValidThrough: listing.validThrough ?? null,
    });
  }

  return { listings: [...unique.values()], duplicates };
}

async function persistResult(
  source: Source,
  runId: string,
  result: ConnectorResult,
  now: () => Date,
) {
  const prepared = prepareListings(source.id, result);
  const isComplete = result.complete && prepared.duplicates === 0;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${source.id}::text))`,
    );

    const existingRows = await tx
      .select({
        externalId: sourceListings.externalId,
        contentHash: sourceListings.contentHash,
      })
      .from(sourceListings)
      .where(eq(sourceListings.sourceId, source.id));
    const existing = new Map(
      existingRows
        .filter(
          (row): row is { externalId: string; contentHash: string } =>
            row.externalId !== null,
        )
        .map((row) => [row.externalId, row.contentHash]),
    );

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const listing of prepared.listings) {
      const previousHash = existing.get(listing.externalId);
      if (previousHash === undefined) created += 1;
      else if (previousHash !== listing.contentHash) updated += 1;
      else unchanged += 1;
    }

    if (prepared.listings.length > 0) {
      await tx
        .insert(sourceListings)
        .values(
          prepared.listings.map((listing) => ({
            sourceId: source.id,
            externalId: listing.externalId,
            sourceUrl: listing.sourceUrl,
            canonicalUrl: listing.canonicalUrl,
            rawPayload: listing.rawPayload,
            contentHash: listing.contentHash,
            sourcePostedAt: listing.sourcePostedAt,
            sourceValidThrough: listing.sourceValidThrough,
            rawFetchedAt: result.fetchedAt,
            firstSeenAt: result.fetchedAt,
            lastSeenAt: result.fetchedAt,
            isPresent: true,
            consecutiveMisses: 0,
          })),
        )
        .onConflictDoUpdate({
          target: [sourceListings.sourceId, sourceListings.externalId],
          set: {
            sourceUrl: sql`excluded.source_url`,
            canonicalUrl: sql`excluded.canonical_url`,
            rawPayload: sql`excluded.raw_payload`,
            contentHash: sql`excluded.content_hash`,
            sourcePostedAt: sql`excluded.source_posted_at`,
            sourceValidThrough: sql`excluded.source_valid_through`,
            rawFetchedAt: sql`excluded.raw_fetched_at`,
            lastSeenAt: sql`excluded.last_seen_at`,
            isPresent: true,
            consecutiveMisses: 0,
            updatedAt: result.fetchedAt,
          },
        });
    }

    let jobsCreated = 0;
    let jobsMatched = 0;
    if (prepared.listings.length > 0) {
      const persistedListings = await tx
        .select()
        .from(sourceListings)
        .where(
          and(
            eq(sourceListings.sourceId, source.id),
            inArray(
              sourceListings.externalId,
              prepared.listings.map((listing) => listing.externalId),
            ),
          ),
        );
      const byExternalId = new Map(
        persistedListings.map((listing) => [listing.externalId, listing]),
      );

      for (const preparedListing of prepared.listings) {
        const row = byExternalId.get(preparedListing.externalId);
        if (!row) {
          throw new Error(
            `Persisted listing not found: ${preparedListing.externalId}`,
          );
        }
        const canonical = await canonicalizeListing(
          tx,
          source,
          preparedListing.listing,
          {
            id: row.id,
            jobId: row.jobId,
            firstSeenAt: row.firstSeenAt,
            lastSeenAt: row.lastSeenAt,
          },
        );
        await tx
          .update(sourceListings)
          .set({ jobId: canonical.jobId })
          .where(eq(sourceListings.id, row.id));
        await classifyAndPersistJob(tx, canonical.jobId, result.fetchedAt);
        if (canonical.outcome === "created") jobsCreated += 1;
        else jobsMatched += 1;
      }
    }

    let missing = 0;
    if (isComplete) {
      const externalIds = prepared.listings.map((listing) => listing.externalId);
      const absenceCondition =
        externalIds.length > 0
          ? and(
              eq(sourceListings.sourceId, source.id),
              notInArray(sourceListings.externalId, externalIds),
            )
          : eq(sourceListings.sourceId, source.id);

      const missingRows = await tx
        .update(sourceListings)
        .set({
          isPresent: false,
          consecutiveMisses: sql`${sourceListings.consecutiveMisses} + 1`,
          updatedAt: result.fetchedAt,
        })
        .where(absenceCondition)
        .returning({ id: sourceListings.id });
      missing = missingRows.length;
    }

    const status = isComplete ? "success" : "partial";
    const partialError = prepared.duplicates
      ? `${prepared.duplicates} duplicate external ID(s) returned by connector`
      : !result.complete
        ? "Connector reported an incomplete result"
        : null;
    const finishedAt = now();

    await tx
      .update(sourceRuns)
      .set({
        finishedAt,
        status,
        recordsFound: result.listings.length,
        recordsCreated: created,
        recordsUpdated: updated,
        errorMessage: partialError,
      })
      .where(eq(sourceRuns.id, runId));

    if (status === "success") {
      await tx
        .update(sources)
        .set({ lastSuccessAt: finishedAt, updatedAt: finishedAt })
        .where(eq(sources.id, source.id));
    }

    return {
      status,
      found: result.listings.length,
      created,
      updated,
      unchanged,
      missing,
      failures: prepared.duplicates,
      jobsCreated,
      jobsMatched,
      finishedAt,
      error: partialError ?? undefined,
    } as const;
  });
}

export async function collectSource(
  sourceId: string,
  options: CollectSourceOptions = {},
): Promise<CollectionSummary> {
  const now = options.now ?? (() => new Date());
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const startedAt = now();
  const staleBefore = new Date(startedAt.getTime() - SOURCE_RUN_STALE_AFTER_MS);
  await db
    .update(sourceRuns)
    .set({
      finishedAt: startedAt,
      status: "failed",
      errorMessage: "Execução interrompida ou abandonada antes da conclusão.",
    })
    .where(
      and(
        eq(sourceRuns.sourceId, sourceId),
        eq(sourceRuns.status, "running"),
        lt(sourceRuns.startedAt, staleBefore),
      ),
    );
  const [run] = await db
    .insert(sourceRuns)
    .values({ sourceId, startedAt, status: "running" })
    .onConflictDoNothing()
    .returning({ id: sourceRuns.id });

  if (!run) {
    return {
      runId: null,
      sourceId,
      sourceName: source.name,
      provider: source.type,
      status: "skipped",
      found: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      missing: 0,
      failures: 0,
      jobsCreated: 0,
      jobsMatched: 0,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      error: "Esta fonte já possui uma coleta em andamento.",
    };
  }

  try {
    const connector = options.connector ?? getConnector(source.type);
    if (!connector) {
      throw new Error(`Connector not implemented for source type: ${source.type}`);
    }
    if (connector.provider !== source.type) {
      throw new Error(
        `Connector ${connector.provider} cannot collect source type ${source.type}`,
      );
    }

    const result = await connector.fetch(source);
    const persisted = await persistResult(source, run.id, result, now);
    const { finishedAt, ...counts } = persisted;

    return {
      runId: run.id,
      sourceId,
      sourceName: source.name,
      provider: source.type,
      ...counts,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const finishedAt = now();
    const message = errorMessage(error);

    await db.transaction(async (tx) => {
      await tx
        .update(sourceRuns)
        .set({
          finishedAt,
          status: "failed",
          errorMessage: message,
        })
        .where(eq(sourceRuns.id, run.id));
      await tx
        .update(sources)
        .set({ lastErrorAt: finishedAt, updatedAt: finishedAt })
        .where(eq(sources.id, source.id));
    });

    return {
      runId: run.id,
      sourceId,
      sourceName: source.name,
      provider: source.type,
      status: "failed",
      found: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      missing: 0,
      failures: 1,
      jobsCreated: 0,
      jobsMatched: 0,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: message,
    };
  }
}
