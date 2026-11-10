import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { PictureStore, type StoredPicture } from "./pictureStore";
import { uploadWaitingPictures, type PutBytes } from "./pictureUploads";
import type { UploadReply, UploadRequest } from "./serviceProtocol";

const BYTES = new Uint8Array([9, 8, 7]);
let document: CanvasDocument;
afterEach(() => document.destroy());

async function setup(reply: UploadReply | ((hash: string) => UploadReply)) {
  document = new CanvasDocument();
  const data = new Map<string, StoredPicture>();
  const store = new PictureStore({
    shelf: {
      get: (hash) => Promise.resolve(data.get(hash)),
      put: (hash, picture) => {
        data.set(hash, picture);
        return Promise.resolve();
      },
    },
    codec: { seal: async (bytes) => bytes, open: async (bytes) => bytes },
    download: null,
    createUrl: () => "",
    revokeUrl: () => {},
  });
  const hash = await store.add(BYTES, "image/webp");
  const id = document.create("picture", 0, 0, {
    picture: { hash, format: "image/webp", stored: false },
  });
  const request = vi.fn((upload: UploadRequest) =>
    Promise.resolve(typeof reply === "function" ? reply(upload.hash) : reply)
  );
  const put = vi.fn<PutBytes>(() => Promise.resolve(true));
  const run = () =>
    uploadWaitingPictures({
      document,
      store,
      request,
      put,
      contentType: (type) => type,
    });
  const stored = () => document.get(id)!.picture?.stored;
  return { hash, id, request, put, run, stored };
}

describe("uploading", () => {
  it("uploads the bytes, then tells peers through the document", async () => {
    const context = await setup((hash) => ({ status: "upload", hash, url: "https://s3/x" }));
    expect(await context.run()).toBe("");
    expect(context.put).toHaveBeenCalledOnce();
    const [url, bytes, request] = context.put.mock.calls[0];
    expect(url).toBe("https://s3/x");
    expect([...bytes]).toEqual([...BYTES]);
    expect(request).toMatchObject({ hash: context.hash, type: "image/webp", size: 3 });
    expect(context.stored()).toBe(true);
  });

  it("sends each picture once, even when several objects show it", async () => {
    const context = await setup((hash) => ({ status: "upload", hash, url: "u" }));
    document.create("picture", 0, 0, {
      picture: { hash: context.hash, format: "image/webp", stored: false },
    });
    await context.run();
    expect(context.put).toHaveBeenCalledOnce();
    expect(document.list().every((item) => item.picture?.stored === true)).toBe(true);
    await context.run();
    expect(context.request).toHaveBeenCalledOnce();
  });

  it("skips the bytes when storage already holds that picture", async () => {
    const context = await setup((hash) => ({ status: "stored", hash }));
    await context.run();
    expect(context.put).not.toHaveBeenCalled();
    expect(context.stored()).toBe(true);
  });

  it("says when storage is full, and leaves the picture to retry", async () => {
    const context = await setup((hash) => ({ status: "refused", hash, reason: "limit" }));
    expect(await context.run()).toMatch(/full/);
    expect(context.stored()).toBe(false);
  });

  it("does not claim a failed upload reached storage", async () => {
    const context = await setup((hash) => ({ status: "upload", hash, url: "u" }));
    context.put.mockResolvedValueOnce(false);
    await context.run();
    expect(context.stored()).toBe(false);
  });

  it("leaves pictures it does not hold to the browser that does", async () => {
    const context = await setup((hash) => ({ status: "upload", hash, url: "u" }));
    document.patch(context.id, {
      picture: { hash: "d".repeat(64), format: "image/webp", stored: false },
    });
    await context.run();
    expect(context.request).not.toHaveBeenCalled();
  });

  it("keeps the storage mark out of undo", async () => {
    const context = await setup((hash) => ({ status: "stored", hash }));
    document.undo.stopCapturing();
    await context.run();
    document.undo.undo();
    expect(document.get(context.id)).toBeNull();
    document.undo.redo();
    expect(context.stored()).toBe(true);
  });
});
