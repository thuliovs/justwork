import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyEligibility,
  classifyRemotePolicy,
  type EligibilityInput,
} from "../src/lib/jobs/eligibility";
import { classifyRoleFamily } from "../src/lib/jobs/role-classification";

function classified(input: EligibilityInput) {
  return classifyEligibility(input);
}

test("Remote Portugal explícito é eligible", () => {
  const result = classified({
    description: "This is a fully remote role. Candidates can work remotely from Portugal.",
  });
  assert.equal(result.remotePolicy, "remote");
  assert.equal(result.eligibility, "eligible");
  assert.match(result.eligibilityReason, /Portugal|União Europeia/u);
});

test("lista de países aceitos incluindo Portugal é eligible", () => {
  const result = classified({
    description: "Eligible countries: Spain, Portugal, and France.",
    evidence: [{ structuredRemotePolicy: "remote" }],
  });
  assert.equal(result.eligibility, "eligible");
});

test("Remote sem países é uncertain", () => {
  const result = classified({
    evidence: [{ structuredRemotePolicy: "remote" }],
  });
  assert.equal(result.eligibility, "uncertain");
  assert.match(result.eligibilityReason, /não esclarece os países/u);
});

test("Remote EMEA permanece uncertain", () => {
  const result = classified({
    locationText: "Remote EMEA",
    evidence: [{ structuredRemotePolicy: "remote" }],
  });
  assert.equal(result.eligibility, "uncertain");
  assert.match(result.eligibilityReason, /Europa\/EMEA/u);
});

test("US-only explícito é ineligible", () => {
  const result = classified({
    description: "This remote position is for US residents only.",
  });
  assert.equal(result.eligibility, "ineligible");
});

test("híbrido obrigatório fora de Portugal é ineligible", () => {
  const result = classified({
    locationText: "Berlin, Germany",
    evidence: [{ structuredRemotePolicy: "hybrid" }],
  });
  assert.equal(result.eligibility, "ineligible");
});

test("presencial em Lisboa é eligible", () => {
  const result = classified({
    locationText: "Lisbon, Portugal",
    evidence: [{ structuredRemotePolicy: "onsite" }],
  });
  assert.equal(result.eligibility, "eligible");
});

test("localização estruturada em Portugal é eligible com modalidade unknown", () => {
  const result = classified({
    locationText: "Portugal",
    evidence: [{ locationText: "Lisbon, Portugal" }],
  });
  assert.equal(result.remotePolicy, "unknown");
  assert.equal(result.eligibility, "eligible");
  assert.match(result.eligibilityReason, /localização oficial/u);
});

test("Lisboa e Porto com modalidade híbrida são eligible", () => {
  for (const locationText of ["Lisbon, Portugal", "Porto"]) {
    const result = classified({
      locationText,
      evidence: [{ structuredRemotePolicy: "hybrid" }],
    });
    assert.equal(result.remotePolicy, "hybrid");
    assert.equal(result.eligibility, "eligible");
  }
});

test("contratação global explícita é eligible", () => {
  for (const description of [
    "We hire globally. This is a fully remote role.",
    "This role is remote and can be executed globally.",
  ]) {
    assert.equal(classified({ description }).eligibility, "eligible");
  }
  assert.equal(
    classified({
      description:
        'While we hire <a href="/handbook">almost anywhere</a> in the world, Europe is preferred.',
    }).eligibility,
    "eligible",
  );
});

test("restrição específica prevalece sobre declaração global genérica", () => {
  const result = classified({
    description:
      "We hire globally, but we do require successful candidates to be located in the United States.",
    evidence: [{ structuredRemotePolicy: "remote" }],
  });
  assert.equal(result.eligibility, "ineligible");
});

test("candidatos podem trabalhar de qualquer país europeu", () => {
  const result = classified({
    description: "Candidates can work from anywhere in Europe.",
  });
  assert.equal(result.eligibility, "eligible");
});

test("Remote Europe meramente descritivo permanece uncertain", () => {
  const result = classified({
    locationText: "Remote Europe",
    evidence: [{ structuredRemotePolicy: "remote" }],
  });
  assert.equal(result.eligibility, "uncertain");
});

test("Americas Remote é ineligible sem confundir menção incidental", () => {
  assert.equal(
    classified({
      locationText: "Americas Remote",
      evidence: [{ structuredRemotePolicy: "remote" }],
    }).eligibility,
    "ineligible",
  );
  assert.equal(
    classified({
      description: "Collaborate with our Americas team. This role is remote.",
    }).eligibility,
    "uncertain",
  );
});

test("presença obrigatória em Paris é híbrida e ineligible", () => {
  const result = classified({
    locationText: "Paris, France",
    description:
      "We offer remote flexibility, but come together in the office on Mondays, Tuesdays, and Thursdays.",
  });
  assert.equal(result.remotePolicy, "hybrid");
  assert.equal(result.eligibility, "ineligible");
});

test("dias obrigatórios no escritório prevalecem sobre modalidade remote estruturada", () => {
  assert.equal(
    classifyRemotePolicy({
      description: "Remote flexibility is available. Three days per week in the office are required.",
      evidence: [{ structuredRemotePolicy: "remote" }],
    }),
    "hybrid",
  );
});

