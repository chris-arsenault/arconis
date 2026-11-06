import { afterEach, expect, it, vi } from "vitest";
import { AppSyncTransport } from "./appsyncTransport";
import type { ConnectionState } from "./transport";

class Socket {
  static readonly OPEN = 1;
  static readonly all: Socket[] = [];
  readyState = 0;
  onopen = () => {};
  onclose = () => {};
  onerror = () => {};
  onmessage: (event: { data: string }) => void = () => {};
  sent: string[] = [];
  constructor() {
    Socket.all.push(this);
  }
  send(message: string) {
    this.sent.push(message);
  }
  // A disconnected real network can leave the close handshake pending.
  close() {
    this.readyState = 2;
  }
  receive(message: object) {
    this.onmessage({ data: JSON.stringify(message) });
  }
  open() {
    this.readyState = 1;
    this.onopen();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Socket.all.length = 0;
});

function start() {
  vi.useFakeTimers();
  const events = new EventTarget();
  const navigator = { onLine: true };
  vi.stubGlobal("window", events);
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("WebSocket", Socket);
  const transport = new AppSyncTransport(
    {
      transport: "appsync",
      appsyncHttp: "https://example.test/event",
      appsyncRealtime: "wss://example.test/event/realtime",
      appsyncApiKey: "public-test-key",
    },
    "room"
  );
  const states: ConnectionState[] = [];
  transport.onStatus = (state) => states.push(state);
  transport.connect();
  return { transport, states, events, navigator };
}

function handshake(socket: Socket) {
  socket.open();
  socket.receive({ type: "connection_ack" });
  socket.receive({ type: "subscribe_success" });
}

it("reports offline before the close handshake completes and ignores a retired socket", () => {
  const { transport, states, events, navigator } = start();
  const first = Socket.all[0];
  handshake(first);
  expect(states.at(-1)).toBe("online");
  navigator.onLine = false;
  events.dispatchEvent(new Event("offline"));
  expect(states.at(-1)).toBe("offline");
  expect(first.readyState).toBe(2);
  navigator.onLine = true;
  events.dispatchEvent(new Event("online"));
  const second = Socket.all[1];
  handshake(second);
  first.onerror();
  first.onclose();
  first.receive({ type: "connection_error" });
  expect(states.at(-1)).toBe("online");
  transport.close();
});

it.each(["keepalive timeout", "publish timeout", "server error", "socket error"])(
  "recovers from %s without waiting for a close event",
  (failure) => {
    const { transport, states } = start();
    const first = Socket.all[0];
    handshake(first);
    if (failure === "keepalive timeout") vi.advanceTimersByTime(60000);
    else if (failure === "publish timeout") {
      transport.send("document update");
      vi.advanceTimersByTime(15050);
    } else if (failure === "server error") first.receive({ type: "connection_error" });
    else first.onerror();
    expect(states.at(-1)).toBe(failure === "server error" ? "error" : "offline");
    expect(first.readyState).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(Socket.all).toHaveLength(2);
    handshake(Socket.all[1]);
    first.onclose();
    first.receive({ type: "connection_error" });
    expect(states.at(-1)).toBe("online");
    const published = first.sent.length;
    transport.send("another update");
    vi.advanceTimersByTime(50);
    expect(first.sent).toHaveLength(published);
    expect(Socket.all[1].sent.at(-1)).toContain("another update");
    transport.close();
  }
);

it("retries a connection that never opens", () => {
  const { transport, states } = start();
  vi.advanceTimersByTime(60000);
  expect(states.at(-1)).toBe("offline");
  vi.advanceTimersByTime(1000);
  expect(Socket.all).toHaveLength(2);
  transport.close();
});
