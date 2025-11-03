import { join } from "node:path";
import { serve } from "bun";

import { buildAssetUrls } from "@app/lib/assets";
import { loadConfig } from "@app/lib/config";
import { validateToken } from "@app/lib/auth";
import { logger } from "@app/lib/logger";
import { runMigrations } from "@app/lib/migrate";
import {
  createItem,
  getItemById,
  listItems,
  updateItem,
  type ItemRow,
} from "@app/lib/items-repo";
import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFound,
  parseJson,
} from "@app/lib/http";
import { getType } from "@app/types/index";
import type { ItemAttributes, NormalizedPayload } from "@app/types/types";

const config = loadConfig();

await runMigrations();

const PUBLIC_DIR = join(process.cwd(), "public");
const DATA_ROOT = config.dataRoot;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return value.trim();
}

function ensureAuthenticated(request: Request): boolean {
  const token = getBearerToken(request);
  return validateToken(token);
}

function itemToResponse<T extends ItemAttributes>(item: ItemRow<T>) {
  const assets = buildAssetUrls(item.type, item.id);
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    sourceUrl: item.sourceUrl,
    attributes: item.attributes,
    tags: item.tags,
    submittedBy: item.submittedBy,
    renderStatus: item.renderStatus,
    renderedAt: item.renderedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    assets,
  };
}

function invalidType(type: unknown): type is string {
  return typeof type !== "string" || type.length === 0;
}

type CreateItemBody = {
  type: string;
  attributes: ItemAttributes;
  tags?: string[];
  submittedBy?: string;
};

type UpdateItemBody = {
  attributes?: ItemAttributes;
  tags?: string[];
  submittedBy?: string | null;
};

function normalizeForType<T extends ItemAttributes>(
  type: string,
  attributes: ItemAttributes,
  tags?: string[],
): { payload: NormalizedPayload<T>; errors: string[] } {
  const definition = getType(type);
  const attributesWithTags = { ...attributes };
  if (Array.isArray(tags)) {
    attributesWithTags.tags = tags;
  }
  const { value, errors } = definition.normalize(attributesWithTags);
  return { payload: value, errors };
}

