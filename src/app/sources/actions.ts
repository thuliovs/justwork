"use server";

import { revalidatePath } from "next/cache";

import { verifyAdminToken } from "@/lib/admin-auth";
import { clearAdminSession, requireAdminSession, setAdminSession } from "@/lib/admin-session";
import { collectActiveSources, collectSource } from "@/lib/sources";
import {
  createManagedSource,
  MANAGED_SOURCE_OPTIONS,
  setSourceActive,
  type ManagedSourceKind,
} from "@/lib/sources/repository";

export type OperationState = { ok: boolean; message: string } | null;

const text = (formData: FormData, name: string, max = 200) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500);

export async function loginAdmin(
  _previous: OperationState,
  formData: FormData,
): Promise<OperationState> {
  const token = text(formData, "token", 500);
  if (!verifyAdminToken(token)) return { ok: false, message: "Token administrativo inválido." };
  await setAdminSession();
  revalidatePath("/sources");
  return { ok: true, message: "Controles administrativos desbloqueados." };
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSession();
  revalidatePath("/sources");
}

export async function collectAllAction(
  _previous: OperationState,
): Promise<OperationState> {
  void _previous;
  try {
    await requireAdminSession();
    const result = await collectActiveSources();
    revalidatePath("/");
    revalidatePath("/sources");
    return {
      ok: result.status === "success",
      message: `${result.sources} fontes: ${result.succeeded} sucesso, ${result.partial} parciais, ${result.failed} falhas, ${result.skipped} ignoradas. ${result.found} encontradas, ${result.created} novas, ${result.updated} alteradas, ${result.jobsCreated} jobs novos.`,
    };
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
}

export async function collectOneAction(
  _previous: OperationState,
  formData: FormData,
): Promise<OperationState> {
  try {
    await requireAdminSession();
    const sourceId = text(formData, "sourceId", 100);
    const result = await collectSource(sourceId);
    revalidatePath("/");
    revalidatePath("/sources");
    return {
      ok: result.status === "success",
      message: `${result.status}: ${result.found} encontradas, ${result.created} novas, ${result.updated} alteradas, ${result.jobsCreated} jobs novos, ${result.jobsMatched} reutilizados, ${result.durationMs} ms${result.error ? `. ${result.error}` : ""}`,
    };
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
}

export async function toggleSourceAction(
  _previous: OperationState,
  formData: FormData,
): Promise<OperationState> {
  try {
    await requireAdminSession();
    const sourceId = text(formData, "sourceId", 100);
    const active = text(formData, "active", 10) === "true";
    await setSourceActive(sourceId, active);
    revalidatePath("/sources");
    return { ok: true, message: active ? "Fonte ativada." : "Fonte desativada." };
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
}

export async function createSourceAction(
  _previous: OperationState,
  formData: FormData,
): Promise<OperationState> {
  try {
    await requireAdminSession();
    const kind = text(formData, "kind", 30) as ManagedSourceKind;
    if (!(kind in MANAGED_SOURCE_OPTIONS)) throw new Error("Provider inválido.");
    await createManagedSource({
      companyName: text(formData, "companyName", 160),
      kind,
      externalKey: text(formData, "externalKey", 120),
      websiteUrl: text(formData, "websiteUrl", 500) || null,
      careersUrl: text(formData, "careersUrl", 500) || null,
    });
    revalidatePath("/sources");
    return { ok: true, message: "Fonte cadastrada e ativada." };
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
}
