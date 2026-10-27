export const ELIGIBILITIES = ["eligible", "uncertain", "ineligible"] as const;
export const ROLE_FAMILIES = [
  "fullstack",
  "backend",
  "frontend",
  "product_engineering",
  "software_engineering",
  "integration_implementation",
  "applied_ai",
  "other",
] as const;
export const REMOTE_POLICIES = ["remote", "hybrid", "onsite", "unknown"] as const;
export const JOB_STATUSES = ["active", "closed", "unknown"] as const;
export const ACTION_STATES = ["new", "saved", "dismissed", "applied"] as const;
export const APPLICATION_STATUSES = [
  "applied",
  "screening",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
] as const;
export const AGE_RANGES = ["0-3", "4-7", "8-14", "15-30", "30+"] as const;

export type Eligibility = (typeof ELIGIBILITIES)[number];
export type RoleFamily = (typeof ROLE_FAMILIES)[number];
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type ActionState = (typeof ACTION_STATES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type AgeRange = (typeof AGE_RANGES)[number];

export const labels = {
  eligibility: { eligible: "Elegível", uncertain: "Incerta", ineligible: "Inelegível" },
  roleFamily: {
    fullstack: "Full-stack",
    backend: "Backend",
    frontend: "Frontend",
    product_engineering: "Product engineering",
    software_engineering: "Software engineering",
    integration_implementation: "Integração / implementação",
    applied_ai: "IA aplicada",
    other: "Other",
  },
  remotePolicy: { remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial", unknown: "Não indicado" },
  jobStatus: { active: "Ativa", closed: "Fechada", unknown: "Desconhecido" },
  actionState: { new: "Nova", saved: "Guardada", dismissed: "Descartada", applied: "Candidatura" },
  applicationStatus: {
    applied: "Candidatura enviada",
    screening: "Screening",
    interview: "Entrevista",
    rejected: "Rejeitada",
    offer: "Oferta",
    withdrawn: "Desistência",
  },
  ageRange: { "0-3": "0–3 dias", "4-7": "4–7 dias", "8-14": "8–14 dias", "15-30": "15–30 dias", "30+": "Mais de 30 dias" },
} as const;

export function isOneOf<T extends string>(value: string | undefined, values: readonly T[]): value is T {
  return Boolean(value && values.includes(value as T));
}
