import type { ItemRow } from "@app/lib/items-repo";
import { buildAssetUrls } from "@app/lib/assets";
import { escapeHtml, renderNav } from "@app/lib/html";

const FEED_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

export function feedResponseHeaders() {
  return { ...FEED_HEADERS };
}

export function renderFeedPage(items: ItemRow<any>[]): string {
  const listItemsHtml = items
    .map((item) => {
      const attributes: Record<string, unknown> = item.attributes ?? {};
      const quoteText = typeof attributes.quote_text === "string" ? attributes.quote_text : "";
      const author = typeof attributes.author === "string" ? attributes.author : "";
      const sourceUrl = item.sourceUrl ?? (typeof attributes.url === "string" ? attributes.url : "");
      const assets = buildAssetUrls(item.type, item.id);

      const quoteHtml = escapeHtml(quoteText);
      const authorHtml = author ? `<cite>${escapeHtml(author)}</cite>` : "";
      const sourceLink = sourceUrl
        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">source</a>`
        : "";

      const links = [
        `<span>ID: ${escapeHtml(item.id)}</span>`,
        sourceLink,
        `<a href="${escapeHtml(assets.embed)}" target="_blank" rel="noreferrer">embed</a>`,
        `<a href="${escapeHtml(assets.og)}" target="_blank" rel="noreferrer">og</a>`,
        `<a href="${escapeHtml(assets.markdown)}" target="_blank" rel="noreferrer">markdown</a>`,
      ]
        .filter(Boolean)
        .join("\n          ");

      return `        <li class="quote-item">
          <blockquote>“${quoteHtml}”</blockquote>
          ${authorHtml}
          <div class="meta">
            ${links}
          </div>
        </li>`;
    })
    .join("\n");

  const listSection = items.length
    ? `<ul class="quote-list">\n${listItemsHtml}\n      </ul>`
    : `<p class="empty">No quotes yet. Add one from the home page.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Feed · QUOOTE</title>
    <link rel="stylesheet" href="/assets/base.css" />
  </head>
  <body>
    <main class="layout feed-page">
      <h1>Latest Quotes</h1>
      ${renderNav("feed")}
${listSection}
    </main>
  </body>
</html>`;
}
