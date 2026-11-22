# CLYORA — Architecture, Orchestration & Multi-Profile Deployment Guide
**Enterprise Employee Onboarding Orchestrator**  
*Coordinating Documents, Equipment, Payroll, Benefits, Training & Manager Tasks with Multi-Jurisdiction Compliance*

---

## 1. System Architecture Overview

The CLYORA platform adheres strictly to the multi-stakeholder enterprise architecture illustrated in the system design specification:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                 CLYORA SYSTEM ARCHITECTURE                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 1. PEOPLE               2. WEB APP (REACT)             3. IDENTITY (KEYCLOAK)        4. SECURE API (EXPRESS / NODE)
 ┌─────────────────┐     ┌───────────────────────┐      ┌────────────────────────┐    ┌────────────────────────────────────────┐
 │ HR Admin        │───► │ HR Workspace          │──┐   │ Keycloak (OIDC + PKCE) │──► │ Request Validation (Zod Closed Schema) │
 ├─────────────────┤     ├───────────────────────┤  │   ├────────────────────────┤    ├────────────────────────────────────────┤
 │ IT Admin        │───► │ IT Workspace          │──┼──►│ SMTP Activation Emails │    │ RBAC / ABAC Data Scoping               │
 ├─────────────────┤     ├───────────────────────┤  │   ├────────────────────────┤    ├────────────────────────────────────────┤
 │ Manager         │───► │ Manager Workspace     │──┤   │ Identity Verification  │    │ Append-Only Activity Audit             │
 ├─────────────────┤     ├───────────────────────┤  │   │ (Roles mastered in DB) │    ├────────────────────────────────────────┤
 │ Employee        │───► │ Employee Workspace    │──┘   └────────────────────────┘    │ 8-Stage Validator Chain (V1 - V8)      │
 └─────────────────┘     └───────────────────────┘                                    └───────────────────┬────────────────────┘
                                                                                                          │
                                  ┌───────────────────────────────────────────────────────────────────────┴────────────────────┐
                                  ▼                                                                                            ▼
                    ┌───────────────────────────┐                                                 ┌────────────────────────────┐
                    │ CHECKPOINT 1: HR APPROVAL │                                                 │ 5. DATA (POSTGRES / PRISMA)│
                    └─────────────┬─────────────┘                                                 ├────────────────────────────┤
                                  │                                                               │ • Users & granular roles   │
                                  ▼                                                               │ • Worker & location records│
     ┌─────────────────────────────────────────────────────────────┐                              │ • Policies & task templates│
     │                 SIX WORKFLOW SERVICE AREAS                  │                              │ • Plans & dependency DAG   │
     ├─────────────┬─────────────┬─────────────┬───────────────────┤                              │ • Onboarding progress      │
     │ 1. Documents│ 2. Equipment│ 3. Payroll  │ 4. Benefits       │                              │ • Append-only audit logs   │
     │ 5. Training │ 6. Manager  │             │                   │                              └────────────────────────────┘
     └─────────────┴─────────────┴─────────────┴───────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │ CHECKPOINT 2: HR SIGN-OFF │ ──► [ Employee Status: ACTIVE ]
                    └───────────────────────────┘
