import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { jobs, sourceListings, sources } from "@/lib/db/schema";

import {
  classifyEligibility,
  type Eligibility,
  type GeographicEvidence,
} from "./eligibility";
import { classifyRoleFamily, type RoleFamily } from "./role-classification";
import { parseStoredListing } from "./stored-listing";

type ClassificationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PersistedClassification = {
  jobId: string;
  eligibility: Eligibility;
  eligibilityReason: string;
  remotePolicy: "remote" | "hybrid" | "onsite" | "unknown";
  roleFamily: RoleFamily;
  rule: string;
  changed: boolean;
};

async function loadEvidence(tx: ClassificationTransaction, jobId: string) {
  const rows = await tx
    .select({ listing: sourceListings, source: sources })
    .from(sourceListings)
    .innerJoin(sources, eq(sourceListings.sourceId, sources.id))
    .where(eq(sourceListings.jobId, jobId));

  const evidence: GeographicEvidence[] = [];
  for (const { listing: row, source } of rows) {
    try {
      const parsed = parseStoredListing(source.type, row.rawPayload);
      evidence.push({
        locationText: parsed.locationText ?? null,
        description: parsed.description ?? null,
        structuredRemotePolicy: parsed.workplaceType ?? null,
      });
    } catch {
      // Unknown future providers still retain the canonical job evidence.
    }
  }
  return evidence;
}

export async function classifyAndPersistJob(
  tx: ClassificationTransaction,
  jobId: string,
  classifiedAt = new Date(),
): Promise<PersistedClassification> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Job not found for classification: ${jobId}`);

  const evidence = await loadEvidence(tx, jobId);
  const geographic = classifyEligibility({
    locationText: job.locationText,
    description: job.description,
    evidence,
  });
  const roleFamily = classifyRoleFamily({
    title: job.title,
    description: job.description,
  });
  const changed =
    job.eligibility !== geographic.eligibility ||
    job.eligibilityReason !== geographic.eligibilityReason ||
    job.remotePolicy !== geographic.remotePolicy ||
    job.roleFamily !== roleFamily;

  if (changed) {
    await tx
      .update(jobs)
      .set({
        eligibility: geographic.eligibility,
        eligibilityReason: geographic.eligibilityReason,
        remotePolicy: geographic.remotePolicy,
        roleFamily,
        updatedAt: classifiedAt,
      })
      .where(eq(jobs.id, jobId));
  }

  return {
    jobId,
    eligibility: geographic.eligibility,
    eligibilityReason: geographic.eligibilityReason,
    remotePolicy: geographic.remotePolicy,
    roleFamily,
    rule: geographic.rule,
    changed,
  };
}

export type ClassificationSummary = {
  found: number;
  updated: number;
  unchanged: number;
  eligibility: Record<Eligibility, number>;
  roleFamily: Record<RoleFamily, number>;
};

export async function reclassifyJobs(
  options: { jobIds?: string[] } = {},
): Promise<ClassificationSummary> {
  const classifiedAt = new Date();
  return db.transaction(async (tx) => {
    const allJobs = options.jobIds
      ? options.jobIds.length
        ? await tx
            .select({ id: jobs.id })
            .from(jobs)
            .where(inArray(jobs.id, options.jobIds))
        : []
      : await tx.select({ id: jobs.id }).from(jobs);
    const summary: ClassificationSummary = {
      found: allJobs.length,
      updated: 0,
      unchanged: 0,
      eligibility: { eligible: 0, uncertain: 0, ineligible: 0 },
      roleFamily: {
        fullstack: 0,
        backend: 0,
        frontend: 0,
        product_engineering: 0,
        software_engineering: 0,
        integration_implementation: 0,
        applied_ai: 0,
        other: 0,
      },
    };

    for (const job of allJobs) {
      const result = await classifyAndPersistJob(tx, job.id, classifiedAt);
      if (result.changed) summary.updated += 1;
      else summary.unchanged += 1;
      summary.eligibility[result.eligibility] += 1;
      summary.roleFamily[result.roleFamily] += 1;
    }
    return summary;
  });
}
