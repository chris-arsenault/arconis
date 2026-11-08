import { afterEach, expect, it, vi } from "vitest";
import { toBase64 } from "lib0/buffer";
import type { FrameChannel } from "./channel";
import { LockedTransport } from "./lockedTransport";
import { generateRoomKey, seal } from "./roomKey";

afterEach(() => vi.restoreAllMocks());

function carrier(): FrameChannel {
  return {
    onMessage: () => {},
    onReady: () => {},
    onStatus: () => {},
    connect: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  };
}
function frame(data: Uint8Array) {
  return JSON.stringify({
    v: 1,
    from: "sender",
    id: "update",
    kind: "update",
    target: "",
    index: 0,
    total: 1,
    data: toBase64(data),
  });
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

it("does not send queued encrypted frames after its channel closes", async () => {
  const inner = carrier();
  const channel = new LockedTransport(inner, "sender");
  channel.unlock(await generateRoomKey());
  let finish!: (bytes: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((resolve) => (finish = resolve));
  const encrypt = vi.spyOn(crypto.subtle, "encrypt").mockReturnValueOnce(pending);
  channel.send(frame(new Uint8Array([1])));
  channel.send(frame(new Uint8Array([2])));
  await vi.waitFor(() => expect(encrypt).toHaveBeenCalledOnce());
  channel.close();
  finish(new ArrayBuffer(16));
  await settled();
  expect(inner.send).not.toHaveBeenCalled();
  expect(inner.close).toHaveBeenCalledOnce();
});

it("does not deliver queued decrypted frames after its channel closes", async () => {
  const inner = carrier();
  const channel = new LockedTransport(inner, "recipient");
  const key = await generateRoomKey();
  channel.unlock(key);
  const message = frame(await seal(key, new Uint8Array([1])));
  let finish!: (bytes: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((resolve) => (finish = resolve));
  const decrypt = vi.spyOn(crypto.subtle, "decrypt").mockReturnValueOnce(pending);
  channel.onMessage = vi.fn();
  inner.onMessage(message);
  inner.onMessage(message);
  await vi.waitFor(() => expect(decrypt).toHaveBeenCalledOnce());
  channel.close();
  finish(new Uint8Array([1]).buffer);
  await settled();
  expect(channel.onMessage).not.toHaveBeenCalled();
  expect(inner.close).toHaveBeenCalledOnce();
});
