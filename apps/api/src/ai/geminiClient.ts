import { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../db/client.js";

let genAIClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!genAIClient) {
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      genAIClient = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: env.AI_TIMEOUT_MS },
      });
    }
  }
  return genAIClient;
}

export interface LlmCallOptions {
  planId?: string;
  purpose: "plan_proposal" | "clause_embedding" | "policy_qa";
  promptVersion?: string;
  temperature?: number;
}

export interface StructuredGenerationResult<T> {
  success: boolean;
  data: T | null;
  rawText: string | null;
  tokens?: { prompt: number; output: number };
  latencyMs: number;
  error?: string;
}

/**
 * Invokes Gemini Flash for structured JSON generation with automatic retries
 */
export async function generateStructuredJson<T>(
  prompt: string,
  jsonSchema?: object,
  options: LlmCallOptions = { purpose: "plan_proposal" },
): Promise<StructuredGenerationResult<T>> {
  const client = getClient();
  const modelName = env.GEMINI_MODEL || "gemini-2.5-flash";
  const promptVersion = options.promptVersion || "plan-proposal@v3";
  const promptHash = createHash("sha256")
    .update(prompt)
    .digest("hex")
    .slice(0, 16);

  if (!client) {
    return {
      success: false,
      data: null,
      rawText: null,
      latencyMs: 0,
      error: "GEMINI_API_KEY is not configured",
    };
  }

  const startTime = Date.now();
  let attempt = 1;
  const maxRetries = env.AI_MAX_RETRIES || 3;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          ...(jsonSchema ? { responseSchema: jsonSchema } : {}),
          temperature: options.temperature ?? 0.1,
        },
      });

      const latencyMs = Date.now() - startTime;
      const rawText = response.text || "";

      let parsed: T;
      let schemaValid = false;
      try {
        parsed = JSON.parse(rawText) as T;
        schemaValid = true;
      } catch (e: any) {
        throw new Error(`Invalid JSON returned by Gemini: ${e.message}`);
      }

      // Persist LLM call audit
      await prisma.llmCall
        .create({
          data: {
            planId: options.planId ?? null,
            purpose: options.purpose,
            modelName,
            promptVersion,
            promptHash,
            requestJson: { promptLength: prompt.length },
            responseRaw: rawText.slice(0, 4000), // Cap length for safety
            schemaValid,
            attempt,
            latencyMs,
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          },
        })
        .catch((e) => logger.warn({ err: e }, "Failed to record llmCall"));

      return {
        success: true,
        data: parsed,
        rawText,
        tokens: {
          prompt: response.usageMetadata?.promptTokenCount ?? 0,
          output: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
        latencyMs,
      };
    } catch (err: any) {
      lastError = err;
      logger.warn(
        { attempt, error: err.message },
        "Gemini call failed; retrying",
      );
      attempt += 1;
      if (attempt <= maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * Math.pow(2, attempt)),
        );
      }
    }
  }

  const totalLatencyMs = Date.now() - startTime;

  // Record failed call
  await prisma.llmCall
    .create({
      data: {
        planId: options.planId ?? null,
        purpose: options.purpose,
        modelName,
        promptVersion,
        promptHash,
        requestJson: { promptLength: prompt.length },
        responseRaw: null,
        schemaValid: false,
        attempt: maxRetries,
        latencyMs: totalLatencyMs,
        errorMessage:
          lastError?.message ?? "Gemini request timed out or failed",
      },
    })
    .catch(() => {});

  return {
    success: false,
    data: null,
    rawText: null,
    latencyMs: totalLatencyMs,
    error: lastError?.message || "Gemini generation failed after retries",
  };
}

/**
 * Generates 768-dimensional embedding vector for policy chunk RAG
 */
export async function generateTextEmbedding(
  text: string,
): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  const embeddingModel = env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

  try {
    const response = await client.models.embedContent({
      model: embeddingModel,
      contents: text,
    });

    const resAny = response as any;
    const values = resAny.embedding?.values || resAny.embeddings?.[0]?.values;
    if (values && values.length > 0) {
      return values;
    }
    return null;
  } catch (err: any) {
    logger.warn({ error: err.message }, "Failed to generate Gemini embedding");
    return null;
  }
}
