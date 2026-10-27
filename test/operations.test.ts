import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";

import {
  adminSessionValue,
  isAdminConfigured,
  verifyAdminSession,
  verifyAdminToken,
} from "../src/lib/admin-auth";
import { collectActiveSources } from "../src/lib/sources/collect-active-sources";
import type { CollectionSummary } from "../src/lib/sources/collect-source";

const source = (id: string, name = id) => ({ id, name, type: "greenhouse" as const });
const result = (sourceId: string, status: CollectionSummary["status"] = "success"): CollectionSummary => ({
  runId: status === "skipped" ? null : `run-${sourceId}`,
  sourceId,
  sourceName: sourceId,
  provider: "greenhouse",
  status,
  found: status === "success" ? 4 : 0,
  created: status === "success" ? 1 : 0,
  updated: status === "success" ? 1 : 0,
  unchanged: status === "success" ? 2 : 0,
  missing: 0,
  failures: status === "failed" ? 1 : 0,
  jobsCreated: status === "success" ? 1 : 0,
  jobsMatched: status === "success" ? 3 : 0,
  startedAt: new Date("2026-10-27T08:00:00Z"),
  finishedAt: new Date("2026-10-27T08:00:01Z"),
  durationMs: 1_000,
  error: status === "failed" ? "controlled failure" : undefined,
});

test("admin operations require the configured token or signed session", () => {
  const secret = "a-private-local-token";
  assert.equal(isAdminConfigured(secret), true);
  assert.equal(isAdminConfigured(""), false);
  assert.equal(verifyAdminToken(secret, secret), true);
  assert.equal(verifyAdminToken("wrong", secret), false);
  const session = adminSessionValue(secret);
  assert.equal(verifyAdminSession(session, secret), true);
  assert.equal(verifyAdminSession(`${session}x`, secret), false);
  assert.equal(verifyAdminSession(undefined, secret), false);
});

test("aggregate collector runs only the sources returned as active and sums results", async () => {
  const collected: string[] = [];
  const summary = await collectActiveSources({
    listActiveSources: async () => [source("active-a"), source("active-b")],
    collect: async (id) => { collected.push(id); return result(id); },
    now: () => new Date("2026-10-27T08:00:00Z"),
  });
  assert.deepEqual(collected, ["active-a", "active-b"]);
  assert.equal(summary.sources, 2);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.found, 8);
  assert.equal(summary.created, 2);
  assert.equal(summary.updated, 2);
  assert.equal(summary.unchanged, 4);
  assert.equal(summary.jobsCreated, 2);
  assert.equal(summary.jobsMatched, 6);
  assert.equal(summary.status, "success");
});

test("one source failure is isolated and remaining sources continue", async () => {
  const collected: string[] = [];
  const summary = await collectActiveSources({
    listActiveSources: async () => [source("ok-a"), source("broken"), source("ok-b")],
    collect: async (id) => {
      collected.push(id);
      if (id === "broken") throw new Error("controlled failure");
      return result(id);
    },
  });
  assert.deepEqual(collected, ["ok-a", "broken", "ok-b"]);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.status, "partial");
  assert.match(summary.results[1]?.error ?? "", /controlled failure/);
});

test("database listing failures abort before collection with the original error", async () => {
  await assert.rejects(
    collectActiveSources({ listActiveSources: async () => { throw new Error("database unavailable"); } }),
    /database unavailable/,
  );
});
