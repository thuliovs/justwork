import Link from "next/link";

import {
  ACTION_STATES,
  AGE_RANGES,
  ELIGIBILITIES,
  JOB_STATUSES,
  REMOTE_POLICIES,
  ROLE_FAMILIES,
  labels,
} from "@/lib/radar/constants";
import { parseRadarFilters, type RawSearchParams } from "@/lib/radar/filters";
import { getRadarFacets, listRadarJobs } from "@/lib/radar/repository";

import { Badge, EligibilityBadge, JobStateActions, formatDate, relativeDate } from "./ui";

function option(value: string, label: string) {
  return <option key={value} value={value}>{label}</option>;
}

function pageHref(params: RawSearchParams, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first && key !== "page") next.set(key, first);
  }
  next.set("page", String(page));
  return `/?${next.toString()}`;
}

export default async function RadarPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const rawParams = await searchParams;
  const filters = parseRadarFilters(rawParams);
  const [{ items, total, page, pageCount }, facets] = await Promise.all([
    listRadarJobs(filters),
    getRadarFacets(),
  ]);

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Radar pessoal</p>
          <h1>Oportunidades para rever</h1>
          <p className="lede">Uma fila prática de vagas canónicas, priorizada para decisões rápidas.</p>
        </div>
        <div className="total-card"><strong>{facets.counts.all}</strong><span>vagas no radar</span></div>
      </section>

      <nav className="shortcut-grid" aria-label="Atalhos de revisão">
        <Link href="/?eligibility=uncertain&all=1"><strong>{facets.counts.uncertain}</strong><span>Rever incertas</span></Link>
        <Link href="/?family=other&all=1"><strong>{facets.counts.other}</strong><span>Rever “other”</span></Link>
        <Link href="/?action=saved&all=1"><strong>{facets.counts.saved}</strong><span>Vagas guardadas</span></Link>
        <Link href="/?action=new&all=1"><strong>{facets.counts.untouched}</strong><span>Sem ação pessoal</span></Link>
      </nav>

      <form className="filter-panel" method="get">
        <div className="search-field">
          <label htmlFor="q">Pesquisar</label>
          <input id="q" name="q" defaultValue={filters.query} placeholder="Título ou empresa" />
        </div>
        <div><label htmlFor="eligibility">Elegibilidade</label><select id="eligibility" name="eligibility" defaultValue={filters.eligibility ?? ""}><option value="">Todas visíveis</option>{ELIGIBILITIES.map((v) => option(v, labels.eligibility[v]))}</select></div>
        <div><label htmlFor="family">Família</label><select id="family" name="family" defaultValue={filters.roleFamily ?? ""}><option value="">Todas</option>{ROLE_FAMILIES.map((v) => option(v, labels.roleFamily[v]))}</select></div>
        <div><label htmlFor="company">Empresa</label><select id="company" name="company" defaultValue={filters.companyId ?? ""}><option value="">Todas</option>{facets.companies.map((c) => option(c.id, c.name))}</select></div>
        <div><label htmlFor="mode">Modalidade</label><select id="mode" name="mode" defaultValue={filters.remotePolicy ?? ""}><option value="">Todas</option>{REMOTE_POLICIES.map((v) => option(v, labels.remotePolicy[v]))}</select></div>
        <div><label htmlFor="status">Estado da vaga</label><select id="status" name="status" defaultValue={filters.status ?? ""}><option value="">Todos</option>{JOB_STATUSES.map((v) => option(v, labels.jobStatus[v]))}</select></div>
        <div><label htmlFor="action">Estado pessoal</label><select id="action" name="action" defaultValue={filters.actionState ?? ""}><option value="">Todos visíveis</option>{ACTION_STATES.map((v) => option(v, labels.actionState[v]))}</select></div>
        <div><label htmlFor="age">Idade da publicação</label><select id="age" name="age" defaultValue={filters.age ?? ""}><option value="">Qualquer</option>{AGE_RANGES.map((v) => option(v, labels.ageRange[v]))}</select></div>
        <div><label htmlFor="source">Fonte</label><select id="source" name="source" defaultValue={filters.sourceId ?? ""}><option value="">Todas</option>{facets.sources.map((s) => option(s.id, s.name))}</select></div>
        <label className="check-field"><input type="checkbox" name="all" value="1" defaultChecked={filters.includeAll} /> Incluir inelegíveis e descartadas</label>
        <div className="filter-actions"><button className="button button-primary" type="submit">Aplicar filtros</button><Link className="button button-ghost" href="/">Limpar</Link></div>
      </form>

      <div className="results-heading"><p><strong>{total}</strong> resultado{total === 1 ? "" : "s"}</p><span>Página {page} de {pageCount}</span></div>
      {items.length ? (
        <div className="job-list">
          {items.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="job-card-main">
                <div className="job-title-row"><div><p className="company-name">{job.companyName ?? "Empresa não identificada"}</p><h2><Link href={`/jobs/${job.id}`}>{job.title}</Link></h2></div><EligibilityBadge value={job.eligibility} /></div>
                <div className="meta-row"><span>{job.locationText ?? "Localização não indicada"}</span><span>{labels.remotePolicy[job.remotePolicy]}</span><Badge>{labels.roleFamily[job.roleFamily]}</Badge><Badge>{labels.jobStatus[job.status]}</Badge></div>
                <p className="reason">{job.eligibilityReason ?? "Sem justificativa disponível."}</p>
                <div className="date-grid"><span><small>Publicada</small>{job.postedAt ? `${formatDate(job.postedAt)} · ${relativeDate(job.postedAt)}` : "Data não disponível"}</span><span><small>Descoberta</small>{formatDate(job.firstSeenAt)} · {relativeDate(job.firstSeenAt)}</span><span><small>Fonte principal</small>{job.sourceName ?? "Não identificada"}</span><span><small>Estado pessoal</small>{labels.actionState[job.actionState ?? "new"]}</span></div>
              </div>
              <JobStateActions jobId={job.id} state={job.actionState} />
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><h2>Nenhuma vaga encontrada</h2><p>Altere ou limpe os filtros para voltar à fila principal.</p><Link className="button button-primary" href="/">Ver radar principal</Link></div>
      )}
      {pageCount > 1 && <nav className="pagination" aria-label="Paginação">{page > 1 ? <Link href={pageHref(rawParams, page - 1)}>← Anterior</Link> : <span /> }<span>{page} / {pageCount}</span>{page < pageCount ? <Link href={pageHref(rawParams, page + 1)}>Seguinte →</Link> : <span />}</nav>}
    </main>
  );
}
