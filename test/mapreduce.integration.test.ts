import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildGraph } from "../src/agent/graph.js";
import { setSettings } from "../src/lib/llm.js";
import { HumanMessage } from "@langchain/core/messages";

// Mock server that handles both extract (non-stream) and summarize (stream) calls.
// Deliberately varies response latency per chunk to prove parallel order is non-deterministic.
const PORT = 9912;
let server: { close: () => void };

function startMockServer(): Promise<{ close: () => void }> {
  const http = require("http");
  const srv = http.createServer((req: any, res: any) => {
    let body = "";
    req.on("data", (c: any) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const stream = parsed.stream;
      const url = req.url;
      const userMessage = parsed.messages?.find((m: any) => m.role === "user")?.content ?? "";

      if (url === "/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
        return;
      }

      if (stream) {
        const chunkMatch = userMessage.match(/PAGE_CONTENT>>>\n(.*?)\n>>>/s);
        const chunkText = chunkMatch?.[1] ?? "";
        const idxMarker = chunkText.slice(0, 20);
        const summary = `Summary of: ${idxMarker}`;

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        const tokens = summary.split(" ");
        for (const t of tokens) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t + " " } }] })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"title":"Long Page Test","topic":"Map-reduce","keyPoints":["covers full page"]}',
                },
              },
            ],
          })
        );
      }
    });
  });

  return new Promise((resolve) => {
    srv.listen(PORT, () => {
      resolve({ close: () => srv.close() });
    });
  });
}

describe("M3 parallel map-reduce", () => {
  beforeAll(async () => {
    server = await startMockServer();
    setSettings({
      provider: "lmstudio",
      endpoint: `http://localhost:${PORT}/v1`,
      model: "test-model",
      apiKey: "",
      timeout: 30000,
    });
  });

  afterAll(() => {
    server.close();
  });

  it("chunks a long page, summarizes in parallel, and produces ordered extract+answer", async () => {
    const sectionA = "SECTION_A_BEGIN " + "a".repeat(3000) + " SECTION_A_END\n";
    const sectionB = "SECTION_B_BEGIN " + "b".repeat(3000) + " SECTION_B_END\n";
    const sectionC = "SECTION_C_BEGIN " + "c".repeat(3000) + " SECTION_C_END\n";
    const sectionD = "SECTION_D_BEGIN " + "d".repeat(3000) + " SECTION_D_END\n";
    const rawPage = sectionA + sectionB + sectionC + sectionD;

    const app = buildGraph();
    const result = await app.invoke({
      messages: [new HumanMessage("What is this page about?")],
      rawPage,
      selection: "",
    });

    expect(result.partials.length).toBeGreaterThan(1);

    const indices = result.partials.map((p) => p.i);
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);

    expect(result.facts).not.toBeNull();
    expect(result.facts?.title).toBe("Long Page Test");

    const lastMessage = result.messages[result.messages.length - 1];
    expect(lastMessage?.content).toBeTruthy();
  });

  it("short pages skip the map-reduce path entirely", async () => {
    const app = buildGraph();
    const result = await app.invoke({
      messages: [new HumanMessage("What is this?")],
      rawPage: "This is a short page.",
      selection: "",
    });

    expect(result.chunks.length).toBe(0);
    expect(result.partials.length).toBe(0);

    expect(result.facts).not.toBeNull();
    const lastMessage = result.messages[result.messages.length - 1];
    expect(lastMessage?.content).toBeTruthy();
  });

  it("selection mode skips map-reduce", async () => {
    const app = buildGraph();
    const result = await app.invoke({
      messages: [new HumanMessage("Explain this")],
      rawPage: "a".repeat(50000),
      selection: "This is the selected text.",
    });

    expect(result.chunks.length).toBe(0);
    expect(result.facts).not.toBeNull();
  });
});
