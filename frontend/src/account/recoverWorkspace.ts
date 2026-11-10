import * as Y from "yjs";
import { CanvasDocument } from "../document/canvasDocument";
import { decodePicture, encodePicture, sha256 } from "../document/pictures";
import {
  createEnvelope,
  defaultRoomKey,
  DEFAULT_PASSWORD,
  openEnvelope,
  seal,
  unseal,
} from "../collaboration/roomKey";
import { decodeContents, encodeContents, type SavedCopy } from "./workspaceFile";

/** Recovery into a fresh nopass room uses that room's key, including every referenced picture. */
export async function recoverPublicWorkspace(
  copy: SavedCopy,
  roomId: string,
  readPicture: (hash: string) => Promise<Uint8Array | null>
): Promise<SavedCopy> {
  const oldKey = await openEnvelope(DEFAULT_PASSWORD, copy.envelope);
  const key = await defaultRoomKey(roomId);
  const contents = decodeContents(await unseal(oldKey, copy.sealed));
  const document = new CanvasDocument();
  try {
    Y.applyUpdate(document.doc, contents.update);
    const existing = new Map(
      (await Promise.all(contents.pictures.map(decodePicture)))
        .filter((picture) => picture !== null)
        .map((picture) => [picture.hash, picture.bytes])
    );
    const pictures = [];
    const replaced = new Map<string, string>();
    for (const item of document.list()) {
      if (!item.picture) continue;
      const { hash, format } = item.picture;
      if (!replaced.has(hash)) {
        const stored = existing.get(hash) ?? (await readPicture(hash));
        if (!stored || (await sha256(stored)).hex !== hash)
          throw new Error("A picture needed by this saved copy is unavailable.");
        const bytes = await seal(key, await unseal(oldKey, stored));
        const next = (await sha256(bytes)).hex;
        replaced.set(hash, next);
        pictures.push(encodePicture(next, format, bytes));
      }
      document.patch(item.id, {
        picture: { ...item.picture, hash: replaced.get(hash)!, stored: false },
      });
    }
    return {
      roomId,
      envelope: await createEnvelope(DEFAULT_PASSWORD, key, 1),
      sealed: await seal(
        key,
        encodeContents({ roomId, update: Y.encodeStateAsUpdate(document.doc), pictures })
      ),
    };
  } finally {
    document.destroy();
  }
}
