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

For a **new empty database**, run `npm run db:deploy`, then `npm run db:seed` to seed RBAC. Optional starter departments, jurisdictions, catalogs and clearly marked mock policies require `SEED_REFERENCE_DATA=true`; demo employee records and identities require `SEED_DEMO_DATA=true`. These fixtures are for local demonstration only and must not be treated as company or legal data. To bootstrap the first HR identity, set `BOOTSTRAP_HR_EMAIL=<username>.hr@clyora` for one `npm run db:seed` invocation. The app creates an invited account with the `hr_admin` database role and no password; create a matching Keycloak user with verified email, then sign in through OIDC. Do not use this bootstrap setting for existing users or in routine production startup. On PowerShell: `$env:BOOTSTRAP_HR_EMAIL='deepak.hr@clyora'; npm run db:seed; Remove-Item Env:BOOTSTRAP_HR_EMAIL`.

## Workflow

1. HR creates an employee, including location, department and reporting manager.
2. Generate a plan and track its saved background job. When the configured model is unavailable, the deterministic baseline is used. Without approved policy coverage, the plan stays limited to safe operational setup tasks.
3. Review sensitive tasks, then approve the plan. Approval creates downstream service records.
4. Complete document, equipment, payroll, benefits, training and manager work. Prerequisites restrict actions; verified work advances plan progress.
5. When every task is completed or explicitly skipped, the plan enters `AWAITING_COMPLETION_APPROVAL`. HR reviews the completed journey and records final sign-off; only then is the employee marked `ACTIVE` and the plan marked `COMPLETED`.
6. Inspect plan audit history and download the IT pack. Its scripts are templates for administrator review, not automatically executed integrations.

HR, IT, manager and employee workspaces share consistent navigation. The employee assistant currently searches policy sources; it does not claim to answer with AI.

### Integrated Workflow Services

- **Payroll Setup & Verification (Service 3)**:
  - Task-scoped lifecycle (`AWAITING_TAX_FORM`, `AWAITING_BANK_DETAILS`, `PENDING`, `READY`, `VERIFIED`).
  - Strict security controls: raw bank account and national ID strings are masked write-only and never stored or returned; only 4-digit suffixes and opaque tokens are persisted.
  - Plan approval gate, dependency satisfaction checks, serializable transaction isolation, and mandatory tamper-evident audit trail.
- **Benefits Statutory Enrolment & AI Advisor (Service 4)**:
  - Enrolment window enforcement: statutory 31-day (Ontario CA-ON) and 30-day (UK/US) statutory windows with at-risk alerts.
  - AI Benefit Advisor providing grounded recommendations, citing corporate policy and statutory references with authority refusal outside supported jurisdictions.
- **Training Pathways & Compliance Deadlines (Service 5)**:
  - Automated statutory course assignment (7-day Ontario OHSA worker health & safety, 30-day UK GDPR data protection).
  - Grounded training advisory citing statutory requirements.
- **Manager Tasks & Day-One Alignment (Service 6)**:
  - Deterministic action generator producing prioritized recommendations (`ASSIGN_BUDDY`, `PREPARE_DAY_ONE_AGENDA`, `APPROVE_SYSTEM_ACCESS`, `SCHEDULE_INTRO_MEETINGS`, `SET_PROBATION_GOALS`).
  - High-performance native TypeScript architecture replacing fragile LangGraph dependencies, preventing build and CI cache failures.

## Keycloak OIDC Authentication & Security Architecture

### 1. Production Sign-in & OIDC Authorization Code Flow with PKCE
- **Flow**: Keycloak OIDC is the production authentication path using Authorization Code flow with PKCE (`code_challenge_method=S256`), CSRF state, and nonce protection.
- **Verification**: ID tokens are exchanged directly over backchannel and verified using JWKS retrieved from Keycloak's `.well-known/openid-configuration` endpoint (`jose.jwtVerify`). Issuer, audience (`OIDC_CLIENT_ID`), expiration, and signature are enforced.
- **Verified Email Enforcement**: Every ID token must contain `email_verified: true`. Unverified email addresses are strictly rejected with actionable guidance.
- **Cookie Security**: Secure session cookies are issued:
  - `eo_refresh`: Refresh token cookie (`httpOnly: true`, `sameSite: "lax"`, `path: "/api/v1/auth"`, `secure` in production).
  - `eo_oidc_state`: PKCE verifier, state, and nonce storage during login handshake (`httpOnly: true`, `sameSite: "lax"`, 10-minute expiry, cleared immediately upon callback).
- **Hardened Access**: Self-service public signup and password login are disabled. Users sign in through Keycloak OIDC; application roles and scopes are assigned through trusted provisioning and stored in the database.

