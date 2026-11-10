import { describe, expect, it } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { feedbackStorage } from "./feedbackStorage";
import type { FeedbackRecord } from "../protocol/feedback";

const ID = "28de4e5b-ce79-4cdb-9465-ac0479dd6b68";
const CHECKSUM = "a".repeat(43) + "=";
interface CapturedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
}
function setup() {
  const requests: CapturedRequest[] = [];
  const replies: Record<string, string>[] = [];
  // Local signing only. These fixture credentials never reach AWS.
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    requestHandler: {
      handle: (request: CapturedRequest) => {
        requests.push(request);
        return Promise.resolve({
          response: { statusCode: 200, headers: replies.shift() ?? {}, body: new Uint8Array() },
        });
      },
    },
  });
  return { store: feedbackStorage("private-feedback", client), requests, replies };
}

describe("feedback's S3 adapter", () => {
  it("signs only an exact screenshot PUT, with the checksum and upload metadata bound to it", async () => {
    const { store, requests } = setup();
    const url = new URL(await store.signScreenshot(ID, { size: 123, checksum: CHECKSUM }));
    expect(url.pathname).toBe(`/submissions/${ID}/canvas.png`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual([
      "content-length",
      "content-type",
      "host",
      "x-amz-checksum-sha256",
    ]);
    expect(url.searchParams.get("x-amz-meta-feedback-id")).toBe(ID);
    expect(url.searchParams.get("x-amz-tagging")).toBe("Project=arconis&kind=feedback-screenshot");
    expect(requests).toHaveLength(0);
  });

  it("checks the stored content type, size and checksum before accepting a screenshot", async () => {
    const { store, requests, replies } = setup();
    replies.push({
      "content-length": "123",
      "content-type": "image/png",
      "x-amz-checksum-sha256": CHECKSUM,
    });
    const screenshot = { id: ID, size: 123, checksum: CHECKSUM };
    expect(await store.hasScreenshot(screenshot)).toBe(true);
    expect(requests[0]).toMatchObject({
      method: "HEAD",
      path: `/submissions/${ID}/canvas.png`,
      headers: { "x-amz-checksum-mode": "ENABLED" },
    });
    for (const bad of [
      { "content-length": "124", "content-type": "image/png", "x-amz-checksum-sha256": CHECKSUM },
      { "content-length": "123", "content-type": "text/html", "x-amz-checksum-sha256": CHECKSUM },
      { "content-length": "123", "content-type": "image/png", "x-amz-checksum-sha256": "other" },
    ]) {
      replies.push(bad);
      expect(await store.hasScreenshot(screenshot)).toBe(false);
    }
  });

  it("writes private report JSON with diagnostic tags and prevents replacing an existing report", async () => {
    const { store, requests } = setup();
    const record = {
      id: ID,
      receivedAt: "2026-11-09T20:00:00Z",
      message: "A useful report",
      screenshot: null,
      metadata: { revision: "abc123", canvas: { roomType: "ordinary" } },
    } as FeedbackRecord;
    await store.save(record);
    const request = requests[0];
    expect(request).toMatchObject({
      method: "PUT",
      path: `/submissions/${ID}/report.json`,
      body: JSON.stringify(record),
      headers: {
        "content-type": "application/json",
        "if-none-match": "*",
        "x-amz-meta-feedback-id": ID,
        "x-amz-meta-received-at": record.receivedAt,
      },
    });
    const tags = new URLSearchParams(request.headers["x-amz-tagging"]);
    expect(Object.fromEntries(tags)).toMatchObject({
      Project: "arconis",
      kind: "usability-feedback",
      revision: "abc123",
      "room-type": "ordinary",
      screenshot: "false",
    });
    expect(request.headers).not.toHaveProperty("x-amz-acl");
  });
});
