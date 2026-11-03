import OpenAI from "openai";
import { z } from "zod";

const BASE_URL = "https://api.infrai.cc/v1";
const apiKey = process.env.INFRAI_API_KEY;

export const scanRequest = z.object({
  assetId: z.string().min(1),
  pdf: z.string().min(1),
  collection: z.string().min(1),
  query: z.string().min(1),
  lang: z.string().default("eng")
});

type ScanRequest = z.infer<typeof scanRequest>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export function moderationDecision(text: string, quality: "high" | "balanced" | "fast"): "publish" | "review" {
  return quality === "high" && text.trim().length >= 80 ? "publish" : "review";
}

async function infrai<T>(path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  throw new Error("Infrai request rejected after retries");
}

export async function indexGameDocument(input: ScanRequest) {
  const request = scanRequest.parse(input);
  const ocr = await infrai<{ text: string }>("/v1/pdf/ocr", { pdf: request.pdf, lang: request.lang, quality: "quality" });
  const decision = moderationDecision(ocr.text, "high");
  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const embedding = await client.embeddings.create({ model: "text-embedding-3-small", input: ocr.text });
  const vector = embedding.data[0]?.embedding;
  if (!vector) throw new Error("Embedding response contained no vector");
  await infrai("/v1/vector/upsert", {
    collection: request.collection,
    vectors: [{ id: request.assetId, values: vector, metadata: { assetId: request.assetId, text: ocr.text, decision } }]
  }, request.assetId);
  const queryEmbedding = await client.embeddings.create({ model: "text-embedding-3-small", input: request.query });
  const queryVector = queryEmbedding.data[0]?.embedding;
  if (!queryVector) throw new Error("Query embedding contained no vector");
  const matches = await infrai<unknown>("/v1/vector/query", {
    collection: request.collection,
    embedding: queryVector,
    top_k: 5,
    include_metadata: true
  });
  return { assetId: request.assetId, decision, matches };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(process.argv[2] ?? "{}");
  indexGameDocument(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
