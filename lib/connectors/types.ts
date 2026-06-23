// spotify/tiktok added in 0009 (platform_type enum) — no connector or agent
// support for either yet, same "enum allows it, nothing implements it" gap
// instagram/facebook/linkedin have had since 0001.
export type Platform = "youtube" | "instagram" | "facebook" | "linkedin" | "spotify" | "tiktok";

export interface ConnectorVideo {
  externalVideoId: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string | null; // ISO 8601, null if unknown
}

export interface FetchCatalogParams {
  externalChannelId: string;
}

// Shared adapter contract — YouTube implements this now; Instagram/Facebook/
// LinkedIn implement the same shape later. Agents only ever see
// ConnectorVideo + a platform tag, never connector-specific details.
export interface PlatformConnector {
  readonly platform: Platform;
  fetchCatalog(params: FetchCatalogParams): Promise<ConnectorVideo[]>;
}
