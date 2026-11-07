/**
 * A PNG can carry a copy of the document, so a picture of a canvas can be loaded again, as draw.io's
 * does. The copy sits in a standard compressed text chunk, which image viewers ignore.
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const KEYWORD = "arconis-document";
const CHUNK_TEXT = "iTXt";
const CHUNK_END = "IEND";
/** Decompressed size that a copy may reach, which stops a crafted file exhausting memory. */
const MAX_COPY_BYTES = 256 * 1024 * 1024;

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream) {
  const pair = transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  const reader = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(pair).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_COPY_BYTES) {
      await reader.cancel();
      throw new Error("The canvas inside this picture is too large to load.");
    }
    parts.push(value);
  }
  return join(parts);
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function chunk(type: string, data: Uint8Array) {
  const typed = join([new TextEncoder().encode(type), data]);
  const result = new Uint8Array(typed.length + 8);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(typed, 4);
  view.setUint32(typed.length + 4, crc32(typed));
  return result;
}

export function isPng(bytes: Uint8Array) {
  return SIGNATURE.every((value, index) => bytes[index] === value);
}

interface Chunk {
  type: string;
  /** Where the chunk's length field begins. */
  start: number;
  data: Uint8Array;
}

function* chunks(bytes: Uint8Array): Generator<Chunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let start = SIGNATURE.length;
  while (start + 12 <= bytes.length) {
    const length = view.getUint32(start);
    const end = start + 12 + length;
    if (end > bytes.length) return;
    const type = String.fromCharCode(...bytes.subarray(start + 4, start + 8));
    yield { type, start, data: bytes.subarray(start + 8, start + 8 + length) };
    start = end;
  }
}

/** Returns the PNG with the document added just before its end. */
export async function embedCopy(png: Uint8Array, document: string) {
  const end = [...chunks(png)].find((item) => item.type === CHUNK_END);
  if (!end) throw new Error("The exported picture could not be read.");
  const encoder = new TextEncoder();
  // iTXt: keyword, NUL, compressed flag, method, empty language, NUL, empty translation, NUL, text.
  const header = join([encoder.encode(KEYWORD), new Uint8Array([0, 1, 0, 0, 0])]);
  const text = await pipe(encoder.encode(document), new CompressionStream("deflate"));
  const added = chunk(CHUNK_TEXT, join([header, text]));
  return join([png.subarray(0, end.start), added, png.subarray(end.start)]);
}

/** Returns the document inside a PNG, or null if it has none. */
export async function readCopy(png: Uint8Array) {
  const header = new TextEncoder().encode(KEYWORD);
  for (const { type, data } of chunks(png)) {
    if (type !== CHUNK_TEXT) continue;
    if (!header.every((value, index) => data[index] === value)) continue;
    const text = data.subarray(header.length + 5);
    const inflated = await pipe(text, new DecompressionStream("deflate"));
    return new TextDecoder().decode(inflated);
  }
  return null;
}
