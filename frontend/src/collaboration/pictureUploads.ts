import type { CanvasDocument } from "../document/canvasDocument";
import { PICTURE_HASH, PICTURE_STORED, isPictureHash, sha256 } from "../document/pictures";
import type { PictureStore } from "./pictureStore";
import type { UploadReply, UploadRequest } from "./transport";

/** Not an undoable edit: undoing must not make a picture forget that it reached storage. */
const STORAGE_ORIGIN = Symbol("picture storage");

export type PutBytes = (url: string, bytes: Uint8Array, request: UploadRequest) => Promise<boolean>;

export const putToStorage: PutBytes = async (url, bytes, { type, checksum }) => {
  const response = await fetch(url, {
    method: "PUT",
    body: new Blob([new Uint8Array(bytes)], { type }),
    headers: { "content-type": type, "x-amz-checksum-sha256": checksum },
  });
  return response.ok;
};

function waitingHashes(document: CanvasDocument) {
  const hashes = document
    .list()
    .filter((item) => item.kind === "picture" && item.style[PICTURE_STORED] !== true)
    .map((item) => item.style[PICTURE_HASH])
    .filter(isPictureHash);
  return [...new Set(hashes)];
}

function markStored(document: CanvasDocument, hash: string) {
  document.doc.transact(() => {
    document
      .list()
      .filter((item) => item.style[PICTURE_HASH] === hash)
      .forEach((item) => document.patchStyle(item.id, { [PICTURE_STORED]: true }));
  }, STORAGE_ORIGIN);
}

export interface UploadContext {
  document: CanvasDocument;
  store: PictureStore;
  request: (request: UploadRequest) => Promise<UploadReply>;
  put: PutBytes;
  /** The content type storage records. Differs from the picture's for encrypted bytes. */
  contentType: (pictureType: string) => string;
}

/**
 * Uploads this room's pictures that have not reached storage and that this browser holds. Peers learn
 * a picture is available from the document once its bytes are there. Returns a message for people, if
 * storage refused. Anything else is retried the next time the relay connects.
 */
export async function uploadWaitingPictures(context: UploadContext) {
  const { document, store } = context;
  for (const hash of waitingHashes(document)) {
    const picture = await store.read(hash);
    if (!picture) continue;
    const { base64: checksum } = await sha256(picture.bytes);
    const request: UploadRequest = {
      hash,
      type: context.contentType(picture.type),
      size: picture.bytes.length,
      checksum,
    };
    const reply = await context.request(request);
    if (reply.status === "refused")
      return reply.reason === "limit"
        ? "Picture storage is full, so this picture stays on this device."
        : "This picture could not be shared, so it stays on this device.";
    if (reply.status === "upload" && !(await context.put(reply.url, picture.bytes, request)))
      return "";
    markStored(document, hash);
  }
  return "";
}
