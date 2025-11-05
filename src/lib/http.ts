import { logger } from "./logger";

export type ErrorResponse = {
  error: string;
  details?: unknown;
};

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
): Response {
  return jsonResponse({ error: message, details }, { status });
}

export async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    const body = await request.json();
    return body as T;
  } catch (error) {
    logger.error("json_parse_error", {
      error: error instanceof Error ? error.message : String(error),
      url: request.url ?? "unknown",
    });
    return null;
  }
}

export function notFound(): Response {
  return errorResponse("Not found", 404);
}

export function methodNotAllowed(): Response {
  return errorResponse("Method not allowed", 405);
}
