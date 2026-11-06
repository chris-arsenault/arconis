import { toBase64 as fromUint8Array, fromBase64 as toUint8Array } from "lib0/buffer";

export type MessageKind = "hello" | "vector" | "update" | "awareness";
export interface Frame {
  v: 1;
  from: string;
  id: string;
  kind: MessageKind;
  target: string;
  index: number;
  total: number;
  data: string;
}
export const CHUNK_BYTES = 32768;

export function frames(from: string, kind: MessageKind, data: Uint8Array, target = "") {
  const id = crypto.randomUUID();
  const total = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
  return Array.from({ length: total }, (_, index): string =>
    JSON.stringify({
      v: 1,
      from,
      id,
      kind,
      target,
      index,
      total,
      data: fromUint8Array(data.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)),
    } satisfies Frame)
  );
}

export class FrameAssembler {
  private pending = new Map<
    string,
    { time: number; frame: Frame; parts: Map<number, Uint8Array> }
  >();
  receive(message: string, ownId: string): { frame: Frame; data: Uint8Array } | null {
    let frame: Frame;
    try {
      frame = JSON.parse(message) as Frame;
    } catch {
      return null;
    }
    if (!accept(frame, ownId)) return null;
    this.expire();
    const key = `${frame.from}:${frame.id}`;
    if (!this.pending.has(key))
      this.pending.set(key, { time: Date.now(), frame, parts: new Map() });
    const transfer = this.pending.get(key)!;
    if (transfer.frame.total !== frame.total || transfer.frame.kind !== frame.kind) return null;
    try {
      transfer.parts.set(frame.index, toUint8Array(frame.data));
    } catch {
      return null;
    }
    if (transfer.parts.size !== frame.total) return null;
    const data = new Uint8Array(
      [...transfer.parts.values()].reduce((size, part) => size + part.length, 0)
    );
    let offset = 0;
    for (let i = 0; i < frame.total; i++) {
      const part = transfer.parts.get(i)!;
      data.set(part, offset);
      offset += part.length;
    }
    this.pending.delete(key);
    return { frame, data };
  }
  private expire() {
    this.pending.forEach((transfer, id) => {
      if (Date.now() - transfer.time > 60000) this.pending.delete(id);
    });
  }
}

function valid(frame: Frame) {
  return (
    validIdentity(frame) &&
    Number.isInteger(frame.index) &&
    Number.isSafeInteger(frame.total) &&
    frame.index >= 0 &&
    frame.total > 0 &&
    frame.index < frame.total &&
    typeof frame.data === "string" &&
    frame.data.length < 50000
  );
}

function validIdentity(frame: Frame) {
  return (
    frame?.v === 1 &&
    typeof frame.from === "string" &&
    typeof frame.id === "string" &&
    typeof frame.target === "string" &&
    ["hello", "vector", "update", "awareness"].includes(frame.kind)
  );
}
function accept(frame: Frame, ownId: string) {
  return valid(frame) && frame.from !== ownId && (!frame.target || frame.target === ownId);
}
