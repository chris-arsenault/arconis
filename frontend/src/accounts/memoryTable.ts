import type { AccountTable } from "./api";
import { TOTAL_STORAGE_BYTES, USER_STORAGE_BYTES } from "./storage";
import type { AccountProfile } from "../protocol/account";
import type { LibraryEntry } from "../protocol/library";
import type { LibraryTable } from "./library";
import { memoryWorkspaces } from "./memoryWorkspaces";

function memoryLibrary(
  adjustBytes: (user: string, delta: number) => boolean,
  writable: (user: string) => boolean
): LibraryTable {
  const library = new Map<string, LibraryEntry>();
  return {
    library: (user) =>
      Promise.resolve(
        [...library]
          .filter(([key]) => key.startsWith(`${user}/`))
          .map(([, entry]) => structuredClone(entry))
      ),
    libraryEntry: (user, id) =>
      Promise.resolve(structuredClone(library.get(`${user}/${id}`) ?? null)),
    createLibrary: (user, entry) => {
      if (!writable(user)) return Promise.resolve("deleting");
      if (library.has(`${user}/${entry.id}`)) return Promise.resolve("conflict");
      if (!adjustBytes(user, entry.size)) return Promise.resolve("full");
      library.set(`${user}/${entry.id}`, structuredClone(entry));
      return Promise.resolve("saved");
    },
    renameLibrary: (user, entry) => {
      if (!writable(user)) return Promise.resolve(false);
      if (library.get(`${user}/${entry.id}`)?.revision !== entry.revision)
        return Promise.resolve(false);
      library.set(`${user}/${entry.id}`, structuredClone(entry));
      return Promise.resolve(true);
    },
    deleteLibrary: (user, entry) => {
      if (library.get(`${user}/${entry.id}`)?.revision !== entry.revision)
        return Promise.resolve(false);
      library.delete(`${user}/${entry.id}`);
      adjustBytes(user, -entry.size);
      return Promise.resolve(true);
    },
  };
}

/** Test-only: the account table in memory, with the same limits as the real one. */
export function memoryAccountTable() {
  const profiles = new Map<string, Omit<AccountProfile, "bytes">>();
  const bytes = new Map<string, number>();
  let total = 0;
  const deleting = new Set<string>();
  const writable = (user: string) => !deleting.has(user);
  const adjustBytes = (user: string, delta: number) => {
    const current = bytes.get(user) ?? 0;
    if (delta > 0 && (current + delta > USER_STORAGE_BYTES || total + delta > TOTAL_STORAGE_BYTES))
      return false;
    bytes.set(user, current + delta);
    total += delta;
    return true;
  };
  const table: AccountTable = {
    ...memoryLibrary(adjustBytes, writable),
    ...memoryWorkspaces(adjustBytes, writable),
    profile: (user) => {
      const profile = profiles.get(user);
      return Promise.resolve(
        profile && writable(user) ? { ...profile, bytes: bytes.get(user) ?? 0 } : null
      );
    },
    saveProfile: (user, values) => {
      if (!writable(user)) return Promise.resolve(false);
      profiles.set(user, values);
      return Promise.resolve(true);
    },
    beginDelete: (user) => {
      deleting.add(user);
      return Promise.resolve();
    },
    isDeleting: (user) => Promise.resolve(deleting.has(user)),
    deleteProfile: (user) => {
      profiles.delete(user);
      bytes.delete(user);
      return Promise.resolve();
    },
  };
  return {
    ...table,
    bytes: (user: string) => bytes.get(user) ?? 0,
    setBytes: (user: string, value: number) => bytes.set(user, value),
    total: () => total,
    setTotal: (value: number) => {
      total = value;
    },
  };
}
