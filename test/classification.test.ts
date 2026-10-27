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
