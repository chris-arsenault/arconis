import MarkdownIt, { type Token } from "markdown-it";
import { katex } from "@mdit/plugin-katex";
import hljs from "highlight.js/lib/common";

/** Text stays Markdown in Y.Text. This module only derives safe presentation from it. */
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  highlight(source, language) {
    if (!language || !hljs.getLanguage(language)) return "";
    return hljs.highlight(source, { language, ignoreIllegals: true }).value;
  },
}).use(katex, { mathFence: true, trust: false, throwOnError: false });

// Text images would bypass the canvas's picture storage and encryption boundaries.
markdown.disable("image");
const SAFE_TAG = /^<(u|sub|sup|mark)>([\s\S]*?)<\/\1>/;
markdown.inline.ruler.before("html_inline", "canvas_semantic_tag", (state, silent) => {
  const depth = Number(state.env?.canvasTagDepth ?? 0);
  if (depth >= state.md.options.maxNesting) return false;
  const match = SAFE_TAG.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) {
    state.push("canvas_tag_open", match[1], 1);
    const children: Token[] = [];
    state.md.inline.parse(
      match[2],
      state.md,
      { ...state.env, canvasTagDepth: depth + 1 },
      children
    );
    state.tokens.push(...children);
    state.push("canvas_tag_close", match[1], -1);
  }
  state.pos += match[0].length;
  return true;
});
markdown.renderer.rules.canvas_tag_open = (tokens, index) => `<${tokens[index].tag}>`;
markdown.renderer.rules.canvas_tag_close = (tokens, index) => `</${tokens[index].tag}>`;

const defaultLink = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return defaultLink
    ? defaultLink(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options);
};

/** Escaping is also used for peer-supplied subtitles, marks and error strings. */
export const escapeText = (source: string) => markdown.utils.escapeHtml(source);

export function renderMarkdown(source: string) {
  // Structural whitespace outside the rendered blocks is not part of the label's text.
  return markdown.render(source).trim();
}

export interface CodeBlock {
  language: string;
  source: string;
}

export function codeBlocks(source: string): CodeBlock[] {
  return markdown
    .parse(source, {})
    .filter((token) => token.type === "fence" && token.info.trim() !== "math")
    .map((token) => ({ language: token.info.trim(), source: token.content }));
}

function plainTokens(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.children) return plainTokens(token.children);
      if (token.type.endsWith("_close") && token.block) return "\n";
      if (token.type === "softbreak" || token.type === "hardbreak") return "\n";
      if (!token.nesting) return token.content;
      return "";
    })
    .join("");
}

/** Clipboard plain text retains code whitespace and equation source. */
export function markdownPlainText(source: string) {
  const text = plainTokens(markdown.parse(source, {}));
  let end = text.length;
  while (end > 0 && text[end - 1] === "\n") end--;
  return text.slice(0, end);
}
