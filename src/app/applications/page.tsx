import Link from "next/link";

import { APPLICATION_STATUSES, isOneOf, labels } from "@/lib/radar/constants";
import { getRadarFacets, listApplications } from "@/lib/radar/repository";

import { changeApplicationStatus } from "../actions";
import { Badge, formatDate } from "../ui";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string; company?: string }> }) {
  const params = await searchParams;
  const status = isOneOf(params.status, APPLICATION_STATUSES) ? params.status : undefined;
  const [{ companies }, items] = await Promise.all([getRadarFacets(), listApplications({ status, companyId: params.company || undefined })]);
  return (
    <main className="page-shell">
      <section className="page-heading"><div><p className="eyebrow">Acompanhamento</p><h1>Candidaturas</h1><p className="lede">Um registo simples do processo, mesmo depois de a vaga fechar.</p></div><div className="total-card"><strong>{items.length}</strong><span>nesta vista</span></div></section>
      <form className="application-filters" method="get"><label>Estado<select name="status" defaultValue={status ?? ""}><option value="">Todos</option>{APPLICATION_STATUSES.map((v) => <option key={v} value={v}>{labels.applicationStatus[v]}</option>)}</select></label><label>Empresa<select name="company" defaultValue={params.company ?? ""}><option value="">Todas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="button button-primary" type="submit">Filtrar</button><Link className="button button-ghost" href="/applications">Limpar</Link></form>
      {items.length ? <div className="application-list">{items.map((item) => <article className="application-card" key={item.id}><div><p className="company-name">{item.companyName ?? "Empresa não identificada"}</p><h2><Link href={`/jobs/${item.jobId}`}>{item.title}</Link></h2><p className="application-summary">Candidatado em {formatDate(item.appliedAt)}{item.cvVariant ? ` · CV ${item.cvVariant}` : ""}</p>{item.notes && <p className="notes-preview">{item.notes}</p>}</div><form action={changeApplicationStatus} className="inline-status"><input type="hidden" name="applicationId" value={item.id} /><Badge kind={item.status}>{labels.applicationStatus[item.status]}</Badge><select aria-label={`Estado de ${item.title}`} name="status" defaultValue={item.status}>{APPLICATION_STATUSES.map((v) => <option key={v} value={v}>{labels.applicationStatus[v]}</option>)}</select><button className="button small button-secondary" type="submit">Atualizar</button></form></article>)}</div> : <div className="empty-state"><h2>Ainda não há candidaturas nesta vista</h2><p>Registe uma candidatura a partir do detalhe de uma vaga.</p><Link className="button button-primary" href="/">Explorar vagas</Link></div>}
    </main>
  );
}
