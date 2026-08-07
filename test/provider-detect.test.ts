import { describe, it, expect } from "vitest";
import { detectProviderFromEndpoint } from "../src/lib/providers.js";

describe("detectProviderFromEndpoint", () => {
  it("detects lmstudio from localhost:1234", () => {
    expect(detectProviderFromEndpoint("http://localhost:1234/v1")).toBe("lmstudio");
    expect(detectProviderFromEndpoint("http://localhost:1234")).toBe("lmstudio");
  });

  it("detects ollama from localhost:11434", () => {
    expect(detectProviderFromEndpoint("http://localhost:11434/v1")).toBe("ollama");
  });

  it("detects openrouter from its API URL", () => {
    expect(detectProviderFromEndpoint("https://openrouter.ai/api/v1")).toBe("openrouter");
  });

  it("detects opencode-zen from its endpoint", () => {
    expect(detectProviderFromEndpoint("https://opencode.ai/zen/v1")).toBe("opencode-zen");
  });

  it("falls back to custom for unknown origins", () => {
    expect(detectProviderFromEndpoint("https://api.example.com/v1")).toBe("custom");
  });

  it("falls back to custom for malformed URLs", () => {
    expect(detectProviderFromEndpoint("not-a-url")).toBe("custom");
    expect(detectProviderFromEndpoint("")).toBe("custom");
  });
});
