import * as Y from "yjs";
import { expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { decodePicture, sha256 } from "../document/pictures";
import {
  createEnvelope,
  defaultRoomKey,
  DEFAULT_PASSWORD,
  seal,
  unseal,
} from "../collaboration/roomKey";
import { decodeContents, encodeContents } from "./workspaceFile";
import { recoverPublicWorkspace } from "./recoverWorkspace";

it("reseals a recovered nopass document and its shared pictures under the new room's key", async () => {
  const source = new CanvasDocument();
  const restored = new CanvasDocument();
  try {
    const originalRoom = "a".repeat(48);
    const targetRoom = "b".repeat(48);
    const key = await defaultRoomKey(originalRoom);
    const bytes = new Uint8Array([1, 2, 3]);
    const sealedPicture = await seal(key, bytes);
    const hash = (await sha256(sealedPicture)).hex;
    source.create("picture", 0, 0, {
      id: "picture",
      picture: { hash, format: "image/png", stored: true },
    });
    const copy = {
      roomId: originalRoom,
      envelope: await createEnvelope(DEFAULT_PASSWORD, key, 1),
      sealed: await seal(
        key,
        encodeContents({
          roomId: originalRoom,
          update: Y.encodeStateAsUpdate(source.doc),
          pictures: [],
        })
      ),
    };
    const read = vi.fn(() => Promise.resolve(sealedPicture));
    const recovered = await recoverPublicWorkspace(copy, targetRoom, read);
    const newKey = await defaultRoomKey(targetRoom);
    const contents = decodeContents(await unseal(newKey, recovered.sealed));
    Y.applyUpdate(restored.doc, contents.update);
    expect(recovered.roomId).toBe(targetRoom);
    const picture = restored.get("picture")!.picture!;
    expect(picture.hash).not.toBe(hash);
    expect(picture.stored).toBe(false);
    const data = (await decodePicture(contents.pictures[0]))!;
    expect(await unseal(newKey, data.bytes)).toEqual(bytes);
    expect(read).toHaveBeenCalledOnce();
    expect(source.get("picture")!.picture!.hash).toBe(hash);
  } finally {
    source.destroy();
    restored.destroy();
  }
});
