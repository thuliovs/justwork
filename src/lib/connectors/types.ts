import type { Source } from "@/lib/db/schema";

export type SupportedSourceType = Extract<
  Source["type"],
  "greenhouse" | "lever" | "ashby"
>;

export type ConnectorSource = Pick<
  Source,
  "id" | "type" | "name" | "baseUrl" | "externalKey" | "configJson"
>;

export type WorkplaceType = "remote" | "hybrid" | "onsite" | "unknown";

export type NormalizedJobListing = {
  externalId: string;
  title: string;
  companyName?: string;
  sourceUrl: string;
  canonicalUrl?: string;
  applyUrl?: string;
  description?: string;
  locationText?: string;
  workplaceType?: WorkplaceType;
  department?: string;
  team?: string;
  employmentType?: string;
  postedAt?: Date;
  validThrough?: Date;
  rawPayload: unknown;
};

export type ConnectorResult = {
  provider: SupportedSourceType;
  sourceId: string;
  requestUrl: string;
  fetchedAt: Date;
  complete: boolean;
  listings: NormalizedJobListing[];
};

export type ConnectorRequestContext = {
  provider: SupportedSourceType;
  source: ConnectorSource;
  url: string;
};

export type JsonFetcher = (context: ConnectorRequestContext) => Promise<unknown>;

export interface JobConnector {
  readonly provider: SupportedSourceType;
  fetch(source: ConnectorSource): Promise<ConnectorResult>;
}
