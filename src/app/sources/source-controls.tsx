"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  collectAllAction,
  collectOneAction,
  createSourceAction,
  loginAdmin,
  toggleSourceAction,
  type OperationState,
} from "./actions";

function Submit({ children, className = "button button-primary" }: { children: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? "A processar…" : children}</button>;
}

function Result({ state }: { state: OperationState }) {
  if (!state) return null;
  return <p className={state.ok ? "operation-result success" : "operation-result error"} role="status">{state.message}</p>;
}

function RefreshAfterSuccess({ state }: { state: OperationState }) {
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [router, state]);
  return null;
}

export function AdminLogin({ configured }: { configured: boolean }) {
  const [state, action] = useActionState(loginAdmin, null);
  if (!configured) return <p className="operation-result error">Defina <code>ADMIN_TOKEN</code> no arquivo .env e reinicie a aplicação para habilitar operações.</p>;
  return <form action={action} className="admin-login">
    <label>Token administrativo<input name="token" type="password" autoComplete="current-password" required /></label>
    <Submit>Desbloquear operações</Submit>
    <Result state={state} />
    <RefreshAfterSuccess state={state} />
  </form>;
}

export function CollectAllControl() {
  const [state, action] = useActionState(collectAllAction, null);
  return <form action={action} className="collection-control">
    <Submit>Atualizar agora</Submit>
    <Result state={state} />
  </form>;
}

export function SourceControls({ sourceId, active }: { sourceId: string; active: boolean }) {
  const [collection, collectAction] = useActionState(collectOneAction, null);
  const [toggle, toggleAction] = useActionState(toggleSourceAction, null);
  return <div className="source-control-stack">
    <form action={collectAction}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <Submit className="button button-secondary small">Atualizar fonte</Submit>
    </form>
    <form action={toggleAction}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="active" value={String(!active)} />
      <Submit className="button button-ghost small">{active ? "Desativar" : "Ativar"}</Submit>
    </form>
    <Result state={collection ?? toggle} />
  </div>;
}

export function CreateSourceForm() {
  const [state, action] = useActionState(createSourceAction, null);
  return <form action={action} className="source-create-form">
    <label>Empresa<input name="companyName" required maxLength={160} /></label>
    <label>Provider<select name="kind" defaultValue="greenhouse"><option value="greenhouse">Greenhouse</option><option value="ashby">Ashby</option><option value="lever_global">Lever Global</option><option value="lever_europe">Lever Europe</option></select></label>
    <label>Identificador externo<input name="externalKey" required maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" /></label>
    <label>Website público (opcional)<input name="websiteUrl" type="url" /></label>
    <label>Carreiras (opcional)<input name="careersUrl" type="url" /></label>
    <div><Submit>Cadastrar fonte</Submit></div>
    <Result state={state} />
  </form>;
}
