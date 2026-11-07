import { useState } from "react";
import { Copy } from "lucide-react";

interface AgentConfig {
  mcpUrl?: string;
}

/** The address a connector needs, or null where agents are not configured. */
export function agentSettings(config: AgentConfig | undefined) {
  return config?.mcpUrl ? { url: config.mcpUrl } : null;
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
        Add a custom connector with this server address and leave its OAuth settings empty. Sign in
        with this Ahara account when asked and allow access, then give the assistant a room&apos;s
        link. Someone must have the room open, and password rooms stay closed to assistants.
      </p>
      <CopyField label="Server address" value={settings.url} />
    </section>
  );
}
