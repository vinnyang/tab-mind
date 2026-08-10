import { StateGraph, START, END, Send } from "@langchain/langgraph/web";
import type { BaseCheckpointSaver } from "@langchain/langgraph/web";
import { AgentState, type AgentStateT } from "./state.js";
import { splitNode } from "./nodes/split.js";
import { summarizeChunkNode } from "./nodes/summarizeChunk.js";
import { extractNode } from "./nodes/extract.js";
import { answerNode } from "./nodes/answer.js";

const LONG_PAGE = 12000;

function routeStart(s: AgentStateT): "split" | "extract" {
  if (s.selection.trim()) return "extract";
  return s.rawPage.length > LONG_PAGE ? "split" : "extract";
}

function fanOut(s: AgentStateT) {
  return s.chunks.map((chunk, i) => new Send("summarizeChunk", { chunk, i }));
}

export function buildGraph(checkpointer?: BaseCheckpointSaver, onToken?: (token: string) => void) {
  const graph = new StateGraph(AgentState)
    .addNode("split", splitNode)
    .addNode("summarizeChunk", summarizeChunkNode)
    .addNode("extract", extractNode)
    .addNode("answer", (state) => answerNode(state, onToken))
    .addConditionalEdges(START, routeStart, ["split", "extract"])
    .addConditionalEdges("split", fanOut, ["summarizeChunk"])
    .addEdge("summarizeChunk", "extract")
    .addEdge("extract", "answer")
    .addEdge("answer", END);
  return checkpointer ? graph.compile({ checkpointer }) : graph.compile();
}
