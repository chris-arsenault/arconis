import { describe, expect, it } from "vitest";
import {
  decodePicture,
  encodePicture,
  fitWithin,
  isPictureHash,
  isPictureType,
  pictureHashes,
  renamePictures,
  sha256,
} from "./pictures";
import type { Item } from "./types";

const BYTES = new Uint8Array([1, 2, 3, 4]);

it("hashes bytes in both forms storage needs", async () => {
  const { hex, base64 } = await sha256(new TextEncoder().encode("abc"));
  expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(base64).toBe("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
});

describe("validation of what peers write", () => {
  it("accepts only a full lowercase hash, so nothing else can become a path", () => {
    expect(isPictureHash("a".repeat(64))).toBe(true);
    for (const bad of [
      "a".repeat(63),
      "A".repeat(64),
      "../../etc/passwd",
      `${"a".repeat(64)}/x`,
      5,
    ])
      expect(isPictureHash(bad)).toBe(false);
  });

  it("accepts only image types a browser cannot run", () => {
    expect(isPictureType("image/webp")).toBe(true);
    expect(isPictureType("image/svg+xml")).toBe(false);
    expect(isPictureType("text/html")).toBe(false);
  });
});

it("fits a picture within a limit, keeping its proportions", () => {
  expect(fitWithin(8000, 4000, 4096)).toEqual({ width: 4096, height: 2048 });
  expect(fitWithin(100, 50, 4096)).toEqual({ width: 100, height: 50 });
});

const pictureItem = (hash: string, stored = false) =>
  ({ id: "p", type: "picture", picture: { hash, format: "image/png", stored } }) as Item;

it("lists each picture once, ignoring invalid ones", () => {
  const hash = "b".repeat(64);
  expect(pictureHashes([pictureItem(hash), pictureItem(hash), pictureItem("nope")])).toEqual([
    hash,
  ]);
});

it("points items at renamed pictures, which have not reached storage under that name", () => {
  const [a, b] = ["a".repeat(64), "b".repeat(64)];
  const picture = pictureItem(a, true);
  const other = { id: "o", type: "node" } as Item;
  const [renamed, untouched] = renamePictures([picture, other], new Map([[a, b]]));
  expect(renamed.picture).toEqual({ hash: b, format: "image/png", stored: false });
  expect(untouched).toBe(other);
  expect(picture.picture?.hash).toBe(a);
});

describe("pictures in files", () => {
  it("round trips, and refuses bytes that do not match their name", async () => {
    const { hex } = await sha256(BYTES);
    const encoded = encodePicture(hex, "image/png", BYTES);
    const decoded = await decodePicture(encoded);
    expect(decoded?.hash).toBe(hex);
    expect([...decoded!.bytes]).toEqual([...BYTES]);
    expect(await decodePicture({ ...encoded, hash: "c".repeat(64) })).toBeNull();
    expect(await decodePicture({ ...encoded, type: "image/svg+xml" })).toBeNull();
    expect(await decodePicture(null)).toBeNull();
  });
});
