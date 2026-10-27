import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseAshbyPayload } from "../src/lib/connectors/ashby";
import { ConnectorError } from "../src/lib/connectors/errors";
import { parseGreenhousePayload } from "../src/lib/connectors/greenhouse";
import { createJsonFetcher } from "../src/lib/connectors/http";
import { buildLeverUrl, parseLeverPayload } from "../src/lib/connectors/lever";
import type { ConnectorSource } from "../src/lib/connectors/types";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  );
}

function leverSource(region: "global" | "europe"): ConnectorSource {
  return {
    id: `lever-${region}`,
    type: "lever",
    name: `Lever ${region}`,
    baseUrl:
      region === "europe" ? "https://api.eu.lever.co" : "https://api.lever.co",
    externalKey: "example",
    configJson: { region },
  };
}

test("parses Greenhouse listings and tolerates missing optional fields", () => {
  const listings = parseGreenhousePayload(fixture("greenhouse"));

  assert.equal(listings.length, 2);
  assert.equal(listings[0].externalId, "101");
  assert.equal(listings[0].companyName, "Example Product");
  assert.equal(listings[0].locationText, "Lisbon, Portugal");
  assert.equal(listings[0].department, "Engineering");
  assert.equal(listings[0].postedAt?.toISOString(), "2026-10-20T09:00:00.000Z");
  assert.equal(listings[1].description, undefined);
  assert.equal(listings[1].locationText, undefined);
});

test("parses Lever listings and preserves useful categories", () => {
  const listings = parseLeverPayload(fixture("lever"));

  assert.equal(listings.length, 2);
  assert.equal(listings[0].externalId, "lever-101");
  assert.equal(listings[0].workplaceType, "remote");
  assert.equal(listings[0].department, "Product & Engineering");
  assert.equal(listings[0].team, "Applications");
  assert.match(listings[0].description ?? "", /Ship reliable product features/);
  assert.equal(listings[1].locationText, undefined);
});

test("uses explicit and different Lever hosts for global and Europe", () => {
  assert.equal(
    buildLeverUrl(leverSource("global")),
    "https://api.lever.co/v0/postings/example?mode=json",
  );
  assert.equal(
    buildLeverUrl(leverSource("europe")),
    "https://api.eu.lever.co/v0/postings/example?mode=json",
  );
});

test("parses Ashby listings and tolerates missing optional fields", () => {
  const listings = parseAshbyPayload(fixture("ashby"));

  assert.equal(listings.length, 2);
  assert.equal(listings[0].externalId, "ashby-101");
  assert.equal(listings[0].workplaceType, "remote");
  assert.equal(listings[0].locationText, "Europe");
  assert.equal(listings[0].employmentType, "FullTime");
  assert.equal(listings[1].description, undefined);
  assert.equal(listings[1].workplaceType, undefined);
});

test("rejects invalid provider payloads", () => {
  assert.throws(() => parseGreenhousePayload({ jobs: "invalid" }), /Greenhouse|greenhouse/);
  assert.throws(() => parseLeverPayload({ jobs: [] }), /Lever|lever/);
  assert.throws(() => parseAshbyPayload([]), /Ashby|ashby/);
});

test("HTTP errors contain provider, source, URL and status", async () => {
  const getJson = createJsonFetcher({
    fetchImplementation: async () =>
      new Response("not found", { status: 404, statusText: "Not Found" }),
  });
  const source = leverSource("global");
  const url = buildLeverUrl(source);

  await assert.rejects(
    () => getJson({ provider: "lever", source, url }),
    (error: unknown) => {
      assert.ok(error instanceof ConnectorError);
      assert.equal(error.provider, "lever");
      assert.equal(error.sourceId, source.id);
      assert.equal(error.url, url);
      assert.equal(error.status, 404);
      return true;
    },
  );
});
