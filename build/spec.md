# Quote Cards Service Specification (v3)

**Goal:** Operate a lean, Bun-powered service that accepts structured content (starting with quotes), validates and stores it in SQLite, renders assets within seconds, and serves OG images, embeds, Markdown, and RSS feeds from a single VPS deployment.

---

## 1. Core Principles
- **Single runtime:** Bun handles the HTTP API, render worker, RSS/Markdown generation, and utility scripts.
- **One source of truth:** Content lives in SQLite; all assets derive from stored records.
- **Fast turnaround:** Background worker renders new items immediately with a sub-15 s target from submission to published assets.
- **Extensible by type:** Items are typed (`quote`, later `product`) via a registry that owns validation, rendering, and serialization.
- **Predictable surfaces:** Every rendered item produces OG JPEG, embeddable HTML, Markdown export, and RSS entries.

---

## 2. Architecture Overview
- **API Server (`src/api.ts`):** Bun HTTP server exposing `/items` CRUD endpoints, token authentication, and Markdown export. Accepts JSON payloads with `type` and type-specific attributes; assigns ULID ids.
- **SQLite Storage:** `items` table for shared fields, type, JSON attributes, render metadata, and asset paths; `api_keys` table stores hashed tokens; optional `render_events` table for observability.
- **Type Registry (`src/types/`):** Each type module (e.g., `quote.ts`) declares fields, validation, render hooks, and serializers. Central registry maps `type` string to module.
- **Render Worker (`src/worker.ts`):** Long-running Bun process that polls for `render_status='queued'` items, locks the row, renders assets with Satori/Resvg/jpeg-js, writes outputs, updates status, and regenerates per-type RSS.
- **Filesystem Layout (`/srv/quote-cards`):**
  - `/app` — Bun project source.
  - `/data/og/<type>/<id>.jpg`, `/data/embed/<type>/<id>.html`, `/data/markdown/<type>/<id>.md`, `/data/rss/<type>.xml`.
  - `/logs/api.log`, `/logs/worker.log`.
- **Delivery:** Nginx (or Bun static) serves `/og/:type/:id.jpg`, `/embed/:type/:id.html`, `/markdown/:type/:id.md`, `/rss/:type.xml`, and proxies `/api/*` to the Bun API server.

---

## 3. Data Model
### 3.1 `items` table
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT (ULID) | Primary key generated server-side |
| `type` | TEXT | Item type key (`quote`, later `product`) |
| `title` | TEXT | Human-readable title or headline |
| `source_url` | TEXT | Canonical source link |
| `attributes` | TEXT (JSON) | Type-specific payload, validated before insert |
| `tags` | TEXT (JSON array) | Ordered tags for filtering |
| `render_status` | TEXT | `queued` \| `rendering` \| `rendered` \| `failed` |
| `og_path` | TEXT | Relative path to OG JPEG |
| `embed_path` | TEXT | Relative path to HTML embed |
| `markdown_path` | TEXT | Relative path to Markdown export |
| `rendered_at` | DATETIME | Set on successful render |
| `created_at` | DATETIME | Default `CURRENT_TIMESTAMP` |
| `updated_at` | DATETIME | Updated on mutations |
| `render_failures` | INTEGER | Failure count for backoff |

### 3.2 `api_keys` table
- `id`, `name`, `token_hash`, `created_at`, `last_used_at`.

### 3.3 Future tables (optional)
- `users` (for per-user tokens and roles).
- `workspaces` (multi-tenant segmentation).

---

## 4. Type Registry
- `src/types/index.ts` exports a map of `{ [type]: ItemTypeModule }`.
- Each module defines:
  - `schema`: field descriptors (name, type, required, validation rules).
  - `normalize(payload)`: returns sanitized attributes plus derived fields (`title`, `source_url`, `tags`).
  - `render(context)`: produces Satori-ready tree and metadata for OG/HTML.
  - `markdown(item)`: returns canonical Markdown (front matter + body).
  - `rss(item)`: returns RSS item fragment.
- **Quote type** fields: `quote_text`, `author`, `url`, `article_title?`, `tags[]`.
- **Product type (future)** fields: `name`, `manufacturer`, `image`, `url`, `cost`, `finish`, `spec_sheet`, `material`, `tags[]`.

---

## 5. API Endpoints
- `POST /items`
  - Body: `{ type: "quote", attributes: {...}, tags?: [], submitted_by?: string }`.
  - Validates via registry, inserts row with `render_status='queued'`, returns item + asset URLs.
