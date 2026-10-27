export type RoleFamily =
  | "fullstack"
  | "backend"
  | "frontend"
  | "product_engineering"
  | "software_engineering"
  | "integration_implementation"
  | "applied_ai"
  | "other";

export type RoleClassificationInput = {
  title: string;
  description?: string | null;
};

function searchable(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[–—]/gu, "-");
}

export function classifyRoleFamily(input: RoleClassificationInput): RoleFamily {
  const title = searchable(input.title);
  const description = searchable(input.description);

  if (/\b(?:engineering manager|manager,? engineering|director|head of engineering)\b/u.test(title)) {
    return "other";
  }
  if (
    /\b(?:applied ai engineer|ai software engineer|ai product engineer|software engineer\s*[-/,]\s*ai(?:\/ml)?|product engineer,? applied ai)\b/u.test(
      title,
    )
  ) {
    return "applied_ai";
  }
  if (/\bfull[ -]?stack\b/u.test(title)) return "fullstack";
  if (/\bback[ -]?end\b/u.test(title)) return "backend";
  if (/\bfront[ -]?end\b/u.test(title) || /\breact (?:developer|engineer)\b/u.test(title)) {
    return "frontend";
  }
  if (/\b(?:product (?:software )?engineer|software engineer,? product)\b/u.test(title)) {
    return "product_engineering";
  }

  const integrationTitle =
    /\b(?:integration|implementation|solutions?|forward deployed) engineer\b/u.test(title);
  const developmentEvidence =
    /\b(?:programming|write code|coding|software development|develop(?:ing|ment)? (?:software|solutions?|integrations?)|api(?:s)?|sdk(?:s)?|system integration)\b/u.test(
      description,
    );
  if (integrationTitle) {
    return developmentEvidence ? "integration_implementation" : "other";
  }

  if (/\bapi engineer\b/u.test(title)) {
    return /\b(?:backend|server-side|api development|microservices?)\b/u.test(description)
      ? "backend"
      : "software_engineering";
  }
  if (/\b(?:software engineer|software developer|application developer|elixir software engineer|python software engineer|rust software engineer)\b/u.test(title)) {
    return "software_engineering";
  }
  return "other";
}
