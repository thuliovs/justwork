import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { companies, sourceRuns, sources, type Source } from "@/lib/db/schema";

export const SOURCE_STALE_AFTER_MS = 36 * 60 * 60 * 1_000;
export const MANAGED_SOURCE_OPTIONS = {
  greenhouse: { baseUrl: "https://api.greenhouse.io", label: "Greenhouse" },
  ashby: { baseUrl: "https://api.ashbyhq.com", label: "Ashby" },
  lever_global: { baseUrl: "https://api.lever.co", label: "Lever Global" },
  lever_europe: { baseUrl: "https://api.eu.lever.co", label: "Lever Europe" },
} as const;

export type ManagedSourceKind = keyof typeof MANAGED_SOURCE_OPTIONS;

export async function getSourcesDashboard(now = new Date()) {
  const [sourceRows, recentRuns] = await Promise.all([
    db
      .select({
        id: sources.id,
        name: sources.name,
        type: sources.type,
        baseUrl: sources.baseUrl,
        externalKey: sources.externalKey,
        configJson: sources.configJson,
        isActive: sources.isActive,
        lastSuccessAt: sources.lastSuccessAt,
        lastErrorAt: sources.lastErrorAt,
        companyName: companies.name,
      })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .orderBy(asc(sources.name)),
    db
      .select()
      .from(sourceRuns)
      .orderBy(desc(sourceRuns.startedAt))
      .limit(250),
  ]);

  const runsBySource = new Map<string, typeof recentRuns>();
  for (const run of recentRuns) {
    const runs = runsBySource.get(run.sourceId) ?? [];
    if (runs.length < 5) runs.push(run);
    runsBySource.set(run.sourceId, runs);
  }
  const staleBefore = now.getTime() - SOURCE_STALE_AFTER_MS;
  const items = sourceRows.map((source) => {
    const runs = runsBySource.get(source.id) ?? [];
    const latestRun = runs[0] ?? null;
    return {
      ...source,
      recentRuns: runs,
      latestRun,
      isStale:
        source.isActive &&
        (!latestRun || latestRun.startedAt.getTime() < staleBefore) &&
        latestRun?.status !== "running",
    };
  });

  return {
    total: items.length,
    active: items.filter((item) => item.isActive).length,
    inactive: items.filter((item) => !item.isActive).length,
    stale: items.filter((item) => item.isStale).length,
    latestRun: recentRuns[0] ?? null,
    items,
  };
}

export async function setSourceActive(sourceId: string, isActive: boolean) {
  const [updated] = await db
    .update(sources)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id, isActive: sources.isActive });
  if (!updated) throw new Error("Fonte não encontrada.");
  return updated;
}

const slugPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;

function normalizeCompanyName(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function publicUrl(value: string | null) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("URL pública inválida.");
  return url.toString();
}

export async function createManagedSource(input: {
  companyName: string;
  kind: ManagedSourceKind;
  externalKey: string;
  websiteUrl?: string | null;
  careersUrl?: string | null;
}) {
  const companyName = input.companyName.trim();
  const externalKey = input.externalKey.trim();
  const option = MANAGED_SOURCE_OPTIONS[input.kind];
  if (!companyName || companyName.length > 160) throw new Error("Nome da empresa inválido.");
  if (!slugPattern.test(externalKey)) throw new Error("Identificador externo inválido.");
  if (!option) throw new Error("Provider não suportado.");
  const type: Source["type"] = input.kind === "greenhouse"
    ? "greenhouse"
    : input.kind === "ashby"
      ? "ashby"
      : "lever";
  const configJson = type === "lever"
    ? { region: input.kind === "lever_europe" ? "europe" : "global" }
    : {};

  return db.transaction(async (tx) => {
    const normalizedName = normalizeCompanyName(companyName);
    const [company] = await tx
      .insert(companies)
      .values({
        name: companyName,
        normalizedName,
        websiteUrl: publicUrl(input.websiteUrl ?? null),
        careersUrl: publicUrl(input.careersUrl ?? null),
        isTarget: true,
      })
      .onConflictDoUpdate({
        target: companies.normalizedName,
        set: { name: companyName, updatedAt: new Date() },
      })
      .returning({ id: companies.id });

    const [existing] = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(and(
        eq(sources.type, type),
        eq(sources.baseUrl, option.baseUrl),
        eq(sources.externalKey, externalKey),
      ))
      .limit(1);
    if (existing) throw new Error("Esta fonte já está cadastrada.");

    const [created] = await tx.insert(sources).values({
      companyId: company.id,
      type,
      name: `${companyName} — ${option.label}`,
      baseUrl: option.baseUrl,
      externalKey,
      configJson,
    }).returning({ id: sources.id });
    return created;
  });
}
