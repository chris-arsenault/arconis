import { describe, expect, it } from "vitest";
import { deckPage } from "./deckPage";

const SIZE = { width: 1280, height: 720 };
const svg = (text: string) => `<svg viewBox="0 0 10 10"><text>${text}</text></svg>`;

describe("an exported deck's page", () => {
  it("holds every slide in order, showing the first", () => {
    const page = deckPage({
      title: "Plan",
      slides: [
        { name: "Problem", svg: svg("one") },
        { name: "", svg: svg("two") },
      ],
      css: ".canvas-markdown{}",
      definitions: '<svg class="shared"></svg>',
      size: SIZE,
    });
    expect(page.indexOf('<svg class="shared">')).toBeLessThan(page.indexOf("<main>"));
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>Plan</title>");
    expect(page).toContain(
      `<section class="slide shown" aria-label="Slide 1: Problem">${svg("one")}</section>`
    );
    expect(page).toContain(`<section class="slide" aria-label="Slide 2">${svg("two")}</section>`);
    expect(page.indexOf(svg("one"))).toBeLessThan(page.indexOf(svg("two")));
    expect(page).toContain(".canvas-markdown{}");
    expect(page).toContain("@page { size: 1280px 720px;");
  });

  it("treats the title and slide names as text", () => {
    const page = deckPage({
      title: '</title><script>alert("t")</script>',
      slides: [{ name: '"><img src=x onerror=alert(1)>', svg: svg("one") }],
      css: "",
      definitions: "",
      size: SIZE,
    });
    expect(page).toContain(
      "<title>&lt;/title&gt;&lt;script&gt;alert(&quot;t&quot;)&lt;/script&gt;</title>"
    );
    expect(page).toContain('aria-label="Slide 1: &quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(page).not.toContain("<img");
    // Only the page's own script is there.
    expect(page.split("<script>")).toHaveLength(2);
  });
});
