import type { PathPoint } from "../document/types";
import { LanguageError, type Token, type TokenKind } from "./lexer";

/** A position in a token list, with the small reads every part of the parser shares. */
export class Cursor {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  get token() {
    return this.tokens[this.index];
  }
  peek(offset = 1) {
    return this.tokens[this.index + offset];
  }
  next() {
    return this.tokens[this.index++];
  }
  /** Tokens from here to the end of the statement, for looking ahead. */
  ahead() {
    const result: Token[] = [];
    for (let index = this.index; index < this.tokens.length; index++) {
      const token = this.tokens[index];
      if (token.kind === "end" || token.kind === "eof") break;
      result.push(token);
    }
    return result;
  }
  fail(message: string, token = this.token): never {
    throw new LanguageError(message, token.line);
  }
  /** The current token's kind, read afresh so earlier checks do not narrow it. */
  kindIs(kind: TokenKind) {
    return this.tokens[this.index].kind === kind;
  }
  isWord(text?: string, token = this.token) {
    return token.kind === "word" && (text === undefined || token.text === text);
  }
  isPunct(text: string, token = this.token) {
    return token.kind === "punct" && token.text === text;
  }
  atStatementEnd() {
    const { kind } = this.token;
    return kind === "end" || kind === "eof" || this.isPunct("}") || this.isPunct("{");
  }
  /** Consumes `text` if it is the next word. */
  word(text: string) {
    if (!this.isWord(text)) return false;
    this.next();
    return true;
  }
  keyword(text: string) {
    if (!this.word(text)) this.fail(`Expected "${text}", found ${describe(this.token)}.`);
  }
  expectWord(what: string) {
    if (this.token.kind !== "word") this.fail(`Expected ${what}, found ${describe(this.token)}.`);
    return this.next().text;
  }
  expectString(what: string) {
    if (this.token.kind !== "string")
      this.fail(`Expected ${what} in quotes, found ${describe(this.token)}.`);
    return this.next().text;
  }
  number(what: string) {
    if (this.token.kind !== "number") this.fail(`Expected ${what}, found ${describe(this.token)}.`);
    return Number(this.next().text);
  }
  point(what: string): PathPoint {
    const x = this.number(what);
    if (!this.isPunct(",")) this.fail(`Expected ${what} as x,y.`);
    this.next();
    return [x, this.number(what)];
  }
  points(what: string) {
    const points: PathPoint[] = [];
    while (this.token.kind === "number") points.push(this.point(what));
    if (!points.length) this.fail(`Expected ${what} as x,y pairs.`);
    return points;
  }
  ref(what = "an item's id") {
    return this.expectWord(what);
  }
  refList() {
    const refs = [this.ref()];
    while (this.isPunct(",")) {
      this.next();
      refs.push(this.ref());
    }
    return refs;
  }
  iconKey() {
    if (this.token.kind === "string") return this.next().text;
    if (this.word("none")) return "";
    return this.expectWord("an icon key");
  }
}

export function describe(token: Token) {
  if (token.kind === "end") return "the end of the line";
  if (token.kind === "eof") return "the end of the text";
  if (token.kind === "string") return `"${token.text}" in quotes`;
  return `"${token.text}"`;
}
