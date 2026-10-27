import "dotenv/config";

import { closeDatabase } from "@/lib/db";
import { backfillCanonicalJobs } from "@/lib/jobs/backfill";

async function main() {
  const summary = await backfillCanonicalJobs();
  console.log(`Listings sem job encontradas: ${summary.found}`);
  console.log(`Listings processadas: ${summary.processed}`);
  console.log(`Jobs criados: ${summary.jobsCreated}`);
  console.log(`Jobs reutilizados: ${summary.jobsMatched}`);
  console.log(`Listings já processadas concorrentemente: ${summary.skipped}`);
  console.log(`Falhas: ${summary.failures.length}`);
  for (const failure of summary.failures) {
    console.error(`${failure.listingId}: ${failure.error}`);
  }
  if (summary.failures.length) process.exitCode = 1;
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
