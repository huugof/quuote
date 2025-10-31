import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { loadConfig } from "@app/lib/config";

export type DB = Database;

let dbInstance: DB | null = null;

export function getDb(): DB {
  if (dbInstance) return dbInstance;
  const { databasePath } = loadConfig();
  mkdirSync(path.dirname(databasePath), { recursive: true });
  dbInstance = new Database(databasePath, { create: true, strict: true });
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  return dbInstance;
}

export function closeDb() {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
}
