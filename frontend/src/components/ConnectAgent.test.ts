import { expect, it } from "vitest";
import { agentCommand } from "./ConnectAgent";

it("builds Claude Code's command from the deployment's agent settings", () => {
  expect(agentCommand({ mcpUrl: "https://relay.example/mcp", mcpClientId: "abc123" })).toBe(
    "claude mcp add --transport http --client-id abc123 --callback-port 8742 arconis https://relay.example/mcp"
  );
  expect(agentCommand({ mcpUrl: "https://relay.example/mcp" })).toBeNull();
  expect(agentCommand(undefined)).toBeNull();
});
