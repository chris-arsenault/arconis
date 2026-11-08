import { afterEach, expect, it, vi } from "vitest";
import { EditCounter, EDIT_WINDOW_MS, SAME_EDIT_MS } from "./relayStart";
import { RelayTransport, START_DEADLINE_MS } from "./relayTransport";
import type { ConnectionState } from "./channel";

class Socket {
  static readonly OPEN = 1;
  static readonly all: Socket[] = [];
  readyState = 0;
  onopen = () => {};
  onclose = () => {};
  onerror = () => {};
  onmessage: (event: { data: string }) => void = () => {};
  sent: string[] = [];
  constructor(readonly url: string) {
    Socket.all.push(this);
  }
  send(message: string) {
    this.sent.push(message);
  }
  // A disconnected real network can leave the close handshake pending.
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen();
  }
  fail() {
    this.onclose();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Socket.all.length = 0;
});

const ROOM = "a".repeat(48);

function setup(control: Record<string, string> = { status: "stopped", start: "starting" }) {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true });
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: control[url.split("/").at(-1)!] }),
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  const transport = new RelayTransport("https://relay.test", ROOM);
  const states: ConnectionState[] = [];
  const messages: string[] = [];
  const ready = vi.fn();
  transport.onStatus = (state) => states.push(state);
  transport.onMessage = (message) => messages.push(message);
  transport.onReady = ready;
  const last = () => Socket.all.at(-1)!;
  return { transport, states, messages, ready, fetchMock, control, last };
}

it("connects to the room over the matching socket scheme", () => {
  const { transport, last, ready, states } = setup();
  transport.connect();
  expect(last().url).toBe(`wss://relay.test/rooms/${ROOM}`);
  last().open();
  expect(states).toEqual(["connecting", "online"]);
  expect(ready).toHaveBeenCalledOnce();
});

it("asks the relay to count a fresh arrival once", async () => {
  const { transport, last } = setup();
  transport.markFresh();
  transport.connect();
  expect(last().url).toContain("?fresh=1");
  last().open();
  last().fail();
  await vi.advanceTimersByTimeAsync(2000);
  expect(last().url).not.toContain("fresh");
});

it("passes frames through and consumes relay notices", () => {
  const { transport, last, messages } = setup();
  transport.connect();
  last().open();
  last().onmessage({ data: '{"v":1,"from":"a"}' });
  last().onmessage({ data: '{"relay":"ka"}' });
  expect(messages).toEqual(['{"v":1,"from":"a"}']);
});

it("sends only while connected", () => {
  const { transport, last } = setup();
  transport.connect();
  transport.send("early");
  last().open();
  transport.send("frame");
  expect(last().sent).toEqual(["frame"]);
});

it("reports the relay off without waking it, however long the tab stays open", async () => {
  const { transport, last, states, fetchMock } = setup();
  transport.connect();
  last().fail();
  await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toBe("stopped");
  for (let attempt = 0; attempt < 20; attempt++) {
    await vi.advanceTimersByTimeAsync(70_000);
    last().fail();
  }
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["https://relay.test/control/status"]);
  expect(states.at(-1)).toBe("stopped");
});

it("joins when someone else starts the relay", async () => {
  const { transport, last, states } = setup();
  transport.connect();
  last().fail();
  await vi.advanceTimersByTimeAsync(70_000);
  last().open();
  expect(states.at(-1)).toBe("online");
});

it("shows it is starting, then connects", async () => {
  const { transport, last, states, fetchMock } = setup();
  transport.connect();
  last().fail();
  await vi.advanceTimersByTimeAsync(0);
  transport.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenLastCalledWith("https://relay.test/control/start", {
    method: "POST",
  });
  expect(states.at(-1)).toBe("starting");
  await vi.advanceTimersByTimeAsync(3000);
  last().fail();
  expect(states.at(-1)).toBe("starting");
  await vi.advanceTimersByTimeAsync(3000);
  last().open();
  expect(states.at(-1)).toBe("online");
});

