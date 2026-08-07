import type { AgentStateT } from "../state.js";

const CHUNK = 8000;
const OVERLAP = 400;

export function splitNode(s: AgentStateT) {
  const text = s.rawPage;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK - OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK));
  }
  return { chunks };
}