- `GET /items`
  - Query params: `type`, `limit`, `cursor`, `tag`.
  - Returns paginated list ordered by `created_at DESC`.
- `GET /items/:id`
  - Returns metadata, render status, and asset URLs.
- `PATCH /items/:id`
  - Partial updates validated via registry; if render-affecting fields change, set `render_status='queued'`.
- `GET /items/:id/markdown`
  - Returns canonical Markdown export (`text/plain`) generated via registry serializer.
- Authentication: Bearer token header checked against `api_keys` hash.
- Rate limiting: lightweight in-memory buckets per token (configurable).

---

## 6. Rendering Pipeline
1. Worker polls `items` for `render_status='queued'` using `BEGIN IMMEDIATE` plus `UPDATE ... SET render_status='rendering' WHERE id=? AND render_status='queued'`.
2. Registry module builds Satori tree using shared fonts and templates.
3. Resvg rasterizes to JPEG (1200×628 default); embed HTML written via template literal.
4. Markdown file generated from stored attributes (front matter + optional body).
5. Files saved under `/data/{og,embed,markdown}/<type>/<id>`.
6. RSS feed regenerated for the type (keep last 50 rendered items) and a combined feed if enabled.
7. On success update row with paths, `render_status='rendered'`, `rendered_at=now`.
8. On failure increment `render_failures`, set status to `failed`, and schedule retry with exponential backoff.

---

## 7. Assets & Templates
- Fonts stored in `assets/fonts/` (Atkinson Hyperlegible initial).
- Quote renderer reuses the legacy visual design, ported to Satori-friendly modules.
- HTML embeds delivered via minimal template with shared CSS; allow environment overrides for `SITE_ORIGIN` and `BASE_PATH`.
- Markdown export includes YAML front matter matching registry schema for easy re-import.

---

## 8. RSS Generation
- Per-type feeds at `/data/rss/<type>.xml` with `<link>` values pointing to embed URLs.
- Combined feed (`/data/rss/all.xml`) optional; include `type` in item metadata for aggregation.
- Regenerate feeds after each successful render to keep static files current.

---

## 9. Deployment & Operations
- **Services:** Systemd units for `quote-cards-api` (Bun HTTP) and `quote-cards-worker` (Bun worker).
- **Reverse proxy:** Nginx routes `/api/*` to Bun server, serves `/og/`, `/embed/`, `/markdown/`, `/rss/` from disk, and handles HTTPS via Let’s Encrypt.
- **Configuration:** Environment variables (`PORT`, `DATA_ROOT`, `DATABASE_PATH`, `CARD_VERSION`, `BASE_PATH`, `SITE_ORIGIN`).
- **Logging:** Plain text logs under `/srv/quote-cards/logs`; include request id, item id, render duration.
- **Backups:** Nightly SQLite dump plus rsync of `/data` directory; consider object storage mirror for OG images if volume grows.

---

## 10. Security & Auth
- Pre-generated tokens hashed with `crypto.subtle.digest`; creation script writes hash to DB and returns the plaintext token once.
- Enforce HTTPS; reject requests without Bearer token.
- Log auth attempts with token id (not plaintext) for auditing.
- Plan for future user accounts/workspaces with foreign keys already sketched in schema.

---

## 11. Observability & SLA
- Track render duration, queue depth, and failure counts in logs; optional JSON metrics endpoint (`/metrics`) for Prometheus later.
- Alert when render failures exceed threshold or queue age grows beyond SLA.
- With ~5 items/day, single worker is sufficient; document path to increase concurrency (multiple workers, work-stealing) if volume rises.

---

## 12. Roadmap
1. **MVP (Quotes):** Implement registry, API, worker, RSS, Markdown, deployment scripts.
2. **Quality:** Add web form client, token rotation, richer logging/metrics, admin dashboard.
3. **Extensibility:** Introduce `product` type module, additional templates, per-type feeds.
4. **Scale:** Optional Postgres backend, Redis queue, multi-tenant support, CLI packaging via `bun build`.

---

## 13. Deliverables Checklist
- [ ] Bun project scaffold with `src/api.ts`, `src/worker.ts`, `src/types/quote.ts`, `src/lib/db.ts`.
- [ ] SQLite migrations and migration runner.
- [ ] Quote renderer and templates migrated from legacy design.
- [ ] RSS + Markdown generation wired into worker.
- [ ] API key creation script and token auth middleware.
- [ ] Systemd and Nginx deployment configs documented.
- [ ] Smoke tests verifying end-to-end quote submission → rendered assets.

---

**End of spec** (v3)
