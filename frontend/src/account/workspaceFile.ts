import { fromBase64, toBase64 } from "lib0/buffer";
import { parseEnvelope, type Envelope } from "../collaboration/roomKey";
import type { PortablePicture } from "../document/pictures";

/** What a saved workspace holds. */
export interface WorkspaceContents {
  roomId: string;
  update: Uint8Array;
  /** Pictures that are not in shared storage, such as a device-only room's. */
  pictures: PortablePicture[];
}

/**
 * A saved copy as it is stored. An ordinary room's contents are stored as they are. A password room's
 * are sealed under its room key, with the envelope the room's password opens, so the saved copy needs
 * that password like the room does.
 */
export type SavedCopy =
  | { roomId: string; contents: WorkspaceContents }
  | { roomId: string; envelope: Envelope; sealed: Uint8Array };

const FORMAT = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isSealed(copy: SavedCopy): copy is Extract<SavedCopy, { sealed: Uint8Array }> {
  return "sealed" in copy;
}

export function encodeContents(contents: WorkspaceContents) {
  return encoder.encode(JSON.stringify({ ...contents, update: toBase64(contents.update) }));
}

export function decodeContents(bytes: Uint8Array): WorkspaceContents {
  const parsed = JSON.parse(decoder.decode(bytes)) as Omit<WorkspaceContents, "update"> & {
    update: string;
  };
  return { ...parsed, update: fromBase64(parsed.update) };
}

export function encodeSavedCopy(copy: SavedCopy) {
  const body = isSealed(copy)
    ? {
        format: FORMAT,
        roomId: copy.roomId,
        envelope: copy.envelope,
        sealed: toBase64(copy.sealed),
      }
    : {
        format: FORMAT,
        roomId: copy.roomId,
        contents: toBase64(encodeContents(copy.contents)),
      };
  return encoder.encode(JSON.stringify(body));
}

export function decodeSavedCopy(bytes: Uint8Array): SavedCopy {
  const parsed = JSON.parse(decoder.decode(bytes)) as {
    format?: number;
    roomId?: unknown;
    envelope?: unknown;
    sealed?: unknown;
    contents?: unknown;
  };
  if (parsed.format !== FORMAT || typeof parsed.roomId !== "string")
    throw new Error("This saved workspace is not one Arconis can open.");
  if (typeof parsed.sealed === "string") {
    const envelope = parseEnvelope(parsed.envelope);
    if (!envelope) throw new Error("This saved password room is damaged.");
    return { roomId: parsed.roomId, envelope, sealed: fromBase64(parsed.sealed) };
  }
  if (typeof parsed.contents !== "string")
    throw new Error("This saved workspace is not one Arconis can open.");
  return { roomId: parsed.roomId, contents: decodeContents(fromBase64(parsed.contents)) };
}
