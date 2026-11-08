import { fromBase64, toBase64 } from "lib0/buffer";
import type { Frame } from "./frames";
import { parseEnvelope, seal, unseal, type Envelope } from "./roomKey";
import type { ConnectionState, FrameChannel } from "./channel";

const ENVELOPE_RETRY_MS = 3000;
const RELAY_MESSAGE = '{"relay"';

interface EnvelopeFrame extends Omit<Frame, "kind"> {
  kind: "envelope";
}

/**
 * Encrypts every frame's contents before another transport carries it. The relay sees only each
 * frame's sender, kind and target, which it needs for routing and to know when a room is active.
 * Until a key arrives, the only thing sent is a request for the room's envelope.
 */
export class LockedTransport implements FrameChannel {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  /** Called with each envelope a peer sends. */
  onEnvelope: (envelope: Envelope) => void = () => {};
  /** What to answer when someone asks for this room's envelope. */
  shareEnvelope: () => Envelope | null = () => null;
  private key: CryptoKey | null = null;
  private connected = false;
  private closed = false;
  private haveEnvelope = false;
  private sending = Promise.resolve();
  private receiving = Promise.resolve();
  private retry: ReturnType<typeof setInterval> | null = null;

  constructor(
    private inner: FrameChannel,
    private peerId: string
  ) {
    inner.onStatus = (state, detail) => {
      if (this.closed) return;
      if (state !== "online") this.connected = false;
      this.onStatus(state, detail);
    };
    inner.onReady = () => {
      if (this.closed) return;
      this.connected = true;
      if (this.key) this.onReady();
      else this.askForEnvelope();
    };
    inner.onMessage = (message) => this.receive(message);
  }

  connect() {
    if (!this.closed) this.inner.connect();
  }

  /** Begins normal traffic. The provider's join starts here, not when the socket opened. */
  unlock(key: CryptoKey) {
    if (this.closed) return;
    this.key = key;
    this.stopAsking();
    if (this.connected) this.onReady();
  }

  /** Tells the room about an envelope, after a password change. */
  broadcastEnvelope(envelope: Envelope) {
    this.sendEnvelope(JSON.stringify(envelope), "");
  }

  /** Records that an envelope is already known, such as from this device. */
  envelopeKnown() {
    this.haveEnvelope = true;
    this.stopAsking();
  }

  private askForEnvelope() {
    if (this.haveEnvelope) return;
    this.sendEnvelope("", "");
    this.retry ??= setInterval(() => {
      if (this.connected) this.sendEnvelope("", "");
    }, ENVELOPE_RETRY_MS);
  }

  private stopAsking() {
    if (this.retry) clearInterval(this.retry);
    this.retry = null;
  }

  private sendEnvelope(data: string, target: string) {
    if (this.closed) return;
    const frame: EnvelopeFrame = {
      v: 1,
      from: this.peerId,
      id: crypto.randomUUID(),
      kind: "envelope",
      target,
      index: 0,
      total: 1,
      data,
    };
    this.inner.send(JSON.stringify(frame));
  }

  send(message: string) {
    const key = this.key;
    if (!key || this.closed) return;
    // Encryption is asynchronous, and frames must stay in order.
    this.sending = this.sending.then(async () => {
      if (this.closed) return;
      const frame = JSON.parse(message) as Frame;
      const data = toBase64(await seal(key, fromBase64(frame.data)));
      if (!this.closed) this.inner.send(JSON.stringify({ ...frame, data }));
    });
  }

  private receive(message: string) {
    if (this.closed || message.startsWith(RELAY_MESSAGE)) return;
    let frame: Frame | EnvelopeFrame;
    try {
      frame = JSON.parse(message) as Frame | EnvelopeFrame;
    } catch {
      return;
    }
    if (frame.kind === "envelope") {
      this.receiveEnvelope(frame);
      return;
    }
    const key = this.key;
    if (!key) return;
    this.receiving = this.receiving.then(async () => {
      if (this.closed) return;
      try {
        const data = toBase64(await unseal(key, fromBase64(frame.data)));
        if (!this.closed) this.onMessage(JSON.stringify({ ...frame, data }));
      } catch {
        // Not sealed under this room's key: someone without it, or something altered on the way.
      }
    });
  }

  private receiveEnvelope(frame: EnvelopeFrame) {
    if (frame.data) {
      const envelope = parseEnvelope(frame.data);
      if (!envelope) return;
      this.envelopeKnown();
      this.onEnvelope(envelope);
      return;
    }
    const envelope = this.shareEnvelope();
    if (envelope) this.sendEnvelope(JSON.stringify(envelope), frame.from);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.key = null;
    this.stopAsking();
    this.inner.close();
  }
}
