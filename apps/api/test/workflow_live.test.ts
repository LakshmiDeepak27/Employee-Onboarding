import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "true")(
  "Persisted workflow and access boundaries",
  () => {
    it("round trips a document, verifies completion, and denies unrelated employee access", async () => {
      const app = createApp();
      const plan = await prisma.onboardingPlan.findFirst({
        where: {
          status: { in: ["APPROVED", "IN_PROGRESS"] },
          employee: {
            personalEmail: { startsWith: "qa-", endsWith: "@example.invalid" },
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          tasks: { include: { documentRequest: true, dependencies: true } },
        },
      });
      expect(
        plan,
        "Run live_api.test.ts first to create a dedicated QA plan",
      ).toBeTruthy();
      const task = plan!.tasks.find(
        (t) =>
          t.documentRequest?.status === "REQUESTED" &&
          t.dependencies.length === 0,
      );
      expect(task).toBeTruthy();
      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "asha.hr@clyora", password: "Onboard!ng2026" });
      expect(login.status).toBe(200);
      const token = login.body.accessToken;
      const file = Buffer.from(
        "%PDF-1.4\n% QA upload fixture: no personal data\n%%EOF",
      );
      const uploaded = await request(app)
        .post(`/api/v1/document-requests/${task!.documentRequest!.id}/upload`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          fileName: "qa-upload.pdf",
          mimeType: "application/pdf",
          contentBase64: file.toString("base64"),
        });
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200);
      const downloaded = await request(app)
        .get(uploaded.body.document.downloadUrl)
        .set("Authorization", `Bearer ${token}`)
        .responseType("blob");
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(downloaded.body).equals(file)).toBe(true);
      const verified = await request(app)
        .post(`/api/v1/document-requests/${task!.documentRequest!.id}/verify`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "VERIFY" });
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      expect(
        (await prisma.planTask.findUnique({ where: { id: task!.id } }))?.status,
      ).toBe("COMPLETED");
      const employeeLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "priya@clyora", password: "Onboard!ng2026" });
      expect(employeeLogin.status).toBe(200);
      const employeeToken = employeeLogin.body.accessToken;
      const denied = await request(app)
        .get(`/api/v1/employees/${plan!.employeeId}`)
        .set("Authorization", `Bearer ${employeeToken}`);
      expect(denied.status).toBe(404);
      const deniedFile = await request(app)
        .get(uploaded.body.document.downloadUrl)
        .set("Authorization", `Bearer ${employeeToken}`);
      expect(deniedFile.status).toBe(404);
    }, 360000);
  },
);
