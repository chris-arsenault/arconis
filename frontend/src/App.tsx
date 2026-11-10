import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createAccount } from "./account";
import type { SavedCopy } from "./account/workspaceFile";
import {
  RoomSession,
  createLocalRoomId,
  createLockedRoomId,
  createRoomId,
  roomHash,
} from "./collaboration/room";
import { parseRoom } from "./protocol/room";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";
import { rememberRoom } from "./collaboration/recentRooms";
import { onPracticeRequest } from "./help/practice";

const NAME_KEY = "arconis:name";

const account = createAccount();

/** A workspace opened from the account, waiting for its room to start. */
let pendingSavedCopy: SavedCopy | null = null;
function takeSavedCopy(room: string) {
  const saved = pendingSavedCopy;
  pendingSavedCopy = null;
  return saved?.roomId === room ? saved : null;
}

/** Opens the room's session; `createdRoom` names a room this tab has just created. */
function useRoomSession(room: string | null, createdRoom: RefObject<string>) {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!room) return;
    let next: RoomSession | null = null;
    let stopRemembering = () => {};
    let active = true;
    const start = async () => {
      const instance = new RoomSession(
        room,
        localStorage.getItem(NAME_KEY) || "Guest",
        createdRoom.current === room
      );
      next = instance;
      const saved = takeSavedCopy(room);
      if (saved) instance.lock.adoptEnvelope(saved.envelope);
      await instance.start(Boolean(saved));
      if (!active) return;
      const openedAt = Date.now();
      let previousTitle = "";
      const remember = () => {
        if (instance.lock.state !== "unlocked") return;
        const title = instance.document.title();
        if (title === previousTitle) return;
        previousTitle = title;
        rememberRoom(room, title, openedAt);
      };
      remember();
      stopRemembering = instance.subscribe(remember);
      setSession(instance);
      if (saved) void instance.saveable.apply(saved);
    };
    void start().catch((reason: unknown) => {
      if (active) setError(String(reason));
    });
    return () => {
      active = false;
      stopRemembering();
      next?.destroy();
    };
  }, [room, createdRoom]);
  return { session, error, setError };
}

/** The account's name replaces whatever a person typed, for as long as they are signed in. */
function useAccountName(session: RoomSession | null) {
  useSyncExternalStore(account?.subscribe ?? noSubscribe, account?.snapshot ?? noSnapshot);
  useEffect(() => void account?.restore().catch(() => {}), []);
  const accountName = account?.status === "in" ? account.name : "";
  useEffect(() => {
    if (accountName) session?.rename(accountName);
  }, [accountName, session]);
  return accountName;
}
const noSubscribe = () => () => {};
const noSnapshot = () => 0;

/** Help's hands-on tutorial asks for a new room on this device and starts there. */
function usePracticeRooms(create: (id: string) => void) {
  const latest = useRef(create);
  useEffect(() => {
    latest.current = create;
  });
  useEffect(
    () =>
      onPracticeRequest(() => {
        const id = createLocalRoomId();
        latest.current(id);
        return id;
      }),
    []
  );
}

function returnToRoom(room: string | null) {
  location.hash = room ? roomHash(room) : "";
}

export function App() {
  const [room, setRoom] = useState(() => parseRoom(location.hash.slice(1)));
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "Guest");
  const [askName, setAskName] = useState(() => !localStorage.getItem(NAME_KEY));
  const [created, setCreated] = useState("");
  const createdRoom = useRef("");
  const previousRoom = useRef<string | null>(null);
  const { session, error, setError } = useRoomSession(room, createdRoom);
  const accountName = useAccountName(session);
  useEffect(() => {
    const onHash = () => setRoom(parseRoom(location.hash.slice(1)));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const open = (id: string) => {
    if (id !== room) previousRoom.current = room;
    setError("");
    location.hash = roomHash(id);
  };
  const changeName = (value: string) => {
    setName(value);
    localStorage.setItem(NAME_KEY, value);
    session?.rename(value);
  };
  const create = (id = createRoomId()) => {
    createdRoom.current = id;
    setCreated(id);
    open(id);
  };
  usePracticeRooms(create);
  const openSaved = (copy: SavedCopy) => {
    if (session?.id === copy.roomId) {
      if (session.canStartCollaboration) session.startCollaboration();
      void session.saveable.apply(copy);
      return;
    }
    pendingSavedCopy = copy;
    open(copy.roomId);
  };
  const shared = { account, onOpenSaved: openSaved };
  // The welcome form has already offered the name field.
  const leaveWelcome = (go: () => void) => {
    setAskName(false);
    changeName(name);
    go();
  };
  if (!session || session.id !== room)
    return (
      <Welcome
        {...shared}
        signedIn={Boolean(accountName)}
        name={name}
        onName={changeName}
        onCreate={() => leaveWelcome(() => create())}
        onCreateLocal={() => leaveWelcome(() => create(createLocalRoomId()))}
        onCreateLocked={() => leaveWelcome(() => create(createLockedRoomId()))}
        onJoin={(id) => leaveWelcome(() => open(id))}
        error={error}
      />
    );
  return (
    <Workspace
      {...shared}
      session={session}
      name={accountName || name}
      askName={askName && !accountName}
      signedIn={Boolean(accountName)}
      newRoom={created === room}
      onName={changeName}
      onCreate={() => create()}
      onJoin={open}
      onLeave={() => returnToRoom(previousRoom.current)}
    />
  );
}
