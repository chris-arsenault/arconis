import { useState } from "react";
import { Copy } from "lucide-react";

/** The port Claude Code listens on for sign-in, which the agents' sign-in client allows. */
const CALLBACK_PORT = 8742;

interface AgentConfig {
  mcpUrl?: string;
  mcpClientId?: string;
}

/** The command that connects Claude Code to Arconis, or null where agents are not configured. */
export function agentCommand(config: AgentConfig | undefined) {
  if (!config?.mcpUrl || !config.mcpClientId) return null;
  return `claude mcp add --transport http --client-id ${config.mcpClientId} --callback-port ${CALLBACK_PORT} arconis ${config.mcpUrl}`;
}

/** How a signed-in person lets an agent work in their rooms. */
export function ConnectAgent() {
  const command = agentCommand(window.__APP_CONFIG__ as AgentConfig | undefined);
  const [copied, setCopied] = useState(false);
  if (!command) return null;
  return (
    <section className="connect-agent" aria-label="Connect an agent">
      <h3>Connect an agent</h3>
      <p className="password-note">
        Add Arconis to Claude Code, sign in with this account when it asks, then give the agent a
        room&apos;s link. Someone must have the room open, and password rooms stay closed to agents.
      </p>
      <div className="agent-command">
        <code>{command}</code>
        <button
          className="icon-action"
          aria-label="Copy the command"
          title={copied ? "Copied" : "Copy"}
          onClick={() => void navigator.clipboard.writeText(command).then(() => setCopied(true))}
        >
          <Copy size={13} />
        </button>
      </div>
    </section>
  );
}
