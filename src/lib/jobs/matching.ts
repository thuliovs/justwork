import {
  normalizeCompanyName,
  normalizeLocation,
  normalizeTitle,
  normalizeUrl,
} from "./normalization";

export type MatchableJob = {
  id: string;
  companyId: string | null;
  title: string;
  normalizedTitle?: string;
  locationText: string | null;
  canonicalUrl: string | null;
};

export type MatchableListing = {
  companyId: string | null;
  companyName?: string | null;
  title: string;
  locationText?: string | null;
  canonicalUrl?: string | null;
};

export function locationsAreCompatible(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = normalizeLocation(left);
  const normalizedRight = normalizeLocation(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function companyIsCompatible(listing: MatchableListing, job: MatchableJob) {
  if (listing.companyId || job.companyId) return listing.companyId === job.companyId;
  const listingName = normalizeCompanyName(listing.companyName);
  return listingName !== null;
}

function titleIsCompatible(listing: MatchableListing, job: MatchableJob) {
  return normalizeTitle(listing.title) === (job.normalizedTitle ?? normalizeTitle(job.title));
}

export function selectCanonicalMatch(
  listing: MatchableListing,
  candidates: MatchableJob[],
) {
  const canonicalUrl = normalizeUrl(listing.canonicalUrl);
  if (canonicalUrl) {
    const urlMatches = candidates.filter(
      (job) =>
        normalizeUrl(job.canonicalUrl) === canonicalUrl &&
        companyIsCompatible(listing, job) &&
        titleIsCompatible(listing, job),
    );
    if (urlMatches.length === 1) return urlMatches[0];
    if (urlMatches.length > 1) return null;
  }

  if (!listing.companyId || !normalizeLocation(listing.locationText)) return null;
  const fallbackMatches = candidates.filter(
    (job) => {
      const jobUrl = normalizeUrl(job.canonicalUrl);
      if (canonicalUrl && jobUrl && canonicalUrl !== jobUrl) return false;
      return (
        job.companyId === listing.companyId &&
        titleIsCompatible(listing, job) &&
        locationsAreCompatible(listing.locationText, job.locationText)
      );
    },
  );
  return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}
