import markdownCss from "../text/markdown.css?inline";
import fontCss from "../text/fonts.css?inline";
import mathCss from "katex/dist/katex.min.css?inline";

const FAMILIES = ["Inter", "Source Serif 4", "Source Code Pro"];

function fontUsed(pane: Element, family: string) {
  if (family.startsWith("KaTeX_")) return Boolean(pane.querySelector(".katex"));
  if (family === "Source Code Pro" && pane.querySelector("code,pre")) return true;
  return [...pane.querySelectorAll<HTMLElement>("[style]")].some((node) =>
    node.style.fontFamily.includes(family)
  );
}

/** Select font subsets by the actual characters, rather than embedding every script in every PNG. */
function coversText(range: string, text: string) {
  if (!range) return true;
  const intervals = range.split(",").map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
    return [
      Number.parseInt(from.replaceAll("?", "0"), 16),
      Number.parseInt((to ?? from).replaceAll("?", "f"), 16),
    ];
  });
  return [...text].some((char) => {
    const code = char.codePointAt(0)!;
    return intervals.some(([from, to]) => code >= from && code <= to);
  });
}

function asDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("An export font could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function inlineFont(rule: CSSFontFaceRule) {
  const match = /url\(["']?([^\s)"']+)/.exec(rule.style.getPropertyValue("src"));
  if (!match) return "";
  const url = new URL(match[1], location.href);
  if (url.protocol === "data:") return rule.cssText;
  // These URLs come only from bundled font CSS, never from a peer's text or styles.
  if (url.origin !== location.origin)
    throw new Error("Export fonts must be bundled with the site.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`An export font could not be loaded (${response.status}).`);
  const data = await asDataUrl(await response.blob());
  // Firefox exposes font descriptors for reading but rejects CSSStyleDeclaration.setProperty.
  const descriptors = Array.from(rule.style, (property) => {
    const value =
      property === "src" ? `url("${data}") format("woff2")` : rule.style.getPropertyValue(property);
    return `${property}: ${value};`;
  });
  return `@font-face { ${descriptors.join(" ")} }`;
}

/** SVG rasterization cannot load external fonts or CSS; inline the same local typography. */
export async function exportTextCss(pane: Element) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(fontCss + mathCss);
  const css: (string | Promise<string>)[] = [];
  const text = pane.textContent ?? "";
  for (const rule of sheet.cssRules) {
    if (!(rule instanceof CSSFontFaceRule)) {
      css.push(rule.cssText);
      continue;
    }
    const font = rule;
    const family = font.style.fontFamily.replaceAll(/["']/g, "");
    if (
      (FAMILIES.includes(family) || family.startsWith("KaTeX_")) &&
      fontUsed(pane, family) &&
      coversText(font.style.getPropertyValue("unicode-range"), text)
    )
      css.push(inlineFont(font));
  }
  return (await Promise.all(css)).join("\n") + markdownCss;
}
