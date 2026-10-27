import {
  ACTION_STATES,
  AGE_RANGES,
  ELIGIBILITIES,
  JOB_STATUSES,
  REMOTE_POLICIES,
  ROLE_FAMILIES,
  isOneOf,
  type ActionState,
  type AgeRange,
  type Eligibility,
  type JobStatus,
  type RemotePolicy,
  type RoleFamily,
} from "./constants";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type RadarFilters = {
  eligibility?: Eligibility;
  roleFamily?: RoleFamily;
  companyId?: string;
  remotePolicy?: RemotePolicy;
  status?: JobStatus;
  actionState?: ActionState;
  age?: AgeRange;
  sourceId?: string;
  query?: string;
  page: number;
  includeAll: boolean;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function parseRadarFilters(params: RawSearchParams): RadarFilters {
  const eligibility = first(params.eligibility);
  const roleFamily = first(params.family);
  const remotePolicy = first(params.mode);
  const status = first(params.status);
  const actionState = first(params.action);
  const age = first(params.age);
  const parsedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const query = first(params.q)?.trim().slice(0, 120);

  return {
    eligibility: isOneOf(eligibility, ELIGIBILITIES) ? eligibility : undefined,
    roleFamily: isOneOf(roleFamily, ROLE_FAMILIES) ? roleFamily : undefined,
    companyId: first(params.company) || undefined,
    remotePolicy: isOneOf(remotePolicy, REMOTE_POLICIES) ? remotePolicy : undefined,
    status: isOneOf(status, JOB_STATUSES) ? status : undefined,
    actionState: isOneOf(actionState, ACTION_STATES) ? actionState : undefined,
    age: isOneOf(age, AGE_RANGES) ? age : undefined,
    sourceId: first(params.source) || undefined,
    query: query || undefined,
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    includeAll: first(params.all) === "1",
  };
}

export function postedAgeBounds(age: AgeRange, now: Date) {
  const day = 86_400_000;
  const ago = (days: number) => new Date(now.getTime() - days * day);
  switch (age) {
    case "0-3": return { from: ago(4), to: now };
    case "4-7": return { from: ago(8), to: ago(4) };
    case "8-14": return { from: ago(15), to: ago(8) };
    case "15-30": return { from: ago(31), to: ago(15) };
    case "30+": return { to: ago(31) };
  }
}

export function hasExplicitVisibilityFilter(filters: RadarFilters) {
  return Boolean(filters.eligibility || filters.actionState || filters.includeAll);
}
