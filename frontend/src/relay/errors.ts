import { randomUUID } from "node:crypto";

/** Correlates a safe client response with server diagnostics, without recording tool inputs. */
export function reportFailure(operation: string, error: unknown) {
  const errorId = randomUUID();
  console.error(
    JSON.stringify({
      level: "error",
      service_name: "arconis-relay",
      event: "request_failed",
      operation,
      errorId,
      error: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  );
  return errorId;
}
