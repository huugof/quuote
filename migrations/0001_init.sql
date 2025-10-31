-- Items table holds all content types.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  source_url TEXT,
  attributes TEXT NOT NULL,
  tags TEXT,
  submitted_by TEXT,
  render_status TEXT NOT NULL DEFAULT 'queued',
  og_path TEXT,
  embed_path TEXT,
  markdown_path TEXT,
  rendered_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  render_failures INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_items_type_created ON items (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_render_status ON items (render_status, created_at);

-- API keys table for token-based auth.
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME
);
