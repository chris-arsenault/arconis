import type { CanvasDocument } from "../document/canvasDocument";

/** Browser download behavior stays outside the model and reusable canvas codec. */
export function downloadFile(
  document: CanvasDocument,
  content: BlobPart,
  type: string,
  ext: string
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.title().replace(/[^a-z0-9 -]/gi, "_")}.${ext}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
