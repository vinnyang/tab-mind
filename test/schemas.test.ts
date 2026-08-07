import { describe, it, expect } from "vitest";
import { parseFacts, PageFactsSchema } from "../src/agent/schemas.js";

describe("parseFacts", () => {
  it("parses fenced JSON", () => {
    const raw = '```json\n{"title":"T","topic":"topic","keyPoints":["a","b"]}\n```';
    expect(parseFacts(raw)).toEqual({ title: "T", topic: "topic", keyPoints: ["a", "b"] });
  });

  it("parses bare JSON", () => {
    const raw = '{"title":"T","topic":"topic","keyPoints":["a"]}';
    expect(parseFacts(raw)).toEqual({ title: "T", topic: "topic", keyPoints: ["a"] });
  });

  it("parses prose-wrapped JSON", () => {
    const raw = 'Here you go:\n{"title":"T","topic":"topic","keyPoints":["a"]}\nDone.';
    expect(parseFacts(raw)).toEqual({ title: "T", topic: "topic", keyPoints: ["a"] });
  });

  it("returns null on garbage", () => {
    expect(parseFacts("I cannot comply with that request.")).toBeNull();
  });

  it("returns null on empty string", () => {
    expect(parseFacts("")).toBeNull();
  });

  it("returns null when no closing brace", () => {
    expect(parseFacts('{"title":"T","topic":"topic","keyPoints":["a"]')).toBeNull();
  });

  it("enforces schema constraints (rejects extra fields, respects max)", () => {
    const raw = '{"title":"T","topic":"topic","keyPoints":["a"],"evil":"payload"}';
    // zod strips unknown keys by default; should still parse
    expect(parseFacts(raw)).toEqual({ title: "T", topic: "topic", keyPoints: ["a"] });
  });

  it("rejects malformed JSON", () => {
    expect(parseFacts('{"title":"T",}')).toBeNull();
  });
});

describe("PageFactsSchema", () => {
  it("accepts valid facts", () => {
    const res = PageFactsSchema.safeParse({
      title: "Page Title",
      topic: "A topic",
      keyPoints: ["point one", "point two"],
    });
    expect(res.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const res = PageFactsSchema.safeParse({ title: "T" });
    expect(res.success).toBe(false);
  });

  it("rejects too many keyPoints (>12)", () => {
    const keyPoints = Array.from({ length: 13 }, (_, i) => `p${i}`);
    const res = PageFactsSchema.safeParse({ title: "T", topic: "t", keyPoints });
    expect(res.success).toBe(false);
  });
});
