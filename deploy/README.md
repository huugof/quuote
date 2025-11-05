# Deployment Guide

This repository includes sample configuration for running Quote Cards on a VPS. Adjust paths and hostnames to match your environment.

## 1. System Prep

1. Install Bun 1.3+ on the server (`curl -fsSL https://bun.sh/install | bash`).
2. Install runtime dependencies (fontconfig, sqlite, nginx, certbot, optional):
   ```bash
   sudo apt update
   sudo apt install -y libfontconfig1 sqlite3 nginx
   ```
3. Create a system user and directory layout:
   ```bash
   sudo useradd --system --home /srv/quote-cards --shell /usr/sbin/nologin quote-cards
   sudo mkdir -p /srv/quote-cards/{app,data,logs}
   sudo chown -R quote-cards:quote-cards /srv/quote-cards
   ```

## 2. Code Deployment

1. Copy the repo to `/srv/quote-cards/app` (git clone or rsync).
2. Switch to the service user and install dependencies:
   ```bash
   sudo -u quote-cards -H bash -c 'cd /srv/quote-cards/app && bun install'
   ```
3. Run database migrations (creates `/srv/quote-cards/data/db.sqlite`):
   ```bash
   sudo -u quote-cards -H bash -c 'cd /srv/quote-cards/app && bun run migrate'
   ```
4. Generate an API token (store the plaintext securely):
   ```bash
   sudo -u quote-cards -H bash -c 'cd /srv/quote-cards/app && bun run key:create admin'
   ```

## 3. Environment Variables

Create `/etc/quote-cards.env` (owned by root, permission 600):
```
PORT=8080
DATA_ROOT=/srv/quote-cards/data
DATABASE_PATH=/srv/quote-cards/data/db.sqlite
SITE_ORIGIN=https://quotes.example.com
CARD_VERSION=1
LOG_LEVEL=info
```
Adjust values for your host and cache-busting needs.

## 4. Systemd Services

`deploy/systemd/quote-cards-api.service` and `quote-cards-worker.service` are ready-to-copy templates.

Install and enable:
```bash
sudo cp deploy/systemd/quote-cards-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now quote-cards-worker.service quote-cards-api.service
```
Review logs with:
```bash
sudo journalctl -fu quote-cards-api
sudo journalctl -fu quote-cards-worker
```

## 5. Nginx Proxy

`deploy/nginx/quote-cards.conf` exposes the API and static assets. Replace `quotes.example.com` and `$PORT` with real values, then link into `sites-enabled`:
```bash
sudo cp deploy/nginx/quote-cards.conf /etc/nginx/sites-available/quote-cards.conf
sudo ln -s /etc/nginx/sites-available/quote-cards.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Add HTTPS via Certbot or your preferred TLS setup.

## 6. Smoke Test

1. Check health: `curl https://quotes.example.com/health`.
2. Submit a quote using the generated token:
   ```bash
   curl -X POST https://quotes.example.com/api/items \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "type": "quote",
       "attributes": {
         "quote_text": "Hello deployment",
         "author": "Admin",
         "url": "https://example.com",
         "article_title": "Launch"
       }
     }'
   ```
3. Within a few seconds the worker should render assets under `/srv/quote-cards/data/{og,embed,markdown}` and update `rss/quote.xml`.
4. Optional: `BASE_URL=https://quotes.example.com bun run smoke` for an automated sanity check.

## 7. Backups & Maintenance

- Schedule nightly SQLite backups with `sqlite3 /srv/quote-cards/data/db.sqlite '.backup /srv/quote-cards/backups/db-$(date +%F).sqlite'`.
- rsync `/srv/quote-cards/data/` to remote storage to capture OG/HTML/Markdown/RSS outputs.
- Monitor disk usage and log size; rotate logs if necessary.

## 8. Client Configuration

Provide users with the base URL and API token. Clients POST to `/api/items`, poll `/api/items/:id` for status, and can download Markdown at `/markdown/:type/:id.md`.

These files are templates—adjust paths, ports, and hostnames to fit your infrastructure.
