import * as Y from "yjs";
import { expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { decodePicture, encodePicture, sha256 } from "../document/pictures";
import { createRecoveryRoomId } from "../collaboration/room";
import {
  createEnvelope,
  defaultRoomKey,
  DEFAULT_PASSWORD,
  seal,
  unseal,
} from "../collaboration/roomKey";
import { decodeContents, encodeContents } from "./workspaceFile";
import { recoverPublicWorkspace } from "./recoverWorkspace";

it.each(["", "local-"])("recovers a %sroom and its pictures under a fresh key", async (prefix) => {
  const source = new CanvasDocument();
  const restored = new CanvasDocument();
  try {
    const originalRoom = `${prefix}${"a".repeat(48)}`;
    const targetRoom = createRecoveryRoomId(originalRoom);
    const key = await defaultRoomKey(originalRoom);
    const bytes = new Uint8Array([1, 2, 3]);
    const sealedPicture = await seal(key, bytes);
    const hash = (await sha256(sealedPicture)).hex;
    source.create("picture", 0, 0, {
      id: "picture",
      picture: { hash, format: "image/png", stored: !prefix },
    });
    const copy = {
      roomId: originalRoom,
      envelope: await createEnvelope(DEFAULT_PASSWORD, key, 1),
      sealed: await seal(
        key,
        encodeContents({
          roomId: originalRoom,
          update: Y.encodeStateAsUpdate(source.doc),
          pictures: prefix ? [encodePicture(hash, "image/png", sealedPicture)] : [],
        })
      ),
    };
    const read = vi.fn(() => Promise.resolve(sealedPicture));
    const recovered = await recoverPublicWorkspace(copy, targetRoom, read);
    const newKey = await defaultRoomKey(targetRoom);
    const contents = decodeContents(await unseal(newKey, recovered.sealed));
    Y.applyUpdate(restored.doc, contents.update);
    expect(recovered.roomId).toBe(targetRoom);
    expect(targetRoom).toMatch(prefix ? /^local-[a-f0-9]{48}$/ : /^[a-f0-9]{48}$/);
    expect(targetRoom).not.toBe(originalRoom);
    const picture = restored.get("picture")!.picture!;
    expect(picture.hash).not.toBe(hash);
    expect(picture.stored).toBe(false);
    const data = (await decodePicture(contents.pictures[0]))!;
    expect(await unseal(newKey, data.bytes)).toEqual(bytes);
    expect(read).toHaveBeenCalledTimes(prefix ? 0 : 1);
    expect(source.get("picture")!.picture!.hash).toBe(hash);
  } finally {
    source.destroy();
    restored.destroy();
  }
});
