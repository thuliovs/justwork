import { fetchJson } from "./http";
import {
  isRecord,
  optionalDate,
  optionalString,
  requireExternalKey,
  requiredId,
  requiredString,
} from "./parsing";
import { ConnectorPayloadError, wrapConnectorError } from "./errors";
import type {
  ConnectorResult,
  ConnectorSource,
  JobConnector,
  JsonFetcher,
  NormalizedJobListing,
} from "./types";

export function parseGreenhousePayload(payload: unknown): NormalizedJobListing[] {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new ConnectorPayloadError("greenhouse", "jobs must be an array");
  }

  return payload.jobs.map((rawJob, index) => {
    if (!isRecord(rawJob)) {
      throw new ConnectorPayloadError(
        "greenhouse",
        `listing ${index} must be an object`,
      );
    }

    const location = isRecord(rawJob.location)
      ? optionalString(rawJob.location.name)
      : undefined;
    const departments = Array.isArray(rawJob.departments)
      ? rawJob.departments
          .filter(isRecord)
          .map((department) => optionalString(department.name))
          .filter((name): name is string => Boolean(name))
      : [];
    const sourceUrl = requiredString(
      rawJob.absolute_url,
      "greenhouse",
      "absolute_url",
      index,
    );

    return {
      externalId: requiredId(rawJob.id, "greenhouse", index),
      title: requiredString(rawJob.title, "greenhouse", "title", index),
      companyName: optionalString(rawJob.company_name),
      sourceUrl,
      canonicalUrl: sourceUrl,
      applyUrl: sourceUrl,
      description: optionalString(rawJob.content),
      locationText: location,
      department: departments.length ? departments.join(", ") : undefined,
      postedAt:
        optionalDate(rawJob.first_published) ?? optionalDate(rawJob.updated_at),
      validThrough: optionalDate(rawJob.application_deadline),
      rawPayload: rawJob,
    };
  });
}

export function buildGreenhouseUrl(source: ConnectorSource) {
  const boardToken = requireExternalKey(
    "greenhouse",
    source.name,
    source.externalKey,
  );
  const url = new URL(
    `/v1/boards/${encodeURIComponent(boardToken)}/jobs`,
    source.baseUrl,
  );
  url.searchParams.set("content", "true");
  return url.toString();
}

export class GreenhouseConnector implements JobConnector {
  readonly provider = "greenhouse" as const;

  constructor(private readonly getJson: JsonFetcher = fetchJson) {}

  async fetch(source: ConnectorSource): Promise<ConnectorResult> {
    const requestUrl = buildGreenhouseUrl(source);
    const context = { provider: this.provider, source, url: requestUrl } as const;

    try {
      const payload = await this.getJson(context);
      return {
        provider: this.provider,
        sourceId: source.id,
        requestUrl,
        fetchedAt: new Date(),
        complete: true,
        listings: parseGreenhousePayload(payload),
      };
    } catch (error) {
      throw wrapConnectorError("Greenhouse fetch failed", context, error);
    }
  }
}
