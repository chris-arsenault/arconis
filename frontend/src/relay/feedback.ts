import {
  feedbackSubmission,
  screenshotUpload,
  type FeedbackRecord,
  type ScreenshotReceipt,
  type ScreenshotUpload,
} from "../protocol/feedback";
import type { AlbRequest } from "./mcpProxy";
import { reportEvent } from "./errors";

export interface FeedbackStorage {
  signScreenshot(id: string, upload: ScreenshotUpload): Promise<string>;
  hasScreenshot(screenshot: ScreenshotReceipt): Promise<boolean>;
  save(record: FeedbackRecord): Promise<void>;
}

/** Fixed object names; browsers choose neither a bucket nor an arbitrary storage path. */
export function feedbackKey(id: string, file: "report.json" | "canvas.png") {
  return `submissions/${id}/${file}`;
}

export function feedbackTags(record: FeedbackRecord) {
  return new URLSearchParams({
    Project: "arconis",
    kind: "usability-feedback",
    "room-type": record.metadata.canvas.roomType,
    screenshot: String(record.screenshot !== null),
    revision: record.metadata.revision.replaceAll(/[^a-zA-Z0-9_.-]/g, "_") || "unknown",
  }).toString();
}

function requestJson(event: AlbRequest) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");
  if (Buffer.byteLength(raw) > 64 * 1024)
    return { status: 413, error: "This feedback is too large.", body: null };
  try {
    return { status: 200, error: "", body: JSON.parse(raw) as unknown };
  } catch {
    return { status: 400, error: "The feedback request is not valid JSON.", body: null };
  }
}

function reportFeedbackFailure(error: unknown) {
  // Feedback and signed URLs do not belong in logs.
  reportEvent(
    "feedback_storage_failed",
    { error: error instanceof Error ? error.name : "UnknownError" },
    "error"
  );
}

/** Guest feedback uses the control Lambda even when the relay itself is stopped. */
export class FeedbackApi {
  constructor(
    private origin: string,
    private storage: FeedbackStorage,
    private now = () => new Date(),
    private newId = () => crypto.randomUUID()
  ) {}

  async handle(event: AlbRequest) {
    if (!["/control/feedback", "/control/feedback/upload"].includes(event.path)) return null;
    const origin = Object.entries(event.headers ?? {}).find(
      ([name]) => name.toLowerCase() === "origin"
    )?.[1];
    if (origin !== this.origin)
      return this.reply(403, { error: "Feedback must be sent from Arconis." });
    if (event.httpMethod === "OPTIONS") return this.reply(204, {});
    if (event.httpMethod !== "POST")
      return this.reply(405, { error: "Use POST to send feedback." });
    try {
      const request = requestJson(event);
      if (request.error) return this.reply(request.status, { error: request.error });
      return event.path.endsWith("/upload")
        ? await this.upload(request.body)
        : await this.submit(request.body);
    } catch (error) {
      reportFeedbackFailure(error);
      return this.reply(503, { error: "Feedback could not be saved. Please try again." });
    }
  }

  private async upload(body: unknown) {
    const parsed = screenshotUpload.safeParse(body);
    if (!parsed.success)
      return this.reply(400, { error: "The screenshot size or checksum is not valid." });
    const id = this.newId();
    return this.reply(200, { id, url: await this.storage.signScreenshot(id, parsed.data) });
  }

  private async submit(body: unknown) {
    const parsed = feedbackSubmission.safeParse(body);
    if (!parsed.success)
      return this.reply(400, { error: "Enter feedback and valid canvas diagnostics." });
    const { screenshot } = parsed.data;
    if (screenshot && !(await this.storage.hasScreenshot(screenshot)))
      return this.reply(409, {
        error: "The screenshot upload has not finished. Please try again.",
      });
    const record: FeedbackRecord = {
      ...parsed.data,
      id: screenshot?.id ?? this.newId(),
      receivedAt: this.now().toISOString(),
    };
    await this.storage.save(record);
    return this.reply(201, { id: record.id });
  }

  private reply(statusCode: number, body: object) {
    return {
      statusCode,
      isBase64Encoded: false,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": this.origin,
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        vary: "Origin",
      },
      body: statusCode === 204 ? "" : JSON.stringify(body),
    };
  }
}
