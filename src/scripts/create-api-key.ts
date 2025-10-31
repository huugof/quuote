import { ulid } from "ulid";

import { hashToken, generateToken } from "@app/lib/crypto";
import { getDb } from "@app/lib/db";
import { runMigrations } from "@app/lib/migrate";

await runMigrations();

const [, , maybeName] = process.argv;
const name = maybeName ?? `key-${Date.now()}`;
const token = generateToken(24);
const tokenHash = hashToken(token);
const id = ulid();

const db = getDb();
db
  .query(
    `INSERT INTO api_keys (id, name, token_hash) VALUES (?, ?, ?)`
  )
  .run(id, name, tokenHash);

console.log(JSON.stringify({ id, name, token }, null, 2));
