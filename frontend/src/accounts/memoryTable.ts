import {
  TOTAL_STORAGE_BYTES,
  USER_STORAGE_BYTES,
  type AccountTable,
  type Profile,
  type WorkspaceRecord,
} from "./api";

/** Test-only: the account table in memory, with the same limits as the real one. */
export function memoryAccountTable() {
  const profiles = new Map<string, Omit<Profile, "bytes">>();
  const workspaces = new Map<string, Map<string, WorkspaceRecord>>();
  const bytes = new Map<string, number>();
  let total = 0;
  const own = (user: string) => {
    const records = workspaces.get(user) ?? new Map<string, WorkspaceRecord>();
    workspaces.set(user, records);
    return records;
  };
  const table: AccountTable = {
    profile: (user) => {
      const profile = profiles.get(user);
      return Promise.resolve(profile ? { ...profile, bytes: bytes.get(user) ?? 0 } : null);
    },
    saveProfile: (user, values) => {
      profiles.set(user, values);
      return Promise.resolve();
    },
    workspaces: (user) => Promise.resolve([...own(user).values()]),
    workspace: (user, id) => Promise.resolve(own(user).get(id) ?? null),
    saveWorkspace: (user, record) => {
      own(user).set(record.id, record);
      return Promise.resolve();
    },
    deleteWorkspace: (user, id) => {
      own(user).delete(id);
      return Promise.resolve();
    },
    addBytes: (user, delta) => {
      const current = bytes.get(user) ?? 0;
      if (
        delta > 0 &&
        (current + delta > USER_STORAGE_BYTES || total + delta > TOTAL_STORAGE_BYTES)
      )
        return Promise.resolve(false);
      bytes.set(user, current + delta);
      total += delta;
      return Promise.resolve(true);
    },
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