it("gives up on a start that never completes", async () => {
  const { transport, last, states } = setup();
  transport.start();
  transport.connect();
  await vi.advanceTimersByTimeAsync(START_DEADLINE_MS + 1);
  last().fail();
  await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toBe("stopped");
});

it("reports the limit from a start request and from the status", async () => {
  const started = setup({ start: "limit", status: "limit" });
  started.transport.connect();
  started.transport.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(started.states.at(-1)).toBe("limit");
  started.transport.close();
  Socket.all.length = 0;
  const status = setup({ start: "limit", status: "limit" });
  status.transport.connect();
  status.last().fail();
  await vi.advanceTimersByTimeAsync(0);
  expect(status.states.at(-1)).toBe("limit");
});

it.each([
  ["idle", "stopped"],
  ["limit", "limit"],
])("takes a closing relay's word that it stopped for %s", async (reason, state) => {
  const { transport, last, states, fetchMock } = setup();
  transport.connect();
  last().open();
  last().onmessage({ data: JSON.stringify({ relay: "closing", reason }) });
  last().fail();
  await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toBe(state);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("retries a start while the instance finishes stopping", async () => {
  const { transport, control, fetchMock } = setup({ start: "stopping", status: "stopping" });
  transport.connect();
  transport.start();
  await vi.advanceTimersByTimeAsync(0);
  control.start = "starting";
  await vi.advanceTimersByTimeAsync(15_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("reports a failed start request", async () => {
  const { transport, states, fetchMock, last } = setup();
  fetchMock.mockRejectedValueOnce(new Error("network"));
  transport.connect();
  transport.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toBe("error");
  last().open();
  expect(states.at(-1)).toBe("online");
});

it("detects a silently dead path through missing keepalives", async () => {
  const { transport, last, states } = setup({ status: "running", start: "running" });
  transport.connect();
  last().open();
  const first = last();
  await vi.advanceTimersByTimeAsync(102_000);
  expect(last()).not.toBe(first);
  expect(states).toContain("offline");
});

it("stops everything when closed", async () => {
  const { transport, last } = setup();
  transport.connect();
  transport.close();
  last().fail();
  const count = Socket.all.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(Socket.all).toHaveLength(count);
});

it.each(["starting", "stopping", "rejected"])(
  "ignores a pending start request that finishes after close: %s",
  async (status) => {
    const { transport, fetchMock, states } = setup();
    let finish!: (value: string) => void;
    let fail!: (error: Error) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = (value) => resolve(Response.json({ status: value }));
          fail = reject;
        })
    );
    transport.connect();
    transport.start();
    const beforeClose = [...states];
    const count = Socket.all.length;
    transport.close();
    if (status === "rejected") fail(new Error("late network failure"));
    else finish(status);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(states).toEqual(beforeClose);
    expect(Socket.all).toHaveLength(count);
    expect(fetchMock).toHaveBeenCalledOnce();
  }
);

it("starts after three separate edits within an hour", () => {
  const counter = new EditCounter();
  expect(counter.record(0)).toBe(false);
  expect(counter.record(SAME_EDIT_MS)).toBe(false);
  expect(counter.record(SAME_EDIT_MS * 2)).toBe(true);
  expect(counter.record(SAME_EDIT_MS * 3)).toBe(false);
});

it("counts one drag as one edit", () => {
  const counter = new EditCounter();
  for (let time = 0; time < 30_000; time += 16) expect(counter.record(time)).toBe(false);
});

it("forgets edits older than an hour", () => {
  const counter = new EditCounter();
  counter.record(0);
  counter.record(SAME_EDIT_MS);
  expect(counter.record(EDIT_WINDOW_MS + SAME_EDIT_MS)).toBe(false);
  expect(counter.record(EDIT_WINDOW_MS + SAME_EDIT_MS * 2)).toBe(false);
  expect(counter.record(EDIT_WINDOW_MS + SAME_EDIT_MS * 3)).toBe(true);
});
