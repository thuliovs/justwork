import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { sources, type Source } from "@/lib/db/schema";

import { collectSource, type CollectionSummary } from "./collect-source";

type ActiveSource = Pick<Source, "id" | "name" | "type">;

export type AggregateCollectionSummary = {
  status: "success" | "partial" | "failed";
  sources: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
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
  results: CollectionSummary[];
};

type CollectActiveSourcesOptions = {
  listActiveSources?: () => Promise<ActiveSource[]>;
  collect?: (sourceId: string) => Promise<CollectionSummary>;
  now?: () => Date;
};

async function defaultListActiveSources() {
  return db
    .select({ id: sources.id, name: sources.name, type: sources.type })
    .from(sources)
    .where(eq(sources.isActive, true))
    .orderBy(asc(sources.name));
}

function unexpectedFailure(source: ActiveSource, startedAt: Date, finishedAt: Date, error: unknown): CollectionSummary {
  return {
    runId: null,
    sourceId: source.id,
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
    error: error instanceof Error ? error.message : String(error),
  };
}

export async function collectActiveSources(
  options: CollectActiveSourcesOptions = {},
): Promise<AggregateCollectionSummary> {
  const listActiveSources = options.listActiveSources ?? defaultListActiveSources;
  const collect = options.collect ?? collectSource;
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const activeSources = await listActiveSources();
  const results: CollectionSummary[] = [];

  for (const source of activeSources) {
    const sourceStartedAt = now();
    try {
      results.push(await collect(source.id));
    } catch (error) {
      results.push(unexpectedFailure(source, sourceStartedAt, now(), error));
    }
  }

  const finishedAt = now();
  const countStatus = (status: CollectionSummary["status"]) =>
    results.filter((result) => result.status === status).length;
  const failed = countStatus("failed");
  const partial = countStatus("partial");
  const skipped = countStatus("skipped");
  const succeeded = countStatus("success");
  const sum = (field: keyof Pick<CollectionSummary,
    "found" | "created" | "updated" | "unchanged" | "missing" | "failures" | "jobsCreated" | "jobsMatched"
  >) => results.reduce((total, result) => total + result[field], 0);
  const status = failed === results.length && results.length > 0
    ? "failed"
    : failed || partial || skipped
      ? "partial"
      : "success";

  return {
    status,
    sources: results.length,
    succeeded,
    partial,
    failed,
    skipped,
    found: sum("found"),
    created: sum("created"),
    updated: sum("updated"),
    unchanged: sum("unchanged"),
    missing: sum("missing"),
    failures: sum("failures"),
    jobsCreated: sum("jobsCreated"),
    jobsMatched: sum("jobsMatched"),
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    results,
  };
}
