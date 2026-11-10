import { isLockedRoom, roomHash } from "./room";
import { parseRoom } from "../protocol/room";

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

export function forgetRoom(id: string, storage: RoomIndexStorage = localStorage) {
  storage.setItem(KEY, JSON.stringify(recentRooms(storage).filter((room) => room.id !== id)));
}

/** Database discovery does not create an empty room while checking a remembered address. */
export async function localRoomCopies() {
  const databases = new Set((await indexedDB.databases()).map(({ name }) => name));
  return Promise.all(
    recentRooms().map(async (room) => ({
      ...room,
      retained: databases.has(`arconis-room:${room.id}`) && (await hasUpdates(room.id)),
    }))
  );
}

function hasUpdates(id: string) {
  return new Promise<boolean>((resolve, reject) => {
    const opening = indexedDB.open(`arconis-room:${id}`);
    // The database may have been deleted since discovery. Do not recreate it.
    opening.onupgradeneeded = () => opening.transaction?.abort();
    opening.onerror = () => resolve(false);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("updates", "readonly");
      const count = transaction.objectStore("updates").count();
      count.onsuccess = () => resolve(count.result > 0);
      count.onerror = () => reject(new Error("This browser could not read its local copies."));
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => db.close();
    };
  });
}

export async function removeLocalRoom(id: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`arconis-room:${id}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("This local copy could not be removed."));
    request.onblocked = () =>
      reject(new Error("Close this room in other tabs before removing it."));
  });
  forgetRoom(id);
}
