import { IndexeddbPersistence } from "y-indexeddb";
import { CanvasDocument } from "../document/canvasDocument";
import { CollaborationProvider } from "./provider";
import { LocalTransport, readConfig, type ConnectionState, type Transport } from "./transport";
import { RelayTransport } from "./relayTransport";
import { EditCounter } from "./relayStart";
import { LockedTransport } from "./lockedTransport";
import { RoomLock, indexedDbLockedStorage } from "./roomLock";
import {
  PLAIN_CODEC,
  PictureStore,
  browserPictureUrls,
  downloadPicture,
  indexedDbShelf,
} from "./pictureStore";
import { putToStorage, uploadWaitingPictures } from "./pictureUploads";
import { decodePicture, encodePicture, pictureHashes } from "../document/pictures";
import { notifyPictures, setPictureSource } from "../editor/pictureSource";

export function createRoomId() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function parseRoom(value: string) {
  let candidate = value.trim();
  try {
    candidate = new URL(candidate).hash.slice(1);
  } catch {
    /* Raw room codes need no URL parsing. */
  }
  const prefix = candidate.startsWith("local=") ? LOCAL_PREFIX : lockedPrefix(candidate);
  candidate = candidate.replace(/^(room|local|locked)=/, "");
  if (!/^[a-f0-9]{48}$/.test(candidate)) return null;
  return `${prefix}${candidate}`;
}
const LOCAL_PREFIX = "local-";
const LOCKED_PREFIX = "locked-";
function lockedPrefix(hash: string) {
  return hash.startsWith("locked=") ? LOCKED_PREFIX : "";
}
/** A room whose contents are encrypted in the browser under a password. */
export function createLockedRoomId() {
  return `${LOCKED_PREFIX}${createRoomId()}`;
}
export function isLockedRoom(id: string) {
  return id.startsWith(LOCKED_PREFIX);
}
/** A room on this device only. It never connects to the relay, and nothing leaves the browser. */
export function createLocalRoomId() {
  return `${LOCAL_PREFIX}${createRoomId()}`;
}
export function isLocalRoom(id: string) {
  return id.startsWith(LOCAL_PREFIX);
}
export function roomHash(id: string) {
  if (isLocalRoom(id)) return `local=${id.slice(LOCAL_PREFIX.length)}`;
  if (isLockedRoom(id)) return `locked=${id.slice(LOCKED_PREFIX.length)}`;
  return `room=${id}`;
}

/** What carries this room's frames. The relay never sees the prefix naming a password room. */
function createCarrier(id: string): Transport {
  const config = readConfig();
  if (config.transport === "local" || isLocalRoom(id)) return new LocalTransport(id);
  return new RelayTransport(config.relayUrl, id.replace(LOCKED_PREFIX, ""));
}

export class RoomSession {
  readonly document = new CanvasDocument();
  readonly persistence: { whenSynced: Promise<unknown>; destroy(): unknown };
  /** Present in a password room. */
  readonly lock: RoomLock | null;
  readonly provider: CollaborationProvider;
  state: ConnectionState = "connecting";
  detail = "Restoring this device's canvas";
  stored = false;
  version = 0;
  private listeners = new Set<() => void>();
  private disposed = false;
  private edits = new EditCounter();
  private transport: Transport;
  readonly pictures: PictureStore;
  /** A message about pictures for the status bar. */
  notice = "";
  private uploading = false;

