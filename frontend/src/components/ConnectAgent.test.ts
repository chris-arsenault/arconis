import { expect, it } from "vitest";
import { agentSettings } from "./ConnectAgent";

it("offers the connector's address only where the deployment configures agents", () => {
  expect(agentSettings({ mcpUrl: "https://relay.example/mcp" })).toEqual({
    url: "https://relay.example/mcp",
  });
  expect(agentSettings({})).toBeNull();
  expect(agentSettings(undefined)).toBeNull();
});
