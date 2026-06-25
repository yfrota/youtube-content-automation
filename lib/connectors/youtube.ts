import type { ConnectorVideo, FetchCatalogParams, PlatformConnector } from "./types";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeChannelsListResponse {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface YouTubeChannelsListIdResponse {
  items?: Array<{ id?: string }>;
}

interface YouTubeSearchListResponse {
  items?: Array<{ id?: { channelId?: string } }>;
}

interface YouTubePlaylistItemsListResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
}

interface YouTubeVideosListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      tags?: string[];
      publishedAt?: string;
    };
  }>;
}

function requireApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY");
  return key;
}

async function youtubeFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  url.searchParams.set("key", requireApiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${path} failed: ${res.status} ${res.statusText} — ${body}`);
  }
  return res.json() as Promise<T>;
}

// channels.list's `id` param (used by getUploadsPlaylistId below) only
// accepts literal Channel IDs — passing a @handle or a full URL silently
// returns zero items, not an error, so this resolution step is load-bearing
// even though it's easy to miss while testing with a real Channel ID.
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

function extractChannelIdFromUrl(input: string): string | null {
  const match = input.match(/\/channel\/(UC[\w-]{22})/);
  return match ? match[1] : null;
}

function extractHandle(input: string): string | null {
  // Matches a bare "@handle" or one embedded in a URL path segment
  // (youtube.com/@handle, optionally followed by /videos, ?query, etc.).
  const match = input.match(/@([\w.-]+)/);
  return match ? `@${match[1]}` : null;
}

function extractLegacyName(input: string): string | null {
  // Older /c/customname and /user/legacyname URL styles — increasingly
  // rare now that YouTube has pushed everyone to @handles, but some
  // channels never migrated.
  const match = input.match(/\/(?:c|user)\/([\w.-]+)/);
  return match ? match[1] : null;
}

async function resolveByHandle(handle: string): Promise<string | null> {
  const data = await youtubeFetch<YouTubeChannelsListIdResponse>("channels", {
    part: "id",
    forHandle: handle,
  });
  return data.items?.[0]?.id ?? null;
}

async function resolveByUsername(username: string): Promise<string | null> {
  const data = await youtubeFetch<YouTubeChannelsListIdResponse>("channels", {
    part: "id",
    forUsername: username,
  });
  return data.items?.[0]?.id ?? null;
}

// Last-resort fallback for /c/ custom URLs that don't match a legacy
// username — search.list costs 100 quota units (vs. 1 for channels.list),
// so this only runs when the cheaper forUsername lookup comes up empty.
async function resolveBySearch(query: string): Promise<string | null> {
  const data = await youtubeFetch<YouTubeSearchListResponse>("search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: "1",
  });
  return data.items?.[0]?.id?.channelId ?? null;
}

/** Resolves a Channel ID, @handle, or full youtube.com URL to a canonical
 * Channel ID (UCxxxx...) — the only format channels.list's `id` param
 * actually accepts. Throws if nothing resolves. */
export async function resolveChannelId(input: string): Promise<string> {
  const trimmed = input.trim();

  if (CHANNEL_ID_PATTERN.test(trimmed)) return trimmed;

  const idFromUrl = extractChannelIdFromUrl(trimmed);
  if (idFromUrl) return idFromUrl;

  const handle = extractHandle(trimmed);
  if (handle) {
    const resolved = await resolveByHandle(handle);
    if (resolved) return resolved;
  }

  const legacyName = extractLegacyName(trimmed);
  if (legacyName) {
    const viaUsername = await resolveByUsername(legacyName);
    if (viaUsername) return viaUsername;
    const viaSearch = await resolveBySearch(legacyName);
    if (viaSearch) return viaSearch;
  }

  throw new Error(
    `Could not resolve YouTube channel identifier "${input}" to a channel ID — ` +
      "expected a Channel ID (UCxxxx...), a @handle, or a youtube.com URL."
  );
}

async function getUploadsPlaylistId(channelId: string): Promise<string | null> {
  const data = await youtubeFetch<YouTubeChannelsListResponse>("channels", {
    part: "contentDetails",
    id: channelId,
  });
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

async function listAllVideoIds(uploadsPlaylistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const data = await youtubeFetch<YouTubePlaylistItemsListResponse>("playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchVideoDetails(videoIds: string[]): Promise<ConnectorVideo[]> {
  const out: ConnectorVideo[] = [];
  for (const batch of chunk(videoIds, 50)) {
    const data = await youtubeFetch<YouTubeVideosListResponse>("videos", {
      part: "snippet",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      out.push({
        externalVideoId: item.id,
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        tags: item.snippet?.tags ?? [],
        publishedAt: item.snippet?.publishedAt ?? null,
      });
    }
  }
  return out;
}

export const youtubeConnector: PlatformConnector = {
  platform: "youtube",
  async fetchCatalog({ externalChannelId }: FetchCatalogParams): Promise<ConnectorVideo[]> {
    // No-op if externalChannelId is already canonical (just a regex check,
    // no extra API call) — callers that already resolved it upstream (see
    // app/api/connectors/youtube/index/route.ts) don't pay for this twice.
    const channelId = await resolveChannelId(externalChannelId);
    const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
    if (!uploadsPlaylistId) return [];

    const videoIds = await listAllVideoIds(uploadsPlaylistId);
    if (videoIds.length === 0) return [];

    return fetchVideoDetails(videoIds);
  },
};