```

---

## 2. Component-by-Component Architectural Breakdown

### 2.1. People & Role-Specific Workspaces
| Role Persona | Workspace Route | Primary Responsibilities |
|---|---|---|
| **HR Administrator** (`asha.hr@clyora`) | `/hr` | Worker intake, dynamic plan generation, policy inspection, Checkpoint 1 (Plan Approval), payroll verification, Checkpoint 2 (Final Sign-off). |
| **IT Administrator** (`vikram.it@clyora`) | `/it_admin` | Hardware procurement, laptop imaging, peripheral fulfillment, account creation, and system access grants. |
| **Reporting Manager** (`david.manager@clyora`) | `/manager` | Welcoming new hire, buddy assignment, Day 1 itinerary schedule, introductory team meetings, and 30-60-90 probation goals. |
| **New Hire Employee** (`priya.dev@clyora`) | `/employee` | Identity document uploads, payroll tax declarations, statutory compliance training (POSH/OHS/GDPR), and benefits elections. |

---

### 2.2. Identity & Access Management (Keycloak + SMTP)
- **OpenID Connect (OIDC) Authorization Code Flow with PKCE (`S256`)**:
  - Implemented in `apps/api/src/auth/routes.ts` (`GET /api/v1/auth/oidc/start`, `GET /api/v1/auth/oidc/callback`).
  - Generates cryptographically secure, single-use `state`, `nonce`, and SHA-256 `code_challenge`.
  - Secure state stored in `HttpOnly`, `SameSite=Lax` cookies (`eo_oidc_state`).
- **Identity Decoupling Principle**:
  - Keycloak verifies identity only (`sub`, `email`, `email_verified`).
  - Application roles, data scopes, and permissions are **strictly controlled and mastered in the CLYORA PostgreSQL database**; incoming JWT claims or groups from Keycloak cannot escalate privileges.
- **SMTP Account Activation**:
  - Keycloak Admin API service account (`KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_CLIENT_SECRET`) generates and dispatches single-use password activation invites upon HR new hire provisioning.
- **Secure Sessions**:
  - Short-lived JWT Access Tokens (15 min) + Rotated Refresh Tokens (7 days) in `HttpOnly`, `SameSite=Strict` cookies (`eo_refresh`).

---

### 2.3. Onboarding Orchestration Engine

The plan generation pipeline takes **Worker Profile + Location Policy Sources** and drives deterministic workflow execution:

```mermaid
flowchart TD
    A[Worker Profile: Job, Jurisdiction, Start Date, Work Mode] --> B[Approved Policy Corpus & Task Templates]
    B --> C[Statutory Rules Engine: Statutory Floor & Mandatory Constraints]
    C --> D{LLM Provider Configured?}
    D -- Yes (Gemini / Ollama) --> E[Synthesis Agent Proposes Candidate Tasks]
    D -- No (Disabled / Offline) --> F[Deterministic Baseline Plan Fallback]
    E --> G[8-Stage Deterministic Validator Chain V1 - V8]
    F --> G
    G --> H[Checkpoint 1: HR Plan Approval]
    H --> I[Dispatch to Six Work Areas]
    I --> J[Shared Progress Dashboards]
    J --> K[Checkpoint 2: HR Final Sign-off]
    K --> L[Employee Status: ACTIVE]
