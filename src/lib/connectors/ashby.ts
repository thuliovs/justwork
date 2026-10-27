import { ConnectorPayloadError, wrapConnectorError } from "./errors";
import { fetchJson } from "./http";
import {
  isRecord,
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

export function parseAshbyPayload(payload: unknown): NormalizedJobListing[] {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new ConnectorPayloadError("ashby", "jobs must be an array");
  }

  return payload.jobs.map((rawJob, index) => {
    if (!isRecord(rawJob)) {
      throw new ConnectorPayloadError("ashby", `listing ${index} must be an object`);
    }

    const sourceUrl = requiredString(
      rawJob.jobUrl,
      "ashby",
      "jobUrl",
      index,
    );

    return {
      externalId: requiredId(rawJob.id, "ashby", index),
      title: requiredString(rawJob.title, "ashby", "title", index),
      sourceUrl,
      canonicalUrl: sourceUrl,
      applyUrl: optionalString(rawJob.applyUrl),
      description:
        optionalString(rawJob.descriptionPlain) ??
        optionalString(rawJob.descriptionHtml),
      locationText: optionalString(rawJob.location),
      workplaceType:
        mapWorkplaceType(rawJob.workplaceType) ??
        (rawJob.isRemote === true ? "remote" : undefined),
      department: optionalString(rawJob.department),
      team: optionalString(rawJob.team),
      employmentType: optionalString(rawJob.employmentType),
      postedAt: optionalDate(rawJob.publishedAt),
      rawPayload: rawJob,
    };
  });
}

export function buildAshbyUrl(source: ConnectorSource) {
  const jobBoardName = requireExternalKey("ashby", source.name, source.externalKey);
  return new URL(
    `/posting-api/job-board/${encodeURIComponent(jobBoardName)}`,
    source.baseUrl,
  ).toString();
}

export class AshbyConnector implements JobConnector {
  readonly provider = "ashby" as const;

  constructor(private readonly getJson: JsonFetcher = fetchJson) {}

  async fetch(source: ConnectorSource): Promise<ConnectorResult> {
    const requestUrl = buildAshbyUrl(source);
    const context = { provider: this.provider, source, url: requestUrl } as const;

    try {
      const payload = await this.getJson(context);
      return {
        provider: this.provider,
        sourceId: source.id,
        requestUrl,
        fetchedAt: new Date(),
        complete: true,
        listings: parseAshbyPayload(payload),
      };
    } catch (error) {
      throw wrapConnectorError("Ashby fetch failed", context, error);
    }
  }
}
