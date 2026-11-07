import { createServer } from "node:http";
import { attachRelay } from "./attach";
import { cognitoVerifier } from "./cognitoTokens";
import { AgentGateway, type McpConfig } from "./mcpHttp";
import { Relay, TICK_MS } from "./relay";
import { s3Pictures } from "./s3Pictures";
import { Uploads } from "./uploads";

// The EC2 entry point. A clean exit shuts the instance down (see the unit in user_data); a crash
// restarts the process.
const port = Number(process.env.PORT ?? 8080);
const controlUrl = process.env.CONTROL_URL ?? "";
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const pictureBucket = process.env.PICTURE_BUCKET ?? "";
if (!controlUrl || !allowedOrigin) throw new Error("CONTROL_URL and ALLOWED_ORIGIN are required.");

const FLUSH_BEFORE_EXIT_MS = 1000;

const relay = new Relay({
  now: Date.now,
  stop: (reason) => {
    console.log(`Stopping relay: ${reason}`);
    setTimeout(() => process.exit(0), FLUSH_BEFORE_EXIT_MS);
  },
  withinBudget: async () => {
    const response = await fetch(`${controlUrl}/control/status`);
    const { status } = (await response.json()) as { status: string };
    return status !== "limit";
  },
  uploads: pictureBucket ? new Uploads(s3Pictures(pictureBucket)) : null,
});

/** Agents connect over MCP when the deployment names the sign-in service for them. */
function agentGateway() {
  const config: McpConfig = {
    resource: process.env.MCP_RESOURCE ?? "",
    issuer: process.env.COGNITO_ISSUER ?? "",
    clientId: process.env.MCP_CLIENT_ID ?? "",
    authDomain: process.env.AUTH_DOMAIN ?? "",
  };
  if (!Object.values(config).every(Boolean)) return null;
  return new AgentGateway(() => relay, config, cognitoVerifier(config));
}
const agents = agentGateway();

const server = createServer((request, response) => {
  void (async () => {
    if (agents && (await agents.handle(request, response))) return;
    // The ALB's health check. Everything else here is a WebSocket upgrade.
    response.statusCode = request.url === "/health" ? 200 : 404;
    response.end();
  })().catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
});
attachRelay(server, () => relay, { allowedOrigin, accepting: () => true });
server.listen(port, () => console.log(`Relay listening on ${port}`));
setInterval(() => {
  relay.tick();
  agents?.sweep();
}, TICK_MS);
