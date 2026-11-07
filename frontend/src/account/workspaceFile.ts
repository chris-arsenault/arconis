import { fromBase64, toBase64 } from "lib0/buffer";
import { parseEnvelope, seal, unseal, type Envelope } from "../collaboration/roomKey";
import type { PortablePicture } from "../document/pictures";

/** What a saved workspace holds, all of it encrypted under the account's key before it leaves. */
export interface WorkspaceContents {
  roomId: string;
  update: Uint8Array;
  /** Pictures that are not in shared storage, such as a device-only room's. */
  pictures: PortablePicture[];
  /** A password room's envelope, so it can be opened where nobody else is online. */
  envelope: Envelope | null;
}

/** The record's name and room, which the server holds only as ciphertext. */
export interface WorkspaceLabel {
  name: string;
  roomId: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sealContents(key: CryptoKey, contents: WorkspaceContents) {
  const json = JSON.stringify({ ...contents, update: toBase64(contents.update) });
  return seal(key, encoder.encode(json));
}

export async function openContents(key: CryptoKey, sealed: Uint8Array): Promise<WorkspaceContents> {
  const parsed = JSON.parse(decoder.decode(await unseal(key, sealed))) as Omit<
    WorkspaceContents,
    "update"
  > & { update: string };
  return { ...parsed, update: fromBase64(parsed.update), envelope: parseEnvelope(parsed.envelope) };
}

export async function sealLabel(key: CryptoKey, label: WorkspaceLabel) {
  return toBase64(await seal(key, encoder.encode(JSON.stringify(label))));
}

export async function openLabel(key: CryptoKey, sealed: string) {
  try {
    return JSON.parse(decoder.decode(await unseal(key, fromBase64(sealed)))) as WorkspaceLabel;
  } catch {
    return null;
  }
}
