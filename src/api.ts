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
  listRenderedItems,
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
import { renderFeedPage, feedResponseHeaders } from "@app/web/feed";

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

function serveStaticPage(filename: string): Response | null {
  try {
    const file = Bun.file(join(PUBLIC_DIR, filename));
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

    if (url.pathname.startsWith("/assets/")) {
      const assetPath = url.pathname.replace(/^\/assets\//, "");
      if (assetPath.includes("..")) {
        return notFound();
      }
      const filePath = join(PUBLIC_DIR, "assets", assetPath);
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        return notFound();
      }

      const contentType =
        file.type ||
        (assetPath.endsWith(".css")
          ? "text/css; charset=utf-8"
          : assetPath.endsWith(".js")
            ? "application/javascript; charset=utf-8"
            : "application/octet-stream");

      const headers = {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      } as const;

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }

      return new Response(file, { status: 200, headers });
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      const page = serveStaticPage("index.html");
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
      url.pathname === "/about"
    ) {
      const page = serveStaticPage("about.html");
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
      const headers = feedResponseHeaders();

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }

      const items = listRenderedItems<any>("quote", 50);
      const html = renderFeedPage(items);
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

    if (url.pathname === "/items" && request.method === "HEAD") {
      if (!ensureAuthenticated(request)) {
        return errorResponse("Unauthorized", 401);
      }
      return new Response(null, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
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
