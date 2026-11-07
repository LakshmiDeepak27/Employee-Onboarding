import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { generatePlanProposal } from "../src/ai/llmClient.js";
vi.mock("../src/db/client.js", () => ({
  prisma: { llmCall: { create: vi.fn().mockResolvedValue({}) } },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  env.LLM_PROVIDER = "ollama";
  env.AI_MAX_RETRIES = 1;
});
describe("Ollama proposal boundary", () => {
  it("sends the configured model and schema and accepts structured JSON", async () => {
    env.LLM_PROVIDER = "ollama";
    env.AI_MAX_RETRIES = 1;
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            message: {
              content: JSON.stringify({
                unsupported: true,
                unsupportedReason: "No source coverage",
                tasks: [],
              }),
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", transport);
    const result = await generatePlanProposal("reference data");
    expect(result.success).toBe(true);
    const body = JSON.parse(transport.mock.calls[0][1].body);
    expect(body.model).toBe(env.LLM_MODEL);
    expect(body.stream).toBe(false);
    expect(
      body.format.properties.tasks.items.properties.taskType.enum,
    ).toContain("RIGHT_TO_WORK_CHECK");
    expect(transport.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects valid JSON with an invalid proposal shape", async () => {
    env.LLM_PROVIDER = "ollama";
    env.AI_MAX_RETRIES = 1;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              done: true,
              message: { content: '{"tasks":"invented"}' },
            }),
          ),
        ),
    );
    expect((await generatePlanProposal("reference")).success).toBe(false);
  });
  it("does not retry a missing model", async () => {
    env.LLM_PROVIDER = "ollama";
    env.AI_MAX_RETRIES = 3;
    const transport = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", transport);
    expect((await generatePlanProposal("reference")).error).toBe(
      "Ollama HTTP 404",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("returns a bounded failure when the local server is unavailable", async () => {
    env.LLM_PROVIDER = "ollama";
    env.AI_MAX_RETRIES = 1;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused")),
    );
    expect((await generatePlanProposal("reference")).success).toBe(false);
  });
  it("makes no network request when disabled", async () => {
    env.LLM_PROVIDER = "disabled";
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    expect((await generatePlanProposal("reference")).success).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
});
