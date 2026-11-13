import { useEffect, useState, useSyncExternalStore } from "react";
import { Cloud, FileText, Link, Search, Trash2 } from "lucide-react";
import type { AccountStore, SavedWorkspace } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { localRoomCopies, removeLocalRoom } from "../collaboration/recentRooms";
import { parseRoom } from "../protocol/room";
import { WorkspaceHistory } from "./WorkspaceHistory";
import "./work-browser.css";

interface Props {
  account: AccountStore | null;
  onOpen: (copy: SavedCopy) => void;
  onJoin: (room: string) => void;
  headingLevel: 1 | 2;
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
  grouped,
}: Readonly<{
  item: SavedWorkspace;
  account: AccountStore;
  onOpen: Props["onOpen"];
  run: Run;
  grouped: boolean;
}>) {
  const [history, setHistory] = useState(false);
  const open = () =>
    run(async () => {
      const { copy } = await account.load(item.id);
      onOpen(copy);
    });
  return (
    <div className={grouped ? "work-copy work-copy-secondary" : "work-copy"}>
      <button
        className="workspace-open"
        aria-label={`Open account copy ${item.name}`}
        data-hint-detail="Open the copy saved in your account."
        onClick={open}
      >
        <Cloud size={20} />
        <span className="work-file-info">
          <span className="work-file-name">{grouped ? "Account copy" : item.name}</span>
          <span className="work-file-meta">
            <span>Private account copy</span>
            <WorkDate value={item.updated} action="Saved" />
          </span>
        </span>
      </button>
      <div className="work-file-actions">
        <button
          className="work-history"
          onClick={() => setHistory((value) => !value)}
          aria-label={`History of ${item.name}`}
          aria-expanded={history}
          data-hint-detail="Show or hide earlier saved copies you can recover."
        >
          History
        </button>
        <button
          className="icon-action"
          aria-label={`Delete ${item.name}`}
          data-hint-detail="Remove this saved copy from your account; copies on devices stay."
          onClick={() => run(() => account.removeWorkspace(item.id))}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {history && <WorkspaceHistory account={account} id={item.id} onOpen={onOpen} />}
    </div>
  );
}

function WorkDate({ value, action }: Readonly<{ value: number; action: string }>) {
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()} data-tip={`${action} ${date.toLocaleString()}`}>
      {action} {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </time>
  );
}

function WorkRow({
  here,
  there,
  account,
  onOpen,
  onJoin,
  run,
}: Readonly<Props & { here: LocalCopy | null; there: SavedWorkspace[]; run: Run }>) {
  const title = there[0]?.name ?? here?.title ?? "Untitled canvas";
  return (
    <li className="work-entry">
      {here && (
        <div className="work-copy">
          <button
            className="workspace-open"
            aria-label={here.retained ? `Open local ${title}` : `Join remembered ${title}`}
            data-hint-detail="Go to this room, using any copy kept in this browser."
            onClick={() => onJoin(here.id)}
          >
            {here.retained ? <FileText size={20} /> : <Link size={20} />}
            <span className="work-file-info">
              <span className="work-file-name">{title}</span>
              <span className="work-file-meta">
                {here.retained ? (
                  <span>On this browser</span>
                ) : (
                  <span>
                    Room link · <span>No local copy</span>
                  </span>
                )}
                <WorkDate value={here.openedAt} action="Opened" />
              </span>
            </span>
          </button>
          <div className="work-file-actions">
            <button
              className="icon-action"
              aria-label={`Remove local ${title}`}
              data-hint-detail="Delete this browser's copy and forget the room; not available for the room you are in."
              disabled={parseRoom(location.hash.slice(1)) === here.id}
              onClick={() => run(() => removeLocalRoom(here.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
      {account &&
        there.map((item) => (
          <AccountCopy
            key={item.id}
            item={item}
            account={account}
            onOpen={onOpen}
            run={run}
            grouped={here !== null}
          />
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
    here: local.find((room) => room.id === id) ?? null,
    there: saved.filter((room) => room.roomId === id),
  }));
  const visible = rows.filter(({ here, there }) =>
    (there[0]?.name ?? here?.title ?? "").toLowerCase().includes(filter.toLowerCase())
  );
  const Heading = props.headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="work-browser" aria-label="Saved work browser">
      <header className="work-browser-toolbar">
        <Heading>Your canvases</Heading>
        <label className="work-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Find saved work"
            placeholder="Find a canvas"
            data-hint-detail="Show only canvases whose title contains this text."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </header>
      {loading && <p role="status">Loading your workspaces…</p>}
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p className="work-empty">No saved work yet.</p>}
      {rows.length > 0 && !visible.length && (
        <p className="work-empty">No canvases match your search.</p>
      )}
      <ul className="workspace-list" aria-label="Saved workspaces">
        {visible.map(({ id, here, there }) => (
          <WorkRow key={id} {...props} here={here} there={there} run={run} />
        ))}
      </ul>
    </section>
  );
}
