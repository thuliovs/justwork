const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

export function normalizeUnicode(value: string) {
  return value.normalize("NFKC");
}

export function normalizeDisplayText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeUnicode(value).replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function normalizeIdentityText(value: string | null | undefined) {
  const display = normalizeDisplayText(value);
  if (!display) return null;

  const normalized = display
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || null;
}

export const normalizeTitle = normalizeIdentityText;
export const normalizeCompanyName = normalizeIdentityText;
export const normalizeLocation = normalizeIdentityText;

export function normalizeUrl(value: string | null | undefined) {
  const candidate = normalizeDisplayText(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith("utm_") || TRACKING_PARAMETERS.has(lowerKey)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");

    return url.toString();
  } catch {
    return null;
  }
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu,
    (entity, token: string) => {
      if (token.startsWith("#x") || token.startsWith("#X")) {
        const codePoint = Number.parseInt(token.slice(2), 16);
        return Number.isSafeInteger(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (token.startsWith("#")) {
        const codePoint = Number.parseInt(token.slice(1), 10);
        return Number.isSafeInteger(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return HTML_ENTITIES[token.toLowerCase()] ?? entity;
    },
  );
}

export function normalizeDescription(
  value: string | null | undefined,
  options: { decodeHtml?: boolean } = {},
) {
  if (!value) return null;
  const decoded = options.decodeHtml ? decodeHtmlEntities(value) : value;
  const normalized = normalizeUnicode(decoded).replace(/\r\n?/gu, "\n").trim();
  return normalized || null;
}

export function normalizeDate(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
