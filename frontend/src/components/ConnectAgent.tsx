import { useState } from "react";
import { Copy } from "lucide-react";

interface AgentConfig {
  mcpUrl?: string;
  mcpClientId?: string;
}

/** What a connector needs, or null where agents are not configured. */
export function agentSettings(config: AgentConfig | undefined) {
  if (!config?.mcpUrl || !config.mcpClientId) return null;
  return { url: config.mcpUrl, clientId: config.mcpClientId };
}

function CopyField({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="agent-command">
      <span>{label}</span>
      <code>{value}</code>
      <button
        className="icon-action"
        aria-label={`Copy the ${label.toLowerCase()}`}
        title={copied ? "Copied" : "Copy"}
        onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
      >
        <Copy size={13} />
      </button>
    </div>
  );
}

/** How a signed-in person adds Arconis to Claude or ChatGPT as a connector. */
export function ConnectAgent() {
  const settings = agentSettings(window.__APP_CONFIG__ as AgentConfig | undefined);
  if (!settings) return null;
  return (
    <section className="connect-agent" aria-label="Connect Claude or ChatGPT">
      <h3>Connect Claude or ChatGPT</h3>
      <p className="password-note">
        Add a custom connector with this server address. Under its OAuth settings, enter this client
        ID and leave the secret empty. Sign in with this account when asked, then give the assistant
        a room&apos;s link. Someone must have the room open, and password rooms stay closed to
        assistants.
      </p>
      <CopyField label="Server address" value={settings.url} />
      <CopyField label="Client ID" value={settings.clientId} />
    </section>
  );
}
