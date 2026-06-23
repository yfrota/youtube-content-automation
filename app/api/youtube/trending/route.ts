import { NextResponse } from "next/server";

const SUGGEST_BASE_URL = "https://suggestqueries.google.com/complete/search";

// No auth needed — this is Google's public (unauthenticated) autocomplete
// endpoint, same one youtube.com's own search box uses.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "q query param is required" }, { status: 400 });
  }
  const lang = searchParams.get("lang") ?? "pt-BR";

  const url = new URL(SUGGEST_BASE_URL);
  url.searchParams.set("client", "youtube");
  url.searchParams.set("ds", "yt");
  url.searchParams.set("q", q);
  url.searchParams.set("hl", lang);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`suggest endpoint failed: ${res.status} ${res.statusText}`);
    }

    // The endpoint serves ISO-8859-1 regardless of what Content-Type claims
    // — Response.text() always decodes as UTF-8 and mangles accented
    // characters (verified against the live endpoint with q=podcast: "podcast
    // cristão" came back as "podcast crist?o"), so decode the raw bytes
    // explicitly instead.
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder("iso-8859-1").decode(buffer);

    // Response is JSONP-wrapped (`window.google.ac.h([...])`) — extract the
    // bracketed array between the first `[` and the last `]` rather than
    // parsing the wrapper, so this works whether or not a callback prefix is
    // present.
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("unexpected response shape from suggest endpoint");
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

    const rawSuggestions = parsed?.[1];
    const suggestions: string[] = Array.isArray(rawSuggestions)
      ? rawSuggestions
          .map((entry: unknown) => (Array.isArray(entry) ? entry[0] : entry))
          .filter((s: unknown): s is string => typeof s === "string")
      : [];

    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
