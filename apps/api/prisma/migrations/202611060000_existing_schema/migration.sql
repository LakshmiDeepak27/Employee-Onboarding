CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AuthEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESHED', 'TOKEN_REUSE_DETECTED', 'PASSWORD_CHANGED', 'ACCOUNT_LOCKED', 'ROLE_GRANTED', 'ROLE_REVOKED');

-- CreateEnum
CREATE TYPE "public"."AuthorityClass" AS ENUM ('ROUTINE', 'PAY_AFFECTING', 'LEGAL');

-- CreateEnum
CREATE TYPE "public"."BenefitEnrollmentStatus" AS ENUM ('WINDOW_OPEN', 'ELECTED', 'WAIVED', 'WINDOW_CLOSED', 'AUTO_ENROLLED');

-- CreateEnum
CREATE TYPE "public"."BenefitType" AS ENUM ('MEDICAL', 'DENTAL', 'VISION', 'PENSION', 'LIFE_INSURANCE', 'WELLNESS');

-- CreateEnum
CREATE TYPE "public"."DeadlineAnchor" AS ENUM ('OFFER_DATE', 'PLAN_CREATED', 'START_DATE');

-- CreateEnum
CREATE TYPE "public"."DeadlineBasis" AS ENUM ('CALENDAR_DAYS', 'BUSINESS_DAYS');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('REQUESTED', 'UPLOADED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."EmployeeStatus" AS ENUM ('PRE_HIRE', 'ONBOARDING', 'ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "public"."EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN');

-- CreateEnum
CREATE TYPE "public"."EquipmentStatus" AS ENUM ('REQUESTED', 'ORDERED', 'SHIPPED', 'DELIVERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "public"."EscalationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."FindingAction" AS ENUM ('ACCEPTED', 'REPAIRED', 'REJECTED', 'FLAGGED', 'INSERTED');

-- CreateEnum
CREATE TYPE "public"."FindingSeverity" AS ENUM ('INFO', 'WARN', 'REJECT');

-- CreateEnum
CREATE TYPE "public"."GenerationMode" AS ENUM ('LLM_GROUNDED', 'BASELINE_FALLBACK');

-- CreateEnum
CREATE TYPE "public"."ManagerTaskKind" AS ENUM ('BUDDY_ASSIGNMENT', 'DAY_ONE_AGENDA', 'INTRO_MEETINGS', 'ACCESS_APPROVAL', 'PROBATION_GOALS');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."OwnerRole" AS ENUM ('HR', 'IT', 'FINANCE', 'MANAGER', 'EMPLOYEE', 'LND', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "public"."PayrollSetupStatus" AS ENUM ('PENDING', 'AWAITING_TAX_FORM', 'AWAITING_BANK_DETAILS', 'READY', 'VERIFIED');

-- CreateEnum
CREATE TYPE "public"."PermissionScope" AS ENUM ('SELF', 'REPORTS', 'DEPARTMENT', 'ORG');

-- CreateEnum
CREATE TYPE "public"."PlanStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REFUSED');

-- CreateEnum
CREATE TYPE "public"."ReviewState" AS ENUM ('OK', 'NEEDS_REVIEW', 'ESCALATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ServiceArea" AS ENUM ('DOCUMENTS', 'EQUIPMENT', 'PAYROLL', 'BENEFITS', 'TRAINING', 'MANAGER');

-- CreateEnum
CREATE TYPE "public"."TaskOrigin" AS ENUM ('TEMPLATE', 'LLM_ACCEPTED', 'LLM_REPAIRED', 'VALIDATOR_INSERTED', 'HUMAN_ADDED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."TaskType" AS ENUM ('COLLECT_ID_PROOF', 'COLLECT_ADDRESS_PROOF', 'COLLECT_EDUCATION_CERTIFICATE', 'COLLECT_PREVIOUS_EMPLOYMENT_PROOF', 'RIGHT_TO_WORK_CHECK', 'SIGN_EMPLOYMENT_CONTRACT', 'SIGN_NDA', 'BACKGROUND_VERIFICATION', 'PROVISION_LAPTOP', 'PROVISION_PERIPHERALS', 'PROVISION_MOBILE_DEVICE', 'ISSUE_ACCESS_BADGE', 'CREATE_SYSTEM_ACCOUNTS', 'GRANT_APPLICATION_ACCESS', 'COLLECT_TAX_DECLARATION', 'COLLECT_BANK_DETAILS', 'COLLECT_NATIONAL_ID', 'PAYROLL_PROFILE_SETUP', 'PAYROLL_FIRST_RUN_VERIFICATION', 'BENEFITS_ELECTION', 'PENSION_AUTO_ENROLMENT', 'MEDICAL_INSURANCE_ENROLMENT', 'DEPENDENT_DECLARATION', 'MANDATORY_COMPLIANCE_TRAINING', 'HEALTH_AND_SAFETY_TRAINING', 'DATA_PROTECTION_TRAINING', 'ROLE_SPECIFIC_TRAINING', 'ASSIGN_BUDDY', 'PREPARE_DAY_ONE_AGENDA', 'SCHEDULE_INTRO_MEETINGS', 'APPROVE_SYSTEM_ACCESS', 'SET_PROBATION_GOALS');

-- CreateEnum
CREATE TYPE "public"."TrainingStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'LOCKED');

-- CreateEnum
CREATE TYPE "public"."ValidatorId" AS ENUM ('V1_SCHEMA', 'V2_CITATION_INTEGRITY', 'V3_JURISDICTION_SCOPE', 'V4_MANDATORY_COVERAGE', 'V5_GRAPH_INTEGRITY', 'V6_DEADLINE_RECOMPUTE', 'V7_AUTHORITY_GUARD', 'V8_CLOSED_VOCABULARY');

-- CreateEnum
CREATE TYPE "public"."WorkMode" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID');

-- CreateTable
CREATE TABLE "public"."audit_events" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "type" "public"."AuthEventType" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."benefit_enrollments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "benefit_plan_id" UUID NOT NULL,
    "status" "public"."BenefitEnrollmentStatus" NOT NULL DEFAULT 'WINDOW_OPEN',
    "window_opens_on" DATE NOT NULL,
    "window_closes_on" DATE NOT NULL,
    "elected_at" TIMESTAMPTZ(6),
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "dependents_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benefit_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."benefit_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."BenefitType" NOT NULL,
    "jurisdiction_code" TEXT,
    "enrollment_window_days" INTEGER NOT NULL,
    "is_auto_enrol" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."document_requests" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'REQUESTED',
    "document_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documents" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."employees" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "employee_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "work_email" CITEXT,
    "personal_email" CITEXT NOT NULL,
    "phone" TEXT,
    "department_id" UUID,
    "manager_id" UUID,
    "job_title" TEXT NOT NULL,
    "role_family" TEXT NOT NULL,
    "employment_type" "public"."EmploymentType" NOT NULL,
    "work_mode" "public"."WorkMode" NOT NULL,
    "jurisdiction_code" TEXT NOT NULL,
    "offer_date" DATE,
    "start_date" DATE NOT NULL,
    "union_member" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."EmployeeStatus" NOT NULL DEFAULT 'PRE_HIRE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."equipment_assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "status" "public"."EquipmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "serial_number" TEXT,
    "ordered_at" TIMESTAMPTZ(6),
    "expected_delivery" DATE,
    "delivered_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."equipment_catalog" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lead_time_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "equipment_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."escalations" (
    "id" UUID NOT NULL,
    "plan_id" UUID,
    "task_id" UUID,
    "reason_code" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "assigned_role" "public"."OwnerRole" NOT NULL,
    "status" "public"."EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "raised_by_id" UUID,
    "resolved_by_id" UUID,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."jurisdictions" (
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "business_days" INTEGER[],
    "holidays" DATE[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurisdictions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."llm_calls" (
    "id" UUID NOT NULL,
    "plan_id" UUID,
    "purpose" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "request_json" JSONB NOT NULL,
    "response_raw" TEXT,
    "schema_valid" BOOLEAN NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "latency_ms" INTEGER,
    "prompt_tokens" INTEGER,
    "output_tokens" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."manager_tasks" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "kind" "public"."ManagerTaskKind" NOT NULL,
    "buddy_employee_id" UUID,
    "agenda" JSONB,
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manager_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."onboarding_plans" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "public"."PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "generation_mode" "public"."GenerationMode" NOT NULL,
    "refusal_reason" TEXT,
    "confidence" DECIMAL(4,3),
    "confidence_breakdown" JSONB,
    "model_name" TEXT,
    "prompt_version" TEXT,
    "created_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payroll_setups" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "public"."PayrollSetupStatus" NOT NULL DEFAULT 'PENDING',
    "pay_frequency" TEXT,
    "salary_currency" CHAR(3),
    "tax_form_type" TEXT,
    "tax_form_received_at" TIMESTAMPTZ(6),
    "bank_account_last4" CHAR(4),
    "bank_token_ref" TEXT,
    "national_id_last4" CHAR(4),
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."plan_task_dependencies" (
    "task_id" UUID NOT NULL,
    "depends_on_id" UUID NOT NULL,

    CONSTRAINT "plan_task_dependencies_pkey" PRIMARY KEY ("task_id","depends_on_id")
);

-- CreateTable
CREATE TABLE "public"."plan_tasks" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "task_type" "public"."TaskType" NOT NULL,
    "service" "public"."ServiceArea" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_role" "public"."OwnerRole" NOT NULL,
    "assignee_user_id" UUID,
    "due_date" DATE NOT NULL,
    "earliest_start_date" DATE NOT NULL,
    "authority_class" "public"."AuthorityClass" NOT NULL,
    "origin" "public"."TaskOrigin" NOT NULL,
    "review_state" "public"."ReviewState" NOT NULL DEFAULT 'OK',
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "is_at_risk" BOOLEAN NOT NULL DEFAULT false,
    "risk_reason" TEXT,
    "on_critical_path" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."policy_clauses" (
    "id" TEXT NOT NULL,
    "document_id" UUID NOT NULL,
    "jurisdiction_code" TEXT,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" vector(768),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."policy_documents" (
    "id" UUID NOT NULL,
    "jurisdiction_code" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source_uri" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "is_mock" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "scope" "public"."PermissionScope" NOT NULL DEFAULT 'ORG',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_citations" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "clause_id" TEXT NOT NULL,
    "quoted_text" TEXT NOT NULL,
    "quote_match" DECIMAL(4,3) NOT NULL,
    "retrieval_rank" INTEGER,
    "retrieval_score" DECIMAL(6,5),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_templates" (
    "id" UUID NOT NULL,
    "task_type" "public"."TaskType" NOT NULL,
    "service" "public"."ServiceArea" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "jurisdiction_code" TEXT,
    "employment_types" "public"."EmploymentType"[],
    "role_families" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "default_owner_role" "public"."OwnerRole" NOT NULL,
    "deadline_anchor" "public"."DeadlineAnchor" NOT NULL,
    "deadline_offset_days" INTEGER NOT NULL,
    "deadline_basis" "public"."DeadlineBasis" NOT NULL DEFAULT 'CALENDAR_DAYS',
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "depends_on_types" "public"."TaskType"[] DEFAULT ARRAY[]::"public"."TaskType"[],
    "authority_class" "public"."AuthorityClass" NOT NULL DEFAULT 'ROUTINE',
    "source_clause_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."training_assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status" "public"."TrainingStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "score_percent" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."training_courses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "mandatory_for_jurisdictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mandatory_for_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "statutory_deadline_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'INVITED',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."validation_findings" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "task_id" UUID,
    "validator" "public"."ValidatorId" NOT NULL,
    "severity" "public"."FindingSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "action" "public"."FindingAction" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "public"."audit_events"("actor_user_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "public"."audit_events"("created_at" ASC);

-- CreateIndex
CREATE INDEX "audit_events_resource_type_resource_id_idx" ON "public"."audit_events"("resource_type" ASC, "resource_id" ASC);

-- CreateIndex
CREATE INDEX "auth_events_type_created_at_idx" ON "public"."auth_events"("type" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "auth_events_user_id_created_at_idx" ON "public"."auth_events"("user_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "benefit_enrollments_status_idx" ON "public"."benefit_enrollments"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "benefit_enrollments_task_id_key" ON "public"."benefit_enrollments"("task_id" ASC);

-- CreateIndex
CREATE INDEX "benefit_enrollments_window_closes_on_idx" ON "public"."benefit_enrollments"("window_closes_on" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "benefit_plans_code_key" ON "public"."benefit_plans"("code" ASC);

-- CreateIndex
CREATE INDEX "benefit_plans_jurisdiction_code_idx" ON "public"."benefit_plans"("jurisdiction_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "public"."departments"("code" ASC);

-- CreateIndex
CREATE INDEX "document_requests_status_idx" ON "public"."document_requests"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "document_requests_task_id_key" ON "public"."document_requests"("task_id" ASC);

-- CreateIndex
CREATE INDEX "documents_employee_id_idx" ON "public"."documents"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "public"."employees"("department_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_number_key" ON "public"."employees"("employee_number" ASC);

-- CreateIndex
CREATE INDEX "employees_jurisdiction_code_idx" ON "public"."employees"("jurisdiction_code" ASC);

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "public"."employees"("manager_id" ASC);

-- CreateIndex
CREATE INDEX "employees_status_start_date_idx" ON "public"."employees"("status" ASC, "start_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "public"."employees"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_work_email_key" ON "public"."employees"("work_email" ASC);

-- CreateIndex
CREATE INDEX "equipment_assignments_status_idx" ON "public"."equipment_assignments"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_assignments_task_id_key" ON "public"."equipment_assignments"("task_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_catalog_sku_key" ON "public"."equipment_catalog"("sku" ASC);

-- CreateIndex
CREATE INDEX "escalations_plan_id_idx" ON "public"."escalations"("plan_id" ASC);

-- CreateIndex
CREATE INDEX "escalations_status_idx" ON "public"."escalations"("status" ASC);

-- CreateIndex
CREATE INDEX "llm_calls_created_at_idx" ON "public"."llm_calls"("created_at" ASC);

-- CreateIndex
CREATE INDEX "llm_calls_plan_id_idx" ON "public"."llm_calls"("plan_id" ASC);

-- CreateIndex
CREATE INDEX "manager_tasks_kind_idx" ON "public"."manager_tasks"("kind" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "manager_tasks_task_id_key" ON "public"."manager_tasks"("task_id" ASC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "public"."notifications"("user_id" ASC, "read_at" ASC);

-- CreateIndex
CREATE INDEX "onboarding_plans_employee_id_idx" ON "public"."onboarding_plans"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "onboarding_plans_status_idx" ON "public"."onboarding_plans"("status" ASC);

-- CreateIndex
CREATE INDEX "payroll_setups_employee_id_idx" ON "public"."payroll_setups"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "payroll_setups_status_idx" ON "public"."payroll_setups"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_setups_task_id_key" ON "public"."payroll_setups"("task_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "public"."permissions"("key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "public"."permissions"("resource" ASC, "action" ASC);

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "public"."permissions"("resource" ASC);

-- CreateIndex
CREATE INDEX "plan_task_dependencies_depends_on_id_idx" ON "public"."plan_task_dependencies"("depends_on_id" ASC);

-- CreateIndex
CREATE INDEX "plan_tasks_assignee_user_id_idx" ON "public"."plan_tasks"("assignee_user_id" ASC);

-- CreateIndex
CREATE INDEX "plan_tasks_due_date_idx" ON "public"."plan_tasks"("due_date" ASC);

-- CreateIndex
CREATE INDEX "plan_tasks_plan_id_status_idx" ON "public"."plan_tasks"("plan_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "plan_tasks_plan_id_task_type_key" ON "public"."plan_tasks"("plan_id" ASC, "task_type" ASC);

-- CreateIndex
CREATE INDEX "plan_tasks_service_status_idx" ON "public"."plan_tasks"("service" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "policy_clauses_document_id_idx" ON "public"."policy_clauses"("document_id" ASC);

-- CreateIndex
CREATE INDEX "policy_clauses_jurisdiction_code_idx" ON "public"."policy_clauses"("jurisdiction_code" ASC);

-- CreateIndex
CREATE INDEX "policy_documents_jurisdiction_code_category_idx" ON "public"."policy_documents"("jurisdiction_code" ASC, "category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "policy_documents_title_version_key" ON "public"."policy_documents"("title" ASC, "version" ASC);

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "public"."refresh_tokens"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "public"."refresh_tokens"("family_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "public"."refresh_tokens"("replaced_by_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "public"."refresh_tokens"("token_hash" ASC);

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "public"."refresh_tokens"("user_id" ASC);

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "public"."role_permissions"("permission_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "public"."roles"("key" ASC);

-- CreateIndex
CREATE INDEX "task_citations_clause_id_idx" ON "public"."task_citations"("clause_id" ASC);

-- CreateIndex
CREATE INDEX "task_citations_task_id_idx" ON "public"."task_citations"("task_id" ASC);

-- CreateIndex
CREATE INDEX "task_templates_jurisdiction_code_is_mandatory_idx" ON "public"."task_templates"("jurisdiction_code" ASC, "is_mandatory" ASC);

-- CreateIndex
CREATE INDEX "task_templates_service_idx" ON "public"."task_templates"("service" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_task_type_jurisdiction_code_key" ON "public"."task_templates"("task_type" ASC, "jurisdiction_code" ASC);

-- CreateIndex
CREATE INDEX "training_assignments_due_date_idx" ON "public"."training_assignments"("due_date" ASC);

-- CreateIndex
CREATE INDEX "training_assignments_status_idx" ON "public"."training_assignments"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "training_assignments_task_id_key" ON "public"."training_assignments"("task_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "training_courses_code_key" ON "public"."training_courses"("code" ASC);

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "public"."user_roles"("role_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "public"."users"("status" ASC);

-- CreateIndex
CREATE INDEX "validation_findings_plan_id_idx" ON "public"."validation_findings"("plan_id" ASC);

-- CreateIndex
CREATE INDEX "validation_findings_validator_code_idx" ON "public"."validation_findings"("validator" ASC, "code" ASC);

-- AddForeignKey
ALTER TABLE "public"."audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auth_events" ADD CONSTRAINT "auth_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_benefit_plan_id_fkey" FOREIGN KEY ("benefit_plan_id") REFERENCES "public"."benefit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."benefit_plans" ADD CONSTRAINT "benefit_plans_jurisdiction_code_fkey" FOREIGN KEY ("jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employees" ADD CONSTRAINT "employees_jurisdiction_code_fkey" FOREIGN KEY ("jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."equipment_assignments" ADD CONSTRAINT "equipment_assignments_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."equipment_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."equipment_assignments" ADD CONSTRAINT "equipment_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escalations" ADD CONSTRAINT "escalations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escalations" ADD CONSTRAINT "escalations_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escalations" ADD CONSTRAINT "escalations_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escalations" ADD CONSTRAINT "escalations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."llm_calls" ADD CONSTRAINT "llm_calls_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."manager_tasks" ADD CONSTRAINT "manager_tasks_buddy_employee_id_fkey" FOREIGN KEY ("buddy_employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."manager_tasks" ADD CONSTRAINT "manager_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."onboarding_plans" ADD CONSTRAINT "onboarding_plans_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."onboarding_plans" ADD CONSTRAINT "onboarding_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."onboarding_plans" ADD CONSTRAINT "onboarding_plans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payroll_setups" ADD CONSTRAINT "payroll_setups_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payroll_setups" ADD CONSTRAINT "payroll_setups_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."plan_task_dependencies" ADD CONSTRAINT "plan_task_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."plan_task_dependencies" ADD CONSTRAINT "plan_task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."plan_tasks" ADD CONSTRAINT "plan_tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."plan_tasks" ADD CONSTRAINT "plan_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."plan_tasks" ADD CONSTRAINT "plan_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policy_clauses" ADD CONSTRAINT "policy_clauses_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."policy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policy_clauses" ADD CONSTRAINT "policy_clauses_jurisdiction_code_fkey" FOREIGN KEY ("jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policy_documents" ADD CONSTRAINT "policy_documents_jurisdiction_code_fkey" FOREIGN KEY ("jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_citations" ADD CONSTRAINT "task_citations_clause_id_fkey" FOREIGN KEY ("clause_id") REFERENCES "public"."policy_clauses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_citations" ADD CONSTRAINT "task_citations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_templates" ADD CONSTRAINT "task_templates_jurisdiction_code_fkey" FOREIGN KEY ("jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."training_assignments" ADD CONSTRAINT "training_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."training_assignments" ADD CONSTRAINT "training_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."validation_findings" ADD CONSTRAINT "validation_findings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."validation_findings" ADD CONSTRAINT "validation_findings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."plan_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

