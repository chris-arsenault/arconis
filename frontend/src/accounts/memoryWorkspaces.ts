import type { WorkspaceRecord } from "../protocol/account";
import type { WorkspaceTable } from "./workspaces";
import { MAX_WORKSPACES } from "./storage";

export function memoryWorkspaces(
  adjustBytes: (user: string, delta: number) => boolean,
  writable: (user: string) => boolean
): WorkspaceTable {
  const records = new Map<string, WorkspaceRecord>();
  const revisions = new Map<string, WorkspaceRecord[]>();
  const key = (user: string, id: string) => `${user}/${id}`;
  const list = (user: string) =>
    [...records]
      .filter(([id]) => id.startsWith(`${user}/`))
      .map(([, record]) => structuredClone(record));
  return {
    workspaces: (user) => Promise.resolve(list(user)),
    workspace: (user, id) => Promise.resolve(structuredClone(records.get(key(user, id)) ?? null)),
    workspaceHistory: (user, id) =>
      Promise.resolve(structuredClone(revisions.get(key(user, id)) ?? [])),
    commitWorkspace: (user, record, expected, pruned) => {
      if (!writable(user)) return Promise.resolve("deleting");
      const id = key(user, record.id);
      if ((records.get(id)?.revision ?? "") !== expected) return Promise.resolve("conflict");
      if (!expected && list(user).length >= MAX_WORKSPACES) return Promise.resolve("full");
      const delta = record.size - pruned.reduce((total, entry) => total + entry.size, 0);
      if (!adjustBytes(user, delta)) return Promise.resolve("full");
      const removed = new Set(pruned.map((entry) => entry.revision));
      revisions.set(id, [
        structuredClone(record),
        ...(revisions.get(id) ?? []).filter((entry) => !removed.has(entry.revision)),
      ]);
      records.set(id, structuredClone(record));
      return Promise.resolve("saved");
    },
    deleteWorkspace: (user, record) => {
      const id = key(user, record.id);
      if (records.get(id)?.revision !== record.revision) return Promise.resolve(false);
      adjustBytes(user, -(revisions.get(id) ?? []).reduce((total, entry) => total + entry.size, 0));
      records.delete(id);
      revisions.delete(id);
      return Promise.resolve(true);
    },
  };
}
