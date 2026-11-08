import { useLayoutEffect, useMemo, useRef } from "react";
import type { EditorController } from "../editor/controller";
import { codeBlocks, renderMarkdown } from "../text/markdown";
import { objectStyle, resolvedLook } from "../editor/styles";

/** The preview uses the canvas renderer and box typography, while staying scrollable for editing. */
export function MarkdownPreview({
  editor,
  id,
  source,
  copy,
}: Readonly<{
  editor: EditorController;
  id: string;
  source: string;
  copy: (source: string) => Promise<void>;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: renderMarkdown(source) }), [source]);
  const blocks = useMemo(() => codeBlocks(source), [source]);
  useLayoutEffect(() => {
    const item = editor.document.get(id);
    if (!item || !ref.current) return;
    const named = editor.document.namedStyle(item.style);
    const scale = resolvedLook(item, named).scale ?? 1;
    const drawn = objectStyle(item, named) as Record<string, unknown>;
    applyTypography(ref.current, drawn, scale);
  });
  return (
    <div className="markdown-preview" aria-label="Markdown preview">
      <div ref={ref} className="canvas-markdown" dir="auto" dangerouslySetInnerHTML={markup} />
      {blocks.map((block, index) => (
        <button key={index} type="button" onClick={() => void copy(block.source)}>
          Copy code {index + 1}
          {block.language && ` (${block.language})`}
        </button>
      ))}
    </div>
  );
}

function applyTypography(element: HTMLDivElement, drawn: Record<string, unknown>, scale: number) {
  const flags = Number(drawn.fontStyle ?? 0);
  Object.assign(element.style, {
    fontFamily: String(drawn.fontFamily),
    fontSize: `${Number(drawn.fontSize) / scale}px`,
    fontWeight: flags & 1 ? "700" : "400",
    fontStyle: flags & 2 ? "italic" : "normal",
    color: String(drawn.fontColor),
    textAlign: String(drawn.align ?? "center"),
    textDecoration: [flags & 4 ? "underline" : "", flags & 8 ? "line-through" : ""]
      .filter(Boolean)
      .join(" "),
    backgroundColor: /^#[\da-f]{3,8}$/i.test(String(drawn.labelHighlight))
      ? String(drawn.labelHighlight)
      : "transparent",
  });
  element.style.setProperty("--text-line-height", String(drawn.labelLineHeight ?? 1.35));
  element.style.setProperty("--text-paragraph-gap", `${Number(drawn.labelParagraphGap ?? 0.5)}em`);
}
