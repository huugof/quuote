**Quote Cards — Self‑Hosted Spec (v1)**

**Vision**
A lean Bun-powered service that captures quotes from any client, validates and stores them, renders shareable assets within seconds, and exposes the catalog via API, embeds, and feeds—fully self-hosted on a VPS. See ./GOALS.md for more detailed vision.

---

**1. Goals**
- Accept authenticated submissions from phones, laptops, CLI, or a web form.
- Render OG images + embeds in <15 s after submission.
- Expose every quote as JPEG, embeddable HTML, Markdown (via API/CLI), and RSS entries.
- Keep the stack minimal: Bun runtime, SQLite/Postgres, local asset generation.
- Allow future metadata expansion without disruptive migrations.

---

**2. High-Level Architecture**
- **Ingress API (Bun HTTP server)**: `/quotes` CRUD endpoints with auth middleware.
- **Storage**: SQLite (default) or Postgres (if multi-instance) with schema + JSONB extension fields.
- **Render Worker**: Bun process watching a queue/table. Uses Satori + Resvg + jpeg-js to render JPEG and wrapper HTML; updates row status.
- **Static Hosting**: Nginx (or Bun static server) serving `/og/<id>.jpg`, `/embed/<id>.html`, `/cards/`, `/q/`.
- **Distribution Endpoints**:
  - `/quotes/:id/markdown` → raw front matter for CLI.
  - `/quotes/rss.xml` → latest quotes feed.
  - `/embed/:id` → iframeable HTML template.
  - `/og/:id.jpg` → OG image (pre-rendered; fallback to dynamic if missing).
- **Queues**: Simple job queue via DB table (`renders` with `status=queued`). Optional Redis/Bullmq if throughput grows.

---

**3. Data Model**
- `quotes` table:
  - `id` (UUID or timestamp-short slug; unique).
  - `quote_text` (TEXT, not null).
  - `author` (TEXT).
  - `source_url` (TEXT, not null).
  - `article_title` (TEXT, optional).
  - `created_at` (TIMESTAMP with TZ, default now).
  - `submitted_by` (TEXT/FK to users table).
  - `tags` (TEXT[] or JSONB).
  - `extras` (JSONB) for future fields.
  - `og_image_path` (TEXT).
  - `embed_path` (TEXT).
  - `render_status` (`queued` | `rendered` | `failed`).
  - `rendered_at` (TIMESTAMP).
  - `hash` (stored for dedup / rerender decisions).
- `users` table:
  - `id`, `email`, `role` (`admin`, `contributor`).
  - `api_token_hash`.
  - `created_at`, `last_seen_at`.
- Optional `sessions` or `refresh_tokens` if implementing web login.

---

**4. API Endpoints (Bun HTTP)**
- `POST /quotes` (auth required)
  - Body: JSON with quote metadata.
  - Validations: non-empty `quote_text`, `source_url` (URL), unique `id` (auto-generate if omitted).
  - Actions: insert row, enqueue render job, return created record with `render_status`.
- `PATCH /quotes/:id`
  - Update metadata, re-queue render if display fields change.
- `GET /quotes/:id`
  - Returns full metadata + render status + asset URLs.
- `GET /quotes/:id/markdown`
  - Returns YAML front matter + body, so CLI can fetch canonical Markdown.
- `GET /quotes`
  - Pagination (created_at DESC), filter by tag/domain.
- `POST /auth/token`
  - Exchange user creds/token for API token (if using password flow).
- `GET /rss.xml`
  - Generates feed from latest rows (limit 50).
- `GET /embed/:id`
  - Returns HTML snippet (pre-rendered file served static).
- `GET /og/:id.jpg`
  - Serves JPEG from disk; optional fallback render if file missing.

---

**5. Rendering Pipeline**
- Trigger: API inserts new quote row with `render_status=queued`.
- Worker process loop:
  1. Select next `queued` quote (SQL `FOR UPDATE SKIP LOCKED`).
  2. Call `renderQuoteSvg` (Satori) using stored fonts (Atkinson Hyperlegible).
  3. Use Resvg to rasterize; encode via `jpeg-js`.
  4. Produce wrapper HTML (iframe-friendly) using moustacheless template or template literal.
  5. Write JPEG to `data/cards/<id>.jpg`; HTML to `data/q/<id>/index.html`.
  6. Update DB: `render_status=rendered`, set paths + `rendered_at`, recompute hash.
  7. On error, set `render_status=failed`, log stack, auto-retry with exponential backoff.
