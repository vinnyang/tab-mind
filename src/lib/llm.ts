import {
  PROVIDERS,
  DEFAULT_PROVIDER,
  egressAllowList,
  assertEgressAllowed,
  type ProviderDef,
  type ProviderId,
} from "./providers.js";

export interface LlmSettings {
  provider: ProviderId;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  referer?: string;
  title?: string;
  timeout?: number;
}

export interface CallOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StreamOptions extends CallOptions {
  onToken?: (token: string) => void;
}

let settings: LlmSettings | null = null;

export function setSettings(next: LlmSettings): void {
  settings = next;
}

function requireSettings(): LlmSettings {
  if (!settings) throw new Error("LLM settings not initialized");
  return settings;
}

function resolveProvider(s: LlmSettings): ProviderDef {
  const base = PROVIDERS[s.provider] ?? PROVIDERS[DEFAULT_PROVIDER];
  const endpoint = s.endpoint?.trim();
  return endpoint ? { ...base, baseUrl: endpoint.replace(/\/+$/, "") } : base;
}

function buildHeaders(provider: ProviderDef, s: LlmSettings): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.extraHeaders) {
    Object.assign(headers, provider.extraHeaders({ referer: s.referer, title: s.title }));
  }
  if (s.apiKey) headers["Authorization"] = `Bearer ${s.apiKey}`;
  return headers;
}

function chatEndpoint(provider: ProviderDef, s: LlmSettings): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}${provider.chatPath}`;
  assertEgressAllowed(url, egressAllowList(provider, s.endpoint));
  return url;
}

function withTimeout(ms: number, external?: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

export type LlmErrorKind =
  | "auth"
  | "rate_limit"
  | "server"
  | "network"
  | "timeout"
  | "config"
  | "unknown";

export class LlmError extends Error {
  kind: LlmErrorKind;
  provider: string;
  statusCode?: number;

  constructor(kind: LlmErrorKind, message: string, provider: string, statusCode?: number) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export function httpErrorKind(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

export function httpErrorMessage(status: number): string {
  if (status === 401) return "Authentication failed (401) — check your API key";
  if (status === 403) return "Access denied (403) — check your API key";
  if (status === 429) return "Rate limited (429) — try again in a moment";
  if (status >= 500) return `Provider error (${status}) — try again later`;
  return `Request failed (${status})`;
}

export function classifyFetchError(e: unknown): LlmErrorKind {
  if (e instanceof DOMException && e.name === "AbortError") return "timeout";
  return "network";
}

export function fetchErrorMessage(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") return "Request timed out";
  return e instanceof Error ? e.message : "Network error";
}

async function assertOk(res: Response, provider: string): Promise<void> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new LlmError(httpErrorKind(res.status), httpErrorMessage(res.status), provider, res.status);
  }
}

export async function callModel(opts: CallOptions): Promise<string> {
  const s = requireSettings();
  const provider = resolveProvider(s);
  const url = chatEndpoint(provider, s);

  const payload = {
    model: s.model || "local-model",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
    stream: false,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(provider, s),
      body: JSON.stringify(payload),
      signal: withTimeout(s.timeout ?? 300000, opts.signal),
    });
  } catch (e) {
    throw new LlmError(classifyFetchError(e), fetchErrorMessage(e), provider.id);
  }
  await assertOk(res, provider.id);

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function streamModel(opts: StreamOptions): Promise<string> {
  const s = requireSettings();
  const provider = resolveProvider(s);
  const url = chatEndpoint(provider, s);

  const payload = {
    model: s.model || "local-model",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
    stream: true,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(provider, s),
      body: JSON.stringify(payload),
      signal: withTimeout(s.timeout ?? 300000, opts.signal),
    });
  } catch (e) {
    throw new LlmError(classifyFetchError(e), fetchErrorMessage(e), provider.id);
  }
  await assertOk(res, provider.id);

  const reader = res.body?.getReader();
  if (!reader) throw new LlmError("config", "No response body from provider", provider.id);
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        opts.onToken?.("");
        return full;
      }
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          opts.onToken?.(delta);
        }
      } catch {
        // skip malformed SSE event
      }
    }
  }
  return full;
}
