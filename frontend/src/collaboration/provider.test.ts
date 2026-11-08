import { it, expect, vi } from "vitest";
import { CollaborationProvider, PRESENCE_INTERVAL_MS } from "./provider";
import { CanvasDocument } from "../document/canvasDocument";
import type { ConnectionState, FrameChannel } from "./channel";
import { CHUNK_BYTES, FrameAssembler, frames } from "./frames";
import { MAX_MESSAGE_BYTES } from "../relay/relay";
import { parseRoom, createRoomId, createLocalRoomId, isLocalRoom, roomHash } from "./room";

class Bus implements FrameChannel {
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
  const id = a.create("note", 0, 0, { name: "hello" });
  const first = new CollaborationProvider(a.doc, new Bus(peers), () => {});
  const second = new CollaborationProvider(b.doc, new Bus(peers), () => {});
  first.connect();
  second.connect();
  expect(b.get(id)?.name).toBe("hello");
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
    const id = a.create("note", 0, 0, { name: "held by first" });
    const first = new CollaborationProvider(a.doc, new Bus(peers), () => {});
    first.connect();
    expect(first.sync).toBe("searching");
    vi.advanceTimersByTime(7000);
    expect(first.sync).toBe("alone");
    const second = new CollaborationProvider(b.doc, new Bus(peers), () => {});
    second.connect();
    expect(second.sync).toBe("synced");
    expect(first.sync).toBe("synced");
    expect(b.get(id)?.name).toBe("held by first");
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
    const id = a.create("note", 0, 0, { name: "survives a lost hello" });
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
    expect(b.get(id)?.name).toBe("survives a lost hello");
    expect(second.sync).toBe("synced");
    first.destroy();
    second.destroy();
    a.destroy();
    b.destroy();
  } finally {
    vi.useRealTimers();
  }
});

it("repairs a lost deletion, which leaves state vectors equal, at the periodic exchange", () => {
  vi.useFakeTimers();
  try {
    const peers: Bus[] = [];
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    const id = a.create("note", 0, 0, { name: "doomed" });
    const busA = new Bus(peers);
    const first = new CollaborationProvider(a.doc, busA, () => {});
    const second = new CollaborationProvider(b.doc, new Bus(peers), () => {});
    first.connect();
    second.connect();
    expect(b.get(id)).not.toBeNull();
    const send = busA.send.bind(busA);
    busA.send = () => {};
    a.remove([id]);
    vi.advanceTimersByTime(100);
    busA.send = send;
    expect(b.get(id)).not.toBeNull();
    vi.advanceTimersByTime(30000);
    expect(b.get(id)).toBeNull();
    first.destroy();
    second.destroy();
    a.destroy();
    b.destroy();
  } finally {
    vi.useRealTimers();
  }
});

it("exchanges only vectors once peers match, however much history they hold", () => {
  vi.useFakeTimers();
  try {
    const peers: Bus[] = [];
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    const id = a.create("note", 0, 0, { name: "edited" });
    a.patch(id, { x: 5 });
    a.remove([a.create("note", 0, 0, {})]);
    const busA = new Bus(peers);
    const busB = new Bus(peers);
    const first = new CollaborationProvider(a.doc, busA, () => {});
    const second = new CollaborationProvider(b.doc, busB, () => {});
    first.connect();
    second.connect();
    vi.advanceTimersByTime(10000);
    const kinds: string[] = [];
    for (const bus of [busA, busB]) {
      const send = bus.send.bind(bus);
      bus.send = (message) => {
        kinds.push((JSON.parse(message) as { kind: string }).kind);
        send(message);
      };
    }
    vi.advanceTimersByTime(14000);
    kinds.length = 0;
    vi.advanceTimersByTime(30000);
    expect(kinds.filter((kind) => kind === "update" || kind === "hello")).toEqual([]);
    first.destroy();
    second.destroy();
    a.destroy();
    b.destroy();
  } finally {
    vi.useRealTimers();
  }
});

function presenceSetup() {
  vi.useFakeTimers();
  const peers: Bus[] = [];
  const doc = new CanvasDocument();
  const bus = new Bus(peers);
  const provider = new CollaborationProvider(doc.doc, bus, () => {});
  new Bus(peers).connected = true;
  provider.connect();
  vi.advanceTimersByTime(PRESENCE_INTERVAL_MS);
  const sent: string[] = [];
  const send = bus.send.bind(bus);
  bus.send = (message) => {
    const { kind } = JSON.parse(message) as { kind: string };
    if (kind === "awareness") sent.push(kind);
    send(message);
  };
  return { provider, doc, sent };
}

it("coalesces rapid cursor movement to a bounded rate", () => {
  try {
    const { provider, doc, sent } = presenceSetup();
    for (let step = 0; step < 100; step++) {
      provider.awareness.setLocalStateField("cursor", { x: step, y: 0 });
      vi.advanceTimersByTime(8);
    }
    expect(sent.length).toBeLessThanOrEqual(11);
    expect(sent.length).toBeGreaterThan(5);
    provider.destroy();
    doc.destroy();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a hidden tab's presence quiet until it is shown again", () => {
  const listeners: (() => void)[] = [];
  const page = {
    hidden: true,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: () => {},
  };
  vi.stubGlobal("document", page);
  try {
    const { provider, doc, sent } = presenceSetup();
    provider.awareness.setLocalStateField("cursor", { x: 1, y: 0 });
    vi.advanceTimersByTime(60_000);
    expect(sent).toEqual([]);
    page.hidden = false;
    listeners.forEach((listener) => listener());
    expect(sent).toHaveLength(1);
    provider.destroy();
    doc.destroy();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("splits a large state into frames the relay accepts, and reassembles it", () => {
  const data = new Uint8Array(CHUNK_BYTES * 3 - 1).map((_, index) => index % 251);
  const chunks = frames("first", "update", data);
  expect(chunks).toHaveLength(3);
  const sizes = chunks.map((chunk) => new TextEncoder().encode(chunk).length);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  const assembler = new FrameAssembler();
  const result = chunks.map((chunk) => assembler.receive(chunk, "second")).filter(Boolean);
  expect(result).toHaveLength(1);
  expect(Buffer.from(result[0]!.data).equals(Buffer.from(data))).toBe(true);
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

it("keeps device-only rooms distinct through their links", () => {
  const id = createLocalRoomId();
  expect(isLocalRoom(id)).toBe(true);
  expect(isLocalRoom(createRoomId())).toBe(false);
  expect(parseRoom(roomHash(id))).toBe(id);
  expect(parseRoom(`https://arconis.ahara.io/#${roomHash(id)}`)).toBe(id);
  const shared = createRoomId();
  expect(parseRoom(roomHash(shared))).toBe(shared);
});
