import { Annotation } from "@langchain/langgraph/web";
import type { BaseMessage } from "@langchain/core/messages";
import type { PageFacts } from "./schemas.js";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  rawPage: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  selection: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  chunks: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  partials: Annotation<{ i: number; text: string }[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  facts: Annotation<PageFacts | null>({ reducer: (_, b) => b, default: () => null }),
});

export type AgentStateT = typeof AgentState.State;
