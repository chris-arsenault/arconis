import { useEffect, useState, useSyncExternalStore } from "react";
import { Cloud, CloudUpload } from "lucide-react";
import type { AccountStore } from "../account/accountStore";
import { WorkspaceSaver } from "../account/workspaceSaver";
import type { RoomSession } from "../collaboration/room";

/** Saves the room to the signed-in account, and keeps it saved after that. */
export function SaveWorkspace({
  account,
  session,
  onMessage,
}: Readonly<{ account: AccountStore; session: RoomSession; onMessage: (text: string) => void }>) {
  useSyncExternalStore(account.subscribe, account.snapshot);
  const signedIn = account.status === "in";
  const [saver, setSaver] = useState<WorkspaceSaver | null>(null);
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    const next = new WorkspaceSaver(account, session.saveable, () =>
      setVersion((version) => version + 1)
    );
    // The saver holds a subscription, so it belongs to this effect rather than to rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaver(next);
    next.attach().catch(() => onMessage("Your saved copy of this room could not be loaded."));
    return () => {
      next.close();
      setSaver(null);
    };
  }, [account, session, signedIn, onMessage]);
  const error = saver?.error ?? "";
  useEffect(() => {
    if (error) onMessage(error);
  }, [error, onMessage]);
  if (!saver) return null;
  const saved = saver.id !== null;
  return (
    <button
      className="icon-button"
      aria-label={saved ? "Save now" : "Save to my account"}
      title={saved ? "Saved to your account, and kept up to date" : "Save to my account"}
      onClick={() => void saver.save()}
    >
      {saved ? <Cloud size={18} /> : <CloudUpload size={18} />}
    </button>
  );
}
