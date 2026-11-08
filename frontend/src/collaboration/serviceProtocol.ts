/** Shared service messages; these contracts do not load a browser or server adapter. */
export type RelayStatus = "running" | "starting" | "stopped" | "stopping" | "limit";

export interface UploadRequest {
  hash: string;
  type: string;
  size: number;
  checksum: string;
}
export type UploadReply =
  | { status: "upload"; hash: string; url: string }
  | { status: "stored"; hash: string }
  | { status: "refused"; hash: string; reason: "limit" | "invalid" | "unavailable" };
