import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { socketText } from "./socketText";
import type { UploadReply, UploadRequest } from "../collaboration/serviceProtocol";
import { attachRelay } from "./attach";
import {
  BUDGET_CHECK_MS,
  IDLE_NO_CONNECTIONS_MS,
  IDLE_NO_CONTENT_MS,
  MAX_BUFFERED_BYTES,
  MAX_ROOM_CONNECTIONS,
  MAX_SESSION_BYTES,
  PEER_MESSAGE_BURST,
  Relay,
  type RelaySocket,
} from "./relay";

const ROOM = "a".repeat(48);
const MINUTE = 60_000;

class Socket implements RelaySocket {
  bufferedAmount = 0;
  sent: string[] = [];
  pings = 0;
  closed = false;
  terminated = false;
  send(data: string) {
    this.sent.push(data);
  }
  ping() {
    this.pings++;
  }
  close() {
    this.closed = true;
  }
  terminate() {
    this.terminated = true;
  }
}

function setup(withinBudget: () => Promise<boolean> = () => Promise.resolve(true)) {
  let time = 1_000_000;
  const stop = vi.fn();
  const uploads = {
    prepare: vi.fn((request: UploadRequest) =>
      Promise.resolve<UploadReply>({ status: "stored", hash: request.hash })
    ),
  };
  const relay = new Relay({ now: () => time, stop, withinBudget, uploads });
  return {
    uploads,
    relay,
    stop,
    advance: (ms: number) => {
      time += ms;
    },
    person: (id: string, fresh = false, room = ROOM) => {
      const socket = new Socket();
      const connection = relay.join(room, socket, fresh);
      return { id, socket, connection };
    },
  };
}

function frame(from: string, kind = "update", target = "") {
  return JSON.stringify({ v: 1, from, kind, target, data: "AA==" });
}

describe("forwarding", () => {
  it("sends a broadcast to everyone in the room except the sender", () => {
    const { person } = setup();
    const [a, b, c] = [person("a"), person("b"), person("c")];
    const other = person("d", false, "b".repeat(48));
    a.connection.receive(frame("a"));
    expect(a.socket.sent).toEqual([]);
    expect(b.socket.sent).toEqual([frame("a")]);
    expect(c.socket.sent).toEqual([frame("a")]);
    expect(other.socket.sent).toEqual([]);
  });

  it("sends a targeted message to one person", () => {
    const { person } = setup();
    const [a, b, c] = [person("a"), person("b"), person("c")];
    b.connection.receive(frame("b", "awareness"));
    c.connection.receive(frame("c", "awareness"));
    a.socket.sent = [];
    b.socket.sent = [];
    c.socket.sent = [];
    a.connection.receive(frame("a", "update", "b"));
    expect(b.socket.sent).toHaveLength(1);
    expect(c.socket.sent).toEqual([]);
  });

  it("sends a join request to one person, and a retry to the next", () => {
    const { person } = setup();
    const [a, b, c] = [person("a"), person("b"), person("c")];
    a.connection.receive(frame("a", "awareness"));
    b.connection.receive(frame("b", "awareness"));
    a.socket.sent = [];
    b.socket.sent = [];
    c.connection.receive(frame("c", "hello"));
    expect([a.socket.sent.length, b.socket.sent.length]).toEqual([1, 0]);
    c.connection.receive(frame("c", "hello"));
    expect([a.socket.sent.length, b.socket.sent.length]).toEqual([1, 1]);
  });

  it("sends a join request to everyone when nobody has spoken yet", () => {
    const { person } = setup();
    const [a, b, c] = [person("a"), person("b"), person("c")];
    a.connection.receive(frame("a", "hello"));
    expect(b.socket.sent).toHaveLength(1);
    expect(c.socket.sent).toHaveLength(1);
  });

  it("refuses to let a socket speak as another peer", () => {
    const { person } = setup();
    const [a, b] = [person("a"), person("b")];
    a.connection.receive(frame("a"));
    b.socket.sent = [];
    a.connection.receive(frame("b"));
    expect(b.socket.sent).toEqual([]);
  });

  it("drops unreadable messages and unknown kinds", () => {
    const { person } = setup();
    const [a, b] = [person("a"), person("b")];
    a.connection.receive("not json");
    a.connection.receive("null");
    a.connection.receive(frame("a", "surprise"));
    expect(b.socket.sent).toEqual([]);
  });
});

