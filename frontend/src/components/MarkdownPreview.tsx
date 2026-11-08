import { useLayoutEffect, useMemo, useRef } from "react";
import type { Appearance } from "../document/appearance";
import { codeBlocks, renderMarkdown } from "../text/markdown";
import { applyTypography } from "../text/typography";

/** The preview uses the canvas renderer and box typography, while staying scrollable for editing. */
export function MarkdownPreview({
  appearance,
  source,
  copy,
}: Readonly<{
  appearance: Appearance;
  source: string;
  copy: (source: string) => Promise<void>;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: renderMarkdown(source) }), [source]);
  const blocks = useMemo(() => codeBlocks(source), [source]);
  useLayoutEffect(() => {
    if (ref.current) applyTypography(ref.current, appearance);
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
