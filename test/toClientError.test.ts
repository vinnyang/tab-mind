import { describe, it, expect, beforeAll } from "vitest";

// Mock browser.storage before importing background.js (it instantiates at import time)
const storageData: Record<string, any> = {
  llmSettings: {
    provider: "custom",
    endpoint: "http://localhost:19999/v1", // unreachable, but prevents real fetches during init
    model: "",
    apiKey: "",
    timeout: 1000,
    models: ["test-model"],
  },
};
(globalThis as any).browser = {
  storage: {
    local: {
      get: async (keys: string[]) => {
        const result: Record<string, any> = {};
        for (const k of keys) if (k in storageData) result[k] = storageData[k];
        return result;
      },
      set: async (obj: Record<string, any>) => {
        Object.assign(storageData, obj);
      },
    },
  },
  runtime: { onMessage: { addListener: () => {} } },
  tabs: { onUpdated: { addListener: () => {} } },
};

// Prevent the init-time autoDetectModels() from making real fetches.
// Must be set BEFORE importing background.js (its constructor schedules
// autoDetectModels in a microtask that runs before the next synchronous line).
globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });

const { toClientError } = await import("../src/background.js");
const { LlmError } = await import("../src/lib/llm.js");

describe("toClientError", () => {
  it("maps LlmError to structured payload", () => {
    const err = new LlmError("auth", "Unauthorized", "opencode-zen", 401);
    expect(toClientError(err)).toEqual({
      kind: "auth",
      message: "Unauthorized",
      provider: "opencode-zen",
    });
  });

  it("maps LlmError without statusCode", () => {
    const err = new LlmError("network", "fetch failed", "lmstudio");
    expect(toClientError(err)).toEqual({
      kind: "network",
      message: "fetch failed",
      provider: "lmstudio",
    });
  });

  it("maps generic Error to unknown", () => {
    const err = new Error("something broke");
    expect(toClientError(err)).toEqual({
      kind: "unknown",
      message: "something broke",
    });
  });

  it("maps non-Error thrown values to unknown", () => {
    expect(toClientError("string error")).toEqual({
      kind: "unknown",
      message: "Unknown error",
    });
    expect(toClientError(null)).toEqual({
      kind: "unknown",
      message: "Unknown error",
    });
    expect(toClientError(undefined)).toEqual({
      kind: "unknown",
      message: "Unknown error",
    });
  });
});