- Ensure fonts/templates are read from `build/templates` folder. Hash these assets to detect global rerender triggers.
- Optional dynamic fallback: if `/og/:id.jpg` is missing when requested, worker can render on-demand (respecting rate limits).

---

**6. Runtime & Dependencies**
- **Runtime**: Bun latest stable.
- **Core deps**: `satori`, `@resvg/resvg-js`, `jpeg-js`. Everything else “opt-in.”
- **Optional deps** (can be replaced later):
  - `gray-matter` -> custom parser if desired.
  - `slugify` -> simple helper.
  - `marked` -> optional basic markdown support.
- **Database**: `bun:sqlite` (default). For Postgres, use `postgres` npm driver (Bun-compatible).
- **Queue**: Start with DB-based queue; move to Redis if necessary.
- **Auth**: HMAC hashed API tokens stored per user; header `Authorization: Bearer <token>`.

---

**7. Authentication & Authorization**
- Issue tokens via admin CLI or web UI—store hashed token (`bcrypt` or `argon2`).
- Middleware checks token on every write request; read endpoints may be public or token-protected as desired.
- Optional web login: email/password -> token issuance; store session cookie (HTTP only).
- Rate limiting: simple in-memory (or Redis) to protect the API; important for public web form.

---

**8. Clients**
- **Mobile Shortcut**: Collect quote data → `POST /quotes` with token; poll `/quotes/:id` for `render_status=rendered` to copy embed/OG URLs.
- **Desktop CLI** (`quote-cards`):
  - `quote-cards submit quote.yaml` → parse YAML, call API.
  - `quote-cards fetch <id> --markdown` → GET Markdown endpoint.
  - `quote-cards list --recent`.
- **Web UI**:
  - Minimal HTML form with fields (quote, author, URL). Uses fetch to call API with user token stored securely (e.g., cookie). Show status updates (poll until rendered).
  - Admin panel listing quotes, render status, manual retry button.

---

**9. Deployment**
- VPS setup:
  - Install Bun, Node-canvas dependencies (Resvg uses Rust binary; ensure glibc).
  - Systemd service `quote-cards-api.service` (runs API server).
  - Systemd service `quote-cards-worker.service` (render worker).
  - Nginx proxy:
    - `/api/*` -> Bun API.
    - `/og/`, `/embed/`, `/q/`, `/cards/` -> static files under `/srv/quote-cards/public`.
- SSL: Let’s Encrypt certbot.
- Backup: nightly DB dump + rsync `data/` directory (JPEG/HTML). Keep fonts/templates under version control.

---

**10. Observability**
- Logging: Bun console logs to journald; include request ID, quote ID, render timing.
- Metrics: simple JSON or Prometheus metrics (render queue length, render duration, failures).
- Alerting: send email/webhook on repeated render failures or auth violations.

---

**11. Extensibility**
- `extras` JSONB field allows new metadata without immediate schema change.
- Template selection: allow `theme` field and load alternate template/stylesheet.
- Secondary outputs: extend worker to generate square assets or GIFs using same pipeline.
- Multi-tenant: add `namespace`/`workspace` field to quotes and enforce user access boundaries.

---

**12. Roadmap**
1. MVP: Bun API + SQLite + render worker + static hosting; CLI/web form.
2. Hardening: token management UI, queue retries, logging/metrics.
3. Enhancements: Postgres migration, UI for template management, multi-theme support, push notifications when rendering complete.
4. Advanced: real-time updates (Server-Sent Events), dynamic HTML API, pre-signed URL uploads for external storage.

---

**Deliverables Checklist**
- [ ] Bun project with `src/api.ts`, `src/worker.ts`, `src/lib/render.ts`.
- [ ] Database schema + migrations.
- [ ] Templates + fonts in `build/`.
- [ ] CLI tool hitting API.
- [ ] Web form (protected).
- [ ] RSS feed generator.
- [ ] Nginx/systemd deployment scripts.
- [ ] Documentation covering install, auth, API, CLI usage, backup.
