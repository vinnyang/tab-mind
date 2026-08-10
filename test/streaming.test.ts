import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { streamModel, callModel, setSettings, LlmError } from "../src/lib/llm.js";

const PORT = 9914;
let server: { close: () => void };
let sseBody = "";
let shouldFail = false;

function startMockServer(): Promise<{ close: () => void }> {
  const http = require("http");
  const srv = http.createServer((req: any, res: any) => {
    if (req.url === "/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
      return;
    }
    if (shouldFail) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    const tokens = sseBody.split(" ");
    tokens.forEach((t, i) => {
      const delta = i === 0 ? t : ` ${t}`;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
    });
    res.write("data: [DONE]\n\n");
    res.end();
  });
  return new Promise((resolve) => {
    srv.listen(PORT, () => resolve({ close: () => srv.close() }));
  });
}

describe("streamModel streaming", () => {
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

  it("delivers tokens to onToken callback in order", async () => {
    sseBody = "The quick brown fox";
    const tokens: string[] = [];
    const text = await streamModel({
      system: "s",
      user: "u",
      onToken: (t) => tokens.push(t),
    });

    expect(tokens).toEqual(["The", " quick", " brown", " fox"]);
    expect(text).toBe("The quick brown fox");
  });

  it("calls onToken for each chunk of a multi-token stream", async () => {
    sseBody = "Hello world from the LLM";
    const tokens: string[] = [];
    await streamModel({
      system: "s",
      user: "u",
      onToken: (t) => tokens.push(t),
    });

    expect(tokens.length).toBe(5);
    expect(tokens.join("")).toBe("Hello world from the LLM");
  });

  it("does not call onToken on HTTP error", async () => {
    shouldFail = true;
    const tokens: string[] = [];
    await expect(
      streamModel({ system: "s", user: "u", onToken: (t) => tokens.push(t) })
    ).rejects.toMatchObject({ kind: "auth" });
    expect(tokens).length(0);
    shouldFail = false;
  });
});
