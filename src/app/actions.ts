"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ACTION_STATES,
  APPLICATION_STATUSES,
  isOneOf,
} from "@/lib/radar/constants";
import {
  recordApplication,
  saveJobNotes,
  setJobAction,
  updateApplicationStatus,
} from "@/lib/radar/repository";

const text = (value: FormDataEntryValue | null, max: number) => {
  const normalized = typeof value === "string" ? value.trim().slice(0, max) : "";
  return normalized || null;
};

export async function changeJobState(formData: FormData) {
  const jobId = text(formData.get("jobId"), 100);
  const state = text(formData.get("state"), 20);
  if (!jobId || !state || !isOneOf(state, ACTION_STATES)) throw new Error("Ação inválida");
  await setJobAction(jobId, state);
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/applications");
}

export async function updateJobNotes(formData: FormData) {
  const jobId = text(formData.get("jobId"), 100);
  if (!jobId) throw new Error("Vaga inválida");
  await saveJobNotes(jobId, text(formData.get("notes"), 5_000));
  revalidatePath(`/jobs/${jobId}`);
}

export async function submitApplication(formData: FormData) {
  const jobId = text(formData.get("jobId"), 100);
  const rawStatus = text(formData.get("status"), 20) ?? "applied";
  const dateValue = text(formData.get("appliedAt"), 20);
  if (!jobId || !isOneOf(rawStatus, APPLICATION_STATUSES)) throw new Error("Candidatura inválida");
  const appliedAt = dateValue ? new Date(`${dateValue}T12:00:00Z`) : new Date();
  if (Number.isNaN(appliedAt.getTime())) throw new Error("Data de candidatura inválida");
  await recordApplication({
    jobId,
    appliedAt,
    status: rawStatus,
    cvVariant: text(formData.get("cvVariant"), 200),
    notes: text(formData.get("notes"), 5_000),
  });
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/applications");
  redirect(`/jobs/${jobId}?updated=application`);
}

export async function changeApplicationStatus(formData: FormData) {
  const applicationId = text(formData.get("applicationId"), 100);
  const status = text(formData.get("status"), 20);
  if (!applicationId || !status || !isOneOf(status, APPLICATION_STATUSES)) throw new Error("Estado inválido");
  await updateApplicationStatus(applicationId, status);
  revalidatePath("/applications");
}
