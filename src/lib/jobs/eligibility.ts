export type RemotePolicy = "remote" | "hybrid" | "onsite" | "unknown";
export type Eligibility = "eligible" | "uncertain" | "ineligible";

export type GeographicEvidence = {
  locationText?: string | null;
  description?: string | null;
  structuredRemotePolicy?: RemotePolicy | null;
};

export type EligibilityInput = {
  locationText?: string | null;
  description?: string | null;
  evidence?: GeographicEvidence[];
};

export type EligibilityResult = {
  eligibility: Eligibility;
  eligibilityReason: string;
  remotePolicy: RemotePolicy;
  rule: string;
};

function searchable(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("en-US");
}

function distinct(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

const PORTUGAL_LOCATION =
  /\b(?:portugal|lisbon|lisboa|porto|braga|coimbra|aveiro|oeiras|cascais|sintra|set[uú]bal)\b/iu;
const EUROPE_AMBIGUOUS = /\b(?:europe|emea|european time zones?)\b/iu;
const CLEARLY_INCOMPATIBLE_REGION =
  /\b(?:north america|united states|u\.?s\.?a?|canada|apac|asia[ -]pacific|australia|singapore)\b/iu;
const NON_LOCATION =
  /^(?:remote|hybrid|on[ -]?site|multiple locations?|various|worldwide|global|anywhere|not specified|unknown)$/iu;

const EXPLICIT_PORTUGAL = [
  /\b(?:remote|work remotely)\s+(?:in|from|within)\s+portugal\b/iu,
  /\b(?:candidates?|applicants?|employees?)\s+(?:must\s+be\s+)?(?:based|located|resident|residing|living)\s+in\s+portugal\b/iu,
  /\b(?:hire|hiring|available|open)\s+(?:in|from|to candidates? in)\s+portugal\b/iu,
  /\b(?:eligible|accepted|approved|hiring)\s+(?:countries|locations|regions)[^.!?\n]{0,160}\bportugal\b/iu,
  /\bportugal\b[^.!?\n]{0,100}\b(?:eligible|accepted|approved)\b/iu,
];

const EXPLICIT_EU = [
  /\bremote\s+(?:anywhere\s+)?(?:in|from|within|across)\s+(?:the\s+)?(?:eu|european union)\b/iu,
  /\b(?:candidates?|applicants?)\s+(?:based|located|resident|residing)\s+in\s+(?:the\s+)?(?:eu|european union)\b/iu,
  /\b(?:hire|hiring)\s+(?:anywhere\s+)?(?:in|across|throughout)\s+(?:the\s+)?(?:eu|european union)\b/iu,
];

const EXPLICIT_INCOMPATIBLE = [
  /\b(?:u\.?s\.?|united states|canada|north america|australia|singapore)\s+(?:residents?\s+)?only\b/iu,
  /\bonly\s+(?:candidates?|applicants?|residents?)\s+(?:in|from|based in|located in)\s+(?:the\s+)?(?:u\.?s\.?|united states|canada|north america|australia|singapore)\b/iu,
  /\b(?:must|required to)\s+(?:live|reside|be based|be located|work)\s+in\s+(?:the\s+)?(?:u\.?s\.?|united states|canada|north america|australia|singapore)\b/iu,
  /\bremote\s+(?:only\s+)?(?:in|from|within)\s+(?:the\s+)?(?:u\.?s\.?|united states|canada|north america|australia|singapore)\b/iu,
];

const WORK_AUTHORIZATION =
  /\b(?:must|required to)\s+(?:already\s+)?(?:have|hold|possess)\s+(?:the\s+)?(?:right|authorization|authorisation|permit|visa)\s+to\s+work\b/iu;

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function descriptionPolicy(text: string): RemotePolicy | null {
  if (
    /\b(?:hybrid (?:role|position|work|arrangement)|work(?:ing)? in a hybrid|hybrid schedule)\b/iu.test(
      text,
    )
  ) {
    return "hybrid";
  }
  if (
    /\b(?:on[ -]?site (?:role|position|work|arrangement)|office-based|work from (?:the|our) office)\b/iu.test(
      text,
    )
  ) {
    return "onsite";
  }
  if (
    /\b(?:fully remote|remote (?:role|position|job|work|within|from|in)|(?:role|position|job) is remote|work(?:ing)? remotely|work from home)\b/iu.test(
      text,
    )
  ) {
    return "remote";
  }
  return null;
}

function locationPolicy(location: string): RemotePolicy | null {
  if (/\bhybrid\b/iu.test(location)) return "hybrid";
  if (/\bon[ -]?site\b/iu.test(location)) return "onsite";
  if (/\bremote\b/iu.test(location)) return "remote";
  return null;
}

export function classifyRemotePolicy(input: EligibilityInput): RemotePolicy {
  const evidence = input.evidence ?? [];
  const structured = distinct(
    evidence.map((item) => item.structuredRemotePolicy).filter((item) => item !== "unknown"),
  );
  if (structured.length > 1) return "unknown";

  const locationSignals = distinct(
    [input.locationText, ...evidence.map((item) => item.locationText)].map((value) =>
      locationPolicy(searchable(value)),
    ),
  );
  const descriptionSignals = distinct(
    [input.description, ...evidence.map((item) => item.description)].map((value) =>
      descriptionPolicy(searchable(value)),
    ),
  );
  const signals = distinct([...structured, ...locationSignals, ...descriptionSignals]);
  return signals.length === 1 ? (signals[0] as RemotePolicy) : "unknown";
}

export function classifyEligibility(input: EligibilityInput): EligibilityResult {
  const remotePolicy = classifyRemotePolicy(input);
  const locations = distinct([
    input.locationText,
    ...(input.evidence ?? []).map((item) => item.locationText),
  ]).map(searchable);
  const descriptions = distinct([
    input.description,
    ...(input.evidence ?? []).map((item) => item.description),
  ]).map(searchable);
  const combinedDescription = descriptions.join("\n");

  const explicitPositive =
    containsAny(combinedDescription, EXPLICIT_PORTUGAL) ||
    containsAny(combinedDescription, EXPLICIT_EU);
  const explicitNegative = containsAny(combinedDescription, EXPLICIT_INCOMPATIBLE);
  const requiresUnknownAuthorization = WORK_AUTHORIZATION.test(combinedDescription);
  const portugalLocation = locations.some((location) => PORTUGAL_LOCATION.test(location));
  const ambiguousEurope = locations.some((location) => EUROPE_AMBIGUOUS.test(location));
  const incompatibleRemoteRegion = locations.some((location) =>
    CLEARLY_INCOMPATIBLE_REGION.test(location),
  );
  const meaningfulLocations = locations.filter(
    (location) => location && !NON_LOCATION.test(location),
  );

  if (explicitPositive && explicitNegative) {
    return {
      eligibility: "uncertain",
      eligibilityReason:
        "Uncertain: o anúncio contém evidências geográficas explícitas contraditórias.",
      remotePolicy,
      rule: "geo.explicit_conflict",
    };
  }
  if (explicitNegative) {
    return {
      eligibility: "ineligible",
      eligibilityReason:
        "Ineligible: o anúncio restringe explicitamente a contratação a uma região incompatível com residência em Portugal.",
      remotePolicy,
      rule: "geo.explicit_incompatible_region",
    };
  }
  if (requiresUnknownAuthorization) {
    return {
      eligibility: "uncertain",
      eligibilityReason:
        "Uncertain: a vaga exige autorização de trabalho cuja situação pessoal não é conhecida.",
      remotePolicy,
      rule: "geo.work_authorization_unknown",
    };
  }
  if (explicitPositive) {
    return {
      eligibility: "eligible",
      eligibilityReason:
        "Eligible: o anúncio inclui explicitamente Portugal ou a União Europeia entre as localizações aceitas.",
      remotePolicy,
      rule: "geo.explicit_portugal_or_eu",
    };
  }
  if ((remotePolicy === "onsite" || remotePolicy === "hybrid") && portugalLocation) {
    return {
      eligibility: "eligible",
      eligibilityReason: `Eligible: vaga ${remotePolicy === "hybrid" ? "híbrida" : "presencial"} localizada em Portugal.`,
      remotePolicy,
      rule: "geo.portugal_workplace",
    };
  }
  if (
    (remotePolicy === "onsite" || remotePolicy === "hybrid") &&
    meaningfulLocations.length > 0 &&
    !portugalLocation
  ) {
    return {
      eligibility: "ineligible",
      eligibilityReason: `Ineligible: vaga ${remotePolicy === "hybrid" ? "híbrida" : "presencial"} localizada fora de Portugal.`,
      remotePolicy,
      rule: "geo.foreign_workplace",
    };
  }
  if (remotePolicy === "remote" && portugalLocation) {
    return {
      eligibility: "eligible",
      eligibilityReason:
        "Eligible: vaga remota com Portugal declarado como localização da posição.",
      remotePolicy,
      rule: "geo.remote_portugal_location",
    };
  }
  if (remotePolicy === "remote" && incompatibleRemoteRegion) {
    return {
      eligibility: "ineligible",
      eligibilityReason:
        "Ineligible: a localização estruturada da vaga remota está limitada a uma região incompatível com Portugal.",
      remotePolicy,
      rule: "geo.remote_incompatible_region",
    };
  }
  if (remotePolicy === "remote" && ambiguousEurope) {
    return {
      eligibility: "uncertain",
      eligibilityReason:
        "Uncertain: anúncio informa trabalho remoto na Europa/EMEA, mas não confirma contratação em Portugal.",
      remotePolicy,
      rule: "geo.remote_europe_ambiguous",
    };
  }
  if (remotePolicy === "remote") {
    return {
      eligibility: "uncertain",
      eligibilityReason:
        "Uncertain: anúncio informa trabalho remoto, mas não esclarece os países de contratação.",
      remotePolicy,
      rule: "geo.remote_without_countries",
    };
  }
  if (remotePolicy === "unknown" && meaningfulLocations.length === 0) {
    return {
      eligibility: "uncertain",
      eligibilityReason:
        "Uncertain: modalidade e localização da vaga não foram informadas com clareza.",
      remotePolicy,
      rule: "geo.location_missing",
    };
  }
  return {
    eligibility: "uncertain",
    eligibilityReason:
      "Uncertain: as evidências disponíveis não confirmam nem excluem trabalho a partir de Portugal.",
    remotePolicy,
    rule: "geo.insufficient_evidence",
  };
}
