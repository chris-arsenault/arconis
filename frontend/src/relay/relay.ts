import type { UploadReply, UploadRequest } from "../collaboration/serviceProtocol";
import type { Uploads } from "./uploads";

/** Rooms and their sockets. The relay forwards frames between them and stores nothing. */

export const IDLE_NO_CONNECTIONS_MS = 10 * 60_000;
export const IDLE_NO_CONTENT_MS = 30 * 60_000;
export const BUDGET_CHECK_MS = 5 * 60_000;
export const TICK_MS = 30_000;

export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_ROOM_CONNECTIONS = 40;
export const MAX_CONNECTIONS = 300;
/** Bytes a room may send across all recipients. A dropped frame heals at the next state exchange. */
export const ROOM_EGRESS_BYTES_PER_SECOND = 8 * 1024 * 1024;
export const ROOM_EGRESS_BURST_BYTES = 64 * 1024 * 1024;
export const PEER_MESSAGES_PER_SECOND = 100;
export const PEER_MESSAGE_BURST = 1000;
/** A client this far behind gets disconnected rather than growing the relay's memory. */
export const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
/** Ends a session whose traffic would outrun the budget check, about $2 of transfer. */
export const MAX_SESSION_BYTES = 20 * 1024 * 1024 * 1024;

export type StopReason = "idle" | "limit";

export interface RelaySocket {
  readonly bufferedAmount: number;
  send(data: string): void;
  ping(): void;
  close(): void;
  terminate(): void;
}

export interface RelayOptions {
  now: () => number;
  /** Called once, after sockets have been told why the relay is going away. */
  stop: (reason: StopReason) => void;
  /** Resolves false when the monthly limit has been reached. */
  withinBudget: () => Promise<boolean>;
  /** Decides picture uploads; null where there is no shared storage. */
  uploads: Pick<Uploads, "prepare"> | null;
}

class TokenBucket {
  private tokens: number;
  private updated: number;
  constructor(
    private rate: number,
    private burst: number,
    now: number
  ) {
    this.tokens = burst;
    this.updated = now;
  }
  take(amount: number, now: number) {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.updated) / 1000) * this.rate);
    this.updated = now;
    if (this.tokens < amount) return false;
    this.tokens -= amount;
    return true;
  }
}

interface Peer {
  socket: RelaySocket;
  id: string;
  /** An agent's peer inside the relay. It neither keeps the relay running nor counts as a person. */
  agent: boolean;
  alive: boolean;
  messages: TokenBucket;
  /** Join requests from this peer, which rotate through the room so a retry reaches someone new. */
  joinRequests: number;
}
interface Room {
  peers: Set<Peer>;
  egress: TokenBucket;
}
interface Header {
  from: string;
  kind: string;
  target: string;
}

/** Messages for the relay itself, rather than for other people in the room. */
const RELAY_REQUEST = '{"relay"';
const FORWARDED_KINDS = new Set(["hello", "vector", "update", "awareness", "envelope"]);

function readHeader(message: string): Header | null {
  try {
    const frame = JSON.parse(message) as Partial<Header> | null;
    if (
      typeof frame?.from !== "string" ||
      typeof frame.target !== "string" ||
      typeof frame.kind !== "string" ||
      !FORWARDED_KINDS.has(frame.kind)
    )
      return null;
    return { from: frame.from, kind: frame.kind, target: frame.target };
  } catch {
    return null;
  }
}

function control(type: string, reason?: StopReason) {
  return JSON.stringify(reason ? { relay: type, reason } : { relay: type });
}

export class Relay {
  private rooms = new Map<string, Room>();
  private connections = 0;
  private lastContent: number;
  private noConnectionsSince: number;
  private lastBudgetCheck = Number.NEGATIVE_INFINITY;
  private sessionBytes = 0;
  private stopped = false;

  constructor(private options: RelayOptions) {
    this.lastContent = options.now();
    this.noConnectionsSince = options.now();
  }

  get connectionCount() {
    return this.connections;
  }

  /** Whether another socket fits in this room. */
  hasRoomFor(roomId: string) {
    if (this.stopped || this.connections >= MAX_CONNECTIONS) return false;
    return (this.rooms.get(roomId)?.peers.size ?? 0) < MAX_ROOM_CONNECTIONS;
  }

  /** How many people, not agents, are in a room. */
  peopleIn(roomId: string) {
    return [...(this.rooms.get(roomId)?.peers ?? [])].filter((peer) => !peer.agent).length;
  }

  get stopping() {
    return this.stopped;
  }