```

#### The 8-Stage Deterministic Validator Chain (V1 – V8)
Located in `apps/api/src/ai/validatorChain.ts`:
1. **Gate V1 (Schema & Closed Vocabulary):** Validates raw LLM proposal output against strict Zod schema `PlanProposalSchema`. Rejects unparseable JSON or extraneous keys.
2. **Gate V2 (Citation Integrity & Quote Authenticity):** Validates that all policy citations reference genuine database clauses (`clauseExists`) and that quoted text matches authoritative source documents with $\ge 80\%$ token similarity (`calculateQuoteSimilarity`).
3. **Gate V3 (Jurisdiction Scope Enforcer):** Prevents cross-border policy contamination (e.g. applying UK pension rules or Singapore MOM rules to an Ontario `CA-ON` worker).
4. **Gate V4 (Mandatory Statutory Coverage):** Automatically inspects candidate tasks against non-negotiable legal rules (e.g. India POSH training in `IN-KA`, Ontario Health & Safety in `CA-ON`, Right to Work in `GB`). If omitted by the LLM, the gate auto-inserts the task.
5. **Gate V5 (Graph Integrity & DAG Cycle Detection):** Validates the task dependency graph using topological sorting (`validateDAG`). Guarantees zero circular dependency deadlocks.
6. **Gate V6 (Deterministic Deadline Recomputer):** Recomputes all task SLAs deterministically based on start-date offsets and jurisdictional business-day calendars (skipping weekends and regional public holidays).
7. **Gate V7 (Authority Guard):** Automatically flags tasks classified as `PAY_AFFECTING` or `LEGAL` for mandatory human review and dual-authorization.
8. **Gate V8 (Role Conformance Auditor):** Restricts task ownership to the closed set of 32 authorized task types and assigns tasks strictly to appropriate workspace roles (`HR`, `IT`, `FINANCE`, `MANAGER`, `EMPLOYEE`, `COMPLIANCE`).

#### AI Safety Boundary ("AI Cannot")
The system strictly enforces that AI **cannot**:
- Assign roles or escalate permissions.
- Approve onboarding plans or dispatch tasks.
- Override deterministic calendar dates or statutory SLAs.
- Bypass safety checks or invent new task types outside the closed vocabulary.

---

### 2.4. Six Core Work Areas
When HR approves the plan at Checkpoint 1, tasks are automatically routed to the six specialized work streams:
1. **Documents:** Identity proof, address proof, Right-to-Work check, employment contract, and NDA review.
2. **Equipment:** Hardware reservation, laptop provisioning (`PROVISION_LAPTOP`), peripherals, access badges, and PowerShell/Azure AD provisioning pack generation.
3. **Payroll:** Country-specific tax declaration (W-4 for US, TD1 for Canada, P45 for UK, Form 12BB for India), bank account setup, and first-run verification.
4. **Benefits:** Window set by location (30-day statutory window), medical insurance enrolment, pension/provident fund auto-enrolment, and dependent declarations.
5. **Training:** Jurisdictional mandatory training (POSH, OHS, GDPR, Data Protection, Security Awareness, and Role-specific toolchains).
6. **Manager Tasks:** Welcome buddy assignment, Day 1 agenda itinerary, 1-on-1 introductory meetings, and probation goal setting.

---

### 2.5. Data Layer (PostgreSQL via Prisma ORM)
- Models defined in `apps/api/prisma/schema.prisma`:
  - `User`, `Role`, `UserRole`, `Permission`, `RolePermission`
  - `Employee`, `Location`, `Department`, `ManagerLink`
  - `PolicyDocument`, `PolicyClause`, `TaskTemplate`, `DeterministicRule`
  - `OnboardingPlan`, `PlanTask`, `TaskDependency`, `ValidationFinding`
  - `EquipmentAssignment`, `PayrollSetup`, `BenefitElection`, `TrainingAssignment`, `ManagerTask`
  - `AuditEvent` (Append-only immutable audit trail with actor, action, resource, IP address, and JSON payload).

---

## 3. Profiles Guide: Local & Deployment Configurations

CLYORA is architected with multiple runtime profiles to support local testing without heavyweight containers, full local containerized identity stacks, and production cloud deployments.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       CLYORA PROFILES MATRIX                                           │
├──────────────────────┬─────────────────────────────┬───────────────────────────────────────────────────┤
│ Profile              │ Primary Target              │ Key Characteristics                               │
├──────────────────────┼─────────────────────────────┼───────────────────────────────────────────────────┤
│ 1. Local Standalone  │ Fast feature dev, testing,  │ Zero-Keycloak, 1-Click Role Login, Local DB,      │
│    (Zero-Docker)     │ evaluation demo             │ Optional Gemini AI or Deterministic fallback.     │
├──────────────────────┼─────────────────────────────┼───────────────────────────────────────────────────┤
│ 2. Local Full-Stack  │ Enterprise SSO integration, │ Local Docker PostgreSQL + Keycloak 26 OIDC,       │
│    (Keycloak Docker) │ security regression test    │ PKCE code flow, SMTP email activation simulation. │
├──────────────────────┼─────────────────────────────┼───────────────────────────────────────────────────┤
│ 3. Cloud Production  │ Render, AWS, GCP, Railway,  │ Multi-stage Docker, Managed PostgreSQL (SSL),      │
│    (Production PaaS) │ Azure, Kubernetes           │ Public OIDC, HTTPS, /healthz probes, zero-downtime│
│                      │                             │ migrations, immutable append-only audit trail.    │
└──────────────────────┴─────────────────────────────┴───────────────────────────────────────────────────┘
```

