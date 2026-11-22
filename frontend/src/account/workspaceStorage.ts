import { sha256 } from "../document/pictures";
import type { PublishWorkspaceRequest, SaveWorkspaceRequest } from "../protocol/account";
import { decodeSavedCopy, encodeSavedCopy, type SavedCopy } from "./workspaceFile";

type WorkspaceRequest = (
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: SaveWorkspaceRequest | PublishWorkspaceRequest
) => Promise<unknown>;
export type WorkspaceFetch = (url: string, init?: RequestInit) => Promise<Response>;
export class WorkspaceConflict extends Error {}

export function workspaceLink(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("url" in value) ||
    typeof value.url !== "string" ||
    !("revision" in value) ||
    typeof value.revision !== "string"
  )
    throw new Error("The account service returned an invalid reply.");
  return { url: value.url, revision: value.revision };
}

/** Browser and relay publish the same sealed format using the same revision protocol. */
export class WorkspaceStorage {
  constructor(
    private api: WorkspaceRequest,
    private request: WorkspaceFetch
  ) {}

  async save(
    id: string,
    name: string,
    copy: SavedCopy,
    expectedRevision: string,
    signal?: AbortSignal
  ) {
    const bytes = encodeSavedCopy(copy);
    const { base64: checksum } = await sha256(bytes);
    const metadata = {
      size: bytes.length,
      checksum,
      name,
      roomId: copy.roomId,
      expectedRevision,
    };
    const path = `workspaces/${id}`;
    signal?.throwIfAborted();
    const reply = await this.api("PUT", path, metadata);
    if (reply === null) throw new Error("The workspace could not be saved.");
    const signed = workspaceLink(reply);
    const uploaded = await this.request(signed.url, {
      method: "PUT",
      body: new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
      headers: { "content-type": "application/octet-stream", "x-amz-checksum-sha256": checksum },
      signal,
    });
    if (!uploaded.ok) throw new Error("The workspace could not be saved.");
    signal?.throwIfAborted();
    const published = await this.api("POST", path, { ...metadata, revision: signed.revision });
    if (published === null) throw new Error("The workspace could not be saved.");
    return signed.revision;
  }

  async load(path: string) {
    const reply = await this.api("GET", path);
    if (reply === null) throw new Error("This workspace no longer exists.");
    const record = workspaceLink(reply);
    const response = await this.request(record.url);
    if (!response.ok) throw new Error("This workspace could not be loaded.");
    const copy = decodeSavedCopy(new Uint8Array(await response.arrayBuffer()));
    return { copy, revision: record.revision };
  }
}
