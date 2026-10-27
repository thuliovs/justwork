# justwork

Radar pessoal de vagas de Software Engineering, com foco em Portugal, Lisboa e trabalho remoto acessível a residentes em Portugal.

O projeto contém a V1 utilizável do Radar, conectores para Greenhouse, Lever e Ashby, persistência idempotente e criação conservadora de vagas canônicas no PostgreSQL.

## Requisitos

- Node.js 20.9 ou superior
- npm
- Docker Desktop, ou outra instância local de PostgreSQL

## Setup local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo de ambiente a partir de `.env.example` e mantenha a mesma `DATABASE_URL` se for usar o PostgreSQL do Docker.

   No PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Inicie o PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Aplique as migrations:

   ```bash
   npm run db:migrate
   ```

5. Adicione os dados mínimos de desenvolvimento:

   ```bash
   npm run db:seed
   ```

6. Inicie a aplicação:

   ```bash
   npm run dev
   ```

A aplicação estará em `http://localhost:3000`. O endpoint `http://localhost:3000/api/health` verifica também a conexão com o PostgreSQL.

## Usar o Radar

- `/` apresenta apenas jobs canónicos, com filtros combináveis e paginação. Por omissão, inelegíveis e descartadas ficam fora da fila principal, mas continuam acessíveis pelo filtro “Incluir inelegíveis e descartadas”.
- Os quatro atalhos no topo abrem as revisões de vagas incertas, família `other`, guardadas e ainda sem ação pessoal.
- `/jobs/[id]` mostra a descrição em texto seguro, todas as fontes, datas de publicação e descoberta, notas e o formulário de candidatura.
- `/applications` acompanha as candidaturas e permite atualizar o estágio do processo.

Guardar, descartar ou restaurar uma vaga altera apenas o estado pessoal. A coleta continua a gerir separadamente o estado objetivo da oportunidade.

## Comandos úteis

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção
npm run lint         # lint
npm run typecheck    # validação de tipos
npm run db:generate  # gera migration após alterar o schema
npm run db:migrate   # aplica migrations pendentes
npm run db:seed      # executa o seed idempotente
npm run db:studio    # abre o Drizzle Studio
npm test             # testes offline e integração PostgreSQL local
npm run source:fetch # lista sources cadastradas
npm run jobs:backfill # associa listings antigas a jobs canônicos
npm run jobs:classify # reclassifica geografia e família dos jobs
```

## Estrutura principal

```text
src/
  app/                 Radar, detalhe, candidaturas, ações e rotas HTTP
  lib/
    connectors/        contrato mínimo dos futuros conectores
    db/                acesso ao PostgreSQL, schema e seed
    jobs/              regras de domínio das vagas nas próximas etapas
    radar/             filtros, consultas, ações e sanitização da interface
drizzle/               migrations SQL versionadas
```

## Modelo inicial

O banco contém:

- `companies`
- `sources`
- `source_runs`
- `source_listings`
- `jobs`
- `job_actions`
- `applications`

O estado objetivo da vaga (`jobs.status`) é separado do estado pessoal (`job_actions.state`). `source_listings` registra separadamente coleta, primeira observação e última observação por meio de `raw_fetched_at`, `first_seen_at` e `last_seen_at`.

Uma ausência isolada não fecha uma vaga. O campo `consecutive_misses` permite implementar depois uma política conservadora sem criar uma máquina de estados agora.

## Conectores ATS

A camada de conectores normaliza respostas de:

- Greenhouse;
- Lever Global;
- Lever Europe;
- Ashby.

O seed adiciona uma source pública de desenvolvimento para cada modo. Para listar seus IDs:

```bash
npm run source:fetch
```

Para coletar e persistir uma source real:

```bash
npm run source:fetch -- <source-id>
```

O comando registra uma linha em `source_runs`, persiste as listings, cria ou reutiliza jobs canônicos na mesma transação e mostra o resumo da execução. Repetir a mesma coleta atualiza a observação sem criar duplicatas.

Os testes de parsing e persistência não acessam APIs externas. Quando `DATABASE_URL` está disponível, a integração PostgreSQL usa registros temporários e os remove ao terminar:

```bash
npm test
```

## Vagas canônicas

Cada `source_listing` é associada a um `job`. A deduplicação considera, nesta ordem:

1. vínculo existente da listing;
2. URL canônica sanitizada, desde que empresa e título não sejam contraditórios;
3. empresa conhecida, título normalizado idêntico e localização conhecida/idêntica.

URLs explícitas diferentes impedem o fallback, e resultados ambíguos permanecem separados. Uma resposta parcial ou uma falha não marca listings como ausentes; somente um inventário completo atualiza `is_present` e `consecutive_misses`, sem fechar jobs.

Para associar dados coletados antes desta etapa, sem acessar APIs externas:

```bash
npm run jobs:backfill
```

O backfill é idempotente e usa os payloads já armazenados.

## Elegibilidade e famílias de cargo

A classificação geográfica é determinística e prioriza recall. Restrições explícitas do anúncio têm precedência, seguidas pelos metadados estruturados do ATS, localização declarada e contexto relevante da descrição. `Remote`, `Remote Europe` e `Remote EMEA` não tornam uma vaga automaticamente elegível para residentes em Portugal.

Cada job recebe:

- `remote_policy`: `remote`, `hybrid`, `onsite` ou `unknown`;
- `eligibility`: `eligible`, `uncertain` ou `ineligible`;
- uma justificativa legível em `eligibility_reason`;
- uma `role_family` determinada pelo título e, nos cargos de integração/solutions, por evidência explícita de desenvolvimento.

Para reclassificar todos os jobs usando apenas os dados armazenados:

```bash
npm run jobs:classify
```

O comando apresenta as distribuições por elegibilidade e família. Repeti-lo sem mudanças nos dados não reescreve os registros.
