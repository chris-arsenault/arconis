import MarkdownIt from "markdown-it";

/**
 * The help reference reads the user guides in the repository's docs folder, bundled with the
 * site so help works offline and never drifts from the published guides. Each guide splits into
 * sections at its second-level headings; a topic names a guide, or a guide and a section.
 */
export const GUIDES = [
  { id: "getting-started", title: "Getting started" },
  { id: "editing", title: "Using the canvas" },
  { id: "drawing", title: "Drawing and markup" },
  { id: "text", title: "Text and formatting" },
  { id: "slides", title: "Slides" },
  { id: "collaboration", title: "Collaboration" },
  { id: "accounts", title: "Accounts" },
  { id: "files", title: "Files" },
  { id: "agents", title: "Assistants and MCP" },
] as const;

export type GuideId = (typeof GUIDES)[number]["id"];

export interface Section {
  guide: GuideId;
  /** The heading's anchor, as GitHub derives it; empty for the text before the first heading. */
  id: string;
  title: string;
  /** The section's Markdown, heading included. */
  source: string;
}

const sources = import.meta.glob<string>(
  [
    "../../../docs/getting-started.md",
    "../../../docs/editing.md",
    "../../../docs/drawing.md",
    "../../../docs/text.md",
    "../../../docs/slides.md",
    "../../../docs/collaboration.md",
    "../../../docs/accounts.md",
    "../../../docs/files.md",
    "../../../docs/agents.md",
  ],
  { query: "?raw", import: "default" }
);
const pictures = import.meta.glob<string>("../../../docs/images/*.png", {
  query: "?url",
  import: "default",
  eager: true,
});

export function isGuide(id: string): id is GuideId {
  return GUIDES.some((guide) => guide.id === id);
}

export function guideTitle(id: GuideId) {
  return GUIDES.find((guide) => guide.id === id)!.title;
}

/** GitHub's heading anchors, which the guides already use to link to one another. */
export function slug(heading: string) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

export function splitSections(guide: GuideId, source: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { guide, id: "", title: guideTitle(guide), source: "" };
  for (const line of source.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      if (current.source.trim()) sections.push(current);
      current = { guide, id: slug(heading[1]), title: heading[1].trim(), source: "" };
    }
    // The guide's own title is shown by the reference, not repeated in its first section.
    if (!/^# /.test(line)) current.source += `${line}\n`;
  }
  if (current.source.trim()) sections.push(current);
  return sections;
}

/** Anchors of a section's own headings, its title and every subheading inside it. */
export function sectionAnchors(section: Section) {
  return [...section.source.matchAll(/^#{2,4} (.+)$/gm)].map((match) => slug(match[1]));
}

/** The section a topic points at: a guide's opening, or the section holding an anchor. */
export function findSection(sections: Section[], topic: string) {
  const [guide, anchor = ""] = topic.split("#");
  const inGuide = sections.filter((section) => section.guide === guide);
  return (
    inGuide.find((section) => section.id === anchor) ??
    inGuide.find((section) => sectionAnchors(section).includes(anchor)) ??
    inGuide[0] ??
    null
  );
}

let loaded: Promise<Section[]> | null = null;

/** Every guide's sections, loaded once on first use. */
export function loadSections() {
  loaded ??= Promise.all(
    GUIDES.map(async ({ id }) => splitSections(id, await sources[`../../../docs/${id}.md`]()))
  ).then((all) => all.flat());
  return loaded;
}

export interface SearchResult {
  section: Section;
  snippet: string;
}

/** Sections holding every word of the query, those naming it in their title first. */
export function searchSections(sections: Section[], query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return sections
    .map((section) => {
      const title = section.title.toLowerCase();
      const body = section.source.toLowerCase();
      if (!words.every((word) => title.includes(word) || body.includes(word))) return null;
      const score = words.filter((word) => title.includes(word)).length;
      const at = Math.max(0, body.indexOf(words[0]));
      const plain = section.source
        .slice(Math.max(0, at - 40), at + 120)
        .replace(/[#*_`[\]()|>-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { section, score, snippet: plain };
    })
    .filter((result) => result !== null)
    .sort((a, b) => b.score - a.score)
    .map(({ section, snippet }) => ({ section, snippet }));
}

const markdown = new MarkdownIt({ html: false, linkify: true });

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

/** Guide pictures resolve to the bundled copies. */
function bundlePicture(image: Token) {
  const name = String(image.attrGet("src") ?? "").replace(/^images\//, "");
  image.attrSet("src", pictures[`../../../docs/images/${name}`] ?? "");
}

/** Guide links open inside the reference; the web opens a new tab; anything else stays text. */
function routeLink(link: Token) {
  const href = String(link.attrGet("href") ?? "");
  const guide = /^([a-z-]+)\.md(?:#([\w-]+))?$/.exec(href);
  if (/^https?:/.test(href)) {
    link.attrSet("target", "_blank");
    link.attrSet("rel", "noopener noreferrer");
    return;
  }
  link.attrSet("href", "#");
  if (guide && isGuide(guide[1]))
    link.attrSet("data-help-topic", guide[2] ? `${guide[1]}#${guide[2]}` : guide[1]);
  else if (/^#[\w-]+$/.test(href)) link.attrSet("data-help-anchor", href.slice(1));
  // Developer documents and source files are outside the in-app reference.
  else link.attrSet("data-help-outside", "");
}

markdown.core.ruler.push("help_links", (state) => {
  state.tokens.forEach((token, index) => {
    if (token.type === "heading_open")
      token.attrSet("id", `help-${slug(state.tokens[index + 1].content)}`);
    for (const child of token.children ?? []) {
      if (child.type === "image") bundlePicture(child);
      if (child.type === "link_open") routeLink(child);
    }
  });
});

/** Bundled guide Markdown as HTML; raw HTML stays disabled, as in canvas text. */
export function renderGuide(source: string) {
  return markdown.render(source);
}
