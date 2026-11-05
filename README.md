# Employee Onboarding Orchestrator

An AI-assisted new-hire onboarding orchestrator that coordinates documents, equipment,
payroll setup, benefits enrolment, training and manager tasks, based on a worker's profile
and location.

Built for the **AI Innovation Challenge** (use case 3, Employee Onboarding).

> **Status: in development.** This README describes what is actually built today. Sections
> marked *Not built yet* are not built yet. See [Current status](#current-status) for the
> honest picture.

---

## The problem

When an organisation hires someone, between fifteen and forty discrete things have to
happen before that person can work, be paid correctly and be legally employed. Those
things are owned by different people, they depend on each other, and — critically —
**which ones apply depends on where the person works and how they are employed.**

A Canadian hire needs federal and provincial tax declarations. A UK hire needs a
right-to-work check completed *before* day one and pension auto-enrolment. Payroll cannot
be set up before the tax form arrives, or the first payslip is wrong. A laptop with a
five-day lead time ordered four days out means day one is wasted.

In most organisations this lives in a generic checklist plus the memory of two or three
experienced HR staff. The failure modes repeat on every hire.

## The approach

**The model proposes, deterministic code disposes, and a human authorises.**

An LLM proposal is never the system's output. It is a *proposal* that must survive a
numbered validator chain it cannot influence, checked against a policy corpus it cannot
write to, before a named person accepts responsibility for it.

| Pipeline stage | Kind | What it does |
| --- | --- | --- |
| 1. Profile intake | Code | Validate the worker profile |
| 2. Jurisdiction resolution | Code | Find the governing policy documents, or **refuse** |
| 3. Clause retrieval | Code | Hybrid metadata + vector search over approved clauses |
| 4. Plan proposal | **LLM** | Propose tasks, each citing the clause that mandates it |
| 5. Validator chain | Code | V1–V8: accept, repair, reject or insert |
| 6. Graph and risk | Code | Topological sort, critical path, lead-time risk |
| 7. Human review | Human | Approve, edit or escalate |
| 8. Dispatch and audit | Code | Append-only audit trail |

The model touches exactly one stage. Everything it produces is checked by stages that
do not involve it.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript 5.7 end to end |
| API | Node.js 20 + Express 4 |
| Validation | Zod — one schema drives runtime validation, TS types, OpenAPI and the LLM output contract |
| Database | PostgreSQL 16 (Neon) + pgvector |
| ORM | Prisma 6 |
| Auth | JWT access + rotating refresh tokens, bcrypt, RBAC with row scoping |
| Frontend | React 19 + Vite + TanStack Query |
| API docs | OpenAPI 3.1, generated from the Zod schemas |
| Logging | pino (structured, request-id correlated) |
| Metrics | prom-client at `/metrics` |
| CI | GitHub Actions |
| LLM | Open-weight model via Ollama *(not wired up yet)* |

---

## Repository layout

An npm-workspaces monorepo. `apps/` holds the two deployable applications; `packages/`
holds the one thing both of them need to share.

```
employee-onboarding/
├── apps/
│   ├── api/                      Express REST API
│   │   ├── prisma/
│   │   │   ├── schema.prisma     32 models, 29 enums
│   │   │   └── seed.ts           RBAC catalog + reference data + demo users
│   │   └── src/
│   │       ├── db/client.ts      Prisma client singleton
│   │       ├── auth/             tokens, login/refresh/logout service, routes
│   │       ├── middleware/       authenticate, authorize, validate, errors, request-id
│   │       ├── rbac/             permission resolution + scope enforcement
│   │       ├── routes/           admin, reference, ops
│   │       └── scripts/          OpenAPI emitter
│   └── web/                      React 19 + Vite frontend
│       └── src/lib/api.ts        typed API client
├── packages/
│   └── contracts/                the ONE shared package — see below
│       └── src/
│           ├── common.ts         primitives, enums, error envelope, pagination
│           ├── rbac.ts           roles, 40 permissions, scopes  ← source of truth
│           ├── auth.ts           JWT claims, login/refresh shapes
│           ├── employees.ts      employee CRUD
│           ├── plans.ts          plans, tasks, citations, findings, approval
│           ├── services.ts       the six workflow services
│           ├── policies.ts       knowledge base + admin + eval metrics
│           ├── llm.ts            the model's constrained output contract
│           └── openapi.ts        OpenAPI 3.1 document builder
├── docs/
│   ├── openapi.json              generated — do not hand-edit
│   └── API-Contract.pdf          generated from openapi.json
└── .github/workflows/ci.yml
```

### Why there is a `packages/` folder with exactly one thing in it

`packages/` is for code that **both** `apps/api` and `apps/web` import. Right now that is
one package, `@eo/contracts`, and it earns its place because a single Zod schema
definition is used **four ways**:

1. Express validates incoming requests against it.
2. React imports the inferred TypeScript types from it, so the UI cannot drift from the API.
3. `docs/openapi.json` is generated from it.
4. The JSON Schema handed to the LLM for constrained decoding comes from it.

If it lived inside `apps/api`, the frontend would have to reach across into the backend's
source tree to import types — or, far more likely, redeclare them by hand and let them go
stale. CI fails the build if the committed `openapi.json` stops matching these schemas.

The database deliberately does **not** live here. Only the API talks to Postgres, so
`prisma/` and the client sit inside `apps/api` where they belong.

---

## Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL 16 database with the `vector` and `citext` extensions.
  We use [Neon](https://neon.tech) (free tier, ~2 minutes, no install).

### Setup

```bash
git clone https://github.com/LakshmiDeepak27/Employee-Onboarding.git
cd Employee-Onboarding
npm install

cp .env.example .env
#   Paste your Neon connection string into DATABASE_URL and DIRECT_URL.
#   Generate secrets:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm run db:generate      # generate the Prisma client
npm run db:push          # create the tables
npm run db:seed          # RBAC catalog, reference data, demo users

npm run dev              # API on http://localhost:4000
npm run dev -w @eo/web   # frontend on http://localhost:5173
```

Open **http://localhost:4000/docs** for interactive API documentation.

### Demo accounts

All three use the password `Onboard!ng2026`.

| Email | Role | Scope | Sees |
| --- | --- | --- | --- |
| `hr.admin@demo.io` | `hr_admin` | `ORG` | All five seeded employees |
| `manager@demo.io` | `manager` | `REPORTS` | Only Priya, their direct report |
| `priya@demo.io` | `employee` | `SELF` | Only herself |

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API with hot reload |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:seed` | Seed RBAC, reference data and demo users (idempotent) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run openapi` | Regenerate `docs/openapi.json` |
| `npm run openapi:check` | Fail if the committed spec drifts from the code |
| `npx tsc -b` | Typecheck the whole workspace |

---

## Authentication and authorization

### Token model

| Token | Lifetime | Storage |
| --- | --- | --- |
| Access | 15 min | `Authorization: Bearer <token>` |
| Refresh | 7 days | httpOnly `eo_refresh` cookie, single use, rotated on every refresh |

**The access token carries identity and role names only — not permissions.** Permissions
are resolved from the database on every request (with a 30-second cache). The cost is one
lookup; the benefit is that revoking a role takes effect on the next request rather than
whenever the token happens to expire.

A `tokenVersion` column gives instant revocation with no blocklist: changing a password or
forcing a logout increments it, and every live access token for that user dies immediately.

Refresh tokens are stored only as SHA-256 hashes. Each belongs to a rotation *family*;
replaying an already-rotated token revokes the whole family and logs
`TOKEN_REUSE_DETECTED`.

### Three roles

Matching the system architecture diagram.

| Role | Scope | Permissions | Notes |
| --- | --- | --- | --- |
| `hr_admin` | `ORG` | 40 | Everything. **The only role that can approve a plan.** |
| `manager` | `REPORTS` | 14 | Direct reports only. No payroll grant at all. |
| `employee` | `SELF` | 11 | Their own record only. |

### Scope is the point

A permission is `resource.action` held **at a scope**. Authorization runs two gates:

1. Does the caller hold this permission at all? → **403** if not.
2. Is the target row inside the scope they hold it at? → **404** if not.

Out-of-scope rows return **404, not 403**, because a 403 would confirm the record exists.

```bash
# as manager@demo.io
GET /api/v1/employees              # 200 — returns Priya only
GET /api/v1/employees/{tom_id}     # 404 — not their report, existence not leaked
PUT /api/v1/tasks/{id}/payroll     # 403 — this role has no payroll grant
```

Nothing is hard-coded in route files. The whole catalog lives in
`packages/contracts/src/rbac.ts` and is read by the seed, the middleware and the
documentation. Guarding a route is one line:

```ts
router.get(
  '/employees/:id',
  requirePermission('employee.read', { target: byParam('id') }),
  handler,
);
```

### Development bypass

So teammates can build routes before login is wired into their screens:

```bash
curl -H "x-dev-user: hr.admin@demo.io" http://localhost:4000/api/v1/employees
```

The API **refuses to boot** if `DEV_AUTH_BYPASS=true` while `NODE_ENV` is anything other
than `development`, so it cannot reach CI or a deployed environment.

---

## Database schema

32 models, 29 enums, in `packages/db/prisma/schema.prisma`. Every table maps to a component
in the architecture diagram.

| Diagram component | Tables |
| --- | --- |
| Authentication (JWT) / RBAC | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`, `auth_events` |
| Employee Profile Processor | `employees`, `departments`, `jurisdictions` |
| HR Policy Knowledge Base | `policy_documents`, `policy_clauses` |
| Rules Engine | `task_templates` |
| Onboarding Orchestrator | `onboarding_plans`, `plan_tasks`, `plan_task_dependencies`, `task_citations` |
| Document Collection & Verification | `documents`, `document_requests` |
| Equipment Allocation (IT) | `equipment_catalog`, `equipment_assignments` |
| Payroll Setup (Finance) | `payroll_setups` |
| Benefits Enrolment (HR) | `benefit_plans`, `benefit_enrollments` |
| Training Assignment (L&D) | `training_courses`, `training_assignments` |
| Manager Tasks (Team Setup) | `manager_tasks` |
| AI Guardrails / Audit Logs | `llm_calls`, `validation_findings`, `audit_events`, `escalations` |
| Email / Notifications | `notifications` |

### Four decisions worth knowing

**A citation is a foreign key, not a string.** `task_citations.clause_id` references
`policy_clauses.id`, whose primary key is a stable readable string like `CA-ON-BEN-004`.
This makes citation validation a database join rather than a hope: a clause id the model
invents simply fails the constraint. We also store the quoted span and verify it actually
occurs in the clause body.

**The dependency graph is edges in a table.** `plan_task_dependencies` is a plain join
table with `CHECK (task_id <> depends_on_id)`, so topological sort and cycle detection are
ordinary code with ordinary unit tests.

**Deadlines are never stored from the model.** `task_templates` holds a deadline *rule* and
`jurisdictions` holds the business-day calendar. `plan_tasks.due_date` is always computed
in code. The model is never given a date field to fill in.

**The audit trail is append-only at the grant level.** `audit_events` will have UPDATE and
DELETE revoked from the application role, so the API physically cannot rewrite history.

### What the schema deliberately does not store

- **No bank account or national id numbers.** `payroll_setups` keeps only `last4` plus an
  opaque token. Those request fields are write-only and never appear in a response.
- **No plaintext secrets.** Passwords are bcrypt hashes; refresh tokens are SHA-256 digests.
- **Every policy document is flagged `is_mock`.** The corpus is written by the team for
  demonstration and is **not legal guidance**.

---

## API documentation

- **Interactive:** http://localhost:4000/docs (Swagger UI)
- **Machine-readable:** [`docs/openapi.json`](docs/openapi.json) — 53 paths, 60 operations, 87 schemas
- **PDF reference:** [`docs/API-Contract.pdf`](docs/API-Contract.pdf)

All three are generated from the same Zod schemas that validate requests at runtime, so
they cannot drift from the code. CI enforces it.

Every non-2xx response uses one envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request body failed validation",
    "fields": [{ "path": "startDate", "message": "must be YYYY-MM-DD" }],
    "requestId": "b7c1e2f0-5a3d-4c11-9f2e-8d6a4b0c1e77",
    "timestamp": "2026-11-06T09:30:00.000Z"
  }
}
```

---

## Current status

Honest state of the build. Nothing below is marked done unless it compiles and is committed.

### Built

| Area | What exists |
| --- | --- |
| Database schema | 32 models, 29 enums, validates against Prisma. Seed script covering RBAC, 4 jurisdictions, catalogs and 5 demo employees |
| Contracts package | Zod schemas for every endpoint; 40-permission RBAC catalog; the LLM output contract |
| OpenAPI | 60 operations generated from Zod; Swagger UI at `/docs`; CI drift check |
| Auth | Login, refresh with rotation + reuse detection, logout, change password, `/auth/me`. Account lockout, rate limiting, `auth_events` logging |
| RBAC | Permission resolution with cache, scope enforcement (`SELF`/`REPORTS`/`ORG`), `requirePermission` middleware, 404-not-403 rule |
| Admin API | User CRUD, role assignment, role listing — all audited |
| Ops | `/healthz`, `/readyz` (database and LLM reported separately), `/metrics` |
| Middleware | Request id, Zod validation, structured errors, pino logging with redaction |
| CI | GitHub Actions: typecheck, lint, OpenAPI drift, unit, integration with a pgvector service, build |
| Frontend | Vite + React 19 scaffold with a typed API client, login, and a scope demonstration screen |

### Not built yet

| Area | Owner |
| --- | --- |
| Policy corpus (the mock jurisdiction documents) | — |
| Rules engine: deadline maths, business-day calendars, topological sort, critical path | — |
| LLM integration: Ollama client, prompts, constrained decoding, pgvector retrieval | — |
| Validator chain V1–V8 | — |
| Plan generation endpoints and the pg-boss job runner | — |
| The six workflow service endpoints | — |
| Employee CRUD endpoints (contracts exist, handlers do not) | — |
| Frontend: HR dashboard, plan review, dependency graph, findings panel | — |
| Tests (the CI jobs run with `--passWithNoTests`) | — |
| Evaluation harness and golden set | — |
| Docker Compose for one-command startup | — |
| Demo recording | — |

### Known gaps and caveats

- **No tests yet.** The CI test jobs pass trivially because there are no test files. The
  harness is wired; the tests are not written.
- **`audit_events` grant revocation** is described above but the migration that performs
  the `REVOKE` has not been written yet. Today it is append-only by convention only.
- **Migrations use `db push`, not `migrate dev`.** Fine for the hackathon; a real project
  would want versioned migrations before any shared environment.
- **The policy corpus is author-written.** It is realistic in shape but it is not real law
  and must never be presented as legal guidance.

---

## Team

| Workstream | Owner |
| --- | --- |
| Database schema, CI/CD, authentication (RBAC), API contracts | Himanshu |
| Frontend | Trisha, Neelavathi |
| Onboarding orchestration — first three workflow services | Deepak, Teja, Himanshu, Dinesh |
| Onboarding orchestration — last three workflow services | Vardhan, Shruthi |
| Deployment and DevOps | Deepak, Himanshu, Vardhan |
| Presentation | Neelavathi |

---

## License

MIT