test("menção incidental a Portugal não gera eligible", () => {
  const result = classified({
    description:
      "Our company history began in Portugal and our offices now span the world. This is a remote role.",
  });
  assert.equal(result.eligibility, "uncertain");
});

test("remote meetings não define trabalho remoto", () => {
  assert.equal(
    classifyRemotePolicy({
      description: "You will facilitate remote meetings and support remote teams.",
    }),
    "unknown",
  );
});

test("localização ausente é uncertain", () => {
  const result = classified({});
  assert.equal(result.remotePolicy, "unknown");
  assert.equal(result.eligibility, "uncertain");
  assert.match(result.eligibilityReason, /não foram informadas/u);
});

test("evidências geográficas explícitas contraditórias são uncertain", () => {
  const result = classified({
    description:
      "Candidates must be based in Portugal. This position is for US residents only.",
    evidence: [{ structuredRemotePolicy: "remote" }],
  });
  assert.equal(result.eligibility, "uncertain");
  assert.match(result.eligibilityReason, /contraditórias/u);
});

test("metadados estruturados de modalidade contraditórios resultam em unknown", () => {
  assert.equal(
    classifyRemotePolicy({
      evidence: [
        { structuredRemotePolicy: "remote" },
        { structuredRemotePolicy: "hybrid" },
      ],
    }),
    "unknown",
  );
});

test("classifica Fullstack", () => {
  assert.equal(
    classifyRoleFamily({ title: "Senior Full-Stack Software Engineer" }),
    "fullstack",
  );
});

test("classifica Backend", () => {
  assert.equal(classifyRoleFamily({ title: "Back-End Developer" }), "backend");
});

test("classifica Frontend", () => {
  assert.equal(classifyRoleFamily({ title: "React Developer" }), "frontend");
});

test("classifica Product Engineer", () => {
  assert.equal(
    classifyRoleFamily({ title: "Senior Product Engineer" }),
    "product_engineering",
  );
});

test("classifica Software Engineer genérico", () => {
  assert.equal(
    classifyRoleFamily({ title: "Senior Software Engineer" }),
    "software_engineering",
  );
});

test("Integration Engineer exige e aceita evidência de desenvolvimento", () => {
  assert.equal(
    classifyRoleFamily({
      title: "Integration Engineer",
      description: "Write code and develop APIs for system integration.",
    }),
    "integration_implementation",
  );
});

test("Solutions Engineer sem programação clara permanece other", () => {
  assert.equal(
    classifyRoleFamily({
      title: "Solutions Engineer",
      description: "Run customer demos and support the sales team.",
    }),
    "other",
  );
});

test("classifica Applied AI Engineer sem incluir Data Scientist", () => {
  assert.equal(
    classifyRoleFamily({ title: "Applied AI Engineer" }),
    "applied_ai",
  );
  assert.equal(classifyRoleFamily({ title: "Data Scientist" }), "other");
});

test("Platform Engineer exige desenvolvimento real", () => {
  assert.equal(
    classifyRoleFamily({
      title: "Platform Engineer",
      description: "Design and implement distributed services and APIs in TypeScript and Go.",
    }),
    "backend",
  );
  assert.equal(
    classifyRoleFamily({
      title: "Platform Engineer",
      description: "Coordinate vendors and monitor operational tickets.",
    }),
    "other",
  );
});

test("SRE operacional permanece other, mas development role é software engineering", () => {
  assert.equal(
    classifyRoleFamily({
      title: "Site Reliability Engineer",
      description: "Monitor alerts, follow runbooks, and coordinate incident response.",
    }),
    "other",
  );
  assert.equal(
    classifyRoleFamily({
      title: "Site Reliability Engineer",
      description: "This is a development role. Build infrastructure automation using Python.",
    }),
    "software_engineering",
  );
});

test("SDK Engineer com autoria de biblioteca é software engineering", () => {
  assert.equal(
    classifyRoleFamily({
      title: "SDK Engineer - Python",
      description: "This is a library-authoring role. Build and maintain our public Python SDK.",
    }),
    "software_engineering",
  );
});

test("AI Platform Engineer com runtime de agentes é applied AI", () => {
  assert.equal(
    classifyRoleFamily({
      title: "AI Platform Engineer",
      description: "Build the runtime that executes AI agents and evaluates model outputs.",
    }),
    "applied_ai",
  );
});

test("Solutions Consultant com implementação e APIs é integração", () => {
  assert.equal(
    classifyRoleFamily({
      title: "Senior Solution Consultant",
      description: "Implement customer solutions, write JavaScript, and integrate REST APIs.",
    }),
    "integration_implementation",
  );
});

test("manager e suporte permanecem other mesmo com vocabulário técnico", () => {
  assert.equal(
    classifyRoleFamily({
      title: "Engineering Manager",
      description: "Lead engineers building TypeScript APIs.",
    }),
    "other",
  );
  assert.equal(
    classifyRoleFamily({
      title: "Database Support Engineer",
      description: "Support PostgreSQL users and troubleshoot production incidents.",
    }),
    "other",
  );
});
