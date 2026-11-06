# Payroll Setup handoff — Teja

For AI Innovation Challenge Option 3. Submission deadline supplied by the team: **7 November 2026, 19:00 IST**.

## Reviewed baseline

Implementation starts at `main` commit `b5083ccbc1435f92f717932f198373e3989ee3ac`.
At inspection, the only other remote branch was `feat/schema-rbac` at `460de17`, already merged into main. No existing payroll implementation or test suite was present.

All five supplied references were inspected: Employee-Onboarding-Progress-Report.pdf (5 pages), Employee-Onboarding-API-Contract.pdf (15 pages), AI_Challenge_Option3_and_Option2_DeepDive.pdf (35 pages), image(4).png, and Pasted text(20261106-152805).txt. The pasted text is the project README/status narrative. Option 2 material is a different candidate project, not this module's scope.

The current repository is authoritative where the early design differs:

- npm workspaces: `apps/api`, `apps/web`, `packages/contracts`.
- Express 4 + TypeScript, React 19/Vite, PostgreSQL + pgvector/citext, Prisma 6, shared Zod schemas, generated OpenAPI 3.1. The early deep dive proposed Fastify/Drizzle and `/workers`; the repository uses Express/Prisma and `/employees`.
- 32 Prisma models and 29 enums in `apps/api/prisma/schema.prisma`, not the stale README path `packages/db/prisma/schema.prisma`.
- `employees -> onboarding_plans -> plan_tasks` is the workflow spine. `plan_task_dependencies` stores edges. `payroll_setups.task_id` is unique: one detail row per task, with its employee derived from the plan. No model, migration or seed changes are needed here.
- The six services are documents, equipment, payroll, benefits, training and manager tasks. Payroll is the third service in the supplied architecture image. The diagram also includes API security, profile/orchestrator/rules, AI/RAG/guardrails, storage/audit and external adapters; most orchestration/AI handlers are still future work at this baseline.
- Existing implemented routes: auth, admin, reference and operations. The frontend is a scaffold; employee CRUD, plan generation/approval, task queue and the other workflow handlers were not implemented at inspection. Contracts are broader than implemented endpoints.

## Role reality

`FINANCE` is an `OwnerRole` for workflow assignment. It is **not** a fourth authentication role. The catalog has `hr_admin`, `manager`, `employee`; only HR admin holds `payroll.read`, `payroll.write`, `payroll.verify`, all at ORG scope. Neither manager nor employee has payroll access. No new Finance role or grants were added.

Routes use existing `authenticate`, DB-backed `requirePermission`, and `employeeIdForTask`. Missing permission returns 403; missing/out-of-scope rows return 404. The resolved employee is checked again inside the transaction. Token cryptography is outside the payroll tests; authentication middleware, permission resolution, role catalog and scope middleware are exercised with isolated database fixtures.

## API and lifecycle

