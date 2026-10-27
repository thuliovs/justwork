import { ConnectorPayloadError, wrapConnectorError } from "./errors";
import { fetchJson } from "./http";
import {
  isRecord,
  joinText,
  mapWorkplaceType,
  optionalDate,
  optionalString,
  requireExternalKey,
  requiredId,
  requiredString,
} from "./parsing";
import type {
  ConnectorResult,
  ConnectorSource,
  JobConnector,
  JsonFetcher,
  NormalizedJobListing,
} from "./types";

type LeverRegion = "global" | "europe";

const LEVER_HOSTS: Record<LeverRegion, string> = {
  global: "https://api.lever.co",
  europe: "https://api.eu.lever.co",
};

function getLeverRegion(source: ConnectorSource): LeverRegion {
  const configuredRegion = source.configJson.region;

  if (configuredRegion === "global" || configuredRegion === "europe") {
    return configuredRegion;
  }

  const origin = new URL(source.baseUrl).origin;
  if (origin === LEVER_HOSTS.global) return "global";
  if (origin === LEVER_HOSTS.europe) return "europe";

  throw new ConnectorPayloadError(
    "lever",
    `source ${source.name} requires config_json.region as global or europe`,
  );
}

export function buildLeverUrl(source: ConnectorSource) {
  const slug = requireExternalKey("lever", source.name, source.externalKey);
  const region = getLeverRegion(source);
  const url = new URL(
    `/v0/postings/${encodeURIComponent(slug)}`,
    LEVER_HOSTS[region],
  );
  url.searchParams.set("mode", "json");
  return url.toString();
}

export function parseLeverPayload(payload: unknown): NormalizedJobListing[] {
  if (!Array.isArray(payload)) {
    throw new ConnectorPayloadError("lever", "root value must be an array");
  }

  return payload.map((rawJob, index) => {
    if (!isRecord(rawJob)) {
      throw new ConnectorPayloadError("lever", `listing ${index} must be an object`);
    }

    const categories = isRecord(rawJob.categories) ? rawJob.categories : {};
    const lists = Array.isArray(rawJob.lists) ? rawJob.lists.filter(isRecord) : [];
    const listContent = lists.map((list) =>
      optionalString(list.content) ?? optionalString(list.text),
    );
    const sourceUrl = requiredString(
      rawJob.hostedUrl,
      "lever",
      "hostedUrl",
      index,
    );

    return {
      externalId: requiredId(rawJob.id, "lever", index),
      title: requiredString(rawJob.text, "lever", "text", index),
      sourceUrl,
      canonicalUrl: sourceUrl,
      applyUrl: optionalString(rawJob.applyUrl),
      description: joinText([
        optionalString(rawJob.descriptionPlain) ??
          optionalString(rawJob.descriptionBodyPlain) ??
          optionalString(rawJob.description),
        ...listContent,
        optionalString(rawJob.additionalPlain) ?? optionalString(rawJob.additional),
      ]),
      locationText: optionalString(categories.location),
      workplaceType: mapWorkplaceType(rawJob.workplaceType),
      department: optionalString(categories.department),
      team: optionalString(categories.team),
      employmentType: optionalString(categories.commitment),
      postedAt: optionalDate(rawJob.createdAt),
      rawPayload: rawJob,
    };
  });
}

export class LeverConnector implements JobConnector {
  readonly provider = "lever" as const;

  constructor(private readonly getJson: JsonFetcher = fetchJson) {}

  async fetch(source: ConnectorSource): Promise<ConnectorResult> {
    const requestUrl = buildLeverUrl(source);
    const context = { provider: this.provider, source, url: requestUrl } as const;

    try {
      const payload = await this.getJson(context);
      return {
        provider: this.provider,
        sourceId: source.id,
        requestUrl,
        fetchedAt: new Date(),
        complete: true,
        listings: parseLeverPayload(payload),
      };
    } catch (error) {
      throw wrapConnectorError("Lever fetch failed", context, error);
    }
  }
}
