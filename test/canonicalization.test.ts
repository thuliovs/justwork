import assert from "node:assert/strict";
import test from "node:test";

import { selectCanonicalMatch } from "../src/lib/jobs/matching";
import {
  normalizeCompanyName,
  normalizeDate,
  normalizeDescription,
  normalizeLocation,
  normalizeTitle,
  normalizeUrl,
} from "../src/lib/jobs/normalization";

test("normalizes identity fields without dropping role distinctions", () => {
  assert.equal(normalizeTitle("  Senior — Backend Engineer II  "), "senior backend engineer ii");
  assert.notEqual(normalizeTitle("Engineer II"), normalizeTitle("Engineer III"));
  assert.notEqual(normalizeTitle("Frontend Engineer"), normalizeTitle("Backend Engineer"));
  assert.equal(normalizeCompanyName("Example, Inc."), "example inc");
  assert.equal(normalizeLocation(" Lisboa — Portugal "), "lisboa portugal");
});

test("canonicalizes URLs conservatively", () => {
  assert.equal(
    normalizeUrl("HTTPS://EXAMPLE.COM/jobs/42/?utm_source=x&job=42&gclid=y#apply"),
    "https://example.com/jobs/42?job=42",
  );
  assert.notEqual(
    normalizeUrl("https://example.com/jobs?job=42"),
    normalizeUrl("https://example.com/jobs?job=43"),
  );
  assert.equal(normalizeUrl("not a URL"), null);
});

test("normalizes descriptions and dates deterministically", () => {
  assert.equal(
    normalizeDescription("&lt;p&gt;R&amp;D&lt;/p&gt;\r\n", { decodeHtml: true }),
    "<p>R&D</p>",
  );
  assert.equal(normalizeDate("2026-10-20T09:00:00Z")?.toISOString(), "2026-10-20T09:00:00.000Z");
  assert.equal(normalizeDate("invalid"), null);
});

const baseJob = {
  id: "job-1",
  companyId: "company-1",
  title: "Senior Backend Engineer II",
  normalizedTitle: "senior backend engineer ii",
  locationText: "Lisbon, Portugal",
  canonicalUrl: "https://example.com/jobs/42",
};

test("matches a trustworthy canonical URL", () => {
  const match = selectCanonicalMatch(
    {
      companyId: "company-1",
      title: "Senior Backend Engineer II",
      locationText: "Remote Europe",
      canonicalUrl: "https://example.com/jobs/42?utm_source=feed",
    },
    [baseJob],
  );
  assert.equal(match?.id, "job-1");
});

test("does not merge different companies or titles", () => {
  assert.equal(
    selectCanonicalMatch(
      { ...baseJob, companyId: "company-2" },
      [baseJob],
    ),
    null,
  );
  assert.equal(
    selectCanonicalMatch(
      { ...baseJob, title: "Staff Backend Engineer" },
      [baseJob],
    ),
    null,
  );
});

test("fallback requires a compatible known location", () => {
  const withoutUrl = { ...baseJob, canonicalUrl: null };
  assert.equal(
    selectCanonicalMatch(
      {
        companyId: "company-1",
        title: baseJob.title,
        locationText: "Porto, Portugal",
      },
      [withoutUrl],
    ),
    null,
  );
  assert.equal(
    selectCanonicalMatch(
      { companyId: "company-1", title: baseJob.title, locationText: null },
      [withoutUrl],
    ),
    null,
  );
});

test("different explicit URLs keep otherwise identical positions separate", () => {
  assert.equal(
    selectCanonicalMatch(
      {
        companyId: "company-1",
        title: baseJob.title,
        locationText: baseJob.locationText,
        canonicalUrl: "https://example.com/jobs/another-opening",
      },
      [baseJob],
    ),
    null,
  );
});

test("ambiguous matches remain separate", () => {
  const candidates = [baseJob, { ...baseJob, id: "job-2" }];
  assert.equal(
    selectCanonicalMatch(
      {
        companyId: "company-1",
        title: baseJob.title,
        locationText: baseJob.locationText,
        canonicalUrl: baseJob.canonicalUrl,
      },
      candidates,
    ),
    null,
  );
});
