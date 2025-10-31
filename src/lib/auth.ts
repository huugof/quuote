import { getDb } from "@app/lib/db";
import { hashToken } from "@app/lib/crypto";

export type ApiKeyRecord = {
  id: string;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
};

let lastCacheTime = 0;
const CACHE_WINDOW_MS = 10_000;
let cachedHashes: Set<string> | null = null;

function refreshCache() {
  const now = Date.now();
  if (cachedHashes && now - lastCacheTime < CACHE_WINDOW_MS) {
    return;
  }
  const db = getDb();
  const rows = db
    .query<ApiKeyRecord>("SELECT id, name, token_hash, created_at, last_used_at FROM api_keys")
    .all();
  cachedHashes = new Set(rows.map((row) => row.token_hash));
  lastCacheTime = now;
}

export function validateToken(token: string | null): boolean {
  if (!token) return false;
  refreshCache();
  if (!cachedHashes) return false;
  const hashed = hashToken(token);
  if (!cachedHashes.has(hashed)) return false;

  const db = getDb();
  db
    .query("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
    .run(hashed);
  return true;
}
