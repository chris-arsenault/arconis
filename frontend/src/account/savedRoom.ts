import * as Y from "yjs";
import type { CanvasDocument } from "../document/canvasDocument";
import { decodePicture, encodePicture, pictureHashes } from "../document/pictures";
import type { PictureCodec, StoredPicture } from "../collaboration/pictureStore";
import type { Envelope } from "../collaboration/roomKey";
import {
  decodeContents,
  encodeContents,
  isSealed,
  type SavedCopy,
  type WorkspaceContents,
} from "./workspaceFile";
import type { SaveableRoom } from "./workspaceSaver";

/** Current room-key capabilities; the adapter reads live envelope state for each operation. */
interface SavedRoomKey {
  readonly codec: PictureCodec;
  readonly currentEnvelope: Envelope | null;
  readonly whenOpen: Promise<void>;
  adoptEnvelope(envelope: Envelope): void;
}

interface SavedPictures {
  read(hash: string): Promise<StoredPicture | undefined>;
  keep(hash: string, picture: StoredPicture): Promise<void>;
}

/** Account-specific saved-copy policy, independent of room and editor implementations. */
export class SavedRoom implements SaveableRoom {
  private origin = Symbol("saved copy");

  constructor(
    readonly id: string,
    private document: CanvasDocument,
    private pictures: SavedPictures,
    private key: SavedRoomKey | null,
    private persistence: unknown,
    private signal: AbortSignal
  ) {}

  title() {
    // The real title is inside what the password protects.
    return this.key ? "Password room" : this.document.title();
  }

  async contents(): Promise<SavedCopy> {
    this.signal.throwIfAborted();
    const contents = {
      roomId: this.id,
      update: Y.encodeStateAsUpdate(this.document.doc),
      pictures: await this.unsharedPictures(),
    };
    this.signal.throwIfAborted();
    const envelope = this.key?.currentEnvelope;
    if (!this.key) return { roomId: this.id, contents };
    if (!envelope) throw new Error("Open this password room before saving.");
    const sealed = await this.key.codec.seal(encodeContents(contents));
    this.signal.throwIfAborted();
    return { roomId: this.id, envelope, sealed };
  }

  async apply(copy: SavedCopy) {
    if (this.signal.aborted) return;
    let contents: WorkspaceContents;
    if (isSealed(copy)) {
      if (!this.key) throw new Error("This saved copy belongs to a password room.");
      this.key.adoptEnvelope(copy.envelope);
      await this.waitForKey(this.key);
      if (this.signal.aborted) return;
      contents = decodeContents(await this.key.codec.open(copy.sealed));
    } else contents = copy.contents;
    const decoded = await Promise.all(contents.pictures.map(decodePicture));
    if (this.signal.aborted) return;
    await Promise.all(
      decoded.map((picture) => picture && this.pictures.keep(picture.hash, picture))
    );
    if (!this.signal.aborted) Y.applyUpdate(this.document.doc, contents.update, this.origin);
  }

  onChange(listener: () => void) {
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== this.origin && origin !== this.persistence) listener();
    };
    this.document.doc.on("update", onUpdate);
    return () => this.document.doc.off("update", onUpdate);
  }

  private async waitForKey(key: SavedRoomKey) {
    if (this.signal.aborted) return;
    let abort!: () => void;
    const stopped = new Promise<void>((resolve) => {
      abort = resolve;
      this.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      await Promise.race([key.whenOpen, stopped]);
    } finally {
      this.signal.removeEventListener("abort", abort);
    }
  }

  /** Include locally held stored bytes when peers cannot obtain them from shared storage. */
  private async unsharedPictures() {
    const items = this.document.list().filter((item) => item.picture && !item.picture.stored);
    const found = await Promise.all(
      pictureHashes(items).map(async (hash) => {
        const picture = await this.pictures.read(hash);
        return picture && encodePicture(hash, picture.type, picture.bytes);
      })
    );
    return found.flatMap((picture) => picture ?? []);
  }
}