---

### Profile 1: Local Standalone Profile (Fastest / Zero-Keycloak)
*Best for: Rapid local development, UI feature work, running tests, and instant demonstration without spinning up a 1GB Java container.*

#### 1. Setup Environment
```bash
npm run profile:standalone
```
*(Or copy `.env.local-standalone.example` to `.env`)*

Key settings in `.env`:
```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/employee_onboarding?schema=public"
JWT_ACCESS_SECRET=local-standalone-access-secret-minimum-32-chars
JWT_REFRESH_SECRET=local-standalone-refresh-secret-minimum-32-chars
DEV_AUTH_BYPASS=false
LLM_PROVIDER=gemini
GEMINI_API_KEY="your-gemini-key-or-leave-blank-for-deterministic-mode"
```

#### 2. Start PostgreSQL & Run Database Setup
```bash
docker compose up -d db
npm run setup
npm run db:seed
```

#### 3. Start API and Web
In Terminal 1:
```bash
npm run dev:api
```
In Terminal 2:
```bash
npm run dev:web
```

#### 4. Access the App
Open `http://localhost:5173` and click any **One-Click Role Sign In** button:
- **Asha Rao (HR):** `asha.hr@clyora`
- **David Chen (Manager):** `david.manager@clyora`
- **Vikram Malhotra (IT):** `vikram.it@clyora`
- **Priya Sharma (Employee):** `priya.dev@clyora`

---

### Profile 2: Local Full-Stack Profile (Keycloak OIDC + Docker)
*Best for: Testing real enterprise OpenID Connect redirection, PKCE code challenge verification, and Keycloak Admin API service account employee activation.*

#### 1. Setup Environment
```bash
npm run profile:keycloak
```
*(Or copy `.env.local-keycloak.example` to `.env`)*

#### 2. Start PostgreSQL and Keycloak Containers
```bash
docker compose up -d db
npm run auth:up
```
Keycloak admin console is available at `http://localhost:8080` (credentials: `admin` / `local-admin-change-me`).

#### 3. Keycloak OIDC Client Configuration
In Keycloak's `employee-onboarding` realm:
1. Create Client: `employee-onboarding-api`
2. Client Authentication: **ON** (confidential client)
3. Standard Flow: **ON**
4. Valid redirect URIs: `http://localhost:4000/api/v1/auth/oidc/callback`
5. Web origins: `http://localhost:5173`, `http://localhost:4000`
6. PKCE Code Challenge: `S256`
7. Copy client secret into `.env` as `OIDC_CLIENT_SECRET`.

#### 4. Run Migrations & Bootstrapping
```bash
npm run setup
$env:BOOTSTRAP_HR_EMAIL = 'asha.hr@clyora'
npm run db:seed
```

#### 5. Launch & Authenticate
```bash
npm run dev:api
npm run dev:web
```
Open `http://localhost:5173` and click **"Continue with Organization SSO (Keycloak)"**.

---

### Profile 3: Cloud Production Deployment Profile
*Best for: Deploying to Render, AWS ECS, GCP Cloud Run, Railway, or Kubernetes.*

#### 1. Environment Configuration
Set production environment variables in your cloud provider's dashboard using `.env.production.example`:
```dotenv
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://employee-onboarding-du20.onrender.com
DATABASE_URL="postgresql://db_user:SUPER_SECURE_PASSWORD@db-host:5432/employee_onboarding?sslmode=require&schema=public"
DIRECT_URL="postgresql://db_user:SUPER_SECURE_PASSWORD@db-host:5432/employee_onboarding?sslmode=require&schema=public"
JWT_ACCESS_SECRET="<64-char-random-generated-secret>"
JWT_REFRESH_SECRET="<64-char-random-generated-secret>"
OIDC_ISSUER_URL="https://sso.yourcompany.com/realms/employee-onboarding"
OIDC_CLIENT_ID="employee-onboarding-app"
OIDC_CLIENT_SECRET="<production-oidc-client-secret>"
OIDC_REDIRECT_URI="https://employee-onboarding-du20.onrender.com/api/v1/auth/oidc/callback"
LLM_PROVIDER=gemini
GEMINI_API_KEY="<production-gemini-api-key>"
DOCUMENT_STORAGE_DIR=/app/.data/documents
```

