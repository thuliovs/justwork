import type { ConnectorRequestContext, SupportedSourceType } from "./types";

type ConnectorErrorOptions = {
  provider: SupportedSourceType;
  sourceId: string;
  sourceName: string;
  url?: string;
  status?: number;
  cause?: unknown;
};

export class ConnectorError extends Error {
  readonly provider: SupportedSourceType;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly url?: string;
  readonly status?: number;

  constructor(message: string, options: ConnectorErrorOptions) {
    const context = [
      `provider=${options.provider}`,
      `source=${options.sourceName} (${options.sourceId})`,
      options.url ? `url=${options.url}` : undefined,
      options.status ? `status=${options.status}` : undefined,
    ]
      .filter(Boolean)
      .join(", ");

    super(`${message} [${context}]`, { cause: options.cause });
    this.name = "ConnectorError";
    this.provider = options.provider;
    this.sourceId = options.sourceId;
    this.sourceName = options.sourceName;
    this.url = options.url;
    this.status = options.status;
  }
}

export class ConnectorPayloadError extends Error {
  constructor(provider: SupportedSourceType, message: string) {
    super(`Invalid ${provider} payload: ${message}`);
    this.name = "ConnectorPayloadError";
  }
}

export function wrapConnectorError(
  message: string,
  context: ConnectorRequestContext,
  cause: unknown,
) {
  if (cause instanceof ConnectorError) {
    return cause;
  }

  const detail = cause instanceof Error ? cause.message : String(cause);

  return new ConnectorError(`${message}: ${detail}`, {
    provider: context.provider,
    sourceId: context.source.id,
    sourceName: context.source.name,
    url: context.url,
    cause,
  });
}