| Method | Existing path | Permission | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/tasks/{taskId}/payroll` | `payroll.read` | 200, `PayrollSetup`; absent detail is 404 |
| PUT | `/api/v1/tasks/{taskId}/payroll` | `payroll.write` | 200, create or partial update |
| POST | `/api/v1/tasks/{taskId}/payroll/verification` | `payroll.verify` | 200, verified detail |

The GET response is explicitly projected and parsed with the shared `PayrollSetupSchema`; raw bank/national-ID fields and `bankTokenRef` are never returned. Timestamps are ISO strings. `verifiedByName` is null if the verifying account has no linked employee profile; its user ID is still recorded in the audit and row.

All writes require a plan in APPROVED or IN_PROGRESS, non-null `approvedById` and `approvedAt`, and task `reviewState=OK`. The task must belong to service PAYROLL. BLOCKED/SKIPPED tasks are not silently unblocked. Completed tasks and VERIFIED details cannot be edited. Read access remains available after plan completion.

Status is derived from persisted data, never accepted from the client:

| Condition, evaluated in this order | Detail status |
| --- | --- |
| No tax form type or no recorded receipt | AWAITING_TAX_FORM |
| No bank suffix or mock bank token | AWAITING_BANK_DETAILS |
| Tax/bank ready, but pay frequency or currency missing | PENDING |
| Tax/bank and pay settings complete | READY |
| Explicit authorized verification, all gates pass | VERIFIED |

The schema's initial/default state is PENDING. PUT may move incomplete states backward when documentation is withdrawn. Omitted fields are preserved. Repeating `taxFormReceived=true` preserves its original timestamp; changing the form type clears receipt unless receipt is explicitly confirmed again. Saving moves the task to IN_PROGRESS. READY means the detail fields are complete; it does **not** mean dependencies are complete or authorize payment.

Verification requires `acknowledgement: true`, all detail readiness fields, and every declared dependency COMPLETED and OK in the same plan. SKIPPED is not accepted as completed. A self-edge or cross-plan edge is rejected. It atomically sets detail VERIFIED, records verifier/time, sets the current task COMPLETED with actor/time, and appends an audit event. Repeating verification on an active plan preserves the original verifier/time and does not duplicate the audit. Replays after the plan becomes COMPLETED return 409; GET still retrieves the result.

The service does not complete sibling tasks, complete the entire plan, change deadlines, invent jurisdiction rules, approve plans, dispatch to providers or reopen verified payroll. A future correction endpoint needs downstream dependency invalidation and fresh approval.

## Validation, privacy and integration decisions

- The original shared Zod schemas are reused, not copied. UUIDs, bank digits (6–20), enum values, length limits, nonempty updates and true acknowledgement are validated.
- Three focused validation tightenings are in the existing schema: currency is three letters and normalized uppercase; tax form type is trimmed/nonblank; national ID is trimmed and 5–32 characters. Rejecting four-character IDs prevents the entire value from being retained as its suffix. These are stricter validation rules for existing fields; frontend users should review the generated contract. No jurisdiction-specific legal validation is claimed.
- Raw identifiers are reduced in memory before any database work, removed from `req.body`, and never passed to Prisma or audit. Only suffixes and a random `mock_bank_...` reference persist. The reference is not a real vault token, cannot recover an account, and is not proof that the account exists. Use synthetic demo data only. Each submitted bank value gets a new random mock reference; it produces no external side effect.
- Existing pino request redaction covers the write-only fields. Payroll audit payloads allow only IDs, statuses, presence flags, changed field names and actor/time. No raw identifiers, suffix values, tokens or free-form verification notes are included. `notes` remains accepted by the contract but deliberately is not retained.
- Tax receipt is an HR attestation in the existing contract; there is no document ID on `PayrollSetup`. This module checks recorded dependency completion, but does not implement document scanning or authenticity checks. The document service must verify evidence before completing its prerequisite task. The orchestrator must create the required tax/bank edges; this handler does not invent missing graph edges.
- Serializable Prisma transactions cover state, completion and audit, with bounded retries for P2034 conflicts and 409 after exhaustion. Mock tests verify transaction wiring and failure handling; real PostgreSQL concurrency and rollback still require an integration run.
- Audit actions are `payroll.created`, `payroll.updated` and `payroll.verified`, following the existing dotted action convention, with `resourceType=payroll_setup` and `planId` in the safe payload for correlation. Database-level REVOKE protection for audit rows remains a team task; no such migration exists despite older comments claiming it.

## Validation evidence (6 November 2026)

| Check | Result |
| --- | --- |
| Payroll HTTP/workflow tests | 45 passed with isolated Prisma fixtures |
| Shared contract/RBAC tests | 4 passed; 49 total tests passed |
| Root typecheck | Passed (contracts and API) |
| Additional strict test-file typecheck | Passed |
| Root build | Passed (contracts and API, including Prisma client generation) |
| Web production build | Passed (TypeScript and Vite) |
| ESLint | Passed; one existing unused `iso` helper warning in `apps/api/prisma/seed.ts` |
| OpenAPI generation/drift | Passed; still 60 operations and 87 schemas |
| Git whitespace check | Passed |
| Real PostgreSQL concurrency/rollback | Not run locally; no local PostgreSQL/Docker executable available |

Local execution used Node 24.22.1, TypeScript 5.9.3 and Prisma 6.19.3 from the existing lockfile/runtime; CI declares Node 20. Dependency installation initially hit a connection reset and succeeded on retry. Loopback test connections needed the environment's local-network permission. No live database URL or JWT secret was used for tests.

## Files changed

| File | Purpose |
| --- | --- |
| `apps/api/src/routes/payroll.ts` | Three existing endpoint handlers, auth, scope and shared validation |
| `apps/api/src/payroll/service.ts` | Gates, readiness, safe mock metadata, response projection and atomic audit |
| `apps/api/src/app.ts` | Mount the payroll router |
| `apps/api/test/payroll.test.ts` | HTTP/workflow tests with isolated Prisma fake |
| `packages/contracts/test/payroll.test.ts` | Shared validation and payroll grant tests |
| `packages/contracts/src/services.ts` | Focused validation hardening |
| `packages/contracts/src/openapi.ts` | Describe lifecycle and missing error responses |
| `docs/openapi.json` | Regenerated by the existing emitter; never hand-edited |
| `.eslintrc.cjs` | Supply missing ESLint configuration so the existing lint command runs |
| `.gitignore`, three removed `tsconfig.tsbuildinfo` files | Stop committing stale incremental caches that broke clean-checkout declarations |
| `docs/PAYROLL-HANDOFF.md` | Integration and demo instructions |

The static `docs/API-Contract.pdf` is the older reference; no PDF regeneration script exists in this repository. Updated Swagger and generated JSON are the current payroll contract.

## Run and demonstrate without a database

From the repository root, with Node 20+ and npm:

```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run lint
npm run openapi:check
npm run build
```

`db:generate` generates local bindings; it does not apply schema changes. The two payroll test suites mock the Prisma client and need neither `.env` nor a database. Supertest opens temporary loopback ports. To demonstrate just the behavior:

```sh
npm test -- apps/api/test/payroll.test.ts --reporter=verbose
```

Show the approval rejection, missing tax/bank stages, blocked prerequisite, successful verification, retry, locked edit and manager/employee denial tests. These are automated HTTP examples, not a claim that a full employee onboarding UI is complete.

## API demo once teammates provide an isolated fixture

Use a disposable local/test database with synthetic data. The orchestrator fixture must provide an employee, an active approved plan with named approver/time, a PAYROLL task with OK review, and its reviewed/completed tax and bank prerequisite tasks. For the main setup flow use `PAYROLL_PROFILE_SETUP`; task IDs are UUIDs, not employee IDs. Sign in through the existing auth flow as an HR admin and use that bearer token in local Swagger `/docs`.

1. GET the task's payroll path: expect 404 before a detail exists.
2. PUT `{ "payFrequency": "MONTHLY", "salaryCurrency": "CAD" }`: expect AWAITING_TAX_FORM.
3. PUT `{ "taxFormType": "TD1", "taxFormReceived": true }`: expect AWAITING_BANK_DETAILS. TD1 here is an illustrative mock label, not legal advice.
4. PUT `{ "bankAccountNumber": "000000123456", "nationalId": "DEMO-ABC9876" }`: expect READY and suffixes only.
5. POST the verification path with `{ "acknowledgement": true }`: expect VERIFIED if prerequisites are complete, otherwise 409.
6. Repeat verification: expect the same result and original verifier/time. PUT another change: expect 409. Inspect the task completion and audit rows in the isolated fixture.
7. Try the three endpoints with manager or employee credentials: expect 403. No token: 401.

No shared Neon `db:push`, seed, migration or application-data operation was performed during this work. Do not run the generic repository bootstrap commands against the shared database without its owner's explicit agreement.

## Team follow-through

- **Himanshu:** urgently rotate the previously disclosed Neon password and JWT access/refresh signing secrets; update each gitignored `.env` and invalidate old sessions as appropriate. Review stricter validators, approve lifecycle conventions, deliver audit DB privileges and run real PostgreSQL tests. Do not copy any exposed values into tickets, commits or logs.
- **Deepak / Dinesh / Himanshu / Teja:** connect employee/plan creation and approval, persist tax/bank dependencies, ensure document verification controls prerequisite completion, and prevent generic task-completion endpoints from bypassing payroll verification. Decide how a separate PAYROLL_FIRST_RUN_VERIFICATION task should consume setup evidence; this implementation keeps each detail task-specific and does not copy bank metadata between tasks.
- **Trisha / Neelavathi:** use the three existing paths and shared schemas, show readiness separately from dependency readiness, hide payroll controls unless permissions grant them, show synthetic/mock integration status, never prefill or display raw identifiers, and disable edits after verification.
- **Vardhan / Shruthi:** consume task completion through the shared graph; this module does not release benefits/training/manager tasks itself.
- **Deepak / Himanshu / Vardhan:** deploy only after review and isolated database validation; keep the mock provider description visible.
- **Neelavathi and recording owner:** demonstrate approval/prerequisite rejection and safe verification, then include evidence in the presentation/video before the supplied deadline. Video ownership remains unassigned in the provided allocation.

This slice does not implement salary calculation, payslips, money movement, real bank/tax verification, the LLM pipeline, a Finance login role, or unrelated teammates' services.
