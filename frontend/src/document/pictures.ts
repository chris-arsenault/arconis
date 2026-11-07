import { fromBase64, toBase64 } from "lib0/buffer";
import type { Item } from "./types";

/** A picture item names its bytes by their hash; the bytes live outside the document. */

export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
export const MAX_PICTURE_SIDE = 4096;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isPictureHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function isPictureType(value: unknown): value is string {
  return typeof value === "string" && TYPES.has(value);
}

/** Built only from a validated hash, because peers write the object that holds it. */
export function pictureKey(hash: string) {
  return `pictures/${hash}`;
}

export async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return {
    hex: [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    base64: toBase64(digest),
  };
}

/** Scales a picture's sides down to fit a limit, keeping its proportions. */
export function fitWithin(width: number, height: number, limit: number) {
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function pictureHashes(items: Item[]) {
  return [...new Set(items.map((item) => item.picture?.hash).filter(isPictureHash))];
}

export interface PortablePicture {
  hash: string;
  type: string;
  data: string;
}

/** A file's pictures, and which objects must point at them under a different name. */
export interface FilePictures {
  pictures: PortablePicture[];
  renames: Map<string, string>;
}
export const NO_PICTURES: FilePictures = { pictures: [], renames: new Map() };

/**
 * Points objects at renamed pictures. A password room names a picture by its encrypted form, so moving
 * one in or out of such a room changes its name, and it has not reached storage under the new one.
 */
export function renamePictures(items: Item[], renames: Map<string, string>) {
  return items.map((item) => {
    const renamed = item.picture && renames.get(item.picture.hash);
    if (!renamed) return item;
    return { ...item, picture: { ...item.picture!, hash: renamed, stored: false } };
  });
}

export function encodePicture(hash: string, type: string, bytes: Uint8Array): PortablePicture {
  return { hash, type, data: toBase64(bytes) };
}

/** Reads a picture from a file, refusing any whose bytes do not match its name. */
export async function decodePicture(value: unknown) {
  const picture = value as Partial<PortablePicture> | null;
  if (!isPictureHash(picture?.hash) || !isPictureType(picture.type)) return null;
  if (typeof picture.data !== "string") return null;
  const bytes = fromBase64(picture.data);
  if (bytes.length > MAX_PICTURE_BYTES) return null;
  const { hex } = await sha256(bytes);
  return hex === picture.hash ? { hash: hex, type: picture.type, bytes } : null;
}
