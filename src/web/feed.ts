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
      const articleTitle = typeof attributes.article_title === "string" ? attributes.article_title : "";
      const sourceUrl = item.sourceUrl ?? (typeof attributes.url === "string" ? attributes.url : "");
      const assets = buildAssetUrls(item.type, item.id);
      const quoteHtml = escapeHtml(quoteText);
      const domain = sourceUrl ? safeHostname(sourceUrl) : "";
      const primary = articleTitle || domain;
      const detail = author ? `${primary ? `${primary}, ` : ""}${author}` : primary || "Collected quote";
      const sourceLink = sourceUrl
        ? `<a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a>`
        : `<span class="source-link muted">no source</span>`;
      const idAttr = escapeHtml(item.id);
      const titleValue = escapeHtml(articleTitle);
      const authorValue = escapeHtml(author);
      const urlValue = escapeHtml(sourceUrl);
      const quoteValue = escapeHtml(quoteText);

      return `        <li class="quote-item" data-item-id="${idAttr}" data-embed-url="${escapeHtml(assets.embed)}">
          <div class="quote-card">
            <div class="quote-view">
              <blockquote>“${quoteValue}”</blockquote>
              <div class="quote-source">${escapeHtml(detail)}</div>
              <div class="quote-links">
                ${sourceLink}
              </div>
            </div>
            <form class="quote-edit-form" data-item-id="${idAttr}">
              <div class="field field--narrow">
                <label class="sr-only" for="edit-${idAttr}-article">Article Title</label>
                <input id="edit-${idAttr}-article" name="article_title" type="text" placeholder="article title" value="${titleValue}" />
              </div>
              <div class="field field--narrow">
                <label class="sr-only" for="edit-${idAttr}-author">Author / Site</label>
                <input id="edit-${idAttr}-author" name="author" type="text" placeholder="blog / author" value="${authorValue}" />
              </div>
              <div class="field">
                <label class="sr-only" for="edit-${idAttr}-url">URL</label>
                <input id="edit-${idAttr}-url" name="url" type="url" placeholder="https://www.example.com/" value="${urlValue}" required />
              </div>
              <div class="field">
                <label class="sr-only" for="edit-${idAttr}-quote">Quote</label>
                <textarea id="edit-${idAttr}-quote" name="quote_text" placeholder="paste the quote here…" required>${quoteValue}</textarea>
              </div>
              <div class="quote-edit-actions">
                <button type="button" data-role="cancel-edit">cancel</button>
                <button type="submit">update</button>
              </div>
              <div class="quote-edit-status" aria-live="polite"></div>
            </form>
          </div>
          <div class="quote-actions-wrapper">
          <div class="quote-actions">
            <button type="button" class="quote-action" data-action="copy" data-embed-url="${escapeHtml(assets.embed)}" aria-label="Copy embed URL">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button type="button" class="quote-action" data-action="edit" data-item-id="${idAttr}" aria-label="Edit quote">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
            <button type="button" class="quote-action delete" data-action="delete" data-item-id="${idAttr}" aria-label="Delete quote">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
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
