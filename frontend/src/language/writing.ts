import type { DraftResult } from "./draft";
import type { Extent } from "./placement";

/** The shapes a write takes and returns. */

export interface WriteOptions {
  /** Who comments come from. */
  author: string;
  /** A file brings its own ids and renames those already taken; otherwise an id names an item. */
  importing: boolean;
  now: number;
}
export type WriteRequest = Pick<WriteOptions, "author"> & Partial<Omit<WriteOptions, "author">>;
export interface PictureData {
  hash: string;
  format: string;
  data: string;
}
export interface WriteResult extends DraftResult {
  pictures: PictureData[];
}

interface ScopeContext {
  holder: string;
  /** The item placed just before, which the next follows when it has no place of its own. */
  previous: string;
  /** Inside a block, items named there move into its holder. */
  nested: boolean;
}
export type Scope = ScopeContext &
  (
    | { kind: "flow" }
    | { kind: "slide"; area: string; carried: string[] }
    | { kind: "arrangement"; members: string[] }
  );
/** Where an item declared at a line's far end goes when it has no place of its own. */
export type Follow = (own: Extent) => { x: number; y: number };
