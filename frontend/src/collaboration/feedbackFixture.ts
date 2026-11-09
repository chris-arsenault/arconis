import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { FeedbackApi, type FeedbackStorage } from "../relay/feedback";
import type { FeedbackRecord, ScreenshotUpload } from "../protocol/feedback";

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function matchesUpload(
  request: IncomingMessage,
  body: Buffer,
  upload: ScreenshotUpload | undefined
) {
  if (!upload || request.method !== "PUT") return false;
  return (
    body.length === upload.size &&
    request.headers["content-type"] === "image/png" &&
    createHash("sha256").update(body).digest("base64") === upload.checksum
  );
}

/** The production feedback handler over private memory, with a checksum-bound S3 PUT stand-in. */
export function feedbackFixture(base: () => string, origin: string) {
  const uploads = new Map<string, ScreenshotUpload>();
  const screenshots = new Map<string, Buffer>();
  const records = new Map<string, FeedbackRecord>();
  const storage: FeedbackStorage = {
    signScreenshot: (id, upload) => {
      uploads.set(id, upload);
      return Promise.resolve(`${base()}/feedback-upload/${id}`);
    },
    hasScreenshot: ({ id, size, checksum }) => {
      const png = screenshots.get(id);
      return Promise.resolve(
        Boolean(
          png &&
          png.length === size &&
          createHash("sha256").update(png).digest("base64") === checksum
        )
      );
    },
    save: (record) => {
      if (records.has(record.id)) return Promise.reject(new Error("Report already exists"));
      records.set(record.id, record);
      return Promise.resolve();
    },
  };
  const api = new FeedbackApi(origin, storage);
  const answer = async (request: IncomingMessage, response: ServerResponse) => {
    const body = await readBody(request);
    if (request.url!.startsWith("/feedback-upload/")) {
      const id = request.url!.slice("/feedback-upload/".length);
      const upload = uploads.get(id);
      const accepted = matchesUpload(request, body, upload);
      if (accepted) screenshots.set(id, body);
      response.statusCode = accepted ? 200 : 403;
      response.end();
      return;
    }
    const result = await api.handle({
      path: request.url!,
      httpMethod: request.method!,
      headers: { origin: request.headers.origin ?? "" },
      body: body.toString("utf8"),
    });
    if (!result) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.statusCode = result.statusCode;
    for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
    response.end(result.body);
  };
  return {
    records: () => [...records.values()],
    screenshot: (id: string) => screenshots.get(id),
    handle(request: IncomingMessage, response: ServerResponse) {
      if (
        !request.url?.startsWith("/control/feedback") &&
        !request.url?.startsWith("/feedback-upload/")
      )
        return false;
      void answer(request, response);
      return true;
    },
  };
}