### 2. Database-Governed RBAC (Zero Claim Trust)
- User permissions, roles (`hr_admin`, `it_admin`, `manager`, `employee`), and data scopes (`SELF`, `REPORTS`, `DEPARTMENT`, `ORG`) are defined and loaded exclusively from the application PostgreSQL database (`roles`, `user_roles`, `role_permissions`).
- **Zero privilege escalation**: The application never derives or escalates roles from Keycloak token claims, groups, or email address patterns. Keycloak authenticates identity; the application database governs authorization.

### 3. Pre-Provisioned Identity Linking & Conflict Prevention
- A Keycloak identity is linked **only** to a pre-provisioned user account with a matching verified email.
- Unprovisioned users (emails not found in the database) receive a 401 error instructing them to contact HR for provisioning.
- **Conflicting Identity Protection**:
  - Rejects sign-in if an incoming Keycloak subject (`sub`) is already bound to a different email.
  - Rejects sign-in if the database account is already bound to a different Keycloak subject.
- On valid first sign-in, the provider subject is persisted safely in `users.oidc_subject`, `users.auth_provider` is set to `'oidc'`, and any `INVITED` status automatically transitions to `ACTIVE`.

### 4. HR Employee Activation
- HR can send an activation link from an employee profile. The API creates or safely matches a Keycloak user, assigns only the `employee` role in the application database, and asks Keycloak to email a seven-day link requiring email verification and password setup.
- The message is sent to the employee's real personal email. The Keycloak username uses the work-email prefix when provided; the verified email claim matches the pre-provisioned application account. No reusable password is generated, displayed, or sent by CLYORA.
- Keycloak Admin API credentials stay on the API server. The portal requires a confidential service-account client with `realm-management` roles `manage-users`, `view-users`, and `query-users`; configure the realm's SMTP settings so Keycloak can deliver activation messages. Retrying an invite resends the action email for the same matching account.

---

## Local Keycloak Setup Guide

### 1. Start local Keycloak
Copy `.env.example` to `.env`, set a local-only `KEYCLOAK_DEV_ADMIN_PASSWORD`, then run:

```powershell
npm run auth:up
```

Open http://localhost:8080/admin and sign in with `KEYCLOAK_DEV_ADMIN_USERNAME` and `KEYCLOAK_DEV_ADMIN_PASSWORD` from `.env`. `npm run auth:up` starts an existing container named `eo-keycloak` if you already created one with `docker run`; otherwise it creates the local Compose service. New Compose-managed Keycloak data is stored in the named `keycloak_data` volume. Start it again later with `npm run auth:up`; `npm run auth:stop` stops it and `npm run auth:logs` shows its logs. Do not run `docker compose down -v` if you want to keep local Keycloak configuration and application documents.

The local Keycloak service is behind the `local-identity` Compose profile and is not started by the normal production `docker compose up --build -d` command. `start-dev` is local testing only. For deployment, use a separately configured Keycloak production deployment or managed identity provider with HTTPS, a persistent production database, secure secrets, hostname/proxy settings, MFA policy, and SMTP. This Compose convenience does not create a production identity deployment.

If the existing standalone container is named `eo-keycloak`, `npm run auth:up` reuses it, preserving your current realm and clients. Do not start a second Keycloak container at the same time because both need port 8080.

### 2. Create the Realm
1. In the top-left dropdown, click **Create Realm**.
2. Realm name: `employee-onboarding`.
3. Click **Create**.

### 3. Configure the OIDC Client
1. Navigate to **Clients** -> **Create client**.
2. **General Settings**:
   - Client type: `OpenID Connect`
   - Client ID: `employee-onboarding-app`
   - Name: `Employee Onboarding Application`
   - Click **Next**.
3. **Capability Config**:
   - Client authentication: **ON** (Confidential client)
   - Authorization: OFF
   - Authentication flow: Standard flow (Authorization Code), Direct access grants (optional).
   - Click **Next**.
4. **Login Settings**:
   - Root URL: `http://localhost:5173`
   - Home URL: `http://localhost:5173`
   - Valid redirect URIs: `http://localhost:4000/api/v1/auth/oidc/callback`
   - Valid post logout redirect URIs: `http://localhost:5173/*`
   - Web origins: `http://localhost:5173`, `http://localhost:4000`
   - Click **Save**.
5. **Credentials Tab**:
   - Copy the **Client Secret** value and set it as `OIDC_CLIENT_SECRET` in your `.env`.
6. **Advanced Settings Tab** (Scroll down):
   - Proof Key for Code Exchange (PKCE) Code Challenge Method: `S256`.
   - Click **Save**.

