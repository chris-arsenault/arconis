import { expect, it } from "vitest";
import { agentSettings } from "./ConnectAgent";

it("offers the connector settings only where the deployment configures agents", () => {
  expect(agentSettings({ mcpUrl: "https://relay.example/mcp", mcpClientId: "abc123" })).toEqual({
    url: "https://relay.example/mcp",
    clientId: "abc123",
  });
  expect(agentSettings({ mcpUrl: "https://relay.example/mcp" })).toBeNull();
  expect(agentSettings(undefined)).toBeNull();
});
