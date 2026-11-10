import { useEffect, useState } from "react";
import type { AccountStore, SavedWorkspace } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { createLockedRoomId, createRoomId, isLockedRoom } from "../collaboration/room";
import { recoverPublicWorkspace } from "../account/recoverWorkspace";
import { downloadPicture } from "../collaboration/pictureStore";

export function WorkspaceHistory({
  account,
  id,
  onOpen,
}: Readonly<{ account: AccountStore; id: string; onOpen: (copy: SavedCopy) => void }>) {
  const [entries, setEntries] = useState<SavedWorkspace[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void account
      .history(id)
      .then((value) => {
        if (active) setEntries(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load history.");
      });
    return () => {
      active = false;
    };
  }, [account, id]);
  const recover = async (revision: string) => {
    try {
      const { copy } = await account.loadRevision(id, revision);
      const roomId = isLockedRoom(copy.roomId) ? createLockedRoomId() : createRoomId();
      const restored = isLockedRoom(copy.roomId)
        ? { ...copy, roomId }
        : await recoverPublicWorkspace(copy, roomId, downloadPicture);
      onOpen(restored);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not recover this copy.");
    }
  };
  return (
    <section aria-label="Saved-copy history">
      <h3>Recent saved copies</h3>
      <p>Recover a copy into a separate room. Your current room stays intact.</p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {entries.map((entry) => (
          <li key={entry.revision}>
            <time dateTime={new Date(entry.updated).toISOString()}>
              {new Date(entry.updated).toLocaleString()}
            </time>
            <button
              aria-label={`Recover ${new Date(entry.updated).toISOString()}`}
              onClick={() => void recover(entry.revision)}
            >
              Recover copy
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
