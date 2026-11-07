import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "../../.env" });

import { PrismaClient, type TaskType, type ServiceArea, type OwnerRole, type AuthorityClass, type DeadlineAnchor, type DeadlineBasis } from "@prisma/client";

const prisma = new PrismaClient();
const starterNotice = "Starter workflow. HR should confirm company policy, eligibility and dates before applying it to a real hire.";
const templates: Array<{
  taskType: TaskType; service: ServiceArea; title: string; owner: OwnerRole;
  authority: AuthorityClass; anchor: DeadlineAnchor; offset: number; basis: DeadlineBasis;
  lead: number; employmentTypes?: Array<"FULL_TIME" | "PART_TIME" | "CONTRACTOR" | "INTERN">;
}> = [
  { taskType: "COLLECT_ID_PROOF", service: "DOCUMENTS", title: "Upload identity document for HR review", owner: "EMPLOYEE", authority: "ROUTINE", anchor: "START_DATE", offset: -5, basis: "BUSINESS_DAYS", lead: 0 },
  { taskType: "PROVISION_LAPTOP", service: "EQUIPMENT", title: "Prepare and assign work equipment", owner: "IT", authority: "ROUTINE", anchor: "START_DATE", offset: -2, basis: "BUSINESS_DAYS", lead: 5 },
  { taskType: "COLLECT_TAX_DECLARATION", service: "PAYROLL", title: "Complete payroll tax setup with Finance", owner: "EMPLOYEE", authority: "PAY_AFFECTING", anchor: "START_DATE", offset: 0, basis: "BUSINESS_DAYS", lead: 0 },
  { taskType: "BENEFITS_ELECTION", service: "BENEFITS", title: "Review available benefits and record an election or waiver", owner: "EMPLOYEE", authority: "ROUTINE", anchor: "START_DATE", offset: 10, basis: "BUSINESS_DAYS", lead: 0, employmentTypes: ["FULL_TIME", "PART_TIME", "INTERN"] },
  { taskType: "MANDATORY_COMPLIANCE_TRAINING", service: "TRAINING", title: "Complete assigned company onboarding training", owner: "EMPLOYEE", authority: "ROUTINE", anchor: "START_DATE", offset: 14, basis: "BUSINESS_DAYS", lead: 0 },
  { taskType: "ASSIGN_BUDDY", service: "MANAGER", title: "Assign an onboarding buddy", owner: "MANAGER", authority: "ROUTINE", anchor: "START_DATE", offset: -2, basis: "BUSINESS_DAYS", lead: 0 },
];

async function main() {
  for (const item of templates) {
    const where = { taskType: item.taskType, jurisdictionCode: null };
    const existing = await prisma.taskTemplate.findFirst({ where });
    const data = {
      taskType: item.taskType,
      service: item.service,
      title: item.title,
      description: starterNotice,
      jurisdictionCode: null,
      employmentTypes: item.employmentTypes ?? [],
      roleFamilies: [],
      isMandatory: true,
      defaultOwnerRole: item.owner,
      deadlineAnchor: item.anchor,
      deadlineOffsetDays: item.offset,
      deadlineBasis: item.basis,
      leadTimeDays: item.lead,
      dependsOnTypes: [],
      authorityClass: item.authority,
    };
    if (existing) await prisma.taskTemplate.update({ where: { id: existing.id }, data });
    else await prisma.taskTemplate.create({ data });
  }
  console.log(`Seeded/updated ${templates.length} starter onboarding templates.`);
}

main().catch((error) => { console.error("Template seeding failed.", error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