function serveStaticHome(): Response | null {
  try {
    const file = Bun.file(join(PUBLIC_DIR, "index.html"));
    if (!file) return null;
    return new Response(file, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFeedPage(items: ItemRow<any>[]): string {
  const listItemsHtml = items
    .map((item) => {
      const attributes: any = item.attributes ?? {};
      const quoteText = typeof attributes.quote_text === "string" ? attributes.quote_text : "";
      const author = typeof attributes.author === "string" ? attributes.author : "";
      const sourceUrl = item.sourceUrl ?? attributes.url ?? "";
      const assets = buildAssetUrls(item.type, item.id);
      const escapedQuote = escapeHtml(quoteText);
      const escapedAuthor = escapeHtml(author);
      const escapedId = escapeHtml(item.id);
      const escapedSource = sourceUrl ? escapeHtml(sourceUrl) : "";
      const embedLink = escapeHtml(assets.embed);
      const ogLink = escapeHtml(assets.og);
      const markdownLink = escapeHtml(assets.markdown);

      return `        <li class="quote-item">
          <blockquote>“${escapedQuote}”</blockquote>
          ${escapedAuthor ? `<cite>${escapedAuthor}</cite>` : ""}
          <div class="meta">
            <span>ID: ${escapedId}</span>
            ${escapedSource ? `<a href="${escapedSource}" target="_blank" rel="noreferrer">source</a>` : ""}
            <a href="${embedLink}" target="_blank" rel="noreferrer">embed</a>
            <a href="${ogLink}" target="_blank" rel="noreferrer">og</a>
            <a href="${markdownLink}" target="_blank" rel="noreferrer">markdown</a>
          </div>
        </li>`;
    })
    .join("\n");

  const listSection = items.length
    ? `<ul class="quote-list">\n${listItemsHtml}\n      </ul>`
    : `<p class="empty">No quotes yet. Add one from the home page.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QUOOTE · Feed</title>
    <style>
      :root { color-scheme: dark light; }
      body {
        margin: 0;
        font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #111;
        color: #f4f4f5;
        display: flex;
        justify-content: center;
        padding: 3rem 1.5rem;
      }
      main {
        width: min(720px, 100%);
        display: grid;
        gap: 1.5rem;
      }
      h1 {
        margin: 0;
        font-size: 1.4rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      nav {
        display: flex;
        gap: 1rem;
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      nav a {
        color: inherit;
        text-decoration: none;
        opacity: 0.75;
      }
      nav a:hover { opacity: 1; }
      .quote-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 1.5rem;
      }
      .quote-item {
        border: 1px solid #3f3f46;
        border-radius: 6px;
        padding: 1rem 1.1rem;
        background: #0c0c0c;
        display: grid;
        gap: 0.6rem;
      }
      blockquote {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.6;
      }
      cite {
        font-style: normal;
        color: #a1a1aa;
        font-size: 0.85rem;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        font-size: 0.75rem;
        color: #d4d4d8;
      }
      .meta a {
        color: inherit;
      }
      .meta a:hover {
        color: #fafafa;
      }
      .empty {
        font-size: 0.85rem;
        color: #a1a1aa;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>QUOOTE · Feed</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/rss/quote.xml">RSS</a>
      </nav>
${listSection}
    </main>
  </body>
</html>`;
}

async function serveDataAsset(url: URL): Promise<Response | null> {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [root, ...rest] = segments;
  const allowed = new Set(["embed", "markdown", "og", "rss"]);
  if (!allowed.has(root)) return null;

  if (
    rest.some(
      (segment) =>
        segment === ".." || segment === "." || segment.includes(".."),
    )
  ) {
    return null;
  }

  const filePath = join(DATA_ROOT, root, ...rest);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  let contentType = "application/octet-stream";
  if (root === "embed") contentType = "text/html; charset=utf-8";
  else if (root === "markdown") contentType = "text/markdown; charset=utf-8";
  else if (root === "og") contentType = "image/jpeg";
  else if (root === "rss") contentType = "application/rss+xml; charset=utf-8";

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control":
        root === "og" ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}

serve({
  port: config.port,
  async fetch(request) {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "http";
    const hostHeader =
      request.headers.get("host") ?? `127.0.0.1:${config.port}`;

    let url: URL;
    try {
      url = new URL(request.url, `${forwardedProto}://${hostHeader}`);
    } catch {
      logger.warn("invalid_request_url", { value: request.url });
      return errorResponse("Invalid request URL", 400);
    }

    if (url.pathname === "/health") {
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return jsonResponse({ status: "ok" });
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      const page = serveStaticHome();
      if (page) {
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: page.headers,
          });
        }
        return page;
      }
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname === "/feed"
    ) {
      const headers = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      } as const;

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }

      const items = listItems<any>({ type: "quote", limit: 50 });
      const html = buildFeedPage(items);
      return new Response(html, { status: 200, headers });
    }

    if (url.pathname === "/items" && request.method === "POST") {
      if (!ensureAuthenticated(request)) {
        return errorResponse("Unauthorized", 401);
      }
      const body = await parseJson<CreateItemBody>(request);
      if (!body) {
        return errorResponse("Invalid JSON body", 400);
      }
      if (invalidType(body.type)) {
        return errorResponse("Type is required", 400);
      }
      if (!body.attributes || typeof body.attributes !== "object") {
        return errorResponse("Attributes object is required", 400);
      }

      try {
        const { payload, errors } = normalizeForType(
          body.type,
          body.attributes,
          body.tags,
        );
        if (errors.length) {
          return errorResponse("Validation failed", 422, errors);
        }
        const item = createItem({
          type: body.type,
          payload,
          submittedBy: body.submittedBy ?? null,
        });
        logger.info("item_created", { id: item.id, type: item.type });
        return jsonResponse({ item: itemToResponse(item) }, { status: 201 });
      } catch (error) {
        logger.error("create_item_failed", { error });
        return errorResponse("Unable to create item", 500);
      }
    }

    if (url.pathname === "/items" && request.method === "GET") {
      const type = url.searchParams.get("type") ?? undefined;
      const limitParam = url.searchParams.get("limit");
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const tag = url.searchParams.get("tag") ?? undefined;
      const limit = limitParam ? Math.min(Number(limitParam) || 20, 100) : 20;

      try {
        const items = listItems({
          type: type ?? undefined,
          limit,
          cursor,
          tag,
        });
        const nextCursor = items.length ? items[items.length - 1].id : null;
        return jsonResponse({
          items: items.map((item) => itemToResponse(item)),
          nextCursor,
        });
      } catch (error) {
        logger.error("list_items_failed", { error });
        return errorResponse("Unable to list items", 500);
      }
    }

    const dataAsset = await serveDataAsset(url);
    if (dataAsset) {
      return dataAsset;
    }

    if (url.pathname.startsWith("/items/") && request.method === "GET") {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[1];
      if (!id) {
        return notFound();
      }

      if (parts.length === 3 && parts[2] === "markdown") {
        const item = getItemById<any>(id);
        if (!item) return notFound();
        try {
          const definition = getType(item.type);
          const payload: NormalizedPayload<any> = {
            attributes: item.attributes,
            title: item.title ?? "",
            sourceUrl: item.sourceUrl ?? undefined,
            tags: item.tags,
          };
          const markdown = definition.renderMarkdown(payload);
          return new Response(markdown, {
            status: 200,
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "Cache-Control": "public, max-age=60",
            },
          });
        } catch (error) {
          logger.error("markdown_render_failed", { error, id });
          return errorResponse("Unable to render markdown", 500);
        }
      }

      const item = getItemById<any>(id);
      if (!item) return notFound();
      return jsonResponse({ item: itemToResponse(item) });
    }

    if (url.pathname.startsWith("/items/") && request.method === "PATCH") {
      if (!ensureAuthenticated(request)) {
        return errorResponse("Unauthorized", 401);
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[1];
      if (!id) return notFound();

      const existing = getItemById<any>(id);
      if (!existing) return notFound();

      const body = await parseJson<UpdateItemBody>(request);
      if (!body) {
        return errorResponse("Invalid JSON body", 400);
      }

      const attributesPatch = body.attributes ?? {};
      if (typeof attributesPatch !== "object") {
        return errorResponse("Attributes must be an object", 400);
      }

      const mergedAttributes = { ...existing.attributes, ...attributesPatch };
      if (Array.isArray(body.tags)) {
        mergedAttributes.tags = body.tags;
      }

      try {
        const { payload, errors } = normalizeForType(
          existing.type,
          mergedAttributes,
          body.tags,
        );
        if (errors.length) {
          return errorResponse("Validation failed", 422, errors);
        }

        const updated = updateItem({
          id,
          type: existing.type,
          payload,
          renderStatus: "queued",
          ogPath: null,
          embedPath: null,
          markdownPath: null,
          renderedAt: null,
          renderFailures: 0,
          submittedBy: body.submittedBy ?? existing.submittedBy ?? null,
        });
        logger.info("item_updated", { id: updated.id, type: updated.type });
        return jsonResponse({ item: itemToResponse(updated) });
      } catch (error) {
        logger.error("update_item_failed", { error, id });
        return errorResponse("Unable to update item", 500);
      }
    }

    if (
      url.pathname.startsWith("/items/") &&
      request.method !== "GET" &&
      request.method !== "PATCH"
    ) {
      return methodNotAllowed();
    }

    return notFound();
  },
});

logger.info("api_started", { port: config.port });
