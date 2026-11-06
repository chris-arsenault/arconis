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

it("reports offline before the close handshake completes and ignores a retired socket", () => {
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
  const first = Socket.all[0];
  first.open();
  first.receive({ type: "connection_ack" });
  first.receive({ type: "subscribe_success" });
  expect(states.at(-1)).toBe("online");
  navigator.onLine = false;
  events.dispatchEvent(new Event("offline"));
  expect(states.at(-1)).toBe("offline");
  expect(first.readyState).toBe(2);
  navigator.onLine = true;
  events.dispatchEvent(new Event("online"));
  const second = Socket.all[1];
  second.open();
  second.receive({ type: "connection_ack" });
  second.receive({ type: "subscribe_success" });
  first.onerror();
  first.onclose();
  first.receive({ type: "connection_error" });
  expect(states.at(-1)).toBe("online");
  transport.close();
});
