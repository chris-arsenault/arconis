import type { CanvasDocument } from "../document/canvasDocument";
import {
  decodePicture,
  encodePicture,
  pictureHashes,
  sha256,
  type FilePictures,
} from "../document/pictures";
import { embedCopy } from "../document/pngCopy";
import { parse } from "../language/parser";
import { importDocument, readDocumentFile, serializeDocument } from "./canvasFile";
import { exportItems } from "../document/exportItems";

interface FilePictureStore {
  add(bytes: Uint8Array, type: string): Promise<string>;
  readOpen(hash: string): Promise<{ bytes: Uint8Array; type: string } | null>;
}

/** Portable file operations use picture capabilities, never a room or graph implementation. */
export class CanvasFiles {
  constructor(
    private document: CanvasDocument,
    private pictures: FilePictureStore,
    private signal: AbortSignal,
    private imported: () => void
  ) {}

  async import(file: File) {
    this.signal.throwIfAborted();
    const content = await readDocumentFile(file);
    this.signal.throwIfAborted();
    const renames = await this.preparePictures(content);
    this.signal.throwIfAborted();
    const created = importDocument(this.document, content, renames);
    this.imported();
    return created.length;
  }

  /** Pasted canvas text: its pictures are kept here first, then its items placed by `place`. */
  async paste(content: string, place: (created: string[]) => void) {
    this.signal.throwIfAborted();
    const renames = await this.preparePictures(content);
    this.signal.throwIfAborted();
    const created = importDocument(this.document, content, renames, place, true);
    this.imported();
    return created;
  }

  /** Whole-document canvas files and selected PNG copies share the same portable representation. */
  async canvas(ids: string[] = [], includeMarkup = true) {
    this.signal.throwIfAborted();
    const pictures = await this.portablePictures(ids, includeMarkup);
    this.signal.throwIfAborted();
    return serializeDocument(this.document, ids, pictures, includeMarkup);
  }

  async png(ids: string[], render: () => Promise<Uint8Array | null>, includeMarkup = true) {
    this.signal.throwIfAborted();
    const png = await render();
    this.signal.throwIfAborted();
    if (!png) return null;
    const result = await embedCopy(png, await this.canvas(ids, includeMarkup));
    this.signal.throwIfAborted();
    return result;
  }

  /** A file names pictures by their plain bytes, even when their stored form is encrypted. */
  private async portablePictures(ids: string[], includeMarkup: boolean): Promise<FilePictures> {
    const items = exportItems(this.document.list(), ids, includeMarkup);
    const renames = new Map<string, string>();
    const found = await Promise.all(
      pictureHashes(items).map(async (hash) => {
        const picture = await this.pictures.readOpen(hash);
        if (!picture) return null;
        const { hex } = await sha256(picture.bytes);
        if (hex !== hash) renames.set(hash, hex);
        return encodePicture(hex, picture.type, picture.bytes);
      })
    );
    return { pictures: found.filter((picture) => picture !== null), renames };
  }

  /** Incoming pictures are kept through the destination store's plain or encrypted codec. */
  private async preparePictures(content: string) {
    const data = parse(content).flatMap((statement) =>
      statement.kind === "data"
        ? [{ hash: statement.hash, type: statement.format, data: statement.data }]
        : []
    );
    const decoded = await Promise.all(data.map(decodePicture));
    this.signal.throwIfAborted();
    const renames = new Map<string, string>();
    for (const picture of decoded) {
      if (!picture) continue;
      this.signal.throwIfAborted();
      const kept = await this.pictures.add(picture.bytes, picture.type);
      if (kept !== picture.hash) renames.set(picture.hash, kept);
    }
    return renames;
  }
}
