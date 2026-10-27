import { createHash } from "node:crypto";

import type { NormalizedJobListing } from "@/lib/connectors";

function stableSerialize(value: unknown): string {
  if (value === null) return "null";

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableExternalId(
  sourceId: string,
  listing: NormalizedJobListing,
) {
  const externalId = listing.externalId.trim();
  if (externalId) return externalId;

  const stableUrl = listing.canonicalUrl?.trim() || listing.sourceUrl.trim();
  return `fallback:${sha256(`${sourceId}\u0000${stableUrl}`)}`;
}

export function listingContentHash(listing: NormalizedJobListing) {
  return sha256(
    stableSerialize({
      sourceUrl: listing.sourceUrl,
      canonicalUrl: listing.canonicalUrl,
      applyUrl: listing.applyUrl,
      postedAt: listing.postedAt,
      validThrough: listing.validThrough,
      rawPayload: listing.rawPayload,
    }),
  );
}
