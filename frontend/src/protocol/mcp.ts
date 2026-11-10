/** MCP discovery and authentication contracts shared by the relay and its control proxy. */
export interface McpConfig {
  /** The canonical MCP endpoint and the access token audience. */
  resource: string;
  /** The sign-in service's issuer URL. */
  issuer: string;
}

export interface Caller {
  user: string;
  clientId: string;
  scopes: string[];
}
export type TokenVerifier = (token: string) => Promise<Caller | null>;

export const MCP_PATH = "/mcp";
/** The control Lambda forwards here through the ALB's relay rule. */
export const MCP_RELAY_PATH = "/mcp/relay";
export const SCOPES = ["edit:rooms", "offline_access"];

/** Discovery remains available from the control Lambda while the relay is stopped. */
export function resourceMetadata(config: McpConfig) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Arconis",
  };
}
