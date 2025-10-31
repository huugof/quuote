**Project Direction**
- Deliver a single Bun-powered service that ingests structured content (starting with quotes) from any client via an authenticated HTTPS API.
- Persist submissions in SQLite so validation, deduping, and downstream rendering share one source of truth.
- Model content as typed “items” so future product-spec categories can reuse the same infrastructure without breaking existing clients.

**Rendering & Delivery**
- Keep the Satori + Resvg + jpeg-js stack, now executed by a background worker on the VPS immediately after each submission; target sub‑15 s render-to-publication.
- Generate four surfaces per item type: OG JPEG, embeddable HTML, downloadable Markdown, and RSS feeds; serve them under predictable `/og/:type/:id.jpg`, `/embed/:type/:id.html`, `/markdown/:type/:id.md`, and `/rss/:type.xml` paths.
- Maintain per-type templates managed through the registry so new layouts (e.g., products) can be added without touching the core pipeline.

**Runtime & Tooling**
- Standardise on Bun for the API server, render worker, RSS generator, and utility scripts; rely on Bun’s HTTP, SQLite, and crypto primitives.
- Trim dependencies to the rendering stack plus light in-house helpers (slugging, validation) to keep deployment lean.
- Use ULIDs for server-generated IDs and write logs to plain files for easy review on the VPS.

**Extensibility**
- Store shared item columns plus a JSON `attributes` payload validated through a per-type registry; this keeps current quote fields strict while leaving space for product metadata (name, manufacturer, image, url, cost, finish, specification sheet, material).
- Allow each type to register custom validators, renderers, and RSS/Markdown serializers so adding new categories is a configuration change, not a rewrite.
- Partition asset storage by type (`/data/og/quote`, `/data/og/product`, etc.) and keep hooks ready for future multi-tenant support.

**Operational Expectations**
- Begin with a single render worker processing jobs sequentially, with simple retry/backoff logic logged to `/srv/quote-cards/logs`.
- Regenerate per-type RSS feeds whenever an item finishes rendering; keep feeds capped to recent entries for fast reads.
- Support pre-generated API keys (hashed at rest) and plan to layer user accounts and role-based access when the multi-user architecture office use case goes live.
