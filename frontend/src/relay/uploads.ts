import type { UploadReply, UploadRequest } from "../collaboration/transport";
import { MAX_PICTURE_BYTES, isPictureHash } from "../document/pictures";

/** Total bytes of pictures shared storage may hold. */
export const STORAGE_LIMIT_BYTES = 20 * 1024 * 1024 * 1024;
/** A password room's pictures are ciphertext, slightly larger than the bytes they hold. */
const MAX_UPLOAD_BYTES = MAX_PICTURE_BYTES + 1024;
const UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/octet-stream"]);

export interface StoredPictures {
  /** Every picture in storage, by hash, with its size. */
  list(): Promise<Map<string, number>>;
  /** A short-lived link allowing exactly this upload. */
  sign(request: UploadRequest): Promise<string>;
}

function isValidRequest(request: UploadRequest) {
  return (
    isPictureHash(request.hash) &&
    UPLOAD_TYPES.has(request.type) &&
    typeof request.checksum === "string" &&
    Number.isInteger(request.size) &&
    request.size > 0 &&
    request.size <= MAX_UPLOAD_BYTES
  );
}

/** Decides uploads against the storage limit. Totals storage once, then counts what it signs. */
export class Uploads {
  private known: Promise<Map<string, number>> | null = null;

  constructor(private storage: StoredPictures) {}

  async prepare(request: UploadRequest): Promise<UploadReply> {
    const { hash } = request;
    if (!isValidRequest(request)) return { status: "refused", hash, reason: "invalid" };
    this.known ??= this.storage.list();
    const known = await this.known;
    if (known.has(hash)) return { status: "stored", hash };
    const total = [...known.values()].reduce((sum, size) => sum + size, 0);
    if (total + request.size > STORAGE_LIMIT_BYTES)
      return { status: "refused", hash, reason: "limit" };
    known.set(hash, request.size);
    try {
      return { status: "upload", hash, url: await this.storage.sign(request) };
    } catch (error) {
      known.delete(hash);
      throw error;
    }
  }
}
