export type ProviderId =
  | "lmstudio" | "llamacpp" | "ollama"
  | "ollama-cloud" | "openrouter" | "opencode-zen" | "custom";

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Base URL INCLUDING the /v1 segment where the provider uses one. */
  baseUrl: string;
  /** Local = page content never leaves the machine. Drives the egress indicator. */
  isLocal: boolean;
  requiresApiKey: boolean;
  modelsPath: string;
  chatPath: string;
  extraHeaders?: (o: { referer?: string; title?: string }) => Record<string, string>;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  lmstudio: {
    id: "lmstudio", label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    isLocal: true, requiresApiKey: false,
    modelsPath: "/models", chatPath: "/chat/completions",
  },
  llamacpp: {
    id: "llamacpp", label: "llama.cpp (local)",
    baseUrl: "http://localhost:8080/v1",
    isLocal: true, requiresApiKey: false,
    modelsPath: "/models", chatPath: "/chat/completions",
  },
  ollama: {
    id: "ollama", label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    isLocal: true, requiresApiKey: false,
    modelsPath: "/models", chatPath: "/chat/completions",
  },
  "ollama-cloud": {
    id: "ollama-cloud", label: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    isLocal: false, requiresApiKey: true,
    modelsPath: "/models", chatPath: "/chat/completions",
  },
  openrouter: {
    id: "openrouter", label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    isLocal: false, requiresApiKey: true,
    modelsPath: "/models", chatPath: "/chat/completions",
    extraHeaders: ({ referer, title }) => ({
      ...(referer ? { "HTTP-Referer": referer } : {}),
      ...(title ? { "X-Title": title } : {}),
    }),
  },
  "opencode-zen": {
    id: "opencode-zen", label: "OpenCode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    isLocal: false, requiresApiKey: true,
    modelsPath: "/models", chatPath: "/chat/completions",
  },
  custom: {
    id: "custom", label: "Custom (OpenAI-compatible)",
    baseUrl: "", isLocal: false, requiresApiKey: false,
    modelsPath: "/models", chatPath: "/chat/completions",
  },
};

export const DEFAULT_PROVIDER: ProviderId = "lmstudio";

/** The only origins the extension may talk to. */
export function egressAllowList(active: ProviderDef, customBase?: string): string[] {
  const base = active.id === "custom" ? (customBase ?? "") : active.baseUrl;
  if (!base) return [];
  try { return [new URL(base).origin]; } catch { return []; }
}

export function assertEgressAllowed(url: string, allow: string[]): void {
  let origin: string;
  try { origin = new URL(url).origin; }
  catch { throw new Error(`Blocked egress to malformed URL: ${url}`); }
  if (!allow.includes(origin)) {
    throw new Error(`Blocked egress to non-allow-listed origin: ${origin}`);
  }
}
