import { useState } from "react";
import { Copy } from "lucide-react";

import { agentSettings } from "./agentSettings";

function CopyField({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="agent-command">
      <span>{label}</span>
      <code>{value}</code>
      <button
        className="icon-action"
        aria-label={`Copy the ${label.toLowerCase()}`}
        data-hint-detail="Put this value on your clipboard to paste into the assistant's connector settings."
        data-tip={copied ? "Copied" : undefined}
        onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
      >
        <Copy size={13} />
      </button>
    </div>
  );
}

/** How a signed-in person adds Arconis to Claude or ChatGPT as a connector. */
export function ConnectAgent() {
  const settings = agentSettings(window.__APP_CONFIG__);
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
