import Link from "next/link";

import { changeJobState } from "./actions";
import { labels, type ActionState, type Eligibility } from "@/lib/radar/constants";

export function Badge({ kind, children }: { kind?: string; children: React.ReactNode }) {
  return <span className={`badge ${kind ? `badge-${kind}` : ""}`}>{children}</span>;
}

export function EligibilityBadge({ value }: { value: Eligibility }) {
  return <Badge kind={value}>{labels.eligibility[value]}</Badge>;
}

export function JobStateActions({ jobId, state }: { jobId: string; state: ActionState | null }) {
  const current = state ?? "new";
  const actions: { state: ActionState; label: string; className: string }[] = [
    { state: "saved", label: current === "saved" ? "Guardada" : "Guardar", className: "button-secondary" },
    { state: "dismissed", label: current === "dismissed" ? "Descartada" : "Descartar", className: "button-ghost" },
    { state: "new", label: "Restaurar", className: "button-ghost" },
  ];
  return (
    <div className="action-row">
      {actions.filter((action) => action.state !== current && !(action.state === "new" && current === "new")).map((action) => (
        <form action={changeJobState} key={action.state}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="state" value={action.state} />
          <button className={`button small ${action.className}`} type="submit">{action.label}</button>
        </form>
      ))}
      <Link className="button small button-primary" href={`/jobs/${jobId}`}>Ver detalhes</Link>
    </div>
  );
}

export function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Lisbon" }).format(value);
}

export function relativeDate(value: Date, now = new Date()) {
  const days = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86_400_000));
  if (days === 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}
