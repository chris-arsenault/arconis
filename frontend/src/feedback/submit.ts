import {
  feedbackAccepted,
  screenshotLink,
  MAX_SCREENSHOT_BYTES,
  type FeedbackMetadata,
  type ScreenshotReceipt,
} from "../protocol/feedback";
import { readConfig } from "../collaboration/transport";
import { sha256 } from "../document/pictures";

async function json(url: string, body: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const reply: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof reply === "object" && reply !== null && "error" in reply
        ? String(reply.error)
        : "Feedback could not be saved. Please try again.";
    throw new Error(message);
  }
  return reply;
}

async function uploadScreenshot(base: string, bytes: Uint8Array): Promise<ScreenshotReceipt> {
  if (bytes.length > MAX_SCREENSHOT_BYTES)
    throw new Error("The canvas PNG is larger than 50 MB. Send feedback without a screenshot.");
  const { base64: checksum } = await sha256(bytes);
  const size = bytes.length;
  const link = screenshotLink.parse(await json(`${base}/upload`, { size, checksum }));
  const response = await fetch(link.url, {
    method: "PUT",
    headers: { "content-type": "image/png", "x-amz-checksum-sha256": checksum },
    body: new Blob([new Uint8Array(bytes)], { type: "image/png" }),
  });
  if (!response.ok) throw new Error("The screenshot could not be uploaded. Please try again.");
  return { id: link.id, size, checksum };
}

/** The report is accepted only after its optional screenshot has reached private storage. */
export async function submitFeedback(
  message: string,
  metadata: FeedbackMetadata,
  png: Uint8Array | null
) {
  const config = readConfig();
  if (config.transport !== "relay")
    throw new Error("The feedback service is not configured on this installation.");
  const base = `${config.relayUrl.replace(/\/$/, "")}/control/feedback`;
  const screenshot = png ? await uploadScreenshot(base, png) : null;
  return feedbackAccepted.parse(await json(base, { message, metadata, screenshot }));
}
