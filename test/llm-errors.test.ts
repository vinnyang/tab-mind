import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { callModel, streamModel, setSettings, LlmError } from "../src/lib/llm.js";

const PORT = 9913;
let server: { close: () => void };
let currentStatus = 200;
let currentBody = "";

function startMockServer(): Promise<{ close: () => void }> {
  const http = require("http");
  const srv = http.createServer((req: any, res: any) => {
    if (req.url === "/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
      return;
    }
    res.writeHead(currentStatus, { "Content-Type": "application/json" });
    res.end(currentBody);
  });
  return new Promise((resolve) => {
    srv.listen(PORT, () => resolve({ close: () => srv.close() }));
  });
}

describe("LlmError classification", () => {
  beforeAll(async () => {
    server = await startMockServer();
    setSettings({
      provider: "lmstudio",
      endpoint: `http://localhost:${PORT}/v1`,
      model: "test-model",
      apiKey: "",
      timeout: 5000,
    });
  });

  afterAll(() => server.close());

  it("classifies 401 as auth with friendly message", async () => {
    currentStatus = 401;
    currentBody = '{"error":"unauthorized"}';
    const err = await callModel({ system: "s", user: "u" }).catch((e) => e);
    expect(err).toMatchObject({ kind: "auth", statusCode: 401 });
    expect(err.message).toContain("check your API key");
  });

  it("classifies 403 as auth", async () => {
    currentStatus = 403;
    currentBody = '{"error":"forbidden"}';
    await expect(callModel({ system: "s", user: "u" })).rejects.toMatchObject({
      kind: "auth",
      statusCode: 403,
    });
  });

  it("classifies 429 as rate_limit with friendly message", async () => {
    currentStatus = 429;
    currentBody = '{"error":"rate limited"}';
    const err = await callModel({ system: "s", user: "u" }).catch((e) => e);
    expect(err).toMatchObject({ kind: "rate_limit", statusCode: 429 });
    expect(err.message).toContain("try again");
  });

  it("classifies 500 as server with friendly message", async () => {
    currentStatus = 500;
    currentBody = '{"error":"internal"}';
    const err = await callModel({ system: "s", user: "u" }).catch((e) => e);
    expect(err).toMatchObject({ kind: "server", statusCode: 500 });
    expect(err.message).toContain("try again later");
  });

  it("classifies 503 as server", async () => {
    currentStatus = 503;
    currentBody = '{"error":"unavailable"}';
    await expect(callModel({ system: "s", user: "u" })).rejects.toMatchObject({
      kind: "server",
      statusCode: 503,
    });
  });

  it("classifies network failures as network", async () => {
    setSettings({
      provider: "custom",
      endpoint: "http://127.0.0.1:1/v1",
      model: "test-model",
      apiKey: "",
      timeout: 2000,
    });
    await expect(callModel({ system: "s", user: "u" })).rejects.toMatchObject({
      kind: "network",
    });
    // Restore working settings for subsequent tests
    setSettings({
      provider: "lmstudio",
      endpoint: `http://localhost:${PORT}/v1`,
      model: "test-model",
      apiKey: "",
      timeout: 5000,
    });
  });

  it("LlmError is an instance of Error", () => {
    const err = new LlmError("auth", "msg", "lmstudio", 401);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.name).toBe("LlmError");
    expect(err.kind).toBe("auth");
    expect(err.provider).toBe("lmstudio");
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("msg");
  });

  it("streamModel also classifies HTTP errors", async () => {
    currentStatus = 401;
    currentBody = '{"error":"unauthorized"}';
    await expect(streamModel({ system: "s", user: "u" })).rejects.toMatchObject({
      kind: "auth",
      statusCode: 401,
    });
  });
});
