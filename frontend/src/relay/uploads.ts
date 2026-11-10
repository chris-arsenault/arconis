import type { UploadReply, UploadRequest } from "../collaboration/serviceProtocol";
import { MAX_PICTURE_BYTES, isPictureHash } from "../document/pictures";

/** Total bytes of pictures shared storage may hold. */
export const STORAGE_LIMIT_BYTES = 20 * 1024 * 1024 * 1024;
/** Room pictures are ciphertext, slightly larger than the bytes they hold. */
const MAX_UPLOAD_BYTES = MAX_PICTURE_BYTES + 1024;

export interface StoredPictures {
  /** Every picture in storage, by hash, with its size. */
  list(): Promise<Map<string, number>>;
  /** A short-lived link allowing exactly this upload. */
  sign(request: UploadRequest): Promise<string>;
}

function isValidRequest(request: UploadRequest) {
  return (
    isPictureHash(request.hash) &&
    request.type === "application/octet-stream" &&
    typeof request.checksum === "string" &&
    Number.isInteger(request.size) &&
    request.size > 0 &&
    request.size <= MAX_UPLOAD_BYTES
  );
}

interface Reservation {
  size: number;
  signing: Promise<string> | null;
  issued: boolean;
}

/** Completed inventory is separate from capacity reserved for upload links. */
export class Uploads {
  private known: Promise<Map<string, number>> | null = null;
  private reservations = new Map<string, Reservation>();

  constructor(private storage: StoredPictures) {}

  async prepare(request: UploadRequest): Promise<UploadReply> {
    const { hash } = request;
    if (!isValidRequest(request)) return { status: "refused", hash, reason: "invalid" };
    this.known ??= this.storage.list();
    const known = await this.known;
    if (known.has(hash)) return { status: "stored", hash };
    let reservation = this.reservations.get(hash);
    if (reservation && reservation.size !== request.size)
      return { status: "refused", hash, reason: "invalid" };
    if (!reservation) {
      const total = [
        ...known.values(),
        ...[...this.reservations.values()].map(({ size }) => size),
      ].reduce((sum, size) => sum + size, 0);
      if (total + request.size > STORAGE_LIMIT_BYTES)
        return { status: "refused", hash, reason: "limit" };
      reservation = { size: request.size, signing: null, issued: false };
      this.reservations.set(hash, reservation);
    }
    return this.sign(request, reservation);
  }

  private async sign(request: UploadRequest, reservation: Reservation): Promise<UploadReply> {
    const { hash } = request;
    const signing = (reservation.signing ??= this.storage.sign(request));
    try {
      const url = await signing;
      reservation.issued = true;
      return { status: "upload", hash, url };
    } catch (error) {
      if (!reservation.issued && this.reservations.get(hash) === reservation)
        this.reservations.delete(hash);
      throw error;
    } finally {
      if (reservation.signing === signing) reservation.signing = null;
    }
  }
}
