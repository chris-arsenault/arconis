import { describe, expect, it, vi } from "vitest";
import { FeedbackApi, feedbackKey, feedbackTags, type FeedbackStorage } from "./feedback";
import { MAX_SCREENSHOT_BYTES, type FeedbackSubmission } from "../protocol/feedback";
import type { AlbRequest } from "./mcpProxy";

const ORIGIN = "https://canvas.example";
const ID = "28de4e5b-ce79-4cdb-9465-ac0479dd6b68";
const CHECKSUM = "a".repeat(43) + "=";
const NOW = new Date("2026-11-09T20:00:00Z");
function submission(): FeedbackSubmission {
  return {
    message: "  Moving between tools was confusing.  ",
    screenshot: null,
    metadata: {
      submittedAt: "2026-11-09T19:59:00Z",
      revision: "abc123",
      page: ORIGIN,
      reporter: { name: "Designer", accountStatus: "out", accountEmail: null },
      browser: {
        userAgent: "Fixture browser",
        language: "en",
        timeZone: "UTC",
        viewport: { width: 1440, height: 1000, pixelRatio: 1 },
        online: true,
      },
      canvas: {
        roomId: "a".repeat(48),
        roomType: "ordinary",
        title: "Design",
        connection: "online",
        participants: 2,
        objects: 8,
        selected: 1,
        tool: "draw",
        drawingInstrument: "pen",
        zoom: 1,
      },
    },
  };
}
function setup() {
  const storage = {
    signScreenshot: vi.fn(() => Promise.resolve("https://storage.example/signed-put")),
    hasScreenshot: vi.fn(() => Promise.resolve(true)),
    save: vi.fn<FeedbackStorage["save"]>(() => Promise.resolve()),
  } satisfies FeedbackStorage;
  const api = new FeedbackApi(
    ORIGIN,
    storage,
    () => NOW,
    () => ID
  );
  const request = (
    body: unknown,
    path = "/control/feedback",
    overrides: Partial<AlbRequest> = {}
  ) =>
    api.handle({
      path,
      httpMethod: "POST",
      headers: { origin: ORIGIN },
      body: JSON.stringify(body),
      ...overrides,
    });
  return { api, storage, request };
}

describe("private feedback", () => {
  it("accepts guests, keeps supplied diagnostics and adds an authoritative receipt time", async () => {
    const { storage, request } = setup();
    expect((await request(submission()))?.statusCode).toBe(201);
    expect(storage.save).toHaveBeenCalledWith({
      ...submission(),
      message: "Moving between tools was confusing.",
      id: ID,
      receivedAt: NOW.toISOString(),
    });
    expect(storage.signScreenshot).not.toHaveBeenCalled();
    expect(storage.hasScreenshot).not.toHaveBeenCalled();
    const stored = storage.save.mock.calls[0][0];
    expect(feedbackKey(stored.id, "report.json")).toBe(`submissions/${ID}/report.json`);
    expect(new URLSearchParams(feedbackTags(stored)).get("screenshot")).toBe("false");
    expect(new URLSearchParams(feedbackTags(stored)).get("revision")).toBe("abc123");
  });

  it("issues a screenshot PUT only for a bounded size and a SHA-256 checksum", async () => {
    const { storage, request } = setup();
    const upload = { size: 1234, checksum: CHECKSUM };
    expect(JSON.parse((await request(upload, "/control/feedback/upload"))!.body)).toEqual({
      id: ID,
      url: "https://storage.example/signed-put",
    });
    expect(storage.signScreenshot).toHaveBeenCalledWith(ID, upload);
    for (const invalid of [
      { size: MAX_SCREENSHOT_BYTES + 1, checksum: CHECKSUM },
      { size: 0, checksum: CHECKSUM },
      { size: 12, checksum: "bad" },
    ])
      expect((await request(invalid, "/control/feedback/upload"))?.statusCode).toBe(400);
    expect(storage.signScreenshot).toHaveBeenCalledOnce();
  });

  it("does not accept a report until its optional screenshot is actually stored and verified", async () => {
    const { storage, request } = setup();
    const body = { ...submission(), screenshot: { id: ID, size: 1234, checksum: CHECKSUM } };
    storage.hasScreenshot.mockResolvedValueOnce(false);
    expect((await request(body))?.statusCode).toBe(409);
    expect(storage.save).not.toHaveBeenCalled();
    expect((await request(body))?.statusCode).toBe(201);
    expect(storage.hasScreenshot).toHaveBeenCalledWith(body.screenshot);
    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, screenshot: body.screenshot })
    );
  });
});

describe("feedback request boundaries", () => {
  it("refuses blank feedback, arbitrary screenshot paths and malformed diagnostics", async () => {
    const { storage, request } = setup();
    for (const invalid of [
      { ...submission(), message: " " },
      { ...submission(), screenshot: { id: "../private", size: 12, checksum: CHECKSUM } },
      { ...submission(), metadata: {} },
    ])
      expect((await request(invalid))?.statusCode).toBe(400);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it("limits request bodies, handles base64 ALB input and does not persist unknown fields", async () => {
    const { storage, request } = setup();
    expect((await request({}, "/control/feedback", { body: "x".repeat(65537) }))?.statusCode).toBe(
      413
    );
    expect((await request({}, "/control/feedback", { body: "{" }))?.statusCode).toBe(400);
    const body = Buffer.from(
      JSON.stringify({ ...submission(), token: "must not persist" })
    ).toString("base64");
    expect(
      (await request({}, "/control/feedback", { body, isBase64Encoded: true }))?.statusCode
    ).toBe(201);
    expect(storage.save.mock.calls[0][0]).not.toHaveProperty("token");
  });

  it("allows site preflight, rejects other origins and does not intercept other control paths", async () => {
    const { api, storage, request } = setup();
    const preflight = await request({}, "/control/feedback/upload", { httpMethod: "OPTIONS" });
    expect(preflight?.statusCode).toBe(204);
    expect(preflight?.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(
      (
        await request(submission(), "/control/feedback", {
          headers: { origin: "https://elsewhere.example" },
        })
      )?.statusCode
    ).toBe(403);
    expect((await request(submission(), "/control/feedback", { headers: {} }))?.statusCode).toBe(
      403
    );
    expect((await request({}, "/control/feedback", { httpMethod: "GET" }))?.statusCode).toBe(405);
    expect(await api.handle({ path: "/control/status", httpMethod: "GET" })).toBeNull();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it("reports storage failures without returning feedback text or internal storage details", async () => {
    const { storage, request } = setup();
    storage.save.mockRejectedValue(new Error("private bucket internals"));
    const result = await request(submission());
    expect(result?.statusCode).toBe(503);
    expect(result?.body).not.toContain("private bucket internals");
    expect(result?.body).not.toContain(submission().message.trim());
  });
});
