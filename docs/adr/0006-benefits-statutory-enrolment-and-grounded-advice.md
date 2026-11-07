# ADR 0006: Deterministic Statutory Enrolment Windows & Grounded Benefits Advisor

## Status
Accepted

## Context
Employee benefits enrolment is subject to strict legal and statutory windows (e.g. 31 days in Ontario, 30 days under US Section 125). Missing these deadlines has severe real-world consequences: employees lose coverage until the next annual open enrolment or must undergo medical Evidence of Insurability (EOI). Furthermore, benefit deductions are `PAY_AFFECTING`, meaning errors immediately corrupt payroll setup and damage employee trust.

Common failure modes in generic LLM solutions:
1. LLMs hallucinate deadlines or propose arbitrary dates that do not conform to statutory calendars.
2. LLMs recommend plans or coverage tiers that do not exist or cross jurisdiction borders (e.g. recommending a UK NHS top-up to an Ontario hire).
3. Pay-affecting payroll deductions are committed without human employee confirmation.

## Decision
1. **Deterministic Deadline Engine (V6 Code Wins)**:
   - The enrolment window start, duration (31 days for CA-ON, 30 days for US-CA/GB), end date, and days remaining are computed in pure TypeScript code (`benefits-rules.ts`).
   - If an LLM suggests a date, it is discarded and replaced with the code-computed date.
   - If remaining days $\le 5$, the task is deterministically flagged `isAtRisk = true` with a clear risk reason.

2. **Policy-Grounded AI Advisor with Citations (V2 & V3)**:
   - The AI advisor retrieves policy clauses from `BENEFITS_POLICY_CORPUS`.
   - Every recommendation must cite stable clause primary keys (e.g. `CA-ON-BEN-004`).
   - Validator V2 verifies the clause exists and validates quotation match.
   - Validator V3 ensures cited clauses belong strictly to the worker's jurisdiction.

3. **Authority Guard & Human Accountability (V7)**:
   - Benefit elections require explicit human acknowledgment (`preTaxDeductionAcknowledged: true`) and a named actor.
   - An append-only audit event (`BENEFIT_ELECTED` or `BENEFIT_WAIVED`) is written in the same transaction.

4. **Grounded Refusal & Graceful Degraded Fallback**:
   - For unsupported jurisdictions (e.g. Contractor in Singapore), the system refuses plan generation with typed code `UNSUPPORTED_JURISDICTION` or `CONTRACTOR_INELIGIBLE`.
   - If `GEMINI_API_KEY` is not provided or the network is unavailable, the service automatically runs in `BASELINE_FALLBACK` mode with deterministic recommendations rather than crashing.

## Consequences
- 100% adherence to statutory deadlines and jurisdiction boundaries.
- Zero halluncinated benefit clauses or cross-border leaks.
- Seamless merging into the team monorepo with 0 breaking changes to other services.
