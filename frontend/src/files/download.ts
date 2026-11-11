import type { CanvasDocument } from "../document/canvasDocument";

/** Browser download behavior stays outside the model and reusable canvas codec. */
export function downloadFile(
  document: CanvasDocument,
  content: BlobPart,
  type: string,
  ext: string,
  /** What the file holds when it is less than the canvas, such as a deck's name. */
  part = ""
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  const name = part ? `${document.title()} - ${part}` : document.title();
  anchor.download = `${name.replace(/[^a-z0-9 -]/gi, "_")}.${ext}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
