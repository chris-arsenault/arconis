import { useEffect, useState, useSyncExternalStore } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import type { AccountStore, SavedWorkspace } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { localRoomCopies, removeLocalRoom } from "../collaboration/recentRooms";
import { parseRoom } from "../collaboration/room";
import { WorkspaceHistory } from "./WorkspaceHistory";

interface Props {
  account: AccountStore | null;
  onOpen: (copy: SavedCopy) => void;
  onJoin: (room: string) => void;
}
type LocalCopy = Awaited<ReturnType<typeof localRoomCopies>>[number];
type Run = (operation: () => Promise<unknown>) => void;
const noSubscribe = () => () => {};
const noSnapshot = () => 0;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not load work.";

function visibleAccountWork(
  owner: string,
  remote: { owner: string; items: SavedWorkspace[]; error: string }
) {
  const current = Boolean(owner && remote.owner === owner);
  return {
    saved: current ? remote.items : [],
    remoteError: current ? remote.error : "",
    loading: Boolean(owner && !current),
  };
}

function useWork(account: AccountStore | null) {
  const version = useSyncExternalStore(
    account?.subscribe ?? noSubscribe,
    account?.snapshot ?? noSnapshot
  );
  const [local, setLocal] = useState<LocalCopy[]>([]);
  const [remote, setRemote] = useState<{ owner: string; items: SavedWorkspace[]; error: string }>({
    owner: "",
    items: [],
    error: "",
  });
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const owner = account?.status === "in" ? account.email : "";
  useEffect(() => {
    let active = true;
    void localRoomCopies()
      .then((items) => {
        if (active) setLocal(items);
      })
      .catch((e: unknown) => {
        if (active) setError(message(e));
      });
    if (owner && account) {
      void account
        .workspaces()
        .then((items) => {
          if (active) setRemote({ owner, items, error: "" });
        })
        .catch((e: unknown) => {
          if (active) setRemote({ owner, items: [], error: message(e) });
        });
    }
    return () => {
      active = false;
    };
  }, [account, owner, refresh, version]);
  const run: Run = (operation) => {
    setError("");
    void operation()
      .then(() => setRefresh((value) => value + 1))
      .catch((e: unknown) => setError(message(e)));
  };
  const { remoteError, ...visible } = visibleAccountWork(owner, remote);
  return {
    local,
    ...visible,
    error: error || remoteError,
    run,
  };
}

function AccountCopy({
  item,
  account,
  onOpen,
  run,
}: Readonly<{ item: SavedWorkspace; account: AccountStore; onOpen: Props["onOpen"]; run: Run }>) {
  const [history, setHistory] = useState(false);
  const open = () =>
    run(async () => {
      const { copy } = await account.load(item.id);
      onOpen(copy);
    });
  return (
    <span>
      <button className="workspace-open" onClick={open}>
        <FolderOpen size={14} /> {item.name}
      </button>
      <small>Private account copy</small>
      <button onClick={() => setHistory((value) => !value)} aria-label={`History of ${item.name}`}>
        History
      </button>
      {history && <WorkspaceHistory account={account} id={item.id} onOpen={onOpen} />}
      <button
        className="icon-action"
        aria-label={`Delete ${item.name}`}
        onClick={() => run(() => account.removeWorkspace(item.id))}
      >
        <Trash2 size={13} />
      </button>
    </span>
  );
}

function WorkRow({
  here,
  there,
  account,
  onOpen,
  onJoin,
  run,
}: Readonly<Props & { here: LocalCopy | undefined; there: SavedWorkspace[]; run: Run }>) {
  const title = there[0]?.name ?? here?.title ?? "Untitled canvas";
  return (
    <li>
      <span className="recent-room-title">{title}</span>
      {here && (
        <>
          <button onClick={() => onJoin(here.id)}>
            {here.retained ? `Open local ${title}` : `Join remembered ${title}`}
          </button>
          <small>{here.retained ? "On this browser" : "No local copy"}</small>
          <button
            className="icon-action"
            aria-label={`Remove local ${title}`}
            disabled={parseRoom(location.hash.slice(1)) === here.id}
            onClick={() => run(() => removeLocalRoom(here.id))}
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
      {account &&
        there.map((item) => (
          <AccountCopy key={item.id} item={item} account={account} onOpen={onOpen} run={run} />
        ))}
    </li>
  );
}

/** Local and account entries identify the same room, while their copy actions stay separate. */
export function WorkBrowser(props: Readonly<Props>) {
  const { local, saved, error, loading, run } = useWork(props.account);
  const [filter, setFilter] = useState("");
  const roomIds = [
    ...new Set([...local.map(({ id }) => id), ...saved.map(({ roomId }) => roomId)]),
  ];
  const rows = roomIds.map((id) => ({
    id,
    here: local.find((room) => room.id === id),
    there: saved.filter((room) => room.roomId === id),
  }));
  return (
    <section className="recent-rooms work-browser" aria-label="Saved work browser">
      <h2>Your canvases</h2>
      <input
        aria-label="Find saved work"
        placeholder="Find a canvas"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {loading && <p role="status">Loading your workspaces…</p>}
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>No saved work yet.</p>}
      <ul className="workspace-list" aria-label="Saved workspaces">
        {rows
          .filter(({ here, there }) =>
            (there[0]?.name ?? here?.title ?? "").toLowerCase().includes(filter.toLowerCase())
          )
          .map(({ id, here, there }) => (
            <WorkRow key={id} {...props} here={here} there={there} run={run} />
          ))}
      </ul>
    </section>
  );
}
