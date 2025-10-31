import path from "node:path";

export type AppConfig = {
  port: number;
  databasePath: string;
  dataRoot: string;
  siteOrigin?: string;
  basePath?: string;
  cardVersion?: string;
  logLevel: "debug" | "info" | "warn" | "error";
};

const DEFAULT_DATA_ROOT = path.resolve(process.cwd(), "data");
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_ROOT, "db.sqlite");

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePath(value: string | undefined, fallback: string): string {
  const target = value && value.length ? value : fallback;
  return path.resolve(target);
}

function normalizeBasePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "/" || value === "") return undefined;
  const prefixed = value.startsWith("/") ? value : `/${value}`;
  return prefixed.endsWith("/") ? prefixed.slice(0, -1) : prefixed;
}

function normalizeLogLevel(value: string | undefined): AppConfig["logLevel"] {
  if (!value) return "info";
  switch (value.toLowerCase()) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value.toLowerCase() as AppConfig["logLevel"];
    default:
      return "info";
  }
}

export function loadConfig(): AppConfig {
  return {
    port: parseNumber(process.env.PORT, 3000),
    databasePath: normalizePath(process.env.DATABASE_PATH, DEFAULT_DB_PATH),
    dataRoot: normalizePath(process.env.DATA_ROOT, DEFAULT_DATA_ROOT),
    siteOrigin: process.env.SITE_ORIGIN,
    basePath: normalizeBasePath(process.env.BASE_PATH),
    cardVersion: process.env.CARD_VERSION,
    logLevel: normalizeLogLevel(process.env.LOG_LEVEL),
  };
}
