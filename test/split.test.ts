import { describe, it, expect } from "vitest";
import { splitNode } from "../src/agent/nodes/split.js";
import type { AgentStateT } from "../src/agent/state.js";

function makeState(rawPage: string): AgentStateT {
  return {
    messages: [],
    rawPage,
    selection: "",
    chunks: [],
    partials: [],
    facts: null,
  };
}

describe("splitNode", () => {
  it("returns no chunks for empty input", () => {
    const result = splitNode(makeState(""));
    expect(result.chunks).toEqual([]);
  });

  it("does not split short pages (under 8000 chars)", () => {
    const result = splitNode(makeState("a".repeat(7000)));
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0]?.length).toBe(7000);
  });

  it("splits long pages into overlapping chunks", () => {
    const text = "a".repeat(20000);
    const result = splitNode(makeState(text));
    expect(result.chunks.length).toBeGreaterThan(1);

    expect(result.chunks[0]?.length).toBe(8000);

    const step = (result.chunks[0]?.length ?? 0) - 400;
    expect(result.chunks[1]).toBe(text.slice(step, step + 8000));
  });

  it("covers the full text (last chunk reaches the end)", () => {
    const text = "x".repeat(25000);
    const result = splitNode(makeState(text));
    const lastChunk = result.chunks[result.chunks.length - 1];
    expect(lastChunk?.endsWith("x".repeat(100))).toBe(true);
  });
});
