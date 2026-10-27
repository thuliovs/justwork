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
    country?: string;
    isTarget?: boolean;
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
      isTarget: true,
    },
    source: {
      type: "ashby",
      name: "Linear — Ashby",
      baseUrl: "https://api.ashbyhq.com",
      externalKey: "linear",
      configJson: {
        priority: "P0",
        boardUrl: "https://jobs.ashbyhq.com/linear",
        apiEndpoint: "https://api.ashbyhq.com/posting-api/job-board/linear",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "Dashlane",
      normalizedName: "dashlane",
      websiteUrl: "https://www.dashlane.com/",
      careersUrl: "https://job-boards.greenhouse.io/dashlane",
      isTarget: true,
    },
    source: {
      type: "greenhouse",
      name: "Dashlane — Greenhouse",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "dashlane",
      configJson: {
        priority: "P0",
        boardUrl: "https://job-boards.greenhouse.io/dashlane",
        apiEndpoint: "https://api.greenhouse.io/v1/boards/dashlane/jobs?content=true",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "SingleStore",
      normalizedName: "singlestore",
      websiteUrl: "https://www.singlestore.com/",
      careersUrl: "https://job-boards.greenhouse.io/singlestore",
      isTarget: true,
    },
    source: {
      type: "greenhouse",
      name: "SingleStore — Greenhouse",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "singlestore",
      configJson: {
        priority: "P0",
        boardUrl: "https://job-boards.greenhouse.io/singlestore",
        apiEndpoint: "https://api.greenhouse.io/v1/boards/singlestore/jobs?content=true",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "Talkdesk",
      normalizedName: "talkdesk",
      websiteUrl: "https://www.talkdesk.com/",
      careersUrl: "https://www.talkdesk.com/careers/",
      isTarget: true,
    },
    source: {
      type: "greenhouse",
      name: "Talkdesk — Greenhouse",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "talkdesk2",
      configJson: {
        priority: "P0",
        boardUrl: "https://job-boards.greenhouse.io/talkdesk2",
        apiEndpoint: "https://api.greenhouse.io/v1/boards/talkdesk2/jobs?content=true",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "Supabase",
      normalizedName: "supabase",
      websiteUrl: "https://supabase.com/",
      careersUrl: "https://jobs.ashbyhq.com/supabase",
      isTarget: true,
    },
    source: {
      type: "ashby",
      name: "Supabase — Ashby",
      baseUrl: "https://api.ashbyhq.com",
      externalKey: "supabase",
      configJson: {
        priority: "P0",
        boardUrl: "https://jobs.ashbyhq.com/supabase",
        apiEndpoint: "https://api.ashbyhq.com/posting-api/job-board/supabase",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "PostHog",
      normalizedName: "posthog",
      websiteUrl: "https://posthog.com/",
      careersUrl: "https://jobs.ashbyhq.com/posthog",
      isTarget: true,
    },
    source: {
      type: "ashby",
      name: "PostHog — Ashby",
      baseUrl: "https://api.ashbyhq.com",
      externalKey: "posthog",
      configJson: {
        priority: "P0",
        boardUrl: "https://jobs.ashbyhq.com/posthog",
        apiEndpoint: "https://api.ashbyhq.com/posting-api/job-board/posthog",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "ElevenLabs",
      normalizedName: "elevenlabs",
      websiteUrl: "https://elevenlabs.io/",
      careersUrl: "https://jobs.ashbyhq.com/elevenlabs",
      isTarget: true,
    },
    source: {
      type: "ashby",
      name: "ElevenLabs — Ashby",
      baseUrl: "https://api.ashbyhq.com",
      externalKey: "elevenlabs",
      configJson: {
        priority: "P0",
        boardUrl: "https://jobs.ashbyhq.com/elevenlabs",
        apiEndpoint: "https://api.ashbyhq.com/posting-api/job-board/elevenlabs",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "Sourcegraph",
      normalizedName: "sourcegraph",
      websiteUrl: "https://sourcegraph.com/",
      careersUrl: "https://job-boards.greenhouse.io/sourcegraph91",
      isTarget: true,
    },
    source: {
      type: "greenhouse",
      name: "Sourcegraph — Greenhouse",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "sourcegraph91",
      configJson: {
        priority: "P1",
        boardUrl: "https://job-boards.greenhouse.io/sourcegraph91",
        apiEndpoint: "https://api.greenhouse.io/v1/boards/sourcegraph91/jobs?content=true",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "Amplemarket",
      normalizedName: "amplemarket",
      websiteUrl: "https://www.amplemarket.com/",
      careersUrl: "https://job-boards.eu.greenhouse.io/amplemarket",
      isTarget: true,
    },
    source: {
      type: "greenhouse",
      name: "Amplemarket — Greenhouse Europe",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "amplemarket",
      configJson: {
        priority: "P1",
        boardRegion: "europe",
        boardUrl: "https://job-boards.eu.greenhouse.io/amplemarket",
        apiEndpoint: "https://api.greenhouse.io/v1/boards/amplemarket/jobs?content=true",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "Customer.io",
      normalizedName: "customer.io",
      websiteUrl: "https://customer.io/",
      careersUrl: "https://job-boards.greenhouse.io/customerio",
      isTarget: true,
    },
    source: {
      type: "greenhouse",
      name: "Customer.io — Greenhouse",
      baseUrl: "https://api.greenhouse.io",
      externalKey: "customerio",
      configJson: {
        priority: "P1",
        boardUrl: "https://job-boards.greenhouse.io/customerio",
        apiEndpoint: "https://api.greenhouse.io/v1/boards/customerio/jobs?content=true",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
  {
    company: {
      name: "n8n",
      normalizedName: "n8n",
      websiteUrl: "https://n8n.io/",
      careersUrl: "https://n8n.io/careers/",
      isTarget: true,
    },
    source: {
      type: "ashby",
      name: "n8n — Ashby",
      baseUrl: "https://api.ashbyhq.com",
      externalKey: "n8n",
      configJson: {
        priority: "P1",
        boardUrl: "https://jobs.ashbyhq.com/n8n",
        apiEndpoint: "https://api.ashbyhq.com/posting-api/job-board/n8n",
        endpointStatus: "validated",
        lastVerifiedAt: "2026-10-27",
        registrySource: "deep-research-report6",
      },
    },
  },
];

async function seed() {
  for (const definition of developmentSources) {
    const [company] = await db
      .insert(companies)
      .values({ ...definition.company, isTarget: definition.company.isTarget ?? false })
      .onConflictDoUpdate({
        target: companies.normalizedName,
        set: {
          name: definition.company.name,
          websiteUrl: definition.company.websiteUrl,
          careersUrl: definition.company.careersUrl,
          country: definition.company.country,
          isTarget: definition.company.isTarget ?? false,
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
    `Seed complete: ${developmentSources.length} sources are available.`,
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
