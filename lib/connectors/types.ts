export type Platform = "youtube" | "instagram" | "facebook" | "linkedin";

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
