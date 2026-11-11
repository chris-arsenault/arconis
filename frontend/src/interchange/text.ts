/** Small text tools the format readers share: a character cursor and line-splitting helpers. */

const isSpace = (char: string) => char === " " || char === "\t";
const QUOTES = "\"'";

/** Reads a string a character position at a time. */
export class TextCursor {
  index = 0;
  constructor(readonly source: string) {}

  get done() {
    return this.index >= this.source.length;
  }
  get char() {
    return this.source.charAt(this.index);
  }
  get rest() {
    return this.source.slice(this.index);
  }
  startsWith(text: string) {
    return this.source.startsWith(text, this.index);
  }
  /** Moves past `text` when it comes next. */
  take(text: string) {
    if (!this.startsWith(text)) return false;
    this.index += text.length;
    return true;
  }
  skipSpace() {
    while (!this.done && isSpace(this.char)) this.index += 1;
  }
  takeWhile(test: (char: string) => boolean) {
    const start = this.index;
    while (!this.done && test(this.char)) this.index += 1;
    return this.source.slice(start, this.index);
  }
  /**
   * Reads up to one of `stops` that sits outside quotes, leaving the stop unread. `quotes` names
   * the characters that quote; a format where an apostrophe is ordinary text passes only ".
   */
  takeUntil(stops: string, quotes = QUOTES) {
    const start = this.index;
    let quote = "";
    while (!this.done) {
      const char = this.char;
      if (quote === char) quote = "";
      else if (!quote && quotes.includes(char)) quote = char;
      else if (!quote && stops.includes(char)) break;
      this.index += 1;
    }
    return this.source.slice(start, this.index);
  }
  /** Reads up to `text` and past it; null, reading nothing, when it never comes. */
  takeThrough(text: string) {
    const at = this.source.indexOf(text, this.index);
    if (at < 0) return null;
    const taken = this.source.slice(this.index, at);
    this.index = at + text.length;
    return taken;
  }
}

/** The text after `word` when the line starts with that whole word, else null. */
export function afterWord(line: string, word: string) {
  if (!line.startsWith(word)) return null;
  const rest = line.slice(word.length);
  if (rest && !/^\s/.test(rest)) return null;
  return rest.trim();
}

/** The two sides of the first `separator`; the second is null when there is none. */
export function splitOnce(text: string, separator: string): [string, string | null] {
  const at = text.indexOf(separator);
  if (at < 0) return [text.trim(), null];
  return [text.slice(0, at).trim(), text.slice(at + separator.length).trim()];
}

/** Text without one pair of matching quotes or backticks around it. */
export function unquote(text: string) {
  const trimmed = text.trim();
  const first = trimmed.charAt(0);
  const wrapped = trimmed.length > 1 && `"'\``.includes(first) && trimmed.endsWith(first);
  return wrapped ? trimmed.slice(1, -1) : trimmed;
}

/** Text with every <tag> removed. */
export function stripTags(text: string) {
  let plain = "";
  const cursor = new TextCursor(text);
  while (!cursor.done) {
    plain += cursor.takeWhile((char) => char !== "<");
    if (cursor.done) break;
    // A < that never closes is text, not a tag.
    if (cursor.takeThrough(">") === null) {
      plain += cursor.rest;
      break;
    }
  }
  return plain;
}

/** Whether a character can sit in a plain name: a letter, a digit or an underscore. */
export function isNameChar(char: string) {
  return /^[\wÀ-￿]$/.test(char);
}

/** Lines of a text with Windows line ends read as one break. */
export function linesOf(text: string) {
  return text.replaceAll("\r\n", "\n").split("\n");
}

/** How far a line is indented, counting a tab as two spaces. */
export function indentOf(line: string) {
  let width = 0;
  for (const char of line) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 2;
    else break;
  }
  return width;
}
