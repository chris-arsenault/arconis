import { CanvasDocument } from "../document/canvasDocument";
import { CollaborationProvider } from "./provider";
import { LocalTransport, readConfig } from "./transport";
import type { ConnectionState, FrameChannel } from "./channel";
import type { RelayActivation, SharedPictures } from "./services";
import { RelayTransport } from "./relayTransport";
import { EditCounter } from "./relayStart";
import { LockedTransport } from "./lockedTransport";
import { RoomLock, indexedDbLockedStorage } from "./roomLock";
import { PictureStore, browserPictureUrls, downloadPicture, indexedDbShelf } from "./pictureStore";
import { putToStorage, uploadWaitingPictures } from "./pictureUploads";
import { SavedRoom } from "../account/savedRoom";
import { CanvasFiles } from "../files/canvasFiles";

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
  // A link may name an item to open at, after the room: #room=…&item=<id>.
  candidate = candidate.replace(/^(room|local|locked)=/, "");
  const extra = candidate.search(/[&?]/);
  if (extra >= 0) candidate = candidate.slice(0, extra);
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
/** History recovery creates an independent room with the source's access mode. */
export function createRecoveryRoomId(source: string) {
  if (isLockedRoom(source)) return createLockedRoomId();
  if (isLocalRoom(source)) return createLocalRoomId();
  return createRoomId();
}
export function roomHash(id: string) {
  if (isLocalRoom(id)) return `local=${id.slice(LOCAL_PREFIX.length)}`;
  if (isLockedRoom(id)) return `locked=${id.slice(LOCKED_PREFIX.length)}`;
  return `room=${id}`;
}

/** What carries this room's frames. The relay never sees the prefix naming a password room. */
function createCarrier(id: string): {
  channel: FrameChannel;
  activation: RelayActivation | null;
  pictures: SharedPictures | null;
} {
  const config = readConfig();
  if (config.transport === "local" || isLocalRoom(id))
    return { channel: new LocalTransport(id), activation: null, pictures: null };
  const relay = new RelayTransport(config.relayUrl, id.replace(LOCKED_PREFIX, ""));
  return {
    channel: relay,
    activation: relay,
    pictures: { requestUpload: relay.requestUpload.bind(relay), download: downloadPicture },
  };
}

export class RoomSession {
  readonly document = new CanvasDocument();
  readonly lock: RoomLock;
  readonly provider: CollaborationProvider;
  state: ConnectionState = "connecting";
  detail = "Restoring this device's canvas";
  stored = false;
  version = 0;
  private listeners = new Set<() => void>();
  private disposed = false;
  private lifetime = new AbortController();
  private edits = new EditCounter();
  private activation: RelayActivation | null;
  private sharedPictures: SharedPictures | null;
  readonly pictures: PictureStore;
  readonly files: CanvasFiles;
  readonly saveable: SavedRoom;
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
    const transport = new LockedTransport(carrier.channel, peerId);
    this.activation = carrier.activation;
    this.sharedPictures = carrier.pictures;
    this.lock = new RoomLock(
      indexedDbLockedStorage(id),
      transport,
      this.document.doc,
      this.emit,
      created,
      isLockedRoom(id) ? null : id
    );
    this.pictures = new PictureStore({
      shelf: indexedDbShelf(),
      codec: this.lock.codec,
      download: carrier.pictures?.download ?? null,
      ...browserPictureUrls(),
    });
    this.files = new CanvasFiles(
      this.document,
      this.pictures,
      this.lifetime.signal,
      () => void this.uploadPictures()
    );
    this.saveable = new SavedRoom(
      id,
      this.document,
      this.pictures,
      this.lock,
      this.lifetime.signal,
      () => void this.uploadPictures()
    );
    this.provider = new CollaborationProvider(
      this.document.doc,
      transport,
      this.emit,
      peerId,
      this.document.actions
    );
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
  async start(restoringCopy = false) {
    await this.lock.whenSynced;
    if (!this.disposed) {
      this.stored = true;
      // A person arriving at a room or at their own saved work is about to use the relay. Someone
      // following a link with no local copy has nothing to send yet, and can use the button.
      const hasCopy = this.lock.hasLocalCopy;
      if (this.created || hasCopy || restoringCopy) {
        this.activation?.markFresh();
        this.activation?.start();
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
    const request = this.sharedPictures?.requestUpload;
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
          contentType: () => "application/octet-stream",
        })
      );
    } catch {
      // The picture stays on this device, and shows to others after the next attempt.
    } finally {
      this.uploading = false;
    }
  };
  /** Whether the relay is off and someone here can ask for it. */
  get canStartCollaboration() {
    return this.activation !== null && (this.state === "stopped" || this.state === "error");
  }
  startCollaboration = () => {
    this.activation?.start();
  };
  private onEdit = (_update: Uint8Array, origin: unknown) => {
    if (origin === this.lock || this.state !== "stopped") return;
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
    this.lifetime.abort();
    this.pictures.close();
    this.provider.destroy();
    void this.lock.destroy();
    this.document.destroy();
    this.listeners.clear();
  }
}
