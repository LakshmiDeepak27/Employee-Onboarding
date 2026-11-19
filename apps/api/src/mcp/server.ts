/**
 * CLYORA Model Context Protocol (MCP) Server
 *
 * Implements the standard MCP JSON-RPC 2.0 protocol over stdio,
 * exposing CLYORA's enterprise onboarding tools to external AI agents
 * (e.g. Claude Desktop, Cursor, Antigravity, and Dayforce evaluation harnesses).
 */
import readline from "node:readline";
import { prisma, checkDatabaseConnection } from "../db/client.js";
import { policyService } from "../ai/policyService.js";

const SERVER_NAME = "clyora-onboarding-mcp";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "clyora_list_employees",
    description: "List employees currently undergoing onboarding, filtered by jurisdiction, status, or department.",
    inputSchema: {
      type: "object",
      properties: {
        jurisdictionCode: {
          type: "string",
          description: "Optional ISO jurisdiction code filter (e.g. CA-ON, GB, IN-KA, SG)",
        },
        status: {
          type: "string",
          enum: ["PRE_HIRE", "ONBOARDING", "ACTIVE", "WITHDRAWN"],
          description: "Optional onboarding status filter",
        },
      },
    },
  },
  {
    name: "clyora_get_onboarding_plan",
    description: "Retrieve an employee's 30-day onboarding plan with task breakdown, statutory citations, and completion metrics.",
    inputSchema: {
      type: "object",
      required: ["employeeId"],
      properties: {
        employeeId: {
          type: "string",
          description: "UUID or employee number (e.g. EMP-0001)",
        },
      },
    },
  },
  {
    name: "clyora_query_hr_policy",
    description: "Search grounded statutory HR policies and clauses for a specific jurisdiction.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Search query, topic, or question (e.g. 'maternity leave', 'probation', 'medical benefits')",
        },
        jurisdictionCode: {
          type: "string",
          description: "Optional jurisdiction code (e.g. CA-ON, GB, IN-KA, SG)",
        },
      },
    },
  },
  {
    name: "clyora_verify_compliance_gates",
    description: "Verify regulatory compliance gates (Right-to-Work, tax forms, statutory safety) for a new hire.",
    inputSchema: {
      type: "object",
      required: ["employeeId"],
      properties: {
        employeeId: {
          type: "string",
          description: "UUID or employee number",
        },
      },
    },
  },
  {
    name: "clyora_get_system_readiness",
    description: "Get CLYORA system status, active jurisdictions, total onboarding counts, and health metrics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

async function handleToolCall(name: string, args: Record<string, any>) {
  switch (name) {
    case "clyora_list_employees": {
      const where: any = {};
      if (args.jurisdictionCode) where.jurisdictionCode = args.jurisdictionCode;
      if (args.status) where.status = args.status;

      const employees = await prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          roleFamily: true,
          status: true,
          jurisdictionCode: true,
          startDate: true,
          department: { select: { name: true } },
        },
        take: 20,
      });

      return {
        count: employees.length,
        employees: employees.map((e) => ({
          id: e.id,
          employeeNumber: e.employeeNumber,
          fullName: `${e.firstName} ${e.lastName}`,
          jobTitle: e.jobTitle,
          roleFamily: e.roleFamily,
          department: e.department?.name ?? "General",
          jurisdiction: e.jurisdictionCode,
          status: e.status,
          startDate: e.startDate.toISOString().slice(0, 10),
        })),
      };
    }

    case "clyora_get_onboarding_plan": {
      const isUuid = /^[0-9a-f-]{36}$/i.test(args.employeeId);
      const employee = await prisma.employee.findFirst({
        where: isUuid ? { id: args.employeeId } : { employeeNumber: args.employeeId },
        include: {
          plans: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              tasks: {
                select: {
                  id: true,
                  title: true,
                  taskType: true,
                  service: true,
                  status: true,
                  dueDate: true,
                  authorityClass: true,
                  citations: true,
                },
              },
            },
          },
        },
      });

      if (!employee) return { error: `Employee '${args.employeeId}' not found.` };
      const plan = (employee as any).plans?.[0];
      if (!plan) return { message: `No active onboarding plan found for ${employee.firstName} ${employee.lastName}.` };

      const totalTasks = plan.tasks.length;
      const completed = plan.tasks.filter((t: any) => t.status === "COMPLETED").length;
      const progressPercent = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

      return {
        employee: {
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          fullName: `${employee.firstName} ${employee.lastName}`,
          jobTitle: employee.jobTitle,
          jurisdiction: employee.jurisdictionCode,
        },
        planId: plan.id,
        status: plan.status,
        progressPercent: `${progressPercent}%`,
        totalTasks,
        completedTasks: completed,
        tasks: plan.tasks.map((t: any) => ({
          title: t.title,
          type: t.taskType,
          service: t.service,
          status: t.status,
          authorityClass: t.authorityClass,
          deadline: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
          hasStatutoryCitation: (t.citations as any[])?.length > 0,
        })),
      };
    }

    case "clyora_query_hr_policy": {
      const tokens = args.query.toLowerCase().split(/\s+/).filter((t: string) => t.length >= 3);
      const where: any = {};
      if (args.jurisdictionCode) where.jurisdictionCode = args.jurisdictionCode;

      if (tokens.length > 0) {
        where.OR = tokens.flatMap((token: string) => [
          { body: { contains: token, mode: "insensitive" as const } },
          { heading: { contains: token, mode: "insensitive" as const } },
        ]);
      }

      const clauses = await prisma.policyClause.findMany({
        where,
        take: 5,
        select: {
          id: true,
          heading: true,
          body: true,
          jurisdictionCode: true,
          document: { select: { title: true, sourceUri: true } },
        },
      });

      return {
        query: args.query,
        matchesFound: clauses.length,
        clauses: clauses.map((c) => ({
          id: c.id,
          heading: c.heading ?? c.document.title,
          jurisdiction: c.jurisdictionCode,
          summary: c.body.slice(0, 300) + (c.body.length > 300 ? "…" : ""),
          sourceDocument: c.document.title,
          sourceUri: c.document.sourceUri,
        })),
      };
    }

    case "clyora_verify_compliance_gates": {
      const isUuid = /^[0-9a-f-]{36}$/i.test(args.employeeId);
      const employee = await prisma.employee.findFirst({
        where: isUuid ? { id: args.employeeId } : { employeeNumber: args.employeeId },
        include: {
          plans: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { tasks: true },
          },
        },
      });

      if (!employee) return { error: `Employee '${args.employeeId}' not found.` };
      const plan = (employee as any).plans?.[0];
      const tasks = plan?.tasks ?? [];

      const rightToWork = tasks.find((t: any) => t.taskType === "RIGHT_TO_WORK_CHECK");
      const idProof = tasks.find((t: any) => t.taskType === "COLLECT_ID_PROOF");
      const safetyTraining = tasks.find((t: any) => t.taskType === "HEALTH_AND_SAFETY_TRAINING");

      return {
        employee: `${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`,
        jurisdiction: employee.jurisdictionCode,
        complianceGates: {
          rightToWork: rightToWork ? { status: rightToWork.status, passed: rightToWork.status === "COMPLETED" } : { status: "NOT_REQUIRED" },
          idProof: idProof ? { status: idProof.status, passed: idProof.status === "COMPLETED" } : { status: "NOT_REQUIRED" },
          safetyTraining: safetyTraining ? { status: safetyTraining.status, passed: safetyTraining.status === "COMPLETED" } : { status: "OPTIONAL" },
        },
        readinessClearance: plan ? ["IN_PROGRESS", "COMPLETED", "AWAITING_COMPLETION_APPROVAL"].includes(plan.status) : false,
      };
    }

    case "clyora_get_system_readiness": {
      const [empCount, plansCount, jurisdictions, departments] = await Promise.all([
        prisma.employee.count(),
        prisma.onboardingPlan.count(),
        prisma.jurisdiction.findMany({ select: { code: true, displayName: true } }),
        prisma.department.findMany({ select: { code: true, name: true } }),
      ]);

      return {
        system: "CLYORA Autonomous Employee Onboarding Orchestrator",
        status: "OPERATIONAL",
        protocol: "Model Context Protocol (MCP) v2024-11-05",
        metrics: {
          totalEmployees: empCount,
          activeOnboardingPlans: plansCount,
          supportedJurisdictions: jurisdictions.map((j) => `${j.code} (${j.displayName})`),
          departments: departments.map((d) => d.name),
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    let req: any;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }

    const { id, method, params } = req;

    if (method === "initialize") {
      const response = {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          capabilities: {
            tools: {},
          },
        },
      };
      process.stdout.write(JSON.stringify(response) + "\n");
      return;
    }

    if (method === "notifications/initialized") {
      return;
    }

    if (method === "tools/list") {
      const response = {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      };
      process.stdout.write(JSON.stringify(response) + "\n");
      return;
    }

    if (method === "tools/call") {
      try {
        const result = await handleToolCall(params.name, params.arguments ?? {});
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
      } catch (err: any) {
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: err?.message || "Tool execution failed",
              },
            ],
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
      }
      return;
    }

    // Default unknown method
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      }) + "\n",
    );
  });
}

startMcpServer().catch((err) => {
  console.error("MCP Server crashed:", err);
  process.exit(1);
});
