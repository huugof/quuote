import type { ItemRow } from "@app/lib/items-repo";
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
      const articleTitle = typeof attributes.article_title === "string" ? attributes.article_title : "";
      const sourceUrl = item.sourceUrl ?? (typeof attributes.url === "string" ? attributes.url : "");
      const quoteHtml = escapeHtml(quoteText);
      const domain = sourceUrl ? safeHostname(sourceUrl) : "";
      const secondary = articleTitle || author || domain || "Collected quote";
      const sourceLink = sourceUrl
        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">source</a>`
        : `<span class="muted">no source</span>`;

      return `        <li class="quote-item">
          <blockquote>“${quoteHtml}”</blockquote>
          <div class="quote-source">${escapeHtml(secondary)}</div>
          <div class="quote-actions">
            ${sourceLink}
            <button type="button" class="quote-action" data-action="edit" data-item-id="${escapeHtml(item.id)}">edit</button>
            <button type="button" class="quote-action" data-action="delete" data-item-id="${escapeHtml(item.id)}">delete</button>
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
    <main class="layout page feed-page">
      <h1>Latest Quotes</h1>
      ${renderNav("feed")}
${listSection}
    </main>
    <script type="module" src="/assets/feed.js"></script>
  </body>
</html>`;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
