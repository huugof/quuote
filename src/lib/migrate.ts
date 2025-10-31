import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "@app/lib/db";
import { logger } from "@app/lib/logger";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

async function readMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export async function runMigrations() {
  const db = getDb();
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );

  const files = await readMigrationFiles();
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const alreadyApplied = db
      .query<{
        count: number;
      }>("SELECT COUNT(1) as count FROM migrations WHERE id = ?")
      .get(id)?.count;

    if (alreadyApplied) continue;

    logger.info("applying_migration", { id });
    const sql = await Bun.file(join(MIGRATIONS_DIR, file)).text();
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.query("INSERT INTO migrations (id) VALUES (?)").run(id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      logger.error("migration_failed", { id, error });
      throw error;
    }
  }
}