### 4. Configure HR-managed employee activation
1. Create a second OpenID Connect client named `employee-onboarding-provisioner`.
2. Enable **Client authentication** and **Service accounts roles**; disable Standard flow and Direct access grants for this client.
3. Under **Service account roles**, select client `realm-management` and assign `manage-users`, `view-users`, and `query-users` only.
4. Copy its client secret into the API `.env` as `KEYCLOAK_ADMIN_CLIENT_ID=employee-onboarding-provisioner` and `KEYCLOAK_ADMIN_CLIENT_SECRET=<secret>`.
5. In **Realm settings → Email**, configure and test SMTP delivery. Keycloak sends the time-limited verify-email and set-password link to the employee's personal email.
6. Restart the API. HR can then open an employee profile and click **Send employee activation link**.

### 5. Create the Initial HR User in Keycloak
Create an enabled Keycloak user for each explicitly provisioned application account, with **Email verified** toggled **ON**. For example, if `BOOTSTRAP_HR_EMAIL=deepak.hr@clyora`, create username `deepak` with email `deepak.hr@clyora`. The matching application account and `hr_admin` role must already exist in the database; do not assign Keycloak realm roles.

For each user:
1. Navigate to **Users** -> **Add user**.
2. Set Email and Username, toggle **Email verified** to **ON**, and click **Create**.
3. Go to **Credentials**, set a strong password for that Keycloak user, set Temporary to **OFF**, and save. This is the SSO password; the app does not store it.

---

## How HR, Managers, and Employees Sign In

### Production / Keycloak SSO Flow:
1. Navigate to http://localhost:5173/login (or http://localhost:4000/login).
2. Click **"Continue with Organization SSO (Keycloak)"**.
3. You are redirected to Keycloak's login page with PKCE challenge, state, and nonce parameters.
4. Sign in with the verified Keycloak identity whose email matches the provisioned application account.
5. Keycloak redirects back to `GET /api/v1/auth/oidc/callback`.
6. The API verifies the authorization code with Keycloak, validates the token signature against Keycloak JWKS, checks `email_verified: true`, links the identity on first login, sets the HTTP-only refresh cookie, and redirects to `/login?sso=success`.
7. The application automatically loads the session with roles and scopes loaded from the application database:
   - **HR Admin** enters `/hr/dashboard` with organization-wide HR controls.
   - **IT Admin** enters `/it_admin/dashboard` with equipment-only fulfillment controls.
   - **Manager** enters `/manager/dashboard` with direct-report scope.
   - **Employee** enters `/employee/dashboard` with self scope.

The login screen uses Keycloak SSO only; there are no demo login accounts, demo account switchers, or application password sign-in controls. Login addresses follow `<username>.hr@clyora`, `<username>.manager@clyora`, and `<username>@clyora`; trusted provisioning assigns matching application database roles, which remain the source of authorization. After signing out, choosing SSO again asks Keycloak to authenticate again so a different user can sign in.

## Configuration

- `DATABASE_URL`: pooled Neon connection for the application.
- `DIRECT_URL`: direct connection for migrations.
- `OIDC_ISSUER_URL`: Keycloak realm issuer URL (e.g. `http://localhost:8080/realms/employee-onboarding`).
- `OIDC_CLIENT_ID`: Keycloak client ID (e.g. `employee-onboarding-app`).
- `OIDC_CLIENT_SECRET`: Keycloak client secret from client credentials.
- `OIDC_REDIRECT_URI`: backend callback URL (e.g. `http://localhost:4000/api/v1/auth/oidc/callback`).
- `OIDC_SCOPES`: space-delimited OIDC scopes (`openid profile email`).
- Separate JWT secrets are required (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`). Keep `DEV_AUTH_BYPASS=false` outside local development.
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

Live tests require the configured development database, a provisioned HR account, reference data, and `RUN_DATABASE_TESTS=true`. They create uniquely named `qa-…@example.invalid` employee records and a harmless upload; those records remain available for inspection.

See [verification and limitations](docs/REDESIGN-PROGRESS.md).

## Backend LLM boundary

Proposals are validated before persistence. Template authority, owner, service, deadlines and prerequisites override model values. Citations must quote stored clauses; missing database sources are never replaced with invented in-memory policy data. Cyclic proposals are rejected. Validation findings are saved in the same plan transaction, and the configured model name is recorded. Active job creation is serialized per employee with a PostgreSQL advisory lock.

Ollama API contract: https://docs.ollama.com/api/chat and https://docs.ollama.com/capabilities/structured-outputs.

Local Ollama was not running during verification. Adapter success/failure/schema tests use mocked HTTP responses; they do not establish real model quality. In Docker, localhost refers to the container: use a reachable private Ollama service URL or host.docker.internal for a host service, without exposing Ollama publicly.
