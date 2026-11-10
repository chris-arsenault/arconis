import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "../document/canvasDocument";
import { CollaborationProvider } from "./provider";
import type { FrameChannel } from "./channel";

class Link implements FrameChannel {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus = () => {};
  connected = false;
  sent: string[] = [];
  constructor(private peers: Link[]) {
    peers.push(this);
  }
  connect() {
    this.connected = true;
    this.onReady();
  }
  close() {
    this.connected = false;
  }
  send(message: string) {
    if (!this.connected) return;
    this.sent.push(message);
    this.peers
      .filter((peer) => peer !== this && peer.connected)
      .forEach((peer) => peer.onMessage(message));
  }
}
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((close) => close());
  vi.useRealTimers();
});
function person(peers: Link[]) {
  const document = new CanvasDocument();
  const link = new Link(peers);
  const provider = new CollaborationProvider(
    document.doc,
    link,
    () => {},
    undefined,
    document.actions
  );
  cleanup.push(() => {
    provider.destroy();
    document.destroy();
  });
  provider.connect();
  return { document, link, provider };
}

it("compares timed update delivery with completion for the same typing workload", () => {
  vi.useFakeTimers();
  const results: { completed: boolean; frames: number; bytes: number }[] = [];
  for (const completed of [false, true]) {
    const peers: Link[] = [];
    const a = person(peers);
    const id = a.document.create("note", 0, 0, { name: "Base" });
    const b = person(peers);
    vi.advanceTimersByTime(100);
    a.link.sent = [];
    const finish = completed ? a.document.actions.begin() : () => {};
    for (let step = 0; step < 20; step++) {
      a.document.editText(id, "Base" + "x".repeat(step + 1));
      vi.advanceTimersByTime(100);
    }
    finish();
    const sent = a.link.sent.filter(
      (message) => (JSON.parse(message) as { kind: string }).kind === "update"
    );
    results.push({
      completed,
      frames: sent.length,
      bytes: sent.reduce((bytes, message) => bytes + new TextEncoder().encode(message).length, 0),
    });
    expect(a.document.list()).toEqual(b.document.list());
  }
  expect(results.map((result) => result.frames)).toEqual([20, 1]);
  console.info("20 edits at 100 ms intervals; outbound update frames/serialized bytes:", results);
});

it("publishes a completed action once instead of each timed character and keeps receiving peers", () => {
  vi.useFakeTimers();
  const peers: Link[] = [];
  const a = person(peers);
  const id = a.document.create("note", 0, 0, { name: "Base" });
  const b = person(peers);
  vi.advanceTimersByTime(100);
  a.link.sent = [];
  const finish = a.document.actions.begin();
  for (let step = 0; step < 20; step++) {
    a.document.editText(id, "Base" + "x".repeat(step + 1));
    vi.advanceTimersByTime(100);
  }
  b.document.doc.transact(() => b.document.text(id)!.insert(0, "Peer "));
  vi.advanceTimersByTime(100);
  expect(a.document.get(id)?.name).toBe("Peer Base" + "x".repeat(20));
  expect(b.document.get(id)?.name).toBe("Peer Base");
  expect(
    a.link.sent.filter((message) => (JSON.parse(message) as { kind: string }).kind === "update")
  ).toHaveLength(0);
  finish();
  expect(
    a.link.sent.filter((message) => (JSON.parse(message) as { kind: string }).kind === "update")
  ).toHaveLength(1);
  expect(a.document.list()).toEqual(b.document.list());
});

it("does not expose unfinished edits through join or periodic state repair", () => {
  vi.useFakeTimers();
  const peers: Link[] = [];
  const a = person(peers);
  const id = a.document.create("note", 0, 0, { name: "Committed" });
  const b = person(peers);
  vi.advanceTimersByTime(100);
  const finish = a.document.actions.begin();
  a.document.editText(id, "Unfinished");
  const c = person(peers);
  vi.advanceTimersByTime(31000);
  expect(b.document.get(id)?.name).toBe("Committed");
  expect(c.document.get(id)?.name).toBe("Committed");
  finish();
  expect(b.document.get(id)?.name).toBe("Unfinished");
  expect(c.document.list()).toEqual(a.document.list());
});

it("lets a late joiner wait for the sole holder's completed action", () => {
  vi.useFakeTimers();
  const peers: Link[] = [];
  const a = person(peers);
  const id = a.document.create("note", 0, 0, { name: "Committed" });
  vi.advanceTimersByTime(100);
  const finish = a.document.actions.begin();
  a.document.editText(id, "Finished");
  const b = person(peers);
  vi.advanceTimersByTime(7000);
  expect(b.document.get(id)).toBeNull();
  finish();
  expect(b.document.get(id)?.name).toBe("Finished");
  expect(b.provider.sync).toBe("synced");
});

it("reconnects after completion and retains locally persisted CRDT changes", () => {
  vi.useFakeTimers();
  const peers: Link[] = [];
  const a = person(peers);
  const id = a.document.create("note", 0, 0, { name: "Before" });
  const b = person(peers);
  vi.advanceTimersByTime(100);
  a.link.close();
  a.provider.disconnected();
  const finish = a.document.actions.begin();
  a.document.editText(id, "After");
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(a.document.doc));
  expect(restored.getMap<Y.Map<unknown>>("items").get(id)?.get("name")?.toString()).toBe("After");
  restored.destroy();
  a.provider.connect();
  vi.advanceTimersByTime(5000);
  expect(b.document.get(id)?.name).toBe("Before");
  finish();
  expect(b.document.list()).toEqual(a.document.list());
});
