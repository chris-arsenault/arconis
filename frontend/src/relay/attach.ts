import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { MAX_MESSAGE_BYTES, type Relay } from "./relay";

const ROOM_PATH = /^\/rooms\/([a-f0-9]{48})$/;

export interface AttachOptions {
  /** Browser origin allowed to connect; null accepts any, for local fixtures. */
  allowedOrigin: string | null;
  /** False refuses sockets, which lets a test fixture simulate a stopped relay. */
  accepting: () => boolean;
}

function refuse(socket: Duplex, status: string) {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

/** Routes WebSocket upgrades on `server` into the current relay. */
export function attachRelay(server: Server, current: () => Relay, options: AttachOptions) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const [path, query] = (request.url ?? "/").split("?");
    const roomId = ROOM_PATH.exec(path)?.[1];
    if (!roomId) return refuse(socket, "404 Not Found");
    const relay = current();
    if (options.allowedOrigin && request.headers.origin !== options.allowedOrigin)
      return refuse(socket, "403 Forbidden");
    if (!options.accepting() || !relay.hasRoomFor(roomId))
      return refuse(socket, "503 Service Unavailable");
    sockets.handleUpgrade(request, socket, head, (client) => {
      const fresh = new URLSearchParams(query).get("fresh") === "1";
      const connection = relay.join(roomId, client, fresh);
      client.on("message", (data, isBinary) => {
        if (!isBinary) connection.receive(String(data));
      });
      client.on("pong", connection.pong);
      client.on("close", connection.leave);
      client.on("error", () => client.terminate());
    });
  });
  return sockets;
}
