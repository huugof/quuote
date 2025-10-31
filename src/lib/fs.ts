import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function ensureParentDir(filePath: string) {
  await ensureDir(dirname(filePath));
}

export async function ensureDataStructure(dataRoot: string) {
  await Promise.all([
    ensureDir(join(dataRoot, "og")),
    ensureDir(join(dataRoot, "embed")),
    ensureDir(join(dataRoot, "markdown")),
    ensureDir(join(dataRoot, "rss")),
  ]);
}

export async function ensureTypeDirectories(dataRoot: string, type: string) {
  await ensureDataStructure(dataRoot);
  await Promise.all([
    ensureDir(join(dataRoot, "og", type)),
    ensureDir(join(dataRoot, "embed", type)),
    ensureDir(join(dataRoot, "markdown", type)),
  ]);
}

export async function writeFileEnsured(path: string, data: string | ArrayBuffer | Uint8Array) {
  await ensureParentDir(path);
  await Bun.write(path, data);
}
