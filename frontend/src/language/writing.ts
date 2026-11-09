import type { DraftResult } from "./draft";
import type { Extent } from "./placement";

/** The shapes a write takes and returns. */

export interface WriteOptions {
  /** Who comments come from. */
  author: string;
  /** A file brings its own ids and renames those already taken; otherwise an id names an item. */
  importing?: boolean;
  now?: number;
}
export interface PictureData {
  hash: string;
  format: string;
  data: string;
}
export interface WriteResult extends DraftResult {
  pictures: PictureData[];
}

export interface Scope {
  holder: string;
  /** The item placed just before, which the next follows when it has no place of its own. */
  previous: string;
  /** Inside a block, items named there move into its holder. */
  nested: boolean;
  /** A slide's block: its items take default spots within the slide but stay out of it. */
  area?: string;
  /** Items a slide's block placed, which move with the slide while this write settles it. */
  carried?: string[];
  /** Inside an arrangement, which places its members itself. */
  members?: string[];
}
/** Where an item declared at a line's far end goes when it has no place of its own. */
export type Follow = (own: Extent) => { x: number; y: number };
