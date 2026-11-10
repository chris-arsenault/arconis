import { describe, expect, it, vi } from "vitest";
import type { UploadRequest } from "../collaboration/serviceProtocol";
import { MAX_PICTURE_BYTES } from "../document/pictures";
import { STORAGE_LIMIT_BYTES, Uploads, type StoredPictures } from "./uploads";

const HASH = "a".repeat(64);
const request = (values: Partial<UploadRequest> = {}): UploadRequest => ({
  hash: HASH,
  type: "application/octet-stream",
  size: 1000,
  checksum: "abc=",
  ...values,
});

describe("retrying picture uploads", () => {
  it("issues another link for an incomplete upload without charging its reservation twice", async () => {
    const { uploads, storage } = setup([["b".repeat(64), STORAGE_LIMIT_BYTES - 1000]]);
    expect((await uploads.prepare(request())).status).toBe("upload");
    expect((await uploads.prepare(request())).status).toBe("upload");
    expect(storage.sign).toHaveBeenCalledTimes(2);
    expect((await uploads.prepare(request({ hash: "c".repeat(64) }))).status).toBe("refused");
    expect((await uploads.prepare(request({ size: 2000 }))).status).toBe("refused");
  });

  it("shares concurrent signing and releases the reservation if signing fails", async () => {
    const { uploads, storage } = setup([["b".repeat(64), STORAGE_LIMIT_BYTES - 1000]]);
    let fail!: (reason: Error) => void;
    vi.mocked(storage.sign).mockImplementationOnce(
      () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        })
    );
    const first = uploads.prepare(request());
    const second = uploads.prepare(request());
    await Promise.resolve();
    await Promise.resolve();
    fail(new Error("Signing unavailable"));
    expect((await Promise.allSettled([first, second])).map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(storage.sign).toHaveBeenCalledOnce();
    expect((await uploads.prepare(request({ hash: "c".repeat(64) }))).status).toBe("upload");
  });

  it("retains an already issued link's capacity when a later signing attempt fails", async () => {
    const { uploads, storage } = setup([["b".repeat(64), STORAGE_LIMIT_BYTES - 1000]]);
    await uploads.prepare(request());
    vi.mocked(storage.sign).mockRejectedValueOnce(new Error("Signing unavailable"));
    await expect(uploads.prepare(request())).rejects.toThrow("Signing unavailable");
    expect((await uploads.prepare(request({ hash: "c".repeat(64) }))).status).toBe("refused");
    expect((await uploads.prepare(request())).status).toBe("upload");
  });
});

function setup(stored: [string, number][] = []) {
  const storage = {
    list: vi.fn(() => Promise.resolve(new Map(stored))),
    sign: vi.fn((upload: UploadRequest) => Promise.resolve(`https://s3/${upload.hash}`)),
  } satisfies StoredPictures;
  return { storage, uploads: new Uploads(storage) };
}

describe("deciding uploads", () => {
  it("signs a new picture", async () => {
    const { uploads } = setup();
    expect(await uploads.prepare(request())).toEqual({
      status: "upload",
      hash: HASH,
      url: `https://s3/${HASH}`,
    });
  });

  it("does not store the same picture twice", async () => {
    const { uploads, storage } = setup([[HASH, 1000]]);
    expect(await uploads.prepare(request())).toEqual({ status: "stored", hash: HASH });
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it("refuses past the storage limit, counting what it has signed since starting", async () => {
    const { uploads } = setup([["b".repeat(64), STORAGE_LIMIT_BYTES - 1500]]);
    expect((await uploads.prepare(request({ hash: "c".repeat(64) }))).status).toBe("upload");
    expect(await uploads.prepare(request({ hash: "d".repeat(64) }))).toEqual({
      status: "refused",
      hash: "d".repeat(64),
      reason: "limit",
    });
  });

  it("totals storage only once", async () => {
    const { uploads, storage } = setup();
    await uploads.prepare(request({ hash: "c".repeat(64) }));
    await uploads.prepare(request({ hash: "d".repeat(64) }));
    expect(storage.list).toHaveBeenCalledOnce();
  });

  it.each([
    ["a path instead of a hash", { hash: "../../etc/passwd" }],
    ["active content", { type: "image/svg+xml" }],
    ["html", { type: "text/html" }],
    ["an unencrypted image", { type: "image/webp" }],
    ["too many bytes", { size: MAX_PICTURE_BYTES * 2 }],
    ["no bytes", { size: 0 }],
    ["a fractional size", { size: 1.5 }],
  ])("refuses %s", async (_, values) => {
    const { uploads, storage } = setup();
    expect((await uploads.prepare(request(values))).status).toBe("refused");
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it("does not count a picture whose link could not be signed", async () => {
    const { uploads, storage } = setup();
    vi.mocked(storage.sign).mockRejectedValueOnce(new Error("signing failed"));
    await expect(uploads.prepare(request())).rejects.toThrow();
    expect((await uploads.prepare(request())).status).toBe("upload");
  });
});
