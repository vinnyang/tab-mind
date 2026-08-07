import { describe, it, expect } from "vitest";
import { egressAllowList, assertEgressAllowed, PROVIDERS, DEFAULT_PROVIDER } from "../src/lib/providers.js";

describe("provider registry", () => {
  it("defaults to lmstudio", () => {
    expect(DEFAULT_PROVIDER).toBe("lmstudio");
    expect(PROVIDERS.lmstudio.isLocal).toBe(true);
  });

  it("lists two remote dev/test providers", () => {
    expect(PROVIDERS["opencode-zen"].baseUrl).toBe("https://opencode.ai/zen/v1");
    expect(PROVIDERS["openrouter"].isLocal).toBe(false);
  });

  it("egress allow list is origin-only", () => {
    const allow = egressAllowList(PROVIDERS["opencode-zen"]);
    expect(allow).toEqual(["https://opencode.ai"]);
  });

  it("blocks egress outside the allow list", () => {
    const allow = egressAllowList(PROVIDERS.lmstudio);
    expect(() => assertEgressAllowed("https://attacker.example/?q=leak", allow)).toThrow();
  });

  it("allows egress to the configured provider", () => {
    const allow = egressAllowList(PROVIDERS.lmstudio);
    expect(() => assertEgressAllowed("http://localhost:1234/v1/chat/completions", allow)).not.toThrow();
  });
});