  /** `fresh` marks a person arriving by creating a room or loading a local copy. */
  join(roomId: string, socket: RelaySocket, fresh: boolean, agent = false) {
    const now = this.options.now();
    const room = this.rooms.get(roomId) ?? {
      peers: new Set<Peer>(),
      egress: new TokenBucket(ROOM_EGRESS_BYTES_PER_SECOND, ROOM_EGRESS_BURST_BYTES, now),
    };
    this.rooms.set(roomId, room);
    const peer: Peer = {
      socket,
      id: "",
      agent,
      alive: true,
      messages: new TokenBucket(PEER_MESSAGES_PER_SECOND, PEER_MESSAGE_BURST, now),
      joinRequests: 0,
    };
    room.peers.add(peer);
    if (!agent) this.connections++;
    if (fresh) this.lastContent = now;
    return {
      receive: (message: string) => this.receive(room, peer, message),
      pong: () => {
        peer.alive = true;
      },
      leave: () => this.leave(roomId, room, peer),
    };
  }

  private leave(roomId: string, room: Room, peer: Peer) {
    if (!room.peers.delete(peer)) return;
    if (!peer.agent) this.connections--;
    if (!room.peers.size) this.rooms.delete(roomId);
    if (!this.connections) this.noConnectionsSince = this.options.now();
  }

  private receive(room: Room, peer: Peer, message: string) {
    const now = this.options.now();
    if (!peer.messages.take(1, now)) return;
    if (message.startsWith(RELAY_REQUEST)) {
      this.answerUpload(peer, message);
      return;
    }
    const header = readHeader(message);
    if (!header) return;
    // A socket keeps the identity it first claimed, so it cannot speak as another peer.
    peer.id ||= header.from;
    if (peer.id !== header.from) return;
    const recipients = this.recipients(room, peer, header);
    const bytes = Buffer.byteLength(message) * recipients.length;
    if (!room.egress.take(bytes, now)) return;
    if (header.kind === "update" && !header.target) this.lastContent = now;
    recipients.forEach((other) => this.deliver(other, message));
    this.sessionBytes += bytes;
    if (this.sessionBytes > MAX_SESSION_BYTES) this.shutdown("limit");
  }

  /** Replies only to the asker. Picture bytes never pass through the relay. */
  private answerUpload(peer: Peer, message: string) {
    let request: UploadRequest;
    try {
      ({ request } = JSON.parse(message) as { request: UploadRequest });
      if (!request || typeof request !== "object") return;
    } catch {
      return;
    }
    const refused: UploadReply = { status: "refused", hash: request.hash, reason: "unavailable" };
    const pending = this.options.uploads?.prepare(request) ?? Promise.resolve(refused);
    void pending
      .catch(() => refused)
      .then((reply) => peer.socket.send(JSON.stringify({ relay: "upload-reply", reply })));
  }

  private recipients(room: Room, peer: Peer, header: Header) {
    const others = [...room.peers].filter((other) => other !== peer);
    if (header.target) return others.filter((other) => other.id === header.target);
    if (header.kind !== "hello") return others;
    // One person answers a join, which avoids everyone sending a full copy. The joiner then
    // broadcasts its state vector, and anyone holding more sends only the difference.
    const candidates = others.filter((other) => other.id);
    if (!candidates.length) return others;
    return [candidates[peer.joinRequests++ % candidates.length]];
  }

  private deliver(peer: Peer, message: string) {
    if (peer.socket.bufferedAmount > MAX_BUFFERED_BYTES) peer.socket.terminate();
    else peer.socket.send(message);
  }

  /** Runs the idle rules, liveness and the periodic budget check. */
  tick() {
    if (this.stopped) return;
    const now = this.options.now();
    if (this.idle(now)) {
      this.shutdown("idle");
      return;
    }
    this.checkLiveness();
    if (now - this.lastBudgetCheck >= BUDGET_CHECK_MS) {
      this.lastBudgetCheck = now;
      void this.options
        .withinBudget()
        .then((within) => {
          if (!within) this.shutdown("limit");
        })
        .catch(() => {
          // An unreachable check leaves the relay up; maximum runtime still bounds it.
        });
    }
  }

  private idle(now: number) {
    if (!this.connections) return now - this.noConnectionsSince >= IDLE_NO_CONNECTIONS_MS;
    return now - this.lastContent >= IDLE_NO_CONTENT_MS;
  }

  private checkLiveness() {
    const keepalive = control("ka");
    this.rooms.forEach((room) =>
      room.peers.forEach((peer) => {
        if (!peer.alive) {
          peer.socket.terminate();
          return;
        }
        peer.alive = false;
        peer.socket.ping();
        peer.socket.send(keepalive);
      })
    );
  }

  /** Tells every client why it is going away, so none mistakes this for a network failure. */
  shutdown(reason: StopReason) {
    if (this.stopped) return;
    this.stopped = true;
    const notice = control("closing", reason);
    this.rooms.forEach((room) =>
      room.peers.forEach((peer) => {
        peer.socket.send(notice);
        peer.socket.close();
      })
    );
    this.options.stop(reason);
  }
}
