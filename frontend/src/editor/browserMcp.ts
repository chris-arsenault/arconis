import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentGateway } from "../relay/mcpHttp";
import { fixture } from "./browserHarness";

export async function connectAgent() {
  const gateway = new AgentGateway(
    fixture.relay,
    { resource: "https://relay.example/mcp", issuer: "https://auth.example/" },
    (token) =>
      Promise.resolve(
        token === "local-test" ? { user: "artist", clientId: "test", scopes: ["edit:rooms"] } : null
      )
  );
  const server = createServer((request, response) => {
    void gateway.handle(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let client = new Client({ name: "Drawing journey", version: "1" });
  const transport = () =>
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`),
      { requestInit: { headers: { authorization: "Bearer local-test" } } }
    );
  await client.connect(transport());
  let sessionId = "";
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const roomTool = [
      "describe_canvas",
      "read",
      "write",
      "undo",
      "close_room",
      "check_layout",
    ].includes(name);
    const result = await client.callTool({
      name,
      arguments: roomTool ? { session_id: sessionId, ...args } : args,
    });
    if (name === "open_room" && !result.isError)
      sessionId = (result.structuredContent as { session_id: string }).session_id;
    return JSON.stringify(result);
  };
  return {
    get client() {
      return client;
    },
    call,
    reconnect: async () => {
      await client.close();
      client = new Client({ name: "Drawing journey resumed", version: "1" });
      await client.connect(transport());
    },
    close: async () => {
      if (sessionId) await call("close_room");
      await client.close();
      gateway.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
