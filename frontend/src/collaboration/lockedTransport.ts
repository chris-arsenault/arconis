import { fromBase64, toBase64 } from "lib0/buffer";
import type { Frame } from "./frames";
import { parseEnvelope, seal, unseal, type Envelope } from "./roomKey";
import type { ConnectionState, Transport } from "./transport";

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
export class LockedTransport implements Transport {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  /** Called with each envelope a peer sends. */
  onEnvelope: (envelope: Envelope) => void = () => {};
  /** What to answer when someone asks for this room's envelope. */
  shareEnvelope: () => Envelope | null = () => null;
  start?: () => void;
  markFresh?: () => void;
  requestUpload?: Transport["requestUpload"];
  private key: CryptoKey | null = null;
  private connected = false;
  private haveEnvelope = false;
  private sending = Promise.resolve();
  private receiving = Promise.resolve();
  private retry: ReturnType<typeof setInterval> | null = null;

  constructor(
    private inner: Transport,
    private peerId: string
  ) {
    this.start = inner.start?.bind(inner);
    this.markFresh = inner.markFresh?.bind(inner);
    this.requestUpload = inner.requestUpload?.bind(inner);
    inner.onStatus = (state, detail) => {
      if (state !== "online") this.connected = false;
      this.onStatus(state, detail);
    };
    inner.onReady = () => {
      this.connected = true;
      if (this.key) this.onReady();
      else this.askForEnvelope();
    };
    inner.onMessage = (message) => this.receive(message);
  }

  connect() {
    this.inner.connect();
  }

  /** Begins normal traffic. The provider's join starts here, not when the socket opened. */
  unlock(key: CryptoKey) {
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
    if (!key) return;
    // Encryption is asynchronous, and frames must stay in order.
    this.sending = this.sending.then(async () => {
      const frame = JSON.parse(message) as Frame;
      const data = toBase64(await seal(key, fromBase64(frame.data)));
      this.inner.send(JSON.stringify({ ...frame, data }));
    });
  }

  private receive(message: string) {
    if (message.startsWith(RELAY_MESSAGE)) return;
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
      try {
        const data = toBase64(await unseal(key, fromBase64(frame.data)));
        this.onMessage(JSON.stringify({ ...frame, data }));
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
    this.stopAsking();
    this.inner.close();
  }
}
