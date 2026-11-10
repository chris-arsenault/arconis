import type { CanvasDocument } from "../document/canvasDocument";
import { authoredLook } from "../document/appearance";
import { transformObjects, type SelectionTransform } from "../document/transform";
import { LOCAL, isBox, isFrame, type Item } from "../document/types";
import { RateLimitedWrite } from "./rateLimitedWrite";
import { panelResizeChanges } from "../document/panelResize";

/** How often a selection-frame gesture writes to the document, and so reaches peers. */
const TRANSFORM_WRITE_MS = 100;
/** The undo capture window the document returns to once a gesture ends. */
const CAPTURE_MS = 400;

/**
 * One collective scale or rotation over the selection frame: it writes at a bounded rate while
 * the gesture runs, merges the whole gesture into one undo step and publishes it on release.
 */
export class TransformSession {
  private writes = new RateLimitedWrite(TRANSFORM_WRITE_MS);
  private finish: (() => void) | null = null;

  constructor(private readonly document: CanvasDocument) {}

  get active() {
    return this.finish !== null;
  }

  begin() {
    this.finish = this.document.actions.begin();
    this.document.undo.stopCapturing();
    this.document.undo.captureTimeout = Number.MAX_SAFE_INTEGER;
  }

  /** Writes at a bounded rate, because each write rewrites every point of every drawing moved. */
  apply(items: Item[], transform: SelectionTransform) {
    this.writes.schedule(() => this.write(items, transform));
  }

  private write(items: Item[], transform: SelectionTransform) {
    const { document } = this;
    const values = transformObjects(items, transform, (item) =>
      authoredLook(item, document.namedStyle(item.style))
    );
    const resized = transform.scaleX !== 1 || transform.scaleY !== 1;
    const paint = resized
      ? panelResizeChanges(
          items,
          items.map((item) => ({ ...item, ...values.get(item.id)! })),
          (item) => authoredLook(item, document.namedStyle(item.style))
        )
      : [];
    document.doc.transact(() => {
      items.forEach((item) => {
        const { rotation, paint, ...geometry } = values.get(item.id)!;
        document.patch(item.id, geometry);
        document.patchLook(item.id, paint);
        if (isBox(item) && !isFrame(item) && transform.angle)
          document.patchLook(item.id, { rotation });
      });
      paint.forEach(({ id, look }) => document.patchLook(id, look));
    }, LOCAL);
  }

  end() {
    this.writes.flush();
    this.finish?.();
    this.finish = null;
    this.document.undo.captureTimeout = CAPTURE_MS;
    this.document.undo.stopCapturing();
  }
}
