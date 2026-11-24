import { useEffect, useRef, useState } from "react";
import { CanvasDocument } from "../document/canvasDocument";
import { sha256 } from "../document/pictures";
import { CanvasFiles } from "../files/canvasFiles";
import { EditorController } from "../editor/controller";
import { renderSvgFile } from "../editor/pngExport";

async function projectDiagram(
  container: HTMLDivElement,
  body: string,
  part: string,
  signal: AbortSignal
) {
  const canvas = new CanvasDocument();
  const pictures = new Map<string, { bytes: Uint8Array; type: string }>();
  const files = new CanvasFiles(
    canvas,
    {
      async add(bytes, type) {
        const { hex } = await sha256(bytes);
        pictures.set(hex, { bytes, type });
        return hex;
      },
      readOpen: (hash) => Promise.resolve(pictures.get(hash) ?? null),
    },
    signal,
    () => {}
  );
  const editor = new EditorController(container, canvas);
  try {
    await files.import(new File([body], "diagram.arconis"));
    signal.throwIfAborted();
    return await renderSvgFile(editor.graph, part ? [part] : [], canvas.list(), "", false);
  } finally {
    editor.destroy();
    canvas.doc.destroy();
  }
}

export function DiagramPreview({
  body,
  part,
  title,
}: Readonly<{ body: string; part: string; title: string }>) {
  const container = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let url = "";
    const control = new AbortController();
    void projectDiagram(node, body, part, control.signal)
      .then((svg) => {
        if (control.signal.aborted || !svg) return;
        url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        setView(url);
      })
      .catch((cause: unknown) => {
        if (!control.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Preview unavailable.");
      });
    return () => {
      control.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [body, part]);
  return (
    <>
      <div className="delivery-diagram-render" aria-hidden="true" ref={container} />
      {view && <img className="delivery-evidence" alt={part || title} src={view} />}
      {error && <p>{error} Download the Draw file to open it in the canvas.</p>}
    </>
  );
}
