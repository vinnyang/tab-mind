import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildGraph } from "../src/agent/graph.js";
import { setSettings } from "../src/lib/llm.js";
import { HumanMessage } from "@langchain/core/messages";

// Mock OpenAI-compatible server that splits SSE across chunks.
const PORT = 9911;
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

      if (url === "/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
        return;
      }

      if (stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        // Answer node: stream tokens
        const tokens = ["The ", "answer ", "is ", "42."];
        for (const t of tokens) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        // Extract node: return JSON
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"title":"Test Page","topic":"Testing","keyPoints":["point one","point two"]}',
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

describe("M2 extract → answer pipeline", () => {
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

  it("runs extract then answer and returns the streamed answer", async () => {
    const app = buildGraph();
    const result = await app.invoke({
      messages: [new HumanMessage("What is the answer?")],
      rawPage: "This is test page content about testing.",
      selection: "",
    });

    expect(result.facts).toEqual({
      title: "Test Page",
      topic: "Testing",
      keyPoints: ["point one", "point two"],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    expect(lastMessage?.content).toBe("The answer is 42.");
  });

  it("degrades gracefully when model emits no JSON (selection mode)", async () => {
    const app = buildGraph();
    const result = await app.invoke({
      messages: [new HumanMessage("summarize")],
      rawPage: "",
      selection: "This is selected text content.",
    });

    expect(result.facts).not.toBeNull();
    const lastMessage = result.messages[result.messages.length - 1];
    expect(lastMessage?.content).toBeTruthy();
  });
});