describe("picture uploads", () => {
  const ask = (hash = "a".repeat(64)) =>
    JSON.stringify({
      relay: "upload",
      request: { hash, type: "image/webp", size: 1, checksum: "x" },
    });

  it("answers only the asker, and tells nobody else", async () => {
    const { person, uploads } = setup();
    const [a, b] = [person("a"), person("b")];
    a.connection.receive(ask());
    await vi.waitFor(() => expect(a.socket.sent).toHaveLength(1));
    expect(JSON.parse(a.socket.sent[0])).toMatchObject({
      relay: "upload-reply",
      reply: { status: "stored" },
    });
    expect(uploads.prepare).toHaveBeenCalledOnce();
    expect(b.socket.sent).toEqual([]);
  });

  it("does not count as activity", () => {
    const { relay, person, advance, stop } = setup();
    const a = person("a");
    advance(IDLE_NO_CONTENT_MS - 1000);
    a.connection.receive(ask());
    a.connection.pong();
    advance(1000);
    relay.tick();
    expect(stop).toHaveBeenCalledWith("idle");
  });

  it("refuses rather than failing silently when deciding throws", async () => {
    const { person, uploads } = setup();
    uploads.prepare.mockRejectedValueOnce(new Error("storage unreachable"));
    const a = person("a");
    a.connection.receive(ask());
    await vi.waitFor(() => expect(a.socket.sent).toHaveLength(1));
    expect((JSON.parse(a.socket.sent[0]) as { reply: unknown }).reply).toMatchObject({
      status: "refused",
      reason: "unavailable",
    });
  });

  it("ignores malformed requests", () => {
    const { person, uploads } = setup();
    const a = person("a");
    a.connection.receive('{"relay":"upload"}');
    a.connection.receive('{"relay":');
    expect(uploads.prepare).not.toHaveBeenCalled();
  });
});

describe("limits", () => {
  it("refuses sockets past a room's size", () => {
    const { relay, person } = setup();
    for (let index = 0; index < MAX_ROOM_CONNECTIONS; index++) person(String(index));
    expect(relay.hasRoomFor(ROOM)).toBe(false);
    expect(relay.hasRoomFor("b".repeat(48))).toBe(true);
  });

  it("drops a sender's messages past its rate, then recovers", () => {
    const { person, advance } = setup();
    const [a, b] = [person("a"), person("b")];
    for (let index = 0; index < PEER_MESSAGE_BURST + 5; index++) a.connection.receive(frame("a"));
    expect(b.socket.sent).toHaveLength(PEER_MESSAGE_BURST);
    advance(1000);
    a.connection.receive(frame("a"));
    expect(b.socket.sent).toHaveLength(PEER_MESSAGE_BURST + 1);
  });

  it("drops a room's traffic past its egress rate", () => {
    const { person } = setup();
    const [a, b] = [person("a"), person("b")];
    person("c");
    person("d");
    const large = frame("a").replace("AA==", "A".repeat(60_000));
    for (let index = 0; index < PEER_MESSAGE_BURST; index++) a.connection.receive(large);
    const allowed = b.socket.sent.length;
    expect(allowed).toBeGreaterThan(100);
    expect(allowed).toBeLessThan(PEER_MESSAGE_BURST);
  });

  it("disconnects a client that has fallen behind", () => {
    const { person } = setup();
    const [a, b] = [person("a"), person("b")];
    b.socket.bufferedAmount = MAX_BUFFERED_BYTES + 1;
    a.connection.receive(frame("a"));
    expect(b.socket.terminated).toBe(true);
    expect(b.socket.sent).toEqual([]);
  });

  it("ends a session past its transfer ceiling", () => {
    const { person, stop, advance } = setup();
    const a = person("a");
    const others = Array.from({ length: MAX_ROOM_CONNECTIONS - 1 }, (_, i) => person(`p${i}`));
    const large = frame("a").replace("AA==", "A".repeat(60_000));
    const perMessage = 60_000 * others.length;
    for (let sent = 0; sent <= MAX_SESSION_BYTES && !stop.mock.calls.length; sent += perMessage) {
      advance(1000);
      a.connection.receive(large);
    }
    expect(stop).toHaveBeenCalledWith("limit");
  });
});

