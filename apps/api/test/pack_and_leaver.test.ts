import { describe, it, expect } from "vitest";
import {
  generateOnboardingPack,
  buildZipPackBuffer,
  LEAVER_MATRIX,
} from "../src/orchestration/packGenerator.js";

describe("Onboarding pack artifacts", () => {
  it("builds a ZIP and an ordered departure checklist without claiming execution", () => {
    const employee = {
      firstName: "QA",
      lastName: "Example",
      employeeNumber: "QA-TEST",
      personalEmail: "qa@example.invalid",
      jobTitle: "Engineer",
      startDate: new Date("2026-12-01"),
      jurisdictionCode: "CA-ON",
    };
    const pack = generateOnboardingPack(
      { id: "qa-plan", status: "DRAFT", tasks: [] },
      employee,
    );
    const zip = buildZipPackBuffer(pack);
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(pack.checklist).toHaveLength(25);
    expect(LEAVER_MATRIX).toHaveLength(17);
    expect(LEAVER_MATRIX[0].title).toContain("Revoke");
  });
});
