import Link from "next/link";
import { notFound } from "next/navigation";

import { APPLICATION_STATUSES, labels } from "@/lib/radar/constants";
import { getJobDetail } from "@/lib/radar/repository";
import { sanitizeDescriptionHtml } from "@/lib/radar/sanitize";

import { submitApplication, updateJobNotes } from "../../actions";
import { Badge, EligibilityBadge, JobStateActions, formatDate } from "../../ui";

export default async function JobDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ updated?: string }> }) {
  const { id } = await params;
  const job = await getJobDetail(id);
  if (!job) notFound();
  const updated = (await searchParams).updated;
  const description = sanitizeDescriptionHtml(job.description);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="page-shell detail-shell">
      <Link className="back-link" href="/">← Voltar ao Radar</Link>
      {updated === "application" && <p className="success-banner">Candidatura guardada com sucesso.</p>}
      <section className="detail-header">
        <div><p className="company-name">{job.companyName ?? "Empresa não identificada"}</p><h1>{job.title}</h1><div className="meta-row"><EligibilityBadge value={job.eligibility} /><Badge>{labels.roleFamily[job.roleFamily]}</Badge><Badge>{labels.remotePolicy[job.remotePolicy]}</Badge><Badge>{labels.jobStatus[job.status]}</Badge></div></div>
        <div className="detail-actions">{job.canonicalUrl && <a className="button button-primary" href={job.canonicalUrl} target="_blank" rel="noreferrer">Candidatar no site oficial ↗</a>}<JobStateActions jobId={job.id} state={job.actionState} /></div>
      </section>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel"><h2>Avaliação</h2><p className="reason large">{job.eligibilityReason ?? "Sem justificativa disponível."}</p></section>
          <section className="panel"><h2>Descrição completa</h2>{description ? <div className="job-description">{description}</div> : <p className="muted">Esta fonte não forneceu uma descrição.</p>}</section>
          <section className="panel"><h2>Fontes associadas <span className="count-pill">{job.sources.length}</span></h2><div className="source-list">{job.sources.map((source) => <article key={`${source.id}-${source.url}`}><div><strong>{source.name}</strong><span>{source.type} · {source.isPresent ? "presente" : "já não aparece na fonte"}</span></div><a href={source.url} target="_blank" rel="noreferrer">Abrir origem ↗</a><small>Vista de {formatDate(source.firstSeenAt)} a {formatDate(source.lastSeenAt)}</small></article>)}</div></section>
        </div>
        <aside className="detail-sidebar">
          <section className="panel facts"><h2>Resumo</h2><dl><div><dt>Localização</dt><dd>{job.locationText ?? "Não indicada"}</dd></div><div><dt>Publicação original</dt><dd>{job.postedAt ? formatDate(job.postedAt) : "Não disponível"}</dd></div><div><dt>Primeira observação</dt><dd>{formatDate(job.firstSeenAt)}</dd></div><div><dt>Última observação</dt><dd>{formatDate(job.lastSeenAt)}</dd></div><div><dt>Estado pessoal</dt><dd>{labels.actionState[job.actionState ?? "new"]}</dd></div></dl></section>
          <section className="panel"><h2>Notas pessoais</h2><form action={updateJobNotes} className="stack-form"><input type="hidden" name="jobId" value={job.id} /><textarea name="notes" rows={5} defaultValue={job.actionNotes ?? ""} placeholder="Ex.: tecnologias relevantes, contacto, próximos passos…" /><button className="button button-secondary" type="submit">Guardar notas</button></form></section>
          <section className="panel"><h2>{job.applicationId ? "Editar candidatura" : "Registar candidatura"}</h2><form action={submitApplication} className="stack-form"><input type="hidden" name="jobId" value={job.id} /><label>Data<input type="date" name="appliedAt" required defaultValue={job.appliedAt?.toISOString().slice(0, 10) ?? today} /></label><label>Estado<select name="status" defaultValue={job.applicationStatus ?? "applied"}>{APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{labels.applicationStatus[status]}</option>)}</select></label><label>Variante do CV<input name="cvVariant" defaultValue={job.cvVariant ?? ""} placeholder="Opcional" /></label><label>Notas<textarea name="notes" rows={4} defaultValue={job.applicationNotes ?? ""} placeholder="Opcional" /></label><button className="button button-primary" type="submit">{job.applicationId ? "Atualizar candidatura" : "Guardar candidatura"}</button></form></section>
        </aside>
      </div>
    </main>
  );
}
