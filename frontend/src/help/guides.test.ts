import { describe, expect, it } from "vitest";
import {
  findSection,
  loadSections,
  renderGuide,
  searchSections,
  sectionAnchors,
  slug,
  splitSections,
} from "./guides";

describe("help guides", () => {
  it("splits a guide at its second-level headings with GitHub anchors", () => {
    const sections = splitSections(
      "editing",
      "# Using the canvas\n\nIntro.\n\n## Topics and depth\n\nTrees.\n\n### Detail\n\nMore.\n"
    );
    expect(sections.map(({ id, title }) => [id, title])).toEqual([
      ["", "Using the canvas"],
      ["topics-and-depth", "Topics and depth"],
    ]);
    expect(sections[1].source).toContain("### Detail");
    expect(slug("Copy, cut and paste")).toBe("copy-cut-and-paste");
    expect(slug("Lock, hide, collapse, tags, tasks and links")).toBe(
      "lock-hide-collapse-tags-tasks-and-links"
    );
  });

  it("keeps guide links inside the reference and leaves developer documents out", () => {
    const html = renderGuide(
      "See [topics](editing.md#topics-and-depth), [slides](slides.md), [ops](deployment.md), " +
        "[site](https://arconis.ahara.io) and <b>raw</b>."
    );
    expect(html).toContain('data-help-topic="editing#topics-and-depth"');
    expect(html).toContain('data-help-topic="slides"');
    expect(html).toContain("data-help-outside");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("&lt;b&gt;raw&lt;/b&gt;");
  });

  it("loads every guide and finds sections by all query words, titles first", async () => {
    const sections = await loadSections();
    expect(new Set(sections.map((section) => section.guide)).size).toBe(9);
    const results = searchSections(sections, "speaker notes");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].section.title.toLowerCase()).toContain("notes");
    expect(searchSections(sections, "zzzz-nothing-matches")).toEqual([]);
    // Every guide link in the bundled guides names a section that exists.
    const anchors = new Set(
      sections.flatMap((section) =>
        sectionAnchors(section).map((anchor) => `${section.guide}#${anchor}`)
      )
    );
    const broken = sections.flatMap((section) =>
      [...renderGuide(section.source).matchAll(/data-help-topic="([^"#]+#[^"]+)"/g)]
        .map((match) => match[1])
        .filter((topic) => !anchors.has(topic))
    );
    expect(broken).toEqual([]);
    expect(findSection(sections, "text#text-editing-shortcuts")?.guide).toBe("text");
    expect(findSection(sections, "slides")?.id).toBe("");
  });
});
