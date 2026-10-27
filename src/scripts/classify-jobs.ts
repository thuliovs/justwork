import "dotenv/config";

import { closeDatabase } from "@/lib/db";
import { reclassifyJobs } from "@/lib/jobs/classification";

async function main() {
  const summary = await reclassifyJobs();
  console.log(`Jobs encontrados: ${summary.found}`);
  console.log(`Jobs atualizados: ${summary.updated}`);
  console.log(`Jobs sem alteração: ${summary.unchanged}`);
  console.log("\nElegibilidade:");
  console.table(summary.eligibility);
  console.log("Famílias de cargo:");
  console.table(summary.roleFamily);
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
