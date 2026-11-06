import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { AppSyncConfig } from "./transport";

interface ClientMessage {
  type: string;
  id: string;
  channel: string;
  events: string[];
  authorization: { "x-api-key": string };
}

// Test-only service boundary. Product builds import no server code.
export async function startAppSyncFixture() {
  const server = new WebSocketServer({
    port: 0,
    host: "127.0.0.1",
    handleProtocols: () => "aws-appsync-event-ws",
  });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const subscriptions = new Map<WebSocket, { channel: string; id: string }>();
  server.on("connection", (socket) => {
    socket.on("message", (bytes) => {
      const message = JSON.parse(bytes.toString()) as ClientMessage;
      if (message.type === "connection_init")
        socket.send(JSON.stringify({ type: "connection_ack", connectionTimeoutMs: 300000 }));
      if (message.type === "subscribe") {
        subscriptions.set(socket, { channel: message.channel, id: message.id });
        socket.send(JSON.stringify({ type: "subscribe_success", id: message.id }));
      }
      if (message.type === "publish") publish(message, socket, subscriptions);
    });
    socket.on("close", () => subscriptions.delete(socket));
  });
  const { port } = server.address() as AddressInfo;
  const config: AppSyncConfig = {
    transport: "appsync",
    appsyncHttp: `http://127.0.0.1:${port}/event`,
    appsyncRealtime: `ws://127.0.0.1:${port}/event/realtime`,
    appsyncApiKey: "test-public-key",
  };
  return {
    config,
    close: () =>
      new Promise<void>((resolve) => {
        server.clients.forEach((socket) => socket.terminate());
        server.close(() => resolve());
      }),
  };
}

function publish(
  message: ClientMessage,
  socket: WebSocket,
  subscriptions: Map<WebSocket, { channel: string; id: string }>
) {
  if (message.authorization?.["x-api-key"] !== "test-public-key") {
    socket.send(JSON.stringify({ type: "publish_error", id: message.id }));
    return;
  }
  subscriptions.forEach((subscription, peer) => {
    if (subscription.channel === message.channel && peer.readyState === WebSocket.OPEN)
      peer.send(JSON.stringify({ type: "data", id: subscription.id, event: message.events }));
  });
  socket.send(JSON.stringify({ type: "publish_success", id: message.id, failed: [] }));
}
