import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { closeDatabase, db } from ".";
import { companies, sources, type Source } from "./schema";

type DevelopmentSource = {
  company: {
    name: string;
    normalizedName: string;
    websiteUrl: string;
    careersUrl: string;
    country: string;
  };
  source: {
    type: Source["type"];
    name: string;
    baseUrl: string;
    externalKey: string;
    configJson: Record<string, unknown>;
  };
};

const developmentSources: DevelopmentSource[] = [
  {
    company: {
      name: "Figma",
      normalizedName: "figma",
      websiteUrl: "https://www.figma.com",
      careersUrl: "https://www.figma.com/careers/",
      country: "US",
    },
    source: {
      type: "greenhouse",
      name: "Figma — Greenhouse",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "figma",
      configJson: {},
    },
  },
  {
    company: {
      name: "Palantir",
      normalizedName: "palantir",
      websiteUrl: "https://www.palantir.com",
      careersUrl: "https://www.palantir.com/careers/",
      country: "US",
    },
    source: {
      type: "lever",
      name: "Palantir — Lever Global",
      baseUrl: "https://api.lever.co",
      externalKey: "palantir",
      configJson: { region: "global" },
    },
  },
  {
    company: {
      name: "Prima",
      normalizedName: "prima",
      websiteUrl: "https://www.helloprima.com",
      careersUrl: "https://jobs.eu.lever.co/prima",
      country: "IT",
    },
    source: {
      type: "lever",
      name: "Prima — Lever Europe",
      baseUrl: "https://api.eu.lever.co",
      externalKey: "prima",
      configJson: { region: "europe" },
    },
  },
  {
    company: {
      name: "Linear",
      normalizedName: "linear",
      websiteUrl: "https://linear.app",
      careersUrl: "https://linear.app/careers",
      country: "US",
    },
    source: {
      type: "ashby",
      name: "Linear — Ashby",
      baseUrl: "https://api.ashbyhq.com",
      externalKey: "linear",
      configJson: {},
    },
  },
];

async function seed() {
  for (const definition of developmentSources) {
    const [company] = await db
      .insert(companies)
      .values({ ...definition.company, isTarget: false })
      .onConflictDoUpdate({
        target: companies.normalizedName,
        set: {
          name: definition.company.name,
          websiteUrl: definition.company.websiteUrl,
          careersUrl: definition.company.careersUrl,
          country: definition.company.country,
          updatedAt: new Date(),
        },
      })
      .returning({ id: companies.id });

    const [existingSource] = await db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.type, definition.source.type),
          eq(sources.baseUrl, definition.source.baseUrl),
          eq(sources.externalKey, definition.source.externalKey),
        ),
      )
      .limit(1);

    if (existingSource) {
      await db
        .update(sources)
        .set({
          companyId: company.id,
          name: definition.source.name,
          configJson: definition.source.configJson,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(sources.id, existingSource.id));
    } else {
      await db.insert(sources).values({
        ...definition.source,
        companyId: company.id,
      });
    }
  }

  console.log(
    `Seed complete: ${developmentSources.length} development sources are available.`,
  );
}

async function run() {
  try {
    await seed();
  } catch (error: unknown) {
    console.error("Seed failed", error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

void run();
