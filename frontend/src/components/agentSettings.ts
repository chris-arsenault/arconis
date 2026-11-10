/** Public runtime configuration is an input boundary; deployments without agents omit the URL. */
export function agentSettings(config: unknown) {
  if (!config || typeof config !== "object" || !("mcpUrl" in config)) return null;
  return typeof config.mcpUrl === "string" && config.mcpUrl ? { url: config.mcpUrl } : null;
}
