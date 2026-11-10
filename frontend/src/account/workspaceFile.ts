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
 * Every room uses the same sealed copy. The UI supplies nopass automatically or asks for the
 * room password; the file carries the envelope needed to open its data key.
 */
export interface SavedCopy {
  roomId: string;
  envelope: Envelope;
  sealed: Uint8Array;
}

const FORMAT = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
  const body = {
    format: FORMAT,
    roomId: copy.roomId,
    envelope: copy.envelope,
    sealed: toBase64(copy.sealed),
  };
  return encoder.encode(JSON.stringify(body));
}

export function decodeSavedCopy(bytes: Uint8Array): SavedCopy {
  const parsed = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
  if (parsed.format !== FORMAT || typeof parsed.roomId !== "string")
    throw new Error("This saved workspace is not one Arconis can open.");
  const envelope = parseEnvelope(parsed.envelope);
  if (!envelope || typeof parsed.sealed !== "string")
    throw new Error("This saved workspace is not one Arconis can open.");
  return { roomId: parsed.roomId, envelope, sealed: fromBase64(parsed.sealed) };
}
