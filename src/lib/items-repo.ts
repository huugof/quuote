import { join } from "node:path";

import { ulid } from "ulid";

import { getDb } from "@app/lib/db";
import type { NormalizedPayload } from "@app/types/types";

export type ItemRecord = {
  id: string;
  type: string;
  title: string | null;
  source_url: string | null;
  attributes: string;
  tags: string | null;
  submitted_by: string | null;
  render_status: string;
  og_path: string | null;
  embed_path: string | null;
  markdown_path: string | null;
  rendered_at: string | null;
  created_at: string;
  updated_at: string;
  render_failures: number;
};

export type CreateItemInput<T> = {
  type: string;
  payload: NormalizedPayload<T>;
  submittedBy?: string | null;
};

export type UpdateItemInput<T> = {
  id: string;
  type: string;
  payload: NormalizedPayload<T>;
  submittedBy?: string | null;
  renderStatus?: "queued" | "rendering" | "rendered" | "failed";
  ogPath?: string | null;
  embedPath?: string | null;
  markdownPath?: string | null;
  renderedAt?: Date | null;
  renderFailures?: number;
};

export type ListItemsOptions = {
  type?: string;
  limit?: number;
  cursor?: string;
  tag?: string;
};

export type ItemRow<T> = {
  id: string;
  type: string;
  title: string | null;
  sourceUrl: string | null;
  attributes: T;
  tags: string[];
  submittedBy: string | null;
  renderStatus: string;
  ogPath: string | null;
  embedPath: string | null;
  markdownPath: string | null;
  renderedAt: string | null;
  createdAt: string;
  updatedAt: string;
  renderFailures: number;
};

function deserializeTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deserializeAttributes<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function mapRow<T>(row: ItemRecord): ItemRow<T> {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    sourceUrl: row.source_url,
    attributes: deserializeAttributes<T>(row.attributes),
    tags: deserializeTags(row.tags),
    submittedBy: row.submitted_by,
    renderStatus: row.render_status,
    ogPath: row.og_path,
    embedPath: row.embed_path,
    markdownPath: row.markdown_path,
    renderedAt: row.rendered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    renderFailures: row.render_failures,
  };
}

export function createItem<T>(input: CreateItemInput<T>): ItemRow<T> {
  const db = getDb();
  const id = ulid();
  const tagsJson = JSON.stringify(input.payload.tags ?? []);
  const attributesJson = JSON.stringify(input.payload.attributes ?? {});

  db.query(
    `INSERT INTO items (
        id, type, title, source_url, attributes, tags, submitted_by, render_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(
    id,
    input.type,
    input.payload.title,
    input.payload.sourceUrl ?? null,
    attributesJson,
    tagsJson,
    input.submittedBy ?? null,
  );

  const row = db.query<ItemRecord>("SELECT * FROM items WHERE id = ?").get(id);

  if (!row) {
    throw new Error("Failed to read inserted item");
  }

  return mapRow<T>(row);
}

export function getItemById<T>(id: string): ItemRow<T> | null {
  const db = getDb();
  const row = db.query<ItemRecord>("SELECT * FROM items WHERE id = ?").get(id);
  return row ? mapRow<T>(row) : null;
}

export function listItems<T>(options: ListItemsOptions): ItemRow<T>[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.type) {
    clauses.push("type = ?");
    params.push(options.type);
  }

  if (options.cursor) {
    clauses.push("created_at < (SELECT created_at FROM items WHERE id = ?)");
    params.push(options.cursor);
  }

  if (options.tag) {
    clauses.push("tags LIKE ?");
    params.push(`%\"${options.tag}\"%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = options.limit ?? 20;

  const rows = db
    .query<ItemRecord>(
      `SELECT * FROM items ${where} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, limit);

  return rows.map((row) => mapRow<T>(row));
}

export function updateItem<T>(input: UpdateItemInput<T>): ItemRow<T> {
  const db = getDb();
  const tagsJson = JSON.stringify(input.payload.tags ?? []);
  const attributesJson = JSON.stringify(input.payload.attributes ?? {});

  db.query(
    `UPDATE items SET
        title = ?,
        source_url = ?,
        attributes = ?,
        tags = ?,
        submitted_by = COALESCE(?, submitted_by),
        render_status = COALESCE(?, render_status),
        og_path = COALESCE(?, og_path),
        embed_path = COALESCE(?, embed_path),
        markdown_path = COALESCE(?, markdown_path),
        rendered_at = COALESCE(?, rendered_at),
        render_failures = COALESCE(?, render_failures),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND type = ?`,
  ).run(
    input.payload.title,
    input.payload.sourceUrl ?? null,
    attributesJson,
    tagsJson,
    input.submittedBy ?? null,
    input.renderStatus ?? null,
    input.ogPath ?? null,
    input.embedPath ?? null,
    input.markdownPath ?? null,
    input.renderedAt ? input.renderedAt.toISOString() : null,
    input.renderFailures ?? null,
    input.id,
    input.type,
  );

  const row = db
    .query<ItemRecord>("SELECT * FROM items WHERE id = ?")
    .get(input.id);

  if (!row) {
    throw new Error("Failed to update item");
  }

  return mapRow<T>(row);
}

export type QueuedItemRow<T> = ItemRow<T>;

export function takeNextQueuedItem<T>(type?: string): QueuedItemRow<T> | null {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const params: unknown[] = [];
    let query = `SELECT * FROM items WHERE render_status = 'queued'`;
    if (type) {
      query += " AND type = ?";
      params.push(type);
    }
    query += " ORDER BY created_at ASC LIMIT 1";

    const stmt = db.query<ItemRecord>(query);
    const row = stmt.get(...params);

    if (!row) {
      db.exec("COMMIT");
      return null;
    }

    db.query(
      "UPDATE items SET render_status = 'rendering', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(row.id);

    db.exec("COMMIT");
    return mapRow<T>(row);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function markRenderResult(
  id: string,
  result: {
    ogPath: string;
    embedPath: string;
    markdownPath: string;
    renderedAt: Date;
  },
) {
  const db = getDb();
  db.query(
    `UPDATE items SET
        render_status = 'rendered',
        og_path = ?,
        embed_path = ?,
        markdown_path = ?,
        rendered_at = ?,
        render_failures = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).run(
    result.ogPath,
    result.embedPath,
    result.markdownPath,
    result.renderedAt.toISOString(),
    id,
  );
}

export function markRenderFailure(id: string) {
  const db = getDb();
  db.query(
    `UPDATE items SET
        render_status = 'failed',
        render_failures = render_failures + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).run(id);
}

export function buildAssetPaths(type: string, id: string, dataRoot: string) {
  return {
    ogPath: join(dataRoot, "og", type, `${id}.jpg`),
    embedPath: join(dataRoot, "embed", type, `${id}.html`),
    markdownPath: join(dataRoot, "markdown", type, `${id}.md`),
  };
}

export function listRenderedItems<T>(type: string, limit = 50): ItemRow<T>[] {
  const db = getDb();
  const rows = db
    .query<ItemRecord>(
      `SELECT * FROM items
         WHERE type = ? AND render_status = 'rendered'
         ORDER BY rendered_at DESC
         LIMIT ?`,
    )
    .all(type, limit);
  return rows.map((row) => mapRow<T>(row));
}
