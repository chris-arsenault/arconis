import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "../document/pictures";
import { PictureStore, type PictureShelf, type StoredPicture } from "./pictureStore";

const BYTES = new Uint8Array([1, 2, 3]);

function memoryShelf(): PictureShelf & { data: Map<string, StoredPicture> } {
  const data = new Map<string, StoredPicture>();
  return {
    data,
    get: (hash) => Promise.resolve(data.get(hash)),
    put: (hash, picture) => {
      data.set(hash, picture);
      return Promise.resolve();
    },
  };
}

function setup(download: ((hash: string) => Promise<Uint8Array | null>) | null = null) {
  const shelf = memoryShelf();
  const createUrl = vi.fn((bytes: Uint8Array) => `blob:${bytes.length}`);
  const store = new PictureStore({
    shelf,
    codec: { seal: async (bytes) => bytes, open: async (bytes) => bytes },
    download,
    createUrl,
    revokeUrl: vi.fn(),
  });
  return { store, shelf, createUrl };
}

afterEach(() => vi.useRealTimers());

describe("loading", () => {
  it("draws a picture kept on this device with no fetch", async () => {
    const download = vi.fn(() => Promise.resolve(null));
    const { store } = setup(download);
    const hash = await store.add(BYTES, "image/png");
    const ready = new Promise<void>((resolve) => store.subscribe(resolve));
    expect(store.url(hash, "image/png", true)).toBeNull();
    await ready;
    expect(store.url(hash, "image/png", true)).toBe("blob:3");
    expect(download).not.toHaveBeenCalled();
  });

  it("fetches once, verifies the bytes, and keeps them", async () => {
    const { hex } = await sha256(BYTES);
    const download = vi.fn(() => Promise.resolve(BYTES));
    const { store, shelf } = setup(download);
    const ready = new Promise<void>((resolve) => store.subscribe(resolve));
    store.url(hex, "image/png", true);
    store.url(hex, "image/png", true);
    await ready;
    store.url(hex, "image/png", true);
    expect(download).toHaveBeenCalledOnce();
    expect(shelf.data.has(hex)).toBe(true);
  });

  it("does not ask storage before the picture has reached it", async () => {
    const download = vi.fn(() => Promise.resolve(BYTES));
    const { store } = setup(download);
    store.url("a".repeat(64), "image/png", false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(download).not.toHaveBeenCalled();
  });

  it("fetches when word of storage arrives during the first local lookup", async () => {
    const { hex } = await sha256(BYTES);
    const download = vi.fn(() => Promise.resolve(BYTES));
    const { store, createUrl } = setup(download);
    store.url(hex, "image/png", false);
    store.url(hex, "image/png", true);
    await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
    expect(download).toHaveBeenCalledOnce();
  });

  it("refuses bytes that do not match the hash, such as the app served for a missing key", async () => {
    vi.useFakeTimers();
    const html = new TextEncoder().encode("<!doctype html>");
    const download = vi.fn(() => Promise.resolve(html));
    const { store, shelf, createUrl } = setup(download);
    const hash = "a".repeat(64);
    store.url(hash, "image/png", true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(createUrl).not.toHaveBeenCalled();
    expect(shelf.data.has(hash)).toBe(false);
    expect(download.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("retries until an upload arrives", async () => {
    vi.useFakeTimers();
    const { hex } = await sha256(BYTES);
    const download = vi.fn<() => Promise<Uint8Array | null>>().mockResolvedValueOnce(null);
    download.mockResolvedValue(BYTES);
    const { store, createUrl } = setup(download);
    store.url(hex, "image/png", true);
    await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce(), { timeout: 10_000 });
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("survives a network failure, and stops asking", async () => {
    vi.useFakeTimers();
    const download = vi.fn(() => Promise.reject(new Error("offline")));
    const { store, createUrl } = setup(download);
    store.url("a".repeat(64), "image/png", true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(createUrl).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(6);
  });
});

describe("codecs", () => {
  it("stores the sealed form, names it by that form, and opens it to draw", async () => {
    const shelf = memoryShelf();
    const createUrl = vi.fn((bytes: Uint8Array) => `blob:${bytes[0]}`);
    const store = new PictureStore({
      shelf,
      download: null,
      createUrl,
      revokeUrl: vi.fn(),
      codec: {
        seal: (bytes) => Promise.resolve(bytes.map((byte) => byte + 100)),
        open: (bytes) => Promise.resolve(bytes.map((byte) => byte - 100)),
      },
    });
    const hash = await store.add(BYTES, "image/png");
    expect(hash).toBe((await sha256(new Uint8Array([101, 102, 103]))).hex);
    expect([...shelf.data.get(hash)!.bytes]).toEqual([101, 102, 103]);
    const ready = new Promise<void>((resolve) => store.subscribe(resolve));
    store.url(hash, "image/png", false);
    await ready;
    expect(store.url(hash, "image/png", false)).toBe("blob:1");
  });
});
