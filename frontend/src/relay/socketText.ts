import type { RawData } from "ws";

/** ws may deliver text as one buffer, fragments or an ArrayBuffer. Decode all three as UTF-8. */
export function socketText(data: RawData) {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}
