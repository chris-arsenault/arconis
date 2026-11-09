import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FIXTURE_CLIENT_ID, accountFixture } from "./accountFixture";
import { feedbackFixture } from "./feedbackFixture";
import { attachRelay } from "../relay/attach";
import { Relay, type StopReason } from "../relay/relay";
import { STORAGE_LIMIT_BYTES, type StoredPictures } from "../relay/uploads";
import { Uploads } from "../relay/uploads";
import type { RelayStatus } from "./serviceProtocol";

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

const ALLOWED_HEADERS =
  "authorization,content-type,x-amz-checksum-sha256,x-amz-target,x-amz-user-agent,cache-control";

function allowBrowsers(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,PUT,POST,DELETE");
  response.setHeader("access-control-allow-headers", ALLOWED_HEADERS);
}

function fixtureConfig(base: string) {
  return {
    transport: "relay" as const,
    relayUrl: base,
    authAuthority: `${base}/oidc`,
    authClientId: FIXTURE_CLIENT_ID,
    authAudience: `${base}/api`,
    authSignOutUrl: `${base}/oidc/logout`,
  };
}

function fullEntry(): [string, number][] {
  return [["full", STORAGE_LIMIT_BYTES]];
}

function fixtureServer(
  accounts: ReturnType<typeof accountFixture>,
  feedback: ReturnType<typeof feedbackFixture>,
  storage: ReturnType<typeof pictureStorage>,
  control: (request: IncomingMessage, response: ServerResponse) => void
) {
  return createServer((request, response) => {
    allowBrowsers(response);
    if (request.method === "OPTIONS") response.end();
    else if (accounts.handle(request, response)) return;
    else if (feedback.handle(request, response)) return;
    else if (request.method === "PUT") void storage.accept(request, response);
    else control(request, response);
  });
}

/**
 * Test-only: the real relay on a local port, with stand-ins for the control Lambda and picture
 * storage. Product builds import no server code.
 */
export async function startRelayFixture(siteOrigin = "") {
  let status: RelayStatus = "running";
  let startDelay = 0;
  let starts = 0;
  let base = "";
  const storage = pictureStorage(() => base);
  const accounts = accountFixture(() => base);
  const feedback = feedbackFixture(() => base, siteOrigin);
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
  const server = fixtureServer(accounts, feedback, storage, control);
  const sockets = attachRelay(server, () => relay, {
    allowedOrigin: null,
    accepting: () => status === "running",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    config: fixtureConfig(base),
    /** Tests attach real MCP sessions to this same relay without an external service. */
    relay: () => relay,
    savedObjects: () => [...accounts.objects.values()],
    feedback: feedback.records,
    feedbackScreenshot: feedback.screenshot,
    get starts() {
      return starts;
    },
    picture: (hash: string) => storage.pictures.get(hash),
    uploadsOf: (hash: string) => storage.counts.get(hash) ?? 0,
    storedPictures: () => [...storage.pictures.values()],
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
