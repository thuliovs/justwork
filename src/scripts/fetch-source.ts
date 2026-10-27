import "dotenv/config";

import { closeDatabase, db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { collectSource, type CollectionSummary } from "@/lib/sources";

function printSummary(summary: CollectionSummary) {
  console.log(`Source: ${summary.provider} / ${summary.sourceName}`);
  console.log(`Status: ${summary.status}`);
  console.log(`Encontradas: ${summary.found}`);
  console.log(`Novas: ${summary.created}`);
  console.log(`Atualizadas: ${summary.updated}`);
  console.log(`Já conhecidas: ${summary.unchanged}`);
  console.log(`Ausentes nesta coleta: ${summary.missing}`);
  console.log(`Falhas: ${summary.failures}`);
  console.log(`Jobs canônicos criados: ${summary.jobsCreated}`);
  console.log(`Jobs canônicos reutilizados: ${summary.jobsMatched}`);
  console.log(`Duração: ${summary.durationMs}ms`);
  console.log(`Run: ${summary.runId}`);
  if (summary.error) console.log(`Erro: ${summary.error}`);
}

async function main() {
  const sourceId = process.argv[2];

  if (!sourceId) {
    const availableSources = await db
      .select({
        id: sources.id,
        provider: sources.type,
        name: sources.name,
        active: sources.isActive,
      })
      .from(sources);

    console.log("Usage: npm run source:fetch -- <source-id>\n");
    console.log("Available sources:");
    console.table(availableSources);
    return;
  }

  const summary = await collectSource(sourceId);
  printSummary(summary);

  if (summary.status === "failed") {
    process.exitCode = 1;
  }
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

void run();
