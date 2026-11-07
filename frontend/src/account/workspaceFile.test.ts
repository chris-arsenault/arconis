import { expect, it } from "vitest";
import * as Y from "yjs";
import {
  createEnvelope,
  generateRoomKey,
  openEnvelope,
  seal,
  unseal,
} from "../collaboration/roomKey";
import {
  decodeContents,
  decodeSavedCopy,
  encodeContents,
  encodeSavedCopy,
  isSealed,
  type WorkspaceContents,
} from "./workspaceFile";

const ROOM = "ab".repeat(24);
const decoder = new TextDecoder();

function contents(text: string): WorkspaceContents {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, text);
  return { roomId: ROOM, update: Y.encodeStateAsUpdate(doc), pictures: [] };
}
const textOf = (update: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc.getText("t").toString();
};

it("stores an ordinary room's copy as it is, and reads it back", () => {
  const stored = encodeSavedCopy({ roomId: ROOM, contents: contents("Roadmap") });
  const copy = decodeSavedCopy(stored);
  expect(isSealed(copy)).toBe(false);
  if (!isSealed(copy)) expect(textOf(copy.contents.update)).toBe("Roadmap");
});

it("stores a password room's copy sealed, so only the room's password opens it", async () => {
  const key = await generateRoomKey();
  const envelope = await createEnvelope("room password", key, 1);
  const sealed = await seal(key, encodeContents(contents("Private roadmap")));
  const stored = encodeSavedCopy({ roomId: `locked-${ROOM}`, envelope, sealed });
  expect(decoder.decode(stored)).not.toContain("Private roadmap");

  const copy = decodeSavedCopy(stored);
  if (!isSealed(copy)) throw new Error("expected a sealed copy");
  const opened = await openEnvelope("room password", copy.envelope);
  expect(textOf(decodeContents(await unseal(opened, copy.sealed)).update)).toBe("Private roadmap");
  await expect(openEnvelope("wrong password", copy.envelope)).rejects.toThrow();
});

it("refuses bytes that are not a saved copy", () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ format: 99, roomId: ROOM }));
  expect(() => decodeSavedCopy(bytes)).toThrow();
});
