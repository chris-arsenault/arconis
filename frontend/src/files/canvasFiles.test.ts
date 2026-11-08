import { afterEach, expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { readCopy } from "../document/pngCopy";
import {
  PLAIN_CODEC,
  PictureStore,
  type PictureCodec,
  type StoredPicture,
} from "../collaboration/pictureStore";
import { generateRoomKey, seal, unseal } from "../collaboration/roomKey";
import { CanvasFiles } from "./canvasFiles";
import { importDocument } from "./canvasFile";

const BYTES = new Uint8Array([1, 2, 3]);
const MARKDOWN = "# 日本語\n\n```python\nprint(1)\n```\n\n$x^2$";
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  ),
  (character) => character.charCodeAt(0)
);
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

function workspace(codec: PictureCodec = PLAIN_CODEC) {
  const document = new CanvasDocument();
  const shelf = new Map<string, StoredPicture>();
  const pictures = new PictureStore({
    shelf: {
      get: (hash) => Promise.resolve(shelf.get(hash)),
      put: (hash, picture) => {
        shelf.set(hash, picture);
        return Promise.resolve();
      },
    },
    codec,
    download: null,
    createUrl: () => "blob:test",
    revokeUrl: () => {},
  });
  const lifetime = new AbortController();
  const imported = vi.fn();
  const files = new CanvasFiles(document, pictures, lifetime.signal, imported);
  cleanups.push(() => {
    lifetime.abort();
    pictures.close();
    document.destroy();
  });
  return { document, pictures, files, lifetime, imported, shelf };
}

it.each([false, true])(
  "imports portable pictures through the destination codec, encrypted=%s, and exports plain hashes",
  async (encrypted) => {
    const source = workspace();
    const hash = await source.pictures.add(BYTES, "image/png");
    source.document.create("picture", 10, 20, {
      id: "photo",
      name: MARKDOWN,
      picture: { hash, format: "image/png", stored: false },
    });
    const text = await source.files.canvas();
    const key = await generateRoomKey();
    const target = workspace(
      encrypted
        ? { seal: (bytes) => seal(key, bytes), open: (bytes) => unseal(key, bytes) }
        : PLAIN_CODEC
    );
    target.document.create("note", 0, 0, { id: "photo", name: "Existing item" });
    const count = await target.files.import(new File([text], "copy.arconis"));
    expect(count).toBe(1);
    expect(target.imported).toHaveBeenCalledOnce();
    expect(target.document.get("photo")!.name).toBe("Existing item");
    const picture = target.document.list().find((item) => item.type === "picture")!;
    expect(picture.name).toBe(MARKDOWN);
    expect(picture.picture!.stored).toBe(false);
    expect(await target.pictures.readOpen(picture.picture!.hash)).toEqual({
      bytes: BYTES,
      type: "image/png",
    });
    if (encrypted) {
      expect(picture.picture?.hash).not.toBe(hash);
      expect(target.shelf.get(picture.picture!.hash)?.bytes).not.toEqual(BYTES);
    } else expect(picture.picture?.hash).toBe(hash);
    const exported = await target.files.canvas();
    expect(exported).toContain(hash);
    if (encrypted) expect(exported).not.toContain(picture.picture!.hash);
    const copy = workspace();
    await copy.files.import(new File([exported], "portable.arconis"));
    expect(copy.document.list().find((item) => item.type === "picture")?.picture?.hash).toBe(hash);
    expect(copy.document.list().find((item) => item.type === "picture")?.name).toBe(MARKDOWN);
  }
);

it("embeds only the selected source in a rendered PNG and imports its exact text", async () => {
  const source = workspace();
  source.document.create("note", 0, 0, { id: "chosen", name: MARKDOWN });
  source.document.create("note", 200, 0, { id: "other", name: "Outside selection" });
  const render = vi.fn(() => Promise.resolve(PIXEL));
  const png = await source.files.png(["chosen"], render);
  expect(render).toHaveBeenCalledOnce();
  const text = await readCopy(png!);
  const selected = workspace();
  importDocument(selected.document, text!);
  expect(selected.document.list().map((item) => item.name)).toEqual([MARKDOWN]);
  const target = workspace();
  await target.files.import(new File([new Uint8Array(png!)], "selection.png"));
  expect(target.document.list().map((item) => item.name)).toEqual([MARKDOWN]);
  const whole = workspace();
  importDocument(whole.document, await source.files.canvas());
  expect(whole.document.list()).toHaveLength(2);
});

it("does not mutate a departed room when a file read finishes later", async () => {
  const target = workspace();
  let finish!: (bytes: ArrayBuffer) => void;
  const file = new File(["unused"], "late.arconis");
  vi.spyOn(file, "arrayBuffer").mockImplementation(
    () => new Promise((resolve) => (finish = resolve))
  );
  const importing = target.files.import(file);
  target.lifetime.abort();
  finish(new TextEncoder().encode('arconis 1\ntext a "Late" at (0, 0)\n').buffer);
  await expect(importing).rejects.toMatchObject({ name: "AbortError" });
  expect(target.document.list()).toEqual([]);
  expect(target.imported).not.toHaveBeenCalled();
});

it("keeps failed imports out of the canvas and reports an empty render without building a file", async () => {
  const target = workspace();
  target.document.create("note", 0, 0, { name: "Retained" });
  await expect(target.files.import(new File(["node a"], "bad.arconis"))).rejects.toThrow(
    "Choose an Arconis canvas file"
  );
  expect(target.document.list().map((item) => item.name)).toEqual(["Retained"]);
  expect(target.imported).not.toHaveBeenCalled();
  expect(await target.files.png([], () => Promise.resolve(null))).toBeNull();
});
