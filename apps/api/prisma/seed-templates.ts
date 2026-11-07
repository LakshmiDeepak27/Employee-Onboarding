import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "../../.env" });

import { PrismaClient, type TaskType, type ServiceArea, type OwnerRole, type AuthorityClass, type DeadlineAnchor, type DeadlineBasis } from "@prisma/client";

const prisma = new PrismaClient();
const starterNotice = "Review this task against the organization’s currently approved policy and record the required evidence.";
const templates: Array<{
  taskType: TaskType; service: ServiceArea; title: string; owner: OwnerRole;
  authority: AuthorityClass; anchor: DeadlineAnchor; offset: number; basis: DeadlineBasis;
  lead: number; employmentTypes?: Array<"FULL_TIME" | "PART_TIME" | "CONTRACTOR" | "INTERN">;
}> = [
  { taskType: "COLLECT_ID_PROOF", service: "DOCUMENTS", title: "Review employee identity document", owner: "HR", authority: "ROUTINE", anchor: "START_DATE", offset: -5, basis: "BUSINESS_DAYS", lead: 0 },
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
