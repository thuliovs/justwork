import { ConnectorPayloadError } from "./errors";
import type { SupportedSourceType, WorkplaceType } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requiredString(
  value: unknown,
  provider: SupportedSourceType,
  field: string,
  index: number,
) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ConnectorPayloadError(
      provider,
      `listing ${index} is missing required field ${field}`,
    );
  }

  return parsed;
}

export function requiredId(
  value: unknown,
  provider: SupportedSourceType,
  index: number,
) {
  if ((typeof value === "string" || typeof value === "number") && String(value)) {
    return String(value);
  }

  throw new ConnectorPayloadError(
    provider,
    `listing ${index} is missing required field id`,
  );
}

export function optionalDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function mapWorkplaceType(value: unknown): WorkplaceType | undefined {
  const normalized = optionalString(value)?.toLowerCase().replaceAll("-", "");

  if (!normalized) return undefined;
  if (normalized === "remote") return "remote";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "onsite") return "onsite";
  return "unknown";
}

export function joinText(parts: Array<string | undefined>) {
  const values = parts.filter((part): part is string => Boolean(part));
  return values.length ? values.join("\n\n") : undefined;
}

export function requireExternalKey(
  provider: SupportedSourceType,
  sourceName: string,
  externalKey: string | null,
) {
  const key = optionalString(externalKey);
  if (!key) {
    throw new ConnectorPayloadError(
      provider,
      `source ${sourceName} requires external_key`,
    );
  }

  return key;
}
