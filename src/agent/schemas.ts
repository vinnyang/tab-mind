import { z } from "zod";

export const PageFactsSchema = z.object({
  title: z.string().max(300),
  topic: z.string().max(300),
  keyPoints: z.array(z.string().max(500)).max(12),
});
export type PageFacts = z.infer<typeof PageFactsSchema>;

export function parseFacts(raw: string): PageFacts | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = PageFactsSchema.safeParse(JSON.parse(body.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
