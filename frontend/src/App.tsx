import { useEffect, useState } from "react";
import { RoomSession, createRoomId, parseRoom } from "./collaboration/room";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";

export function App() {
  const [room, setRoom] = useState(() => parseRoom(location.hash.slice(1)));
  const [session, setSession] = useState<RoomSession | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => sessionStorage.getItem("arconis:name") || "Guest");
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
      const instance = new RoomSession(room, sessionStorage.getItem("arconis:name") || "Guest");
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
    sessionStorage.setItem("arconis:name", value);
    session?.rename(value);
  };
  if (!session || session.id !== room)
    return (
      <Welcome
        name={name}
        onName={changeName}
        onCreate={() => open(createRoomId())}
        onJoin={open}
        error={error}
      />
    );
  return (
    <Workspace
      session={session}
      name={name}
      onName={changeName}
      onCreate={() => open(createRoomId())}
      onJoin={open}
    />
  );
}
