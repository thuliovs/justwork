import { AshbyConnector } from "./ashby";
import { GreenhouseConnector } from "./greenhouse";
import { LeverConnector } from "./lever";
import type { JobConnector, SupportedSourceType } from "./types";

const connectors: Record<SupportedSourceType, JobConnector> = {
  greenhouse: new GreenhouseConnector(),
  lever: new LeverConnector(),
  ashby: new AshbyConnector(),
};

export function getConnector(provider: string): JobConnector | undefined {
  if (provider !== "greenhouse" && provider !== "lever" && provider !== "ashby") {
    return undefined;
  }

  return connectors[provider];
}

export { AshbyConnector, GreenhouseConnector, LeverConnector };
export { ConnectorError, ConnectorPayloadError } from "./errors";
export { createJsonFetcher, fetchJson } from "./http";
export type {
  ConnectorResult,
  ConnectorSource,
  JobConnector,
  NormalizedJobListing,
  SupportedSourceType,
  WorkplaceType,
} from "./types";
