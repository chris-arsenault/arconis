import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

type DiagnosticFields = Record<string, string | number | boolean>;
type Severity = "info" | "warn" | "error";

/** Node's request context keeps asynchronous tool events attached to their HTTP request. */
export const requestLogContext = new AsyncLocalStorage<{ requestId: string; sessionTag: string }>();

function emit(level: Severity, event: string, fields: DiagnosticFields) {
  try {
    console[level](
      JSON.stringify({
        ...requestLogContext.getStore(),
        ...fields,
        timestamp: new Date().toISOString(),
        level,
        service_name: "arconis-relay",
        pid: process.pid,
        event,
      })
    );
  } catch {
    // A failed log sink must not change a tool's outcome. Sink health belongs to the collector.
  }
}

/** Request/session metadata only: callers supply no credentials, room ids or canvas content. */
export function reportEvent(event: string, fields: DiagnosticFields, level: Severity = "info") {
  emit(level, event, fields);
}

/** Correlates a safe client response with server diagnostics, without recording tool inputs. */
export function reportFailure(operation: string, error: unknown, fields: DiagnosticFields = {}) {
  const errorId = randomUUID();
  emit("error", "request_failed", {
    ...fields,
    operation,
    errorId,
    error: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? "") : "",
  });
  return errorId;
}
