# ADR 0007: Training Assignment (L&D) Workflow & Statutory Pathway Engine

## Context
In enterprise onboarding (Option 3: Employee Onboarding Orchestrator), statutory compliance and role-specific enablement depend heavily on timely training completions. Different jurisdictions enforce strict legal deadlines:
- **Ontario, Canada (CA-ON)**: Regulation 297/13 under OHSA mandates Worker Health & Safety Awareness within seven (7) calendar days of start date.
- **United Kingdom (GB)**: Data Protection Act 2018 / UK GDPR Article 39 mandates data protection awareness within thirty (30) days.
- **Enterprise Security (Global)**: SOC2 Type II Trust Services Criteria CC6.1 requires security and access control training within fourteen (14) days.
- **Role-based prerequisites**: Technical hires (Engineering, DevOps, QA) require Toolchain & Security training before production infrastructure access is provisioned.

## Decision
1. **Deterministic Rule Engine (V6 Code Wins)**:
   - Statutory due dates are computed deterministically via `computeTrainingDueDate()` from the employee's start date.
   - Mandatory courses are resolved deterministically via `resolveMandatoryCourses()`.
2. **Grounded AI Training Advisor (LLM + Gemini 3.8 Flash)**:
   - Ingests approved clauses from `TRAINING_POLICY_CORPUS`.
   - Generates personalized Learning Academy pathways citing exact clauses.
   - Verifies citations (Validator V2) and enforces Grounded Refusal (Validator V3) for contractors and unsupported jurisdictions (e.g. Singapore / Hire C).
3. **1:1 PlanTask Detail**:
   - Hangs off `PlanTask` spine with status tracking (`ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `OVERDUE`).
   - Real-time compliance progress tracking (`calculateProgress()`) for First-Week Pathway dashboards.
4. **Degraded Fallback**:
   - If the Gemini API is rate-limited or unavailable, the agent gracefully degrades to `BASELINE_FALLBACK` without failing requests.
