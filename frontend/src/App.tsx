import { useEffect, useState } from "react";
import { RoomSession, createRoomId, parseRoom } from "./collaboration/room";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";

const NAME_KEY = "arconis:name";

export function App() {
  const [room, setRoom] = useState(() => parseRoom(location.hash.slice(1)));
  const [session, setSession] = useState<RoomSession | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "Guest");
  const [askName, setAskName] = useState(() => !localStorage.getItem(NAME_KEY));
  const [created, setCreated] = useState("");
  useEffect(() => {
    const onHash = () => setRoom(parseRoom(location.hash.slice(1)));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!room) return;
    let next: RoomSession | null = null;
    let active = true;
    const start = async () => {
      const instance = new RoomSession(room, localStorage.getItem(NAME_KEY) || "Guest");
      next = instance;
      await instance.start();
      if (active) setSession(instance);
    };
    void start().catch((reason: unknown) => {
      if (active) setError(String(reason));
    });
    return () => {
      active = false;
      next?.destroy();
    };
  }, [room]);
  const open = (id: string) => {
    setError("");
    location.hash = `room=${id}`;
  };
  const changeName = (value: string) => {
    setName(value);
    localStorage.setItem(NAME_KEY, value);
    session?.rename(value);
  };
  const create = () => {
    const id = createRoomId();
    setCreated(id);
    open(id);
  };
  if (!session || session.id !== room)
    return (
      <Welcome
        name={name}
        onName={changeName}
        onCreate={() => {
          // The welcome form has already offered the name field.
          setAskName(false);
          changeName(name);
          create();
        }}
        onJoin={(id) => {
          setAskName(false);
          changeName(name);
          open(id);
        }}
        error={error}
      />
    );
  return (
    <Workspace
      session={session}
      name={name}
      askName={askName}
      newRoom={created === room}
      onName={changeName}
      onCreate={create}
      onJoin={open}
    />
  );
}