describe("idle rules", () => {
  it("stops after 10 minutes with no connections", () => {
    const { relay, stop, advance } = setup();
    advance(IDLE_NO_CONNECTIONS_MS - 1);
    relay.tick();
    expect(stop).not.toHaveBeenCalled();
    advance(1);
    relay.tick();
    expect(stop).toHaveBeenCalledWith("idle");
  });

  it("measures the 10 minutes from the last person leaving", () => {
    const { relay, stop, advance, person } = setup();
    const a = person("a");
    advance(5 * MINUTE);
    a.connection.leave();
    advance(IDLE_NO_CONNECTIONS_MS - 1);
    relay.tick();
    expect(stop).not.toHaveBeenCalled();
    advance(1);
    relay.tick();
    expect(stop).toHaveBeenCalledWith("idle");
  });

  it("stops after 30 minutes of connections with no contentful update", () => {
    const { relay, stop, advance, person } = setup();
    const [a, b] = [person("a"), person("b")];
    for (let minute = 1; minute < 30; minute++) {
      advance(MINUTE);
      a.connection.receive(frame("a", "awareness"));
      a.connection.receive(frame("a", "hello"));
      b.connection.receive(frame("b", "update", "a"));
      a.connection.pong();
      b.connection.pong();
      relay.tick();
    }
    expect(stop).not.toHaveBeenCalled();
    advance(MINUTE);
    relay.tick();
    expect(stop).toHaveBeenCalledWith("idle");
    expect(a.socket.sent.at(-1)).toBe(JSON.stringify({ relay: "closing", reason: "idle" }));
    expect(a.socket.closed).toBe(true);
  });

  it("restarts the 30 minutes on a contentful update", () => {
    const { relay, stop, advance, person } = setup();
    const a = person("a");
    advance(IDLE_NO_CONTENT_MS - MINUTE);
    a.connection.receive(frame("a"));
    advance(IDLE_NO_CONTENT_MS - 1);
    a.connection.pong();
    relay.tick();
    expect(stop).not.toHaveBeenCalled();
    advance(1);
    relay.tick();
    expect(stop).toHaveBeenCalledWith("idle");
  });

  it("counts a fresh arrival as activity, and a plain connection as none", () => {
    const { relay, stop, advance, person } = setup();
    advance(IDLE_NO_CONNECTIONS_MS - 1);
    person("plain");
    advance(IDLE_NO_CONTENT_MS - IDLE_NO_CONNECTIONS_MS);
    relay.tick();
    expect(stop).not.toHaveBeenCalled();
    person("new tab", true);
    advance(IDLE_NO_CONTENT_MS - 1);
    relay.tick();
    expect(stop).not.toHaveBeenCalled();
    advance(1);
    relay.tick();
    expect(stop).toHaveBeenCalledWith("idle");
  });
});

describe("liveness and budget", () => {
  it("terminates a socket that stopped answering pings", () => {
    const { relay, person } = setup();
    const a = person("a");
    relay.tick();
    expect(a.socket.pings).toBe(1);
    a.connection.pong();
    relay.tick();
    expect(a.socket.terminated).toBe(false);
    relay.tick();
    expect(a.socket.terminated).toBe(true);
  });

  it("stops at the limit, and tells clients why", async () => {
    const withinBudget = vi.fn(() => Promise.resolve(false));
    const { relay, stop, person } = setup(withinBudget);
    const a = person("a");
    relay.tick();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledWith("limit"));
    expect(a.socket.sent.at(-1)).toBe(JSON.stringify({ relay: "closing", reason: "limit" }));
  });

  it("checks the budget periodically, and survives a failed check", async () => {
    const withinBudget = vi.fn(() => Promise.reject(new Error("unreachable")));
    const { relay, stop, advance, person } = setup(withinBudget);
    const a = person("a");
    relay.tick();
    a.connection.pong();
    advance(BUDGET_CHECK_MS - 1);
    a.connection.receive(frame("a"));
    relay.tick();
    expect(withinBudget).toHaveBeenCalledTimes(1);
    a.connection.pong();
    advance(1);
    relay.tick();
    expect(withinBudget).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("over real sockets", () => {
  let server: Server;
  const started: WebSocket[] = [];
  afterEach(async () => {
    started.forEach((socket) => socket.terminate());
    started.length = 0;
    await new Promise((resolve) => server.close(resolve));
  });
  async function listen(allowedOrigin: string | null) {
    const relay = new Relay({
      now: Date.now,
      stop: () => {},
      withinBudget: () => Promise.resolve(true),
      uploads: null,
    });
    server = createServer();
    attachRelay(server, () => relay, { allowedOrigin, accepting: () => true });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  function connect(url: string, origin?: string) {
    const socket = new WebSocket(url, { origin });
    started.push(socket);
    return socket;
  }
  const outcome = (socket: WebSocket) =>
    new Promise<string>((resolve) => {
      socket.once("open", () => resolve("open"));
      socket.once("error", () => resolve("refused"));
    });

  it("forwards between browsers' sockets", async () => {
    const url = `${await listen(null)}/rooms/${ROOM}`;
    const [a, b] = [connect(url), connect(url)];
    await Promise.all([outcome(a), outcome(b)]);
    const received = new Promise<string>((resolve) =>
      b.once("message", (data) => resolve(socketText(data)))
    );
    a.send(frame("a"));
    expect(await received).toBe(frame("a"));
  });

  it("refuses other origins and malformed rooms", async () => {
    const base = await listen("https://arconis.ahara.io");
    expect(await outcome(connect(`${base}/rooms/${ROOM}`, "https://example.com"))).toBe("refused");
    expect(await outcome(connect(`${base}/rooms/short`, "https://arconis.ahara.io"))).toBe(
      "refused"
    );
    expect(await outcome(connect(`${base}/rooms/${ROOM}`, "https://arconis.ahara.io"))).toBe(
      "open"
    );
  });
});
