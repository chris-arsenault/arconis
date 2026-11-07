/**
 * Tokens of the canvas language. Statements end at a line break or `;`, blocks use braces, and
 * `//` starts a comment.
 */
export type TokenKind = "word" | "string" | "number" | "color" | "arrow" | "punct" | "end" | "eof";

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
}

/** A mistake in what was written, reported with the line it is on. */
export class LanguageError extends Error {
  constructor(
    message: string,
    readonly line = 0
  ) {
    super(line ? `Line ${line}: ${message}` : message);
  }
}

export const ARROWS = ["..>", "->", "--", "=>"] as const;
export type ArrowText = (typeof ARROWS)[number];
const PUNCTUATION = new Set(["{", "}", ",", "/", ".", "(", ")"]);
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/i;
const COLOR = /^#[0-9a-fA-F]{3,8}\b/;
const WORD_START = /[A-Za-z_]/;
const WORD_PART = /[A-Za-z0-9_:/-]/;
const DELIMITER = /[\s,;{}()]/;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t" };

/** Reads one token at a time, keeping the line number for messages. */
class Scanner {
  readonly tokens: Token[] = [];
  private index = 0;
  private line = 1;

  constructor(private readonly source: string) {}

  run() {
    while (this.index < this.source.length) this.step();
    if (this.tokens.at(-1)?.kind !== "end") this.push("end", "\n");
    this.push("eof", "");
    return this.tokens;
  }

  private push(kind: TokenKind, text: string) {
    this.tokens.push({ kind, text, line: this.line });
  }
  private rest() {
    return this.source.slice(this.index);
  }
  private upcoming(length: number) {
    return this.source.slice(this.index, this.index + length);
  }

  private step() {
    const char = this.source[this.index];
    if (char === "\n" || char === ";") this.end(char);
    else if (/\s/.test(char)) this.index++;
    else if (this.upcoming(2) === "//") this.comment();
    else this.token(char);
  }

  private token(char: string) {
    if (char === '"') this.string();
    else if (ARROWS.some((arrow) => this.upcoming(3).startsWith(arrow))) this.arrow();
    else if (char === "#") this.color();
    else if (/[-\d.]/.test(char) && NUMBER.test(this.rest())) this.number();
    else if (WORD_START.test(char)) this.word();
    else if (PUNCTUATION.has(char)) {
      this.push("punct", char);
      this.index++;
    } else throw new LanguageError(`Unexpected "${char}".`, this.line);
  }

  private end(char: string) {
    if (this.tokens.at(-1)?.kind !== "end") this.push("end", char);
    if (char === "\n") this.line++;
    this.index++;
  }

  private comment() {
    while (this.index < this.source.length && this.source[this.index] !== "\n") this.index++;
  }

  private string() {
    let value = "";
    let index = this.index + 1;
    while (index < this.source.length && this.source[index] !== '"') {
      const char = this.source[index];
      if (char === "\n")
        throw new LanguageError("A string runs past the end of its line.", this.line);
      if (char === "\\") {
        const next = this.source[index + 1] ?? "";
        value += ESCAPES[next] ?? next;
        index += 2;
      } else {
        value += char;
        index++;
      }
    }
    if (index >= this.source.length)
      throw new LanguageError("A string is never closed.", this.line);
    this.push("string", value);
    this.index = index + 1;
  }

  private arrow() {
    const arrow = ARROWS.find((candidate) => this.upcoming(3).startsWith(candidate))!;
    this.push("arrow", arrow);
    this.index += arrow.length;
  }

  private color() {
    const match = COLOR.exec(this.rest());
    if (!match) throw new LanguageError(`"${this.upcoming(8)}" is not a color.`, this.line);
    this.push("color", match[0].toLowerCase());
    this.index += match[0].length;
  }

  /** A run like a picture's hash starts with digits but is a word. */
  private number() {
    const match = NUMBER.exec(this.rest())![0];
    const after = this.source.charAt(this.index + match.length);
    if (after && !DELIMITER.test(after) && after !== "." && after !== "-") {
      this.word();
      return;
    }
    this.push("number", match);
    this.index += match.length;
  }

  /** A word runs until a delimiter, or until an arrow starts. */
  private word() {
    let end = this.index;
    while (end < this.source.length && WORD_PART.test(this.source[end])) {
      const next = this.source[end + 1];
      if (this.source[end] === "-" && (next === ">" || next === "-")) break;
      end++;
    }
    this.push("word", this.source.slice(this.index, end));
    this.index = end;
  }
}

export function tokenize(source: string): Token[] {
  return new Scanner(source).run();
}
