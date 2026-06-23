const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSIONS = 768; // matches scripts.embedding vector(768)

interface GeminiEmbedContentResponse {
  embedding?: { values?: number[] };
}

interface GeminiBatchEmbedContentsResponse {
  embeddings?: Array<{ values?: number[] }>;
}

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

// Gemini rejects empty content — substitute a single space rather than skip
// the item, so callers never have to special-case "no embedding".
function sanitize(text: string): string {
  return text.trim().length > 0 ? text : " ";
}

async function geminiFetch<T>(path: string, body: unknown): Promise<T> {
  const url = `${GEMINI_API_BASE}/${path}?key=${requireApiKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API ${path} failed: ${res.status} ${res.statusText} — ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function embedText(text: string): Promise<number[]> {
  const data = await geminiFetch<GeminiEmbedContentResponse>(
    `models/${EMBEDDING_MODEL}:embedContent`,
    {
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: sanitize(text) }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }
  );
  const values = data.embedding?.values;
  if (!values) throw new Error("Gemini embedText: response had no embedding values");
  return values;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const data = await geminiFetch<GeminiBatchEmbedContentsResponse>(
    `models/${EMBEDDING_MODEL}:batchEmbedContents`,
    {
      requests: texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: sanitize(text) }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    }
  );
  const embeddings = data.embeddings;
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error("Gemini embedBatch: response embeddings count did not match input count");
  }
  return embeddings.map((e, i) => {
    if (!e.values) throw new Error(`Gemini embedBatch: missing values at index ${i}`);
    return e.values;
  });
}
