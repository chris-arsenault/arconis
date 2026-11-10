const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Letters and digits after a leading letter: about 78 billion ids, short enough to read and type. */
const LENGTH = 7;

/** Ids are names in the canvas language: a letter, then letters, digits, `_` or `-`. */
export const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function isId(value: string) {
  return ID_PATTERN.test(value);
}

const OBJECT_SCHEME = /^(?:canvas|local):/i;
const OBJECT_LINK = /^(?:canvas|local):\/\/([a-z_][a-z0-9_-]*)\/?$/i;

export function isCanvasObjectUrl(url: string) {
  return OBJECT_SCHEME.test(url);
}

/** Canvas ids are case-sensitive; do not parse them as URL hostnames. */
export function canvasObjectId(url: string) {
  return OBJECT_LINK.exec(url)?.[1] ?? null;
}

export function canvasObjectUrl(id: string) {
  return `canvas://${id}`;
}

/** A short random id that `taken` does not claim. */
export function newId(taken: (id: string) => boolean = () => false) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
    const id =
      ALPHABET[bytes[0] % 26] +
      [...bytes.slice(1)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
    if (!taken(id)) return id;
  }
}
