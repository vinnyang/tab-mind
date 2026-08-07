import { StateGraph, START, END } from "@langchain/langgraph/web";
import { AgentState } from "./state.js";
import { extractNode } from "./nodes/extract.js";
import { answerNode } from "./nodes/answer.js";

export function buildGraph() {
  return new StateGraph(AgentState)
    .addNode("extract", extractNode)
    .addNode("answer", answerNode)
    .addEdge(START, "extract")
    .addEdge("extract", "answer")
    .addEdge("answer", END)
    .compile();
}
