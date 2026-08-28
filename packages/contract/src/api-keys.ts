/**
 * Wire contract for `/api/keys` — machine credentials for the MCP endpoint.
 * The raw key appears exactly once, in the creation response; the list
 * carries display metadata only, never hashes.
 */

export interface ApiKeyWire {
  id: string;
  name: string;
  /** Display stub of the raw key: "klorn_sk_ab12cd". */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

/** `GET /api/keys` */
export interface ApiKeysListResponse {
  keys: ApiKeyWire[];
}

/** `POST /api/keys` */
export interface CreateApiKeyRequest {
  name: string;
}
export interface CreateApiKeyResponse {
  id: string;
  name: string;
  prefix: string;
  /** The raw key — shown once, never retrievable again. */
  key: string;
}
