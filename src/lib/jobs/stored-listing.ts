import { parseAshbyPayload } from "@/lib/connectors/ashby";
import { parseGreenhousePayload } from "@/lib/connectors/greenhouse";
import { parseLeverPayload } from "@/lib/connectors/lever";
import type { NormalizedJobListing } from "@/lib/connectors";
import type { Source } from "@/lib/db/schema";

export function parseStoredListing(
  provider: Source["type"],
  rawPayload: unknown,
): NormalizedJobListing {
  const listings =
    provider === "greenhouse"
      ? parseGreenhousePayload({ jobs: [rawPayload] })
      : provider === "lever"
        ? parseLeverPayload([rawPayload])
        : provider === "ashby"
          ? parseAshbyPayload({ jobs: [rawPayload] })
          : null;

  if (!listings) throw new Error(`Backfill is not supported for ${provider}`);
  if (listings.length !== 1) throw new Error("Stored payload did not produce one listing");
  return listings[0];
}