  constructor(
    readonly id: string,
    name: string,
    /** Creating a room starts the relay, because a new room is about to be shared. */
    private created = false
  ) {
    const peerId = crypto.randomUUID();
    const carrier = createCarrier(id);
    const locked = isLockedRoom(id) ? new LockedTransport(carrier, peerId) : null;
    const transport = locked ?? carrier;
    this.transport = transport;
    this.lock = locked
      ? new RoomLock(indexedDbLockedStorage(id), locked, this.document.doc, this.emit, created)
      : null;
    this.pictures = new PictureStore({
      shelf: indexedDbShelf(),
      codec: this.lock?.codec ?? PLAIN_CODEC,
      download: transport.requestUpload ? downloadPicture : null,
      ...browserPictureUrls(),
    });
    this.pictures.subscribe(notifyPictures);
    setPictureSource((hash, type, shared) => this.pictures.url(hash, type, shared));
    this.persistence = this.lock ?? new IndexeddbPersistence(`arconis:${id}`, this.document.doc);
    this.provider = new CollaborationProvider(this.document.doc, transport, this.emit, peerId);
    transport.onStatus = (state, detail = "") => {
      this.state = state;
      this.detail = detail;
      if (state !== "online") this.provider.disconnected();
      else void this.uploadPictures();
      this.emit();
    };
    this.provider.awareness.setLocalStateField("user", {
      name,
      color: ["#7863d4", "#d56486", "#329883", "#cf8c39"][this.document.doc.clientID % 4],
    });
    this.provider.awareness.on("change", this.emit);
    this.document.doc.on("update", this.emit);
    this.document.doc.on("update", this.onEdit);
  }
  async start() {
    await this.persistence.whenSynced;
    if (!this.disposed) {
      this.stored = true;
      // A person arriving at a room or at their own saved work is about to use the relay. Someone
      // following a link with no local copy has nothing to send yet, and can use the button.
      const hasCopy = this.lock?.hasLocalCopy ?? this.document.doc.store.clients.size > 0;
      if (this.created || hasCopy) {
        this.transport.markFresh?.();
        this.transport.start?.();
      }
      this.provider.connect();
      this.emit();
    }
  }
  setNotice(notice: string) {
    this.notice = notice;
    this.emit();
  }
  /** Uploads what this browser holds and storage lacks. Failures retry on reconnecting. */
  uploadPictures = async () => {
    const request = this.transport.requestUpload?.bind(this.transport);
    if (!request || this.uploading || this.state !== "online") return;
    this.uploading = true;
    try {
      this.setNotice(
        await uploadWaitingPictures({
          document: this.document,
          store: this.pictures,
          request,
          put: putToStorage,
          // Encrypted bytes must not claim to be an image.
          contentType: (type) => (this.lock ? "application/octet-stream" : type),
        })
      );
    } catch {
      // The picture stays on this device, and shows to others after the next attempt.
    } finally {
      this.uploading = false;
    }
  };
  /** The pictures a file needs, in the form they are stored. */
  async portablePictures(ids: string[] = []) {
    const chosen = new Set(ids);
    const items = this.document.list().filter((item) => !ids.length || chosen.has(item.id));
    const found = await Promise.all(
      pictureHashes(items).map(async (hash) => {
        const picture = await this.pictures.read(hash);
        return picture ? encodePicture(hash, picture.type, picture.bytes) : null;
      })
    );
    return found.filter((picture) => picture !== null);
  }
  /** Keeps the pictures in a file's text, before its objects are imported. */
  async keepFilePictures(content: string) {
    const { pictures } = JSON.parse(content) as { pictures: unknown };
    if (!Array.isArray(pictures)) return;
    const decoded = await Promise.all(pictures.map(decodePicture));
    await Promise.all(
      decoded
        .filter((picture) => picture !== null)
        .map(({ hash, type, bytes }) => this.pictures.keep(hash, { bytes, type }))
    );
  }
  /** Whether the relay is off and someone here can ask for it. */
  get canStartCollaboration() {
    return Boolean(this.transport.start) && (this.state === "stopped" || this.state === "error");
  }
  startCollaboration = () => {
    this.transport.start?.();
  };
  private onEdit = (_update: Uint8Array, origin: unknown) => {
    if (origin === this.persistence || this.state !== "stopped") return;
    if (this.edits.record(Date.now())) this.startCollaboration();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.version;
  emit = () => {
    this.version++;
    this.listeners.forEach((listener) => listener());
  };
  rename(name: string) {
    const user = this.provider.awareness.getLocalState()?.user as { color: string };
    this.provider.awareness.setLocalStateField("user", { ...user, name });
  }
  destroy() {
    this.disposed = true;
    setPictureSource(null);
    this.pictures.close();
    this.provider.destroy();
    Promise.resolve(this.persistence.destroy()).catch(() => {});
    this.document.destroy();
    this.listeners.clear();
  }
}
