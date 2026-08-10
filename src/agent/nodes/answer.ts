import type { AgentStateT } from "../state.js";
import { streamModel } from "../../lib/llm.js";

export async function answerNode(s: AgentStateT, onToken?: (token: string) => void) {
  const question = (s.messages.at(-1)?.content as string) ?? "";
  const grounding = s.facts
    ? JSON.stringify(s.facts)
    : (s.selection || s.rawPage).slice(0, 8000);

  const text = await streamModel({
    system: "Answer the user's question using the page information provided. Be concise.",
    user: `Page information:\n${grounding}\n\nQuestion: ${question}`,
    onToken,
  });
  return { messages: [{ role: "assistant", content: text }] };
}
