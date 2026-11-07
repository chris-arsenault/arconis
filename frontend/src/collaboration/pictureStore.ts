import { pictureKey, sha256 } from "../document/pictures";

export interface StoredPicture {
  bytes: Uint8Array;
  type: string;
}

/** Where pictures persist on this device. */
export interface PictureShelf {
  get(hash: string): Promise<StoredPicture | undefined>;
  put(hash: string, picture: StoredPicture): Promise<void>;
}

/** How bytes are kept. A password room encrypts them; every other room stores them as they are. */
export interface PictureCodec {
  seal(bytes: Uint8Array): Promise<Uint8Array>;
  open(bytes: Uint8Array): Promise<Uint8Array>;
}
export const PLAIN_CODEC: PictureCodec = {
  seal: (bytes) => Promise.resolve(bytes),
  open: (bytes) => Promise.resolve(bytes),
};

/** Fetching gives up after this many tries, until the next time the picture is needed. */
const MAX_FETCHES = 6;
const FIRST_RETRY_MS = 2000;

export interface PictureStoreOptions {
  shelf: PictureShelf;
  codec: PictureCodec;
  /** Null in a room with no shared storage. */
  download: ((hash: string) => Promise<Uint8Array | null>) | null;
  createUrl: (bytes: Uint8Array, type: string) => string;
  revokeUrl: (url: string) => void;
}

/**
 * Pictures by hash: bytes on this device, fetched once from shared storage, and drawn through object
 * URLs. Fetched bytes are checked against their hash, so storage cannot substitute another picture.
 */
export class PictureStore {
  private urls = new Map<string, string>();
  private loading = new Set<string>();
  private shared = new Set<string>();
  private listeners = new Set<() => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(private options: PictureStoreOptions) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Keeps a new picture. Returns the hash that names its stored form. */
  async add(bytes: Uint8Array, type: string) {
    const sealed = await this.options.codec.seal(bytes);
    const { hex } = await sha256(sealed);
    await this.options.shelf.put(hex, { bytes: sealed, type });
    return hex;
  }

  /** The stored form, for uploading and files. */
  read(hash: string) {
    return this.options.shelf.get(hash);
  }

  /** Keeps a picture from a file, already checked against its hash. */
  async keep(hash: string, picture: StoredPicture) {
    await this.options.shelf.put(hash, picture);
  }

  /**
   * An address to draw from, or null while it is not ready yet, which starts it loading.
   * `shared` says the picture has reached shared storage, so asking for it is worthwhile.
   */
  url(hash: string, type: string, shared: boolean) {
    const url = this.urls.get(hash);
    if (url) return url;
    if (shared) this.shared.add(hash);
    if (!this.loading.has(hash)) void this.load(hash, type, 0);
    return null;
  }

  private async load(hash: string, type: string, attempt: number) {
    this.loading.add(hash);
    let stored = await this.options.shelf.get(hash);
    // Read after waiting: word that a picture reached storage can arrive during the lookup.
    const fetchable = this.shared.has(hash) && this.options.download !== null;
    if (!stored && fetchable) stored = await this.fetchVerified(hash, type);
    if (this.closed) return;
    if (stored) {
      await this.publish(hash, stored);
      this.loading.delete(hash);
      return;
    }
    if (fetchable && attempt + 1 < MAX_FETCHES) {
      const timer = setTimeout(
        () => {
          this.timers.delete(timer);
          void this.load(hash, type, attempt + 1);
        },
        FIRST_RETRY_MS * 2 ** attempt
      );
      this.timers.add(timer);
      return;
    }
    this.loading.delete(hash);
  }

  private async fetchVerified(hash: string, type: string) {
    try {
      const bytes = await this.options.download!(hash);
      if (!bytes || (await sha256(bytes)).hex !== hash) return undefined;
      const picture = { bytes, type };
      await this.options.shelf.put(hash, picture);
      return picture;
    } catch {
      return undefined;
    }
  }

  private async publish(hash: string, stored: StoredPicture) {
    try {
      const bytes = await this.options.codec.open(stored.bytes);
      if (this.closed) return;
      this.urls.set(hash, this.options.createUrl(bytes, stored.type));
      this.listeners.forEach((listener) => listener());
    } catch {
      // Bytes that cannot be opened stay undrawn, like any other picture not available yet.
    }
  }

  close() {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.urls.forEach((url) => this.options.revokeUrl(url));
    this.urls.clear();
    this.listeners.clear();
  }
}

/** Pictures kept in this browser, shared by its rooms because a hash names the same bytes anywhere. */
export function indexedDbShelf(): PictureShelf {
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("arconis-pictures", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pictures");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("This browser could not open picture storage."));
  });
  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest
  ) => {
    const db = await opened;
    return new Promise<T>((resolve, reject) => {
      const request = action(db.transaction("pictures", mode).objectStore("pictures"));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(new Error("This browser could not use picture storage."));
    });
  };
  return {
    get: (hash) => run<StoredPicture | undefined>("readonly", (store) => store.get(hash)),
    put: async (hash, picture) => {
      await run<unknown>("readwrite", (store) => store.put(picture, hash));
    },
  };
}

/** Fetches through the website's own address, where a missing key serves the app instead. */
export async function downloadPicture(hash: string) {
  const response = await fetch(`/${pictureKey(hash)}`);
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

export function browserPictureUrls() {
  return {
    createUrl: (bytes: Uint8Array, type: string) =>
      URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type })),
    revokeUrl: (url: string) => URL.revokeObjectURL(url),
  };
}
