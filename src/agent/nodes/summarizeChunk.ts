import { callModel } from "../../lib/llm.js";

export async function summarizeChunkNode(task: { chunk: string; i: number }) {
  const text = await callModel({
    system: "Summarize this section of a longer document in 2-3 sentences. Preserve specifics.",
    user: task.chunk,
  });
  return { partials: [{ i: task.i, text }] };
}
