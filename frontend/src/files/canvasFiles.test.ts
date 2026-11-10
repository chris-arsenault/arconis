import { afterEach, expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { readCopy } from "../document/pngCopy";
import { PictureStore, type PictureCodec, type StoredPicture } from "../collaboration/pictureStore";
import { generateRoomKey, seal, unseal } from "../collaboration/roomKey";
import { CanvasFiles } from "./canvasFiles";
import { importDocument } from "./canvasFile";
import { addComment, listComments } from "../document/comments";
import { sha256 } from "../document/pictures";

const BYTES = new Uint8Array([1, 2, 3]);
const TEST_CODEC: PictureCodec = { seal: async (bytes) => bytes, open: async (bytes) => bytes };
const MARKDOWN = "# 日本語\n\n```python\nprint(1)\n```\n\n$x^2$";
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  ),
  (character) => character.charCodeAt(0)
);
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

function workspace(codec: PictureCodec = TEST_CODEC) {
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

it("inserts independent library sections with pictures and internal references without replacing destination metadata", async () => {
  const source = workspace();
  const target = workspace();
  source.document.meta.set("title", "Source title");
  source.document.styles.set("shared", { fill: "#ff0000" });
  source.document.create("frame", 20, 20, { id: "holder", name: "Layout frame" });
  source.document.create("node", 40, 50, {
    id: "source_node",
    name: "Styled item",
    inside: "holder",
    style: "shared",
  });
  const hash = await source.pictures.add(PIXEL, "image/png");
  source.document.create("picture", 210, 50, {
    id: "photo",
    name: "Layout picture",
    inside: "holder",
    picture: { hash, format: "image/png", stored: false },
  });
  source.document.create("line", 0, 0, {
    id: "wire",
    from: "source_node",
    to: "photo",
    inside: "holder",
  });
  target.document.meta.set("title", "Destination title");
  target.document.styles.set("shared", { fill: "#0000ff" });
  target.document.create("note", 0, 0, { id: "existing", name: "Keep this" });
  const text = await source.files.canvas(["holder"]);
  const first = await target.files.insertSection(text, () => {});
  const second = await target.files.insertSection(text, () => {});
  expect(first).toHaveLength(4);
  expect(second.some((id) => first.includes(id))).toBe(false);
  expect(first.some((id) => source.document.items.has(id))).toBe(false);
  expect(target.document.title()).toBe("Destination title");
  expect(target.document.styles.get("shared")).toEqual({ fill: "#0000ff" });
  const inserted = first.map((id) => target.document.get(id)!);
  const line = inserted.find((item) => item.type === "line")!;
  expect(first).toContain(line.from);
  expect(first).toContain(line.to);
  expect(inserted.find((item) => item.name === "Styled item")?.look.fill).toBe("#ff0000");
  expect(
    await target.pictures.readOpen(inserted.find((item) => item.type === "picture")!.picture!.hash)
  ).toEqual({ bytes: PIXEL, type: "image/png" });
  target.document.undo.undo();
  expect(second.every((id) => !target.document.items.has(id))).toBe(true);
  expect(first.every((id) => target.document.items.has(id))).toBe(true);
  expect(target.document.items.has("existing")).toBe(true);
});

it.each([false, true])(
  "keeps copied layout object links within the inserted copy, same room=%s",
  async (sameRoom) => {
    const source = workspace();
    const target = sameRoom ? source : workspace();
    source.document.create("note", 0, 0, { id: "Storage_A", name: "Storage" });
    source.document.create("note", 100, 0, {
      id: "reader",
      name: "[Inline](canvas://Storage_A) [Local](local://Storage_A/) [Ref][store]\n\n[store]: CANVAS://Storage_A/\n\n[Outside](canvas://outside) [Web](https://example.com/?url=canvas://Storage_A)",
      link: "local://Storage_A/",
    });
    source.document.create("note", 200, 0, {
      id: "bare",
      name: "Bare link",
      link: "Storage_A",
    });
    const created = await target.files.insertSection(
      await source.files.canvas(["Storage_A", "reader", "bare"]),
      () => {}
    );
    const items = created.map((id) => target.document.get(id)!);
    const storage = items.find((item) => item.name === "Storage")!;
    const reader = items.find((item) => item.name.startsWith("[Inline]"))!;
    expect(storage.id).not.toBe("Storage_A");
    expect(reader.name).toBe(
      `[Inline](canvas://${storage.id}) [Local](canvas://${storage.id}) [Ref][store]\n\n[store]: canvas://${storage.id}\n\n[Outside](canvas://outside) [Web](https://example.com/?url=canvas://Storage_A)`
    );
    expect(reader.link).toBe(`canvas://${storage.id}`);
    expect(items.find((item) => item.name === "Bare link")?.link).toBe(storage.id);
    if (sameRoom) expect(source.document.get("Storage_A")?.name).toBe("Storage");
  }
);

it("translates picture storage hashes without rewriting authored text on export or import", async () => {
  const key = await generateRoomKey();
  const codec = {
    seal: (bytes: Uint8Array) => seal(key, bytes),
    open: (bytes: Uint8Array) => unseal(key, bytes),
  };
  const source = workspace(codec);
  const storedHash = await source.pictures.add(BYTES, "image/png");
  const { hex: portableHash } = await sha256(BYTES);
  const text = `Stored checksum: ${storedHash}\nPortable checksum: ${portableHash}`;
  const url = `https://example.test/${storedHash}/${portableHash}`;
  source.document.rename(text);
  source.document.create("picture", 0, 0, {
    id: "photo",
    name: text,
    link: url,
    properties: { checksum: storedHash },
    picture: { hash: storedHash, format: "image/png", stored: true },
  });
  addComment(source.document, { on: "photo", author: "Author", text });

  const exported = await source.files.canvas();
  const portable = workspace();
  importDocument(portable.document, exported);
  expect(portable.document.get("photo")?.picture?.hash).toBe(portableHash);
  const restored = workspace(codec);
  await restored.files.import(new File([exported], "checksums.arconis"));
  expect(restored.document.get("photo")?.picture?.hash).not.toBe(portableHash);
  for (const copy of [portable, restored]) {
    expect(copy.document.title()).toBe(text);
    expect(copy.document.get("photo")).toMatchObject({
      name: text,
      link: url,
      properties: { checksum: storedHash },
    });
    expect(listComments(copy.document)[0]?.text).toBe(text);
  }
  expect(source.document.get("photo")?.picture?.hash).toBe(storedHash);
});

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
        : TEST_CODEC
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

it("omits annotations from clean file and embedded PNG copies, including an all-markup selection", async () => {
  const source = workspace();
  source.document.create("note", 0, 0, { id: "note", name: "Workspace" });
  source.document.create("drawing", 0, 0, {
    id: "ink",
    markup: true,
    points: [
      [0, 0],
      [20, 20],
    ],
  });
  source.document.create("highlight", 0, 0, { id: "outline", target: "note", markup: true });
  const restored = workspace();
  importDocument(restored.document, await source.files.canvas([], false));
  expect(restored.document.list().map((item) => item.id)).toEqual(["note"]);
  const png = await source.files.png(["ink"], () => Promise.resolve(PIXEL), false);
  const empty = workspace();
  importDocument(empty.document, (await readCopy(png!))!);
  expect(empty.document.list()).toEqual([]);
  expect(await source.files.canvas()).toContain("drawing ink");
});

it("exports a selected highlight and its target as a self-contained editable file", async () => {
  const source = workspace();
  source.document.create("note", 500, 500, { id: "target", name: "Target" });
  source.document.create("highlight", 0, 0, { id: "outline", target: "target", markup: true });
  const target = workspace();
  importDocument(target.document, await source.files.canvas(["outline"]));
  expect(
    target.document
      .list()
      .map((item) => item.id)
      .sort((left, right) => left.localeCompare(right))
  ).toEqual(["outline", "target"]);
  const selected = await source.files.canvas(["target"]);
  expect(selected).toContain("highlight outline");
  expect(await source.files.canvas(["target"], false)).not.toContain("highlight outline");
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
