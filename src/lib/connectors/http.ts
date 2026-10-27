import { ConnectorError } from "./errors";
import type { ConnectorRequestContext, JsonFetcher } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

type FetchJsonOptions = {
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
};

export function createJsonFetcher({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImplementation = fetch,
}: FetchJsonOptions = {}): JsonFetcher {
  return async (context: ConnectorRequestContext) => {
    let response: Response;

    try {
      response = await fetchImplementation(context.url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "justwork/0.1 (+personal job radar)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new ConnectorError(`HTTP request failed: ${detail}`, {
        provider: context.provider,
        sourceId: context.source.id,
        sourceName: context.source.name,
        url: context.url,
        cause,
      });
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const suffix = responseText ? `: ${responseText.slice(0, 200)}` : "";

      throw new ConnectorError(
        `HTTP request returned ${response.status} ${response.statusText}${suffix}`,
        {
          provider: context.provider,
          sourceId: context.source.id,
          sourceName: context.source.name,
          url: context.url,
          status: response.status,
        },
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new ConnectorError(`Response is not valid JSON: ${detail}`, {
        provider: context.provider,
        sourceId: context.source.id,
        sourceName: context.source.name,
        url: context.url,
        status: response.status,
        cause,
      });
    }
  };
}

export const fetchJson = createJsonFetcher();
