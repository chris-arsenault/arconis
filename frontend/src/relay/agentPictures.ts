import { CanvasFiles } from "../files/canvasFiles";
import type { CanvasDocument } from "../document/canvasDocument";
import { sha256, pictureKey } from "../document/pictures";
import { seal, unseal } from "../collaboration/roomKey";
import { putToStorage } from "../collaboration/pictureUploads";
import type { Relay } from "./relay";

export interface AgentPictureStorage {
  read(hash: string): Promise<Uint8Array | null>;
  put(bytes: Uint8Array): Promise<string>;
}

/** The same encrypted picture objects and signed-upload path used by browser participants. */
export function agentPictureStorage(siteOrigin: string, relay: () => Relay): AgentPictureStorage {
  return {
    read: async (hash) => {
      const response = await fetch(new URL(pictureKey(hash), siteOrigin), { redirect: "error" });
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    put: async (bytes) => {
      const { hex: hash, base64: checksum } = await sha256(bytes);
      const request = { hash, checksum, size: bytes.length, type: "application/octet-stream" };
      const reply = await relay().prepareUpload(request);
      if (reply.status === "refused") throw new Error(`Picture upload refused: ${reply.reason}`);
      if (reply.status === "upload" && !(await putToStorage(reply.url, bytes, request)))
        throw new Error("Picture upload failed.");
      return hash;
    },
  };
}

export function roomFiles(
  document: CanvasDocument,
  key: () => CryptoKey,
  storage: AgentPictureStorage | null,
  signal: AbortSignal
) {
  const opened = new Map<string, { bytes: Uint8Array; type: string }>();
  const files = new CanvasFiles(
    document,
    {
      add: async (bytes, type) => {
        if (!storage) throw new Error("Shared picture storage is unavailable.");
        const hash = await storage.put(await seal(key(), bytes));
        opened.set(hash, { bytes, type });
        return hash;
      },
      readOpen: async (hash) => {
        const cached = opened.get(hash);
        if (cached) return cached;
        const bytes = await storage?.read(hash);
        if (!bytes || (await sha256(bytes)).hex !== hash) return null;
        const type = document.list().find((item) => item.picture?.hash === hash)?.picture?.format;
        if (!type) return null;
        const picture = { bytes: await unseal(key(), bytes), type };
        opened.set(hash, picture);
        return picture;
      },
    },
    signal,
    () => {
      // Storage availability is metadata, not an undoable user edit, as in pictureUploads.ts.
      document.withoutStamps(() =>
        document.doc.transact(() => {
          for (const item of document.list())
            if (item.picture && opened.has(item.picture.hash))
              document.items.get(item.id)?.set("picture", { ...item.picture, stored: true });
        }, "picture storage")
      );
    }
  );
  return files;
}
