import "dotenv/config";

import { closeDatabase } from "@/lib/db";
import { collectActiveSources } from "@/lib/sources";

async function main() {
  const summary = await collectActiveSources();
  for (const result of summary.results) {
    const details = `${result.found} encontradas, ${result.created} novas, ${result.updated} alteradas, ${result.jobsCreated} jobs novos`;
    console.log(`${result.sourceName.padEnd(34)} ${result.status.padEnd(8)} ${details}`);
    if (result.error) console.log(`  Erro: ${result.error}`);
  }
  console.log("\nResumo");
  console.log(`Fontes: ${summary.sources} (${summary.succeeded} sucesso, ${summary.partial} parciais, ${summary.failed} falhas, ${summary.skipped} ignoradas)`);
  console.log(`Encontradas: ${summary.found} | Novas: ${summary.created} | Alteradas: ${summary.updated} | Conhecidas: ${summary.unchanged}`);
  console.log(`Jobs novos: ${summary.jobsCreated} | Jobs reutilizados: ${summary.jobsMatched} | Duração: ${summary.durationMs} ms`);
  if (summary.status !== "success") process.exitCode = 1;
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(`Coleta não iniciada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

void run();
