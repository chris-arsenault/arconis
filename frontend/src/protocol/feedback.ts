import { z } from "zod";

export const MAX_FEEDBACK_LENGTH = 10_000;
export const MAX_SCREENSHOT_BYTES = 50 * 1024 * 1024;
const text = (length: number) => z.string().max(length);
const dimension = z.number().int().nonnegative().max(100_000);

export const feedbackMetadata = z.object({
  submittedAt: z.iso.datetime(),
  revision: text(100),
  page: text(500),
  reporter: z.object({
    name: text(200),
    accountStatus: z.enum(["loading", "out", "in", "deleting", "unavailable"]),
    accountEmail: text(320).nullable(),
  }),
  browser: z.object({
    userAgent: text(1000),
    language: text(100),
    timeZone: text(100),
    viewport: z.object({
      width: dimension,
      height: dimension,
      pixelRatio: z.number().positive().max(16),
    }),
    online: z.boolean(),
  }),
  canvas: z.object({
    roomId: text(64),
    roomType: z.enum(["ordinary", "password", "device"]),
    title: text(500),
    connection: text(100),
    participants: dimension,
    objects: z.number().int().nonnegative(),
    selected: z.number().int().nonnegative(),
    tool: text(100),
    drawingInstrument: text(100),
    zoom: z.number().positive(),
    layers: z.object({ active: text(128), hidden: z.array(text(128)).max(1000) }).optional(),
  }),
});

export const screenshotUpload = z.object({
  size: z.number().int().positive().max(MAX_SCREENSHOT_BYTES),
  checksum: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});
export const screenshotReceipt = screenshotUpload.extend({ id: z.uuid() });
export const feedbackSubmission = z.object({
  message: z.string().trim().min(1).max(MAX_FEEDBACK_LENGTH),
  metadata: feedbackMetadata,
  screenshot: screenshotReceipt.nullable(),
});
export const screenshotLink = z.object({ id: z.uuid(), url: z.url() });
export const feedbackAccepted = z.object({ id: z.uuid() });

export type FeedbackMetadata = z.infer<typeof feedbackMetadata>;
export type ScreenshotUpload = z.infer<typeof screenshotUpload>;
export type ScreenshotReceipt = z.infer<typeof screenshotReceipt>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmission>;
export interface FeedbackRecord extends FeedbackSubmission {
  id: string;
  receivedAt: string;
}
