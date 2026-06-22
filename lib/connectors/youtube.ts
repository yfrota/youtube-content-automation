import type { ConnectorVideo, FetchCatalogParams, PlatformConnector } from "./types";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeChannelsListResponse {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
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
    const uploadsPlaylistId = await getUploadsPlaylistId(externalChannelId);
    if (!uploadsPlaylistId) return [];

    const videoIds = await listAllVideoIds(uploadsPlaylistId);
    if (videoIds.length === 0) return [];

    return fetchVideoDetails(videoIds);
  },
};