#### 2. Multi-Stage Dockerfile Packaging
The repository root `Dockerfile` automatically builds all workspaces and packages both backend API and static web assets into a lean, production-hardened container:
- **Build stage:** Compiles `@eo/contracts`, `@eo/api`, and `@eo/web` with Vite into `apps/web/dist`.
- **Runtime stage:** Runs non-root user `node`, executes `npx prisma migrate deploy` on release, serves both API and Web from port 4000, and performs automated container health checks on `/healthz`.

#### 3. Production Deployment Commands
```bash
# Build production Docker image
docker build -t clyora-onboarding:latest .

# Run container with persistent storage
docker run -d \
  --name clyora \
  -p 4000:4000 \
  -v clyora-documents:/app/.data/documents \
  --env-file .env.production \
  clyora-onboarding:latest
```

---

## 4. Verification, Evaluation & Testing Suite

CLYORA includes a multi-tiered test and evaluation harness:

### 1. Complete Repository Verification (`npm run verify`)
Runs TypeScript compiler across all workspaces, ESLint, OpenAPI contract check, and Vitest suite:
```bash
npm run verify
```
Expected output:
- `tsc -b`: 0 errors
- `eslint`: 0 errors
- `openapi:check`: 62 operations match code
- `vitest`: 106 tests passed

### 2. Golden Evaluation Harness (`npm run eval`)
Evaluates the 8-Gate Safety Chain across 7 multi-jurisdiction benchmark personas and adversarial attacks:
```bash
npm run eval
```
Evaluated scenarios:
- `SCENARIO-01-CA-DEV`: Ontario Senior Developer (OHS & Statutory Floor)
- `SCENARIO-02-GB-SALES`: UK Sales Executive (GDPR & Workplace Pension)
- `SCENARIO-03-IN-ENG`: India Backend Engineer (Gratuity, PF & Medical)
- `SCENARIO-04-SG-REFUSAL`: Singapore Contractor (Statutory Refusal & Safe Fallback)
- `SCENARIO-05-ADV-OMISSION`: Adversarial Omission (Gate V4 Auto-Insertion)
- `SCENARIO-06-ADV-HALLUCINATION`: Adversarial Task Type Hallucination (Gate V1 Blocked)
- `SCENARIO-07-ADV-FAKE-QUOTE`: Adversarial Fabricated Quote (Gate V2 Mismatch Detected)

**Benchmark scorecard:** 100% Pass Rate | 100% Hallucination Rejection | Sub-10ms Average Latency.

### 3. Model Context Protocol (MCP) Server (`npm run mcp`)
Allows external agents (Claude Desktop, Cursor, Antigravity) to query live onboarding state over JSON-RPC 2.0 stdio:
```bash
npm run mcp
```
Available tools:
- `clyora_list_employees`
- `clyora_get_onboarding_plan`
- `clyora_query_hr_policy`
- `clyora_verify_compliance_gates`
- `clyora_get_system_readiness`

---

## 5. Live Production Deployment Links

- **Live Web Application:** [https://employee-onboarding-du20.onrender.com](https://employee-onboarding-du20.onrender.com)
- **Interactive Swagger / OpenAPI Docs:** [https://employee-onboarding-du20.onrender.com/docs](https://employee-onboarding-du20.onrender.com/docs)
- **Health Check Endpoint:** [https://employee-onboarding-du20.onrender.com/healthz](https://employee-onboarding-du20.onrender.com/healthz)
- **Full Video Walkthrough:** [YouTube Demonstration](https://youtu.be/sUSnpZo5RgE)
