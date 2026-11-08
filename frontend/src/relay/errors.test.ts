import { afterEach, expect, it, vi } from "vitest";
import { reportEvent, reportFailure, requestLogContext } from "./errors";

afterEach(() => vi.restoreAllMocks());

it("emits single-line structured records with time, severity and asynchronous request context", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  await requestLogContext.run({ requestId: "request-one", sessionTag: "session-tag" }, async () => {
    await Promise.resolve();
    reportEvent("tool_finished", { operation: "read", outcome: "succeeded", durationMs: 12 });
  });
  const line = String(info.mock.calls[0][0]);
  const record = JSON.parse(line);
  expect(record).toMatchObject({
    service_name: "arconis-relay",
    event: "tool_finished",
    level: "info",
    requestId: "request-one",
    sessionTag: "session-tag",
    operation: "read",
    outcome: "succeeded",
    durationMs: 12,
    pid: process.pid,
  });
  expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
  expect(requestLogContext.getStore()).toBeUndefined();
  expect(line).not.toContain("\n");
});

it("keeps concurrent requests separate and escapes exception line breaks", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await Promise.all(
    ["first", "second"].map((requestId) =>
      requestLogContext.run({ requestId, sessionTag: requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, requestId === "first" ? 10 : 0));
        reportFailure("read", new Error("failure\r\nforged record"));
      })
    )
  );
  const records = log.mock.calls.map(([line]) => {
    expect(String(line)).not.toMatch(/[\r\n]/);
    return JSON.parse(String(line));
  });
  expect(records.map((record) => record.requestId).sort((a, b) => a.localeCompare(b))).toEqual([
    "first",
    "second",
  ]);
  expect(records.every((record) => record.requestId === record.sessionTag)).toBe(true);
  expect(records.every((record) => record.level === "error" && record.errorId)).toBe(true);
});

it("does not fail a request when the log sink throws", () => {
  vi.spyOn(console, "info").mockImplementation(() => {
    throw new Error("Log sink unavailable");
  });
  vi.spyOn(console, "error").mockImplementation(() => {
    throw new Error("Log sink unavailable");
  });
  expect(() => reportEvent("tool_started", { operation: "read" })).not.toThrow();
  expect(reportFailure("read", new Error("internal failure"))).toMatch(/^[a-f0-9-]{36}$/);
});
