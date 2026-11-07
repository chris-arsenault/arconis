import { it, expect, vi } from "vitest";
import { CollaborationProvider } from "./provider";
import { CanvasDocument } from "../document/canvasDocument";
import type { ConnectionState, Transport } from "./transport";
import { FrameAssembler, frames } from "./frames";
import { parseRoom, createRoomId } from "./room";

class Bus implements Transport {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState) => void = () => {};
  connected = false;
  constructor(private peers: Bus[]) {
    peers.push(this);
  }
  connect() {
    this.connected = true;
    this.onReady();
  }
  send(message: string) {
    if (this.connected)
      this.peers
        .filter((peer) => peer !== this && peer.connected)
        .forEach((peer) => peer.onMessage(message));
  }
  close() {
    this.connected = false;
  }
}

it("late joins and resynchronizes offline edits in both directions", () => {
  const peers: Bus[] = [];
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const id = a.create("sticky", 0, 0, { label: "hello" });
  const first = new CollaborationProvider(a.doc, new Bus(peers), () => {});
  const second = new CollaborationProvider(b.doc, new Bus(peers), () => {});
  first.connect();
  second.connect();
  expect(b.get(id)?.label).toBe("hello");
  second.transport.close();
  a.patch(id, { x: 100 });
  b.patch(id, { y: 200 });
  second.connect();
  expect(a.get(id)).toMatchObject({ x: 100, y: 200 });
  expect(a.list()).toEqual(b.list());
  first.destroy();
  second.destroy();
  a.destroy();
  b.destroy();
});

it("reports searching, then alone, then synced once a peer answers", () => {
  vi.useFakeTimers();
  try {
    const peers: Bus[] = [];
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    const id = a.create("sticky", 0, 0, { label: "held by first" });
    const first = new CollaborationProvider(a.doc, new Bus(peers), () => {});
    first.connect();
    expect(first.sync).toBe("searching");
    vi.advanceTimersByTime(7000);
    expect(first.sync).toBe("alone");
    const second = new CollaborationProvider(b.doc, new Bus(peers), () => {});
    second.connect();
    expect(second.sync).toBe("synced");
    expect(first.sync).toBe("synced");
    expect(b.get(id)?.label).toBe("held by first");
    second.disconnected();
    expect(second.sync).toBe("idle");
    first.destroy();
    second.destroy();
    a.destroy();
    b.destroy();
  } finally {
    vi.useRealTimers();
  }
});

it("repeats an unanswered join request so a lost message cannot strand a late joiner", () => {
  vi.useFakeTimers();
  try {
    const peers: Bus[] = [];
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    const id = a.create("sticky", 0, 0, { label: "survives a lost hello" });
    const first = new CollaborationProvider(a.doc, new Bus(peers), () => {});
    first.connect();
    const dropping = new Bus(peers);
    const send = dropping.send.bind(dropping);
    let drops = 2;
    dropping.send = (message) => {
      if (drops-- <= 0) send(message);
    };
    const second = new CollaborationProvider(b.doc, dropping, () => {});
    second.connect();
    expect(b.get(id)).toBeNull();
    vi.advanceTimersByTime(2500);
    expect(b.get(id)?.label).toBe("survives a lost hello");
    expect(second.sync).toBe("synced");
    first.destroy();
    second.destroy();
    a.destroy();
    b.destroy();
  } finally {
    vi.useRealTimers();
  }
});

it("bounds chunks and reconstructs a large state out of order", () => {
  const data = new Uint8Array(900000).map((_, index) => index % 251);
  const chunks = frames("first", "update", data);
  expect(chunks.every((chunk) => new TextEncoder().encode(chunk).length < 240000)).toBe(true);
  const assembler = new FrameAssembler();
  const reversed = [...chunks];
  reversed.reverse();
  const result = reversed.map((chunk) => assembler.receive(chunk, "second")).filter(Boolean);
  expect(result).toHaveLength(1);
  expect(result[0]!.data).toEqual(data);
  expect(assembler.receive(chunks[0], "first")).toBeNull();
  expect(assembler.receive('{"v":1}', "second")).toBeNull();
});

it("uses high entropy room IDs and accepts shared URLs", () => {
  const id = createRoomId();
  expect(id).toMatch(/^[a-f0-9]{48}$/);
  expect(createRoomId()).not.toBe(id);
  expect(parseRoom(`https://arconis.ahara.io/#room=${id}`)).toBe(id);
  expect(parseRoom("123456")).toBeNull();
});
