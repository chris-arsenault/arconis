import { expect, it } from "vitest";
import { embedCopy, isPng, readCopy } from "./pngCopy";

// A valid one-pixel PNG.
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  ),
  (character) => character.charCodeAt(0)
);

it("round trips a document through a picture, including text outside Latin-1", async () => {
  const document = JSON.stringify({ format: "arconis", objects: [{ label: "日本語 ✓" }] });
  const png = await embedCopy(PIXEL, document);
  expect(isPng(png)).toBe(true);
  expect(await readCopy(png)).toBe(document);
});

it("leaves the picture valid, with the copy before the end chunk", async () => {
  const png = await embedCopy(PIXEL, "{}");
  const tail = String.fromCharCode(...png.subarray(png.length - 8, png.length - 4));
  expect(tail).toBe("IEND");
  expect(png.subarray(0, PIXEL.length - 12)).toEqual(PIXEL.subarray(0, PIXEL.length - 12));
});

it("compresses a large document", async () => {
  const document = JSON.stringify({ objects: Array(5000).fill({ label: "repeated" }) });
  const png = await embedCopy(PIXEL, document);
  expect(png.length).toBeLessThan(document.length / 10);
  expect(await readCopy(png)).toBe(document);
});

it("reports a picture with no copy", async () => {
  expect(await readCopy(PIXEL)).toBeNull();
});

it("rejects other files and survives truncated ones", async () => {
  expect(isPng(new TextEncoder().encode('{"format":"arconis"}'))).toBe(false);
  const png = await embedCopy(PIXEL, "{}");
  expect(await readCopy(png.subarray(0, 40))).toBeNull();
});

it("refuses a corrupted copy rather than loading it", async () => {
  const png = await embedCopy(PIXEL, JSON.stringify({ objects: Array(100).fill("x") }));
  const damaged = new Uint8Array(png);
  damaged[PIXEL.length - 12 + 30] ^= 0xff;
  await expect(readCopy(damaged)).rejects.toThrow();
});
