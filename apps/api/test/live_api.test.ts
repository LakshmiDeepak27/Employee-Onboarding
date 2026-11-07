import { describe, it, expect } from "vitest";
import request from "supertest";
import { policyService } from "../src/ai/policyService.js";
import { createApp } from "../src/app.js";

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "true")(
  "Live database API integration",
  () => {
    const app = createApp();

    it("persists intake, generates a plan and enforces approval before dispatch", async () => {
      await policyService.ensureDemoCorpusSeeded();
      // 1. Login
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "asha.hr@clyora", password: "Onboard!ng2026" });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.user.email).toBe("asha.hr@clyora");

      const token = loginRes.body.accessToken;

      // 2. Reference Jurisdictions
      const jurRes = await request(app)
        .get("/api/v1/jurisdictions")
        .set("Authorization", `Bearer ${token}`);
      expect(jurRes.status).toBe(200);
      expect(jurRes.body.length).toBeGreaterThanOrEqual(3);

      // 3. Employee list
      const empRes = await request(app)
        .get("/api/v1/employees")
        .set("Authorization", `Bearer ${token}`);
      expect(empRes.status).toBe(200);
      expect(empRes.body.items.length).toBeGreaterThanOrEqual(3);

      // 4. Create Employee Intake
      const createEmpRes = await request(app)
        .post("/api/v1/employees")
        .set("Authorization", `Bearer ${token}`)
        .send({
          firstName: "Elena",
          lastName: "Rostova",
          personalEmail: `qa-${Date.now()}@example.invalid`,
          jobTitle: "Cloud Architect",
          roleFamily: "engineering",
          jurisdictionCode: "CA-ON",
          employmentType: "FULL_TIME",
          workMode: "HYBRID",
          startDate: "2026-12-01",
        });
      expect(createEmpRes.status).toBe(201);
      expect(createEmpRes.body.firstName).toBe("Elena");
      const newEmpId = createEmpRes.body.id;

      // 5. Generate Plan
      const genRes = await request(app)
        .post(`/api/v1/employees/${newEmpId}/plans`)
        .set("Authorization", `Bearer ${token}`)
        .send({ forceBaseline: true, regenerate: true });
      expect(genRes.status).toBe(202);
      expect(genRes.body.jobId).toBeDefined();

      const jobId = genRes.body.jobId;

      // 6. Poll Job
      let pollRes: any;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 500));
        pollRes = await request(app)
          .get(`/api/v1/jobs/${jobId}`)
          .set("Authorization", `Bearer ${token}`);
        if (
          pollRes.body.status === "SUCCEEDED" ||
          pollRes.body.status === "FAILED"
        )
          break;
      }
      expect(pollRes.body.status).toBe("SUCCEEDED");
      const planId = pollRes.body.resultUrl.split("/").pop();

      // 7. Get Plan Details
      const planRes = await request(app)
        .get(`/api/v1/plans/${planId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(planRes.status).toBe(200);
      expect(planRes.body.tasks.length).toBeGreaterThanOrEqual(4);

      // 8. DAG Graph
      const graphRes = await request(app)
        .get(`/api/v1/plans/${planId}/graph`)
        .set("Authorization", `Bearer ${token}`);
      expect(graphRes.status).toBe(200);
      expect(graphRes.body.nodes.length).toBeGreaterThanOrEqual(4);

      // 9. Guardrail V7 Test: Premature approval should be blocked if sensitive tasks are in NEEDS_REVIEW
      const blockedRes = await request(app)
        .post(`/api/v1/plans/${planId}/approval`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          decision: "APPROVE",
          acknowledgement: true,
          reason: "Attempt before review",
        });
      expect(blockedRes.status).toBe(409);
      expect(blockedRes.body.error.code).toBe("APPROVAL_BLOCKED");

      // 10. Review sensitive tasks (Guardrail V7: HR Review)
      const sensitiveTasks = planRes.body.tasks.filter(
        (t: any) =>
          (t.authorityClass === "PAY_AFFECTING" ||
            t.authorityClass === "LEGAL") &&
          t.reviewState === "NEEDS_REVIEW",
      );
      for (const t of sensitiveTasks) {
        const reviewRes = await request(app)
          .patch(`/api/v1/plans/${planId}/tasks/${t.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({
            reviewState: "OK",
            reason: "HR reviewer approved statutory terms",
          });
        expect(reviewRes.status).toBe(200);
        expect(reviewRes.body.reviewState).toBe("OK");
      }

      // 11. Authorize Plan Dispatch
      const approveRes = await request(app)
        .post(`/api/v1/plans/${planId}/approval`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          decision: "APPROVE",
          acknowledgement: true,
          reason: "Authorized by HR Admin in test",
        });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe("APPROVED");
      expect(approveRes.body.dispatchedTaskIds.length).toBeGreaterThanOrEqual(
        1,
      );
    }, 600000);
  },
);
