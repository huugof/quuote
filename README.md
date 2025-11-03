# Quote Cards Service

Bun-powered service that ingests typed content (starting with quotes), stores it in SQLite, renders OG assets, and serves embeds, Markdown, and RSS feeds from a single VPS-friendly deployment.

## Requirements

- [Bun](https://bun.sh/) 1.3+

## Setup

```bash
bun install
bun run migrate             # creates SQLite schema under ./data
bun run key:create my-key   # prints a new API token (store it somewhere safe)
```

> **Tip:** When you run Bun commands as another user (for example via `sudo -u quote-cards`), start a login shell (`bash -lc`) or set `PATH="$HOME/.bun/bin:$PATH"` inside the command so `bun` resolves.

The service stores data under `./data` by default (configurable via `DATA_ROOT`). Generated assets land in:

- `data/og/<type>/<id>.jpg`
- `data/embed/<type>/<id>.html`
- `data/markdown/<type>/<id>.md`
- `data/rss/<type>.xml`

## Running locally

Start the HTTP API and render worker in separate terminals:

```bash
bun run start:api
bun run start:worker
```

Environment variables:

- `PORT` – API port (default `3000`).
- `DATA_ROOT` – absolute/relative path for asset output (`./data` default).
- `DATABASE_PATH` – custom SQLite file path.
- `SITE_ORIGIN` – public hostname (used when generating absolute asset URLs/RSS links).
- `BASE_PATH` – optional prefix like `/quotes` when hosting behind a subdirectory.
- `CARD_VERSION` – cache-busting query appended to OG JPEG URLs.

## Submitting a quote

```bash
curl -X POST http://localhost:3000/items \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "quote",
    "attributes": {
      "quote_text": "What is an API.",
      "author": "Anot Person",
      "url": "https://example.com/static-first-two"
    },
    "tags": ["static", "inspiration"]
  }'
```

The API enqueues the new item (`render_status="queued"`). The worker renders outputs, regenerates the quote RSS feed, and updates the database to `render_status="rendered"` once complete.

Prefer a browser? When the API is running locally, visit `http://localhost:3000/` (or the host/IP where it’s exposed) to use the built-in form. Enter your token once; the page stores it in local storage so you can submit quotes quickly from any device on your network.

> **Reminder:** Every API request header must be `Authorization: Bearer <token>` (note the literal `Bearer ` prefix).

## Fetching content

- `GET /items?type=quote` – list items (supports `limit`, `cursor`, `tag`).
- `GET /items/<id>` – retrieve metadata and asset URLs.
- `GET /items/<id>/markdown` – download canonical Markdown for CLI/editor workflows.

Public assets resolve relative to `/og/`, `/embed/`, `/markdown/`, and `/rss/`. Set `SITE_ORIGIN`/`BASE_PATH` so RSS links and returned URLs match your deployment.

## API tokens

Tokens are pre-generated secrets hashed in the database. Use `bun run key:create <name>` to mint a new one. The script prints the plaintext token once—store it securely. To rotate keys, delete the row from `api_keys` (via SQLite shell) and re-run the script.

## Deployment

### Quick VPS setup

1. Provision a small Linux VPS (e.g., Ubuntu 22.04, 1 vCPU/1 GB RAM). Allow inbound 80/443 (and 22 for SSH).
2. Install prerequisites and Bun:
   ```bash
   sudo apt update
   sudo apt install -y git curl sqlite3 libfontconfig1 nginx
   curl -fsSL https://bun.sh/install | bash
   echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.profile
   ```
3. Create a dedicated user and directories for the app and data:
   ```bash
   sudo useradd --system --home /srv/quote-cards --shell /usr/sbin/nologin quote-cards
   sudo mkdir -p /srv/quote-cards/{app,data,logs}
   sudo chown -R quote-cards:quote-cards /srv/quote-cards
   ```
4. Deploy the code and install dependencies:
   ```bash
   sudo -u quote-cards -H bash -c 'cd /srv/quote-cards && git clone https://github.com/huugof/quuote.git app'
   sudo -u quote-cards -H bash -c 'export PATH="$HOME/.bun/bin:$PATH"; cd /srv/quote-cards/app && bun install'
   ```
5. Run migrations and mint an API token (store the plaintext token securely):
   ```bash
   sudo -u quote-cards -H bash -c 'export PATH="$HOME/.bun/bin:$PATH"; cd /srv/quote-cards/app && bun run migrate'
   sudo -u quote-cards -H bash -c 'export PATH="$HOME/.bun/bin:$PATH"; set -a; source /etc/quote-cards.env; set +a; cd /srv/quote-cards/app && bun run key:create admin'
   ```
   The `set -a; source …; set +a` sequence exports the same environment variables systemd uses so the key lands in `/srv/quote-cards/data/db.sqlite`. If `/etc/quote-cards.env` is strictly `600 root:root`, either temporarily `chmod 640 /etc/quote-cards.env` (and restore `600` afterward) or export the variables inline instead of sourcing.
6. Create `/etc/quote-cards.env` (permission `600`) with production env vars:
   ```
   PORT=3000
   DATA_ROOT=/srv/quote-cards/data
   DATABASE_PATH=/srv/quote-cards/data/db.sqlite
   SITE_ORIGIN=https://quotes.example.com
   BASE_PATH=
   CARD_VERSION=1
   LOG_LEVEL=info
   ```
7. Ensure the logs directory is owned by the service user:
   ```bash
   sudo mkdir -p /srv/quote-cards/logs
   sudo chown quote-cards:quote-cards /srv/quote-cards/logs
   ```
8. Install the provided systemd units and start the services:
   ```bash
   sudo cp deploy/systemd/quote-cards-*.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now quote-cards-worker.service quote-cards-api.service
   ```
   The units call `/usr/bin/env bun`. If Bun only exists at `/srv/quote-cards/.bun/bin/bun`, either update each `ExecStart` to that absolute path or add `Environment=PATH=/srv/quote-cards/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin` inside the `[Service]` block before reloading systemd.
9. Configure a reverse proxy (Caddy/Nginx) to terminate TLS and forward to `localhost:3000`. The sample Nginx file under `deploy/nginx/` is a good starting point—if you want `/api/...` paths to reach Bun’s `/items` endpoints, use `proxy_pass http://127.0.0.1:3000/;` (note the trailing slash) so `/api/items` maps cleanly to `/items`.
10. Verify the setup by browsing to your domain, saving the generated API token in the form, and submitting a test quote. Assets should appear under `/srv/quote-cards/data`.

For a more detailed walkthrough (including smoke tests, backups, and TLS tips) see `deploy/README.md`.

## Domain & TLS

1. **DNS:** Point an `A` record (and optionally `www` CNAME) at your VPS IP. Wait for propagation (`dig quoote.wtf +short` should return the droplet address).
2. **App config:** Set `SITE_ORIGIN=https://your-domain` and, if needed, `BASE_PATH` in `/etc/quote-cards.env`, then restart the services:
   ```bash
   sudo systemctl restart quote-cards-api.service quote-cards-worker.service
   ```
   When you change `SITE_ORIGIN`, requeue existing quotes so their embeds/OG images point at the new host. You can loop over API items and PATCH them back to `queued`, or run a SQLite update:  
   ```bash
   sudo -u quote-cards -H sqlite3 /srv/quote-cards/data/db.sqlite \
     "update items set render_status = 'queued' where render_status = 'rendered';"
   ```
   The worker will regenerate assets on the next pass.
3. **Nginx hostnames:** Update `/etc/nginx/sites-available/quote-cards.conf` so `server_name` matches the domain(s)—typos here make Certbot fail. Ensure only one server block listens on `80` for that host and reload Nginx (`sudo nginx -t && sudo systemctl reload nginx`).
4. **TLS certificates:** Install Certbot and issue a Let’s Encrypt cert:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d quoote.wtf -d www.quoote.wtf
   ```
   Certbot adds the `listen 443 ssl` block automatically. If multiple domains share the site, include them all in the `-d` list.
5. **Redirect to HTTPS:** Accept Certbot’s redirect prompt (or add a tiny `server { listen 80; server_name www.example.com; return 301 https://example.com$request_uri; }` block). Confirm with:
   ```bash
   curl -I https://quoote.wtf
   curl -I https://www.quoote.wtf
   ```
6. **Renewal:** Certbot installs a cron/systemd timer. Test it anytime with `sudo certbot renew --dry-run`.

## Project structure

```
.
├─ src/
│  ├─ api.ts            # Bun HTTP server
│  ├─ worker.ts         # render queue processor
│  ├─ lib/              # config, db, auth, RSS, filesystem helpers
│  ├─ types/            # item type registry + quote schema/normalizers
│  └─ render/           # renderer registry + Satori/Resvg quote renderer
├─ migrations/          # SQLite migration files
├─ data/                # generated assets + SQLite (gitignored)
└─ bunfig.toml / tsconfig.json
```

The quote renderer uses Satori to build SVGs, Resvg to rasterize, and jpeg-js to encode OG cards. Templates live in `src/render`.

## Next steps

- Flesh out the quote renderer with Satori + Resvg + jpeg-js outputs.
- Add product/item renderers via the type registry.
- Layer richer auth (per-user keys, workspaces) on top of the existing API key table.

## Troubleshooting

- **`bun` command not found (sudo/systemd):** Prepend `export PATH="$HOME/.bun/bin:$PATH"` when running commands as `quote-cards`, or edit the systemd units to point `ExecStart` at `/srv/quote-cards/.bun/bin/bun`. Without that, both the API and worker will exit with status `127`.
- **API keys never validate:** Make sure `bun run key:create` runs with the production environment loaded so it writes to `/srv/quote-cards/data/db.sqlite`. Source `/etc/quote-cards.env` (or export the variables manually), then restart `quote-cards-api.service` to clear the 10 s key cache if the service is already running. You can confirm the key is stored with `sudo -u quote-cards -H sqlite3 /srv/quote-cards/data/db.sqlite 'select id, name, last_used_at from api_keys;'`.
- **401 even though the token exists:** Double-check the header format. It must be `Authorization: Bearer <token>`—leaving out `Bearer` or surrounding the token with quotes/brackets will fail.
- **Reverse proxy blocks the UI form:** The sample Nginx config returns `404` at `/`. Replace that block with a `proxy_pass http://127.0.0.1:3000/` stanza if you want the built-in submission form on your domain root.
- **Certbot can’t install the cert:** Ensure the HTTP block’s `server_name` matches every hostname you pass with `-d`. If the challenge gets HTML instead of the token, another virtual host (or a DNS parking page) is serving the request. Fix the host mapping, reload Nginx, and re-run `certbot install --cert-name <domain>`.
