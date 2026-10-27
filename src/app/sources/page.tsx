import type { Metadata } from "next";

import { isAdminConfigured } from "@/lib/admin-auth";
import { hasAdminSession } from "@/lib/admin-session";
import { getSourcesDashboard } from "@/lib/sources/repository";

import { logoutAdmin } from "./actions";
import { AdminLogin, CollectAllControl, CreateSourceForm, SourceControls } from "./source-controls";

export const metadata: Metadata = { title: "Fontes" };
export const dynamic = "force-dynamic";

const dateTime = (value: Date | null) => value
  ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(value)
  : "Nunca";

const statusLabel = {
  success: "Sucesso",
  partial: "Parcial",
  failed: "Falha",
  running: "Em andamento",
} as const;

export default async function SourcesPage() {
  const [dashboard, admin] = await Promise.all([getSourcesDashboard(), hasAdminSession()]);
  return <main className="page-shell sources-page">
    <section className="page-heading">
      <div><p className="eyebrow">Operação do radar</p><h1>Fontes e saúde</h1><p className="lede">Acompanhe as coletas, investigue falhas e mantenha apenas as fontes que deseja consultar diariamente.</p></div>
      <div className="total-card"><strong>{dashboard.active}</strong><span>fontes ativas</span></div>
    </section>

    <section className="health-grid" aria-label="Resumo operacional">
      <article><strong>{dashboard.total}</strong><span>Total</span></article>
      <article><strong>{dashboard.inactive}</strong><span>Desativadas</span></article>
      <article><strong>{dashboard.stale}</strong><span>Sem coleta recente</span></article>
      <article><strong className="health-date">{dateTime(dashboard.latestRun?.startedAt ?? null)}</strong><span>Última execução global</span></article>
    </section>

    <section className="panel admin-panel">
      <div><h2>Operações administrativas</h2><p className="muted">As coletas rodam no servidor. O token nunca é enviado às fontes nem guardado no banco.</p></div>
      {admin ? <div className="admin-actions"><CollectAllControl /><form action={logoutAdmin}><button className="button button-ghost small">Bloquear</button></form></div> : <AdminLogin configured={isAdminConfigured()} />}
    </section>

    <section className="source-dashboard">
      {dashboard.items.map((source) => <article className="source-health-card" key={source.id}>
        <header>
          <div><p className="company-name">{source.companyName ?? source.type}</p><h2>{source.name}</h2><p className="source-endpoint">{source.type} · {source.externalKey ?? "sem identificador"}</p></div>
          <div className="source-badges"><span className={`badge ${source.isActive ? "badge-eligible" : ""}`}>{source.isActive ? "Ativa" : "Desativada"}</span>{source.isStale && <span className="badge badge-uncertain">Sem coleta recente</span>}</div>
        </header>
        <div className="source-latest">
          <span><small>Última coleta</small>{dateTime(source.latestRun?.startedAt ?? null)}</span>
          <span><small>Estado</small>{source.latestRun ? statusLabel[source.latestRun.status] : "Sem histórico"}</span>
          <span><small>Encontradas</small>{source.latestRun?.recordsFound ?? "—"}</span>
          <span><small>Novas / alteradas</small>{source.latestRun ? `${source.latestRun.recordsCreated} / ${source.latestRun.recordsUpdated}` : "—"}</span>
          <span><small>Último sucesso</small>{dateTime(source.lastSuccessAt)}</span>
        </div>
        {source.latestRun?.errorMessage && <p className="source-error">{source.latestRun.errorMessage}</p>}
        {admin && <SourceControls sourceId={source.id} active={source.isActive} />}
        <details><summary>Últimas execuções e configuração</summary>
          <p className="source-endpoint">Endpoint confiável: {source.baseUrl}<br />Região: {typeof source.configJson.region === "string" ? source.configJson.region : "padrão"}</p>
          {source.recentRuns.length ? <div className="run-table">{source.recentRuns.map((run) => <div key={run.id}><span className={`run-status status-${run.status}`}>{statusLabel[run.status]}</span><span>{dateTime(run.startedAt)}</span><span>{run.recordsFound} encontradas</span><span>{run.recordsCreated} novas</span><span>{run.recordsUpdated} alteradas</span>{run.errorMessage && <span className="run-error">{run.errorMessage}</span>}</div>)}</div> : <p className="muted">Ainda não há execuções.</p>}
        </details>
      </article>)}
    </section>

    {admin && <section className="panel"><h2>Cadastrar fonte suportada</h2><p className="muted">Somente endpoints fixos de Greenhouse, Ashby e Lever são aceitos.</p><CreateSourceForm /></section>}
  </main>;
}
