import { loadConfig } from "@app/lib/config";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const config = loadConfig();
const minLevel = levelWeights[config.logLevel];

function formatPayload(payload?: LogPayload): string {
  if (!payload) return "";
  const entries = Object.entries(payload);
  if (!entries.length) return "";
  return entries
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
}

function log(level: LogLevel, message: string, payload?: LogPayload) {
  if (levelWeights[level] < minLevel) return;
  const timestamp = new Date().toISOString();
  const renderedPayload = formatPayload(payload);
  const line = renderedPayload ? `${message} ${renderedPayload}` : message;

  switch (level) {
    case "debug":
      console.debug(timestamp, level.toUpperCase(), line);
      break;
    case "info":
      console.info(timestamp, level.toUpperCase(), line);
      break;
    case "warn":
      console.warn(timestamp, level.toUpperCase(), line);
      break;
    case "error":
      console.error(timestamp, level.toUpperCase(), line);
      break;
  }
}

export const logger = {
  debug: (message: string, payload?: LogPayload) =>
    log("debug", message, payload),
  info: (message: string, payload?: LogPayload) =>
    log("info", message, payload),
  warn: (message: string, payload?: LogPayload) =>
    log("warn", message, payload),
  error: (message: string, payload?: LogPayload) =>
    log("error", message, payload),
};
