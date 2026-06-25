import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ConnectorVideo, Platform } from "@/lib/connectors/types";
import { embedBatch } from "./embeddings";

export interface IndexCatalogParams {
  clientId: string;
  platform: Platform;
  externalChannelId: string;
  videos: ConnectorVideo[];
}

export interface IndexCatalogResult {
  totalVideos: number;
  indexed: number;
  failed: Array<{ externalVideoId: string; error: string }>;
}

const EMBED_BATCH_SIZE = 100;
// Per video this is 2-3 sequential Supabase round-trips (upsert projects,
// select scripts, insert-or-update scripts) — live-measured at ~550ms each
// when run one-at-a-time, which is what caused 76 videos to take ~45s and
// blow past Vercel's serverless function timeout. embedBatch itself is not
// the bottleneck (one batched Gemini call for the whole input, ~1.7s for
// 76 texts) — it's this per-video DB chain. Running PER_VIDEO_CONCURRENCY
// of these chains at once cuts wall-clock time roughly proportionally,
// since each video's work is otherwise fully independent of the others'.
const PER_VIDEO_CONCURRENCY = 10;

function buildEmbeddingText(video: ConnectorVideo): string {
  const tagLine = video.tags.length > 0 ? `Tags: ${video.tags.join(", ")}` : "";
  const text = [video.title, video.description, tagLine].filter(Boolean).join("\n\n");
  return text || video.externalVideoId;
}

// No `p-limit` dependency for one concurrency-capped loop — `concurrency`
// workers each pull the next item off a shared cursor until none remain.
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
}

export async function indexCatalog(params: IndexCatalogParams): Promise<IndexCatalogResult> {
  const { clientId, platform, externalChannelId, videos } = params;
  const supabase = getSupabaseAdmin();
  const failed: IndexCatalogResult["failed"] = [];
  let indexed = 0;

  for (let i = 0; i < videos.length; i += EMBED_BATCH_SIZE) {
    const batch = videos.slice(i, i + EMBED_BATCH_SIZE);

    let embeddings: number[][];
    try {
      embeddings = await embedBatch(batch.map(buildEmbeddingText));
    } catch (err) {
      // Whole batch failed (e.g. OpenAI outage/rate limit) — record every
      // video in this batch and move on to the next batch rather than
      // aborting the entire run.
      const message = err instanceof Error ? err.message : String(err);
      for (const video of batch) failed.push({ externalVideoId: video.externalVideoId, error: message });
      continue;
    }

    await runWithConcurrency(batch, PER_VIDEO_CONCURRENCY, async (video, j) => {
      try {
        const { data: project, error: projectError } = await supabase
          .from("projects")
          .upsert(
            {
              client_id: clientId,
              platform,
              title: video.title || video.externalVideoId,
              external_channel_id: externalChannelId,
              external_video_id: video.externalVideoId,
              status: "published",
            },
            { onConflict: "client_id,external_video_id" }
          )
          .select("id")
          .single();
        if (projectError) throw new Error(projectError.message);

        const content = buildEmbeddingText(video);

        // Not .upsert(): the unique index on scripts(project_id) is partial
        // (where raw_transcript is null), and PostgREST's upsert emits a
        // plain `ON CONFLICT (project_id) DO UPDATE` with no WHERE clause,
        // which Postgres rejects against a partial index. Select-then-branch
        // sidesteps that entirely.
        const { data: existing, error: selectError } = await supabase
          .from("scripts")
          .select("id")
          .eq("project_id", project.id)
          .is("raw_transcript", null)
          .maybeSingle();
        if (selectError) throw new Error(selectError.message);

        if (existing) {
          const { error: updateError } = await supabase
            .from("scripts")
            .update({ content, embedding: embeddings[j] })
            .eq("id", existing.id);
          if (updateError) throw new Error(updateError.message);
        } else {
          const { error: insertError } = await supabase.from("scripts").insert({
            client_id: clientId,
            project_id: project.id,
            platform,
            content,
            status: "published",
            embedding: embeddings[j],
          });
          if (insertError) throw new Error(insertError.message);
        }

        indexed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ externalVideoId: video.externalVideoId, error: message });
      }
    });
  }

  return { totalVideos: videos.length, indexed, failed };
}
