import type { RoomSession } from "../collaboration/room";
import {
  MAX_PICTURE_BYTES,
  MAX_PICTURE_SIDE,
  PICTURE_HASH,
  PICTURE_STORED,
  PICTURE_TYPE,
  fitWithin,
} from "../document/pictures";
import type { EditorController } from "./controller";
import { containerAt } from "./panels";

/** A new picture appears no larger than this on screen. */
const MAX_PLACED_PIXELS = 640;
const QUALITY = 0.9;

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, [role=dialog]"));
}

/** Redraws through a canvas, which leaves only pixels: no scripts, metadata or location data. */
async function reencode(file: Blob) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_PICTURE_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY)
  );
  if (!blob) throw new Error("This picture could not be read.");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type, width, height };
}

async function placePicture(
  editor: EditorController,
  session: RoomSession,
  file: Blob,
  point: { x: number; y: number }
) {
  const { bytes, type, width, height } = await reencode(file);
  if (bytes.length > MAX_PICTURE_BYTES) {
    session.setNotice("This picture is too large to share. Try a smaller one.");
    return;
  }
  const hash = await session.pictures.add(bytes, type);
  const { scale } = editor.graph.view;
  const shown = fitWithin(width, height, MAX_PLACED_PIXELS);
  const size = { width: shown.width / scale, height: shown.height / scale };
  const x = point.x - size.width / 2;
  const y = point.y - size.height / 2;
  const id = editor.document.create("picture", x, y, {
    ...size,
    parent: containerAt(editor.document, point.x, point.y, size),
    style: { [PICTURE_HASH]: hash, [PICTURE_TYPE]: type, [PICTURE_STORED]: false },
  });
  editor.select(id);
  void session.uploadPictures();
}

function firstImage(files: Iterable<File> | ArrayLike<File> | undefined) {
  return Array.from(files ?? []).find((file) => file.type.startsWith("image/"));
}

/** Paste places a picture at the pointer, and dropping a file places it where it lands. */
export function bindPictureInput(editor: EditorController, session: RoomSession) {
  const abort = new AbortController();
  const { element } = editor;
  let pointer: { clientX: number; clientY: number } | null = null;
  const options = { signal: abort.signal };
  const place = (file: Blob, event: { clientX: number; clientY: number }) => {
    placePicture(editor, session, file, editor.worldPoint(event)).catch((error: unknown) =>
      session.setNotice(error instanceof Error ? error.message : "This picture could not be read.")
    );
  };
  element.addEventListener(
    "pointermove",
    ({ clientX, clientY }) => (pointer = { clientX, clientY }),
    options
  );
  window.addEventListener(
    "paste",
    (event) => {
      if (isTyping(event.target)) return;
      const file = firstImage(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      place(
        file,
        pointer ?? {
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
        }
      );
    },
    options
  );
  element.addEventListener("dragover", (event) => event.preventDefault(), options);
  element.addEventListener(
    "drop",
    (event) => {
      const file = firstImage(event.dataTransfer?.files);
      if (!file) return;
      event.preventDefault();
      place(file, event);
    },
    options
  );
  return () => abort.abort();
}
