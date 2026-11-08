import { describe, expect, it } from "vitest";
import { codeBlocks, markdownPlainText, renderMarkdown } from "./markdown";

describe("canvas Markdown", () => {
  it("renders nested lists, headings and semantic emphasis without modifying the source", () => {
    const source =
      "# Plan\n\n1. **Build**\n   - *Review* ~~old~~ <u>new</u>\n\nH<sub>2</sub>O x<sup>2</sup> <mark>yes</mark>";
    const html = renderMarkdown(source);
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>Build</strong>");
    expect(html).toContain("<s>old</s>");
    expect(html).toContain("<u>new</u>");
    expect(html).toContain("H<sub>2</sub>O x<sup>2</sup>");
    expect(html).toContain("<mark>yes</mark>");
  });

  it.each([
    "python",
    "typescript",
    "java",
    "c",
    "cpp",
    "csharp",
    "go",
    "rust",
    "ruby",
    "sql",
    "bash",
    "json",
    "yaml",
    "html",
    "css",
  ])("highlights %s fences and keeps code copyable", (language) => {
    const code = language === "python" ? "def hello():\n    return 42\n" : "return true;\n";
    const source = `\`\`\`${language}\n${code}\`\`\``;
    expect(renderMarkdown(source)).toContain(`language-${language}`);
    expect(codeBlocks(source)).toEqual([{ language, source: code }]);
    if (language === "python") expect(renderMarkdown(source)).toContain("hljs-keyword");
  });

  it("keeps unknown code readable and escapes code HTML", () => {
    const source = "```unknown-language\n<img src=x onerror=alert(1)>\n```";
    const html = renderMarkdown(source);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(markdownPlainText(source)).toBe("<img src=x onerror=alert(1)>");
  });

  it("renders inline, display and fenced math while preserving invalid input", () => {
    expect(renderMarkdown("Energy $E=mc^2$")).toContain('class="katex"');
    expect(renderMarkdown("$$\n\\frac{a}{b}\n$$")).toContain("katex-display");
    expect(renderMarkdown("```math\n\\sqrt{x}\n```")).toContain("katex-display");
    expect(renderMarkdown("$\\notARealCommand{x}$")).toContain("notARealCommand");
    expect(codeBlocks("```math\nx\n```")).toEqual([]);
  });

  it("keeps literal dollars, escaped math and code containing dollars literal", () => {
    expect(renderMarkdown("Costs $5 and $10")).not.toContain('class="katex"');
    expect(renderMarkdown("\\$x\\$")).not.toContain('class="katex"');
    expect(renderMarkdown("`$x$`")).toContain("<code>$x$</code>");
  });

  it("rejects arbitrary peer HTML, attribute-bearing tags, unsafe links and external images", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script> <u onclick="bad()">bad</u> ![pic](https://example.org/a.png) [bad](javascript:alert(1))'
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<u onclick");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(renderMarkdown("[safe](https://example.org)")).toContain('rel="noopener noreferrer"');
    expect(renderMarkdown("$\\href{javascript:alert(1)}{bad}$")).not.toContain('href="javascript:');
  });

  it("copies content without Markdown decoration and retains code and math source", () => {
    expect(markdownPlainText("**Hello** <sub>world</sub>\n\n- First\n- Second")).toContain(
      "Hello world"
    );
    expect(markdownPlainText("`  code  ` and $x^2$")).toContain("code");
    expect(markdownPlainText("$x^2$")).toBe("x^2");
  });
});

describe("Markdown isolation", () => {
  it("keeps semantic tag nesting within the Markdown parser's existing limit", () => {
    const source = "<u>".repeat(150) + "deep" + "</u>".repeat(150);
    expect(() => renderMarkdown(source)).not.toThrow();
  });

  it("does not carry equation macros between labels", () => {
    renderMarkdown("$\\gdef\\canvasMacro{42}$");
    expect(renderMarkdown("$\\canvasMacro$")).toContain("canvasMacro");
  });
});
