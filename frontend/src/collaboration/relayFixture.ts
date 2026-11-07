import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { attachRelay } from "../relay/attach";
import { Relay, type StopReason } from "../relay/relay";
import { STORAGE_LIMIT_BYTES, type StoredPictures } from "../relay/uploads";
import { Uploads } from "../relay/uploads";
import type { RelayStatus } from "./transport";

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Picture storage in miniature, which checks an upload's checksum and name as S3 and its link do. */
function pictureStorage(base: () => string) {
  const pictures = new Map<string, { bytes: Buffer; type: string }>();
  const counts = new Map<string, number>();
  let full = false;
  const stored: StoredPictures = {
    list: () => {
      const sizes = [...pictures].map(([hash, { bytes }]): [string, number] => [
        hash,
        bytes.length,
      ]);
      return Promise.resolve(new Map([...sizes, ...(full ? fullEntry() : [])]));
    },
    sign: ({ hash }) => Promise.resolve(`${base()}/upload/${hash}`),
  };
  return {
    stored,
    pictures,
    counts,
    setFull: (value: boolean) => {
      full = value;
    },
    async accept(request: IncomingMessage, response: ServerResponse) {
      const bytes = await readBody(request);
      const hash = request.url!.slice("/upload/".length);
      const digest = createHash("sha256").update(bytes).digest();
      const matches =
        digest.toString("base64") === request.headers["x-amz-checksum-sha256"] &&
        digest.toString("hex") === hash;
      if (matches) {
        pictures.set(hash, { bytes, type: request.headers["content-type"] ?? "" });
        counts.set(hash, (counts.get(hash) ?? 0) + 1);
      }
      response.statusCode = matches ? 200 : 400;
      response.end();
    },
  };
}

function newRelay(stored: StoredPictures) {
  return new Relay({
    now: Date.now,
    stop: () => {},
    withinBudget: () => Promise.resolve(true),
    uploads: new Uploads(stored),
  });
}

function fullEntry(): [string, number][] {
  return [["full", STORAGE_LIMIT_BYTES]];
}

/**
 * Test-only: the real relay on a local port, with stand-ins for the control Lambda and picture
 * storage. Product builds import no server code.
 */
export async function startRelayFixture() {
  let status: RelayStatus = "running";
  let startDelay = 0;
  let starts = 0;
  let base = "";
  const storage = pictureStorage(() => base);
  const makeRelay = () => newRelay(storage.stored);
  let relay = makeRelay();
  const control = (request: IncomingMessage, response: ServerResponse) => {
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
  };
  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "PUT");
    response.setHeader("access-control-allow-headers", "content-type,x-amz-checksum-sha256");
    if (request.method === "OPTIONS") response.end();
    else if (request.method === "PUT") void storage.accept(request, response);
    else control(request, response);
  });
  const sockets = attachRelay(server, () => relay, {
    allowedOrigin: null,
    accepting: () => status === "running",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    config: { transport: "relay" as const, relayUrl: base },
    get starts() {
      return starts;
    },
    get connections() {
      return relay.connectionCount;
    },
    picture: (hash: string) => storage.pictures.get(hash),
    uploadsOf: (hash: string) => storage.counts.get(hash) ?? 0,
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
    /** Takes effect at once, as a relay starting up would find it. */
    setStorageFull(full: boolean) {
      storage.setFull(full);
      relay = makeRelay();
    },
    /** Brings the relay back as a new session, as a real restart does. */
    reset() {
      storage.setFull(false);
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
