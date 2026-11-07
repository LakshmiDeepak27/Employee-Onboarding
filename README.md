# Employee Onboarding

React/Vite frontend, Express API, Prisma/PostgreSQL, and optional Ollama/Gemini plan generation. The blue-and-white redesign uses real API records, nested routes, role guards, refresh-session recovery, and responsive layouts.

## Run locally

Keep the supplied credentials only in the ignored `.env`. Teammates copy `.env.example` and obtain credentials privately.

```sh
npm ci
npm run db:generate
npm run build
npm start
```

Open http://localhost:4000. For development, run `npm run dev:api` and `npm run dev:web` in separate terminals; Vite opens on port 5173.

For a **new empty database**, run `npm run db:deploy`, then `npm run db:seed` if you want the explicitly labelled demonstration accounts, catalogs and policies. Do not seed production with demonstration accounts. The supplied Neon database already has its migrations applied.

## Workflow

1. HR creates an employee, including location, department and reporting manager.
2. Generate a plan and track its saved background job. When the configured model is unavailable, the deterministic baseline is used. Locations without policy coverage produce a refusal.
3. Review sensitive tasks, then approve the plan. Approval creates downstream service records.
4. Complete document, equipment, payroll, benefits, training and manager work. Prerequisites restrict actions; verified work advances plan progress.
5. Inspect plan audit history and download the IT pack. Its scripts are templates for administrator review, not automatically executed integrations.

HR, manager and employee workspaces share consistent navigation. The employee assistant currently searches policy sources; it does not claim to answer with AI.

## Configuration

- `DATABASE_URL`: pooled Neon connection for the application.
- `DIRECT_URL`: direct connection for migrations.
- Separate JWT secrets are required. Keep `DEV_AUTH_BYPASS=false` outside local development.
- `LLM_PROVIDER=ollama` uses `OLLAMA_BASE_URL` and `LLM_MODEL`. Use `gemini` with `GEMINI_API_KEY`, or `disabled` for baseline-only generation.
- For local inference: install Ollama, run `ollama pull qwen2.5:7b-instruct`, then `ollama serve`. The adapter uses schema-constrained `/api/chat`, bounded retries and timeouts.
- Retrieval currently uses database jurisdiction/topic matching, not vector embeddings; `EMBEDDING_MODEL` is reserved for a future vector index.
- Documents are stored in `DOCUMENT_STORAGE_DIR`, default `.data/documents`. PDF, PNG and JPEG uploads are limited to 5 MB and require authenticated download.
- Email password recovery is not configured; the UI directs users to HR.

## Deployment

The simplest target is one Node/container service serving both the API and built frontend, with Neon and persistent document storage.

```sh
docker compose up --build -d
```

Compose uses `.env`, forces production mode and disables the development auth bypass. It applies migrations without reseeding or pushing schema. Set `CORS_ORIGIN` to the deployed HTTPS origin, use fresh JWT secrets and mount the document volume. Run a single API instance: jobs execute in-process and are not a distributed, restart-resilient queue.

Docker execution and public hosting have not been verified in this environment. No live deployment has been made. For horizontal scaling, add durable workers and shared object storage first.

## Checks

```sh
npm run build
npm run lint
npm test
npm run openapi:check
```

Live tests require the configured development database, seeded demo accounts and `RUN_DATABASE_TESTS=true`. Run `apps/api/test/live_api.test.ts` first, then `apps/api/test/workflow_live.test.ts`. They create uniquely named `qa-…@example.invalid` employee records and a harmless upload; those records remain available for inspection.

See [verification and limitations](docs/REDESIGN-PROGRESS.md).

## Backend LLM boundary

Proposals are validated before persistence. Template authority, owner, service, deadlines and prerequisites override model values. Citations must quote stored clauses; missing database sources are never replaced with invented in-memory policy data. Cyclic proposals are rejected. Validation findings are saved in the same plan transaction, and the configured model name is recorded. Active job creation is serialized per employee with a PostgreSQL advisory lock.

Ollama API contract: https://docs.ollama.com/api/chat and https://docs.ollama.com/capabilities/structured-outputs.

Local Ollama was not running during verification. Adapter success/failure/schema tests use mocked HTTP responses; they do not establish real model quality. In Docker, localhost refers to the container: use a reachable private Ollama service URL or host.docker.internal for a host service, without exposing Ollama publicly.
