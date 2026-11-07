import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { attachRelay } from "../relay/attach";
import { Relay, type StopReason } from "../relay/relay";
import type { RelayStatus } from "./transport";

/**
 * Test-only: the real relay on a local port, with a stand-in for the control Lambda. Product
 * builds import no server code.
 */
export async function startRelayFixture() {
  let status: RelayStatus = "running";
  let startDelay = 0;
  let starts = 0;
  const makeRelay = () =>
    new Relay({ now: Date.now, stop: () => {}, withinBudget: () => Promise.resolve(true) });
  let relay = makeRelay();
  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && request.url === "/control/start") {
      starts++;
      if (status === "stopped") {
        status = "starting";
        setTimeout(() => {
          relay = makeRelay();
          status = "running";
        }, startDelay);
      }
    }
    response.end(JSON.stringify({ status }));
  });
  const sockets = attachRelay(server, () => relay, {
    allowedOrigin: null,
    accepting: () => status === "running",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    config: { transport: "relay" as const, relayUrl: `http://127.0.0.1:${port}` },
    get starts() {
      return starts;
    },
    get connections() {
      return relay.connectionCount;
    },
    /** Simulates the relay stopping, or being off before the test begins. */
    stop(reason: StopReason = "idle") {
      status = reason === "limit" ? "limit" : "stopped";
      relay.shutdown(reason);
    },
    /** Simulates losing the relay with no notice, as a network failure does. */
    drop() {
      status = "stopped";
      sockets.clients.forEach((socket) => socket.terminate());
    },
    setStartDelay(delay: number) {
      startDelay = delay;
    },
    /** Brings the relay back as a new session, as a real restart does. */
    reset() {
      relay = makeRelay();
      status = "running";
      startDelay = 0;
      starts = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        sockets.clients.forEach((socket) => socket.terminate());
        server.close(() => resolve());
      }),
  };
}
