import { isLockedRoom, parseRoom, roomHash } from "./room";

const KEY = "arconis:recent-rooms";
type RoomIndexStorage = Pick<Storage, "getItem" | "setItem">;

export interface RecentRoom {
  id: string;
  title: string;
  openedAt: number;
}

/** This browser's room addresses, never document contents, passwords or keys. */
export function recentRooms(storage: RoomIndexStorage = localStorage): RecentRoom[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((entry): entry is RecentRoom => {
        if (!entry || typeof entry !== "object") return false;
        const room = entry as Partial<RecentRoom>;
        return (
          typeof room.id === "string" &&
          parseRoom(roomHash(room.id)) === room.id &&
          typeof room.title === "string" &&
          typeof room.openedAt === "number" &&
          Number.isFinite(room.openedAt)
        );
      })
      .sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export function rememberRoom(
  id: string,
  title: string,
  openedAt = Date.now(),
  storage: RoomIndexStorage = localStorage
) {
  const entry = { id, title: isLockedRoom(id) ? "Password room" : title, openedAt };
  const rooms = recentRooms(storage).filter((room) => room.id !== id);
  try {
    storage.setItem(KEY, JSON.stringify([entry, ...rooms]));
  } catch {
    // An unavailable browser index must not prevent opening or editing a room.
  }
}
