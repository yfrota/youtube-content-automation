import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536; // matches scripts.embedding vector(1536)

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  client = new OpenAI({ apiKey });
  return client;
}

// OpenAI rejects empty string input — substitute a single space rather than
// skip the item, so callers never have to special-case "no embedding".
function sanitize(text: string): string {
  return text.trim().length > 0 ? text : " ";
}

export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: sanitize(text),
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map(sanitize),
    dimensions: EMBEDDING_DIMENSIONS,
  });
  // OpenAI guarantees response order matches input order.
  return res.data.map((d) => d.embedding);
}
