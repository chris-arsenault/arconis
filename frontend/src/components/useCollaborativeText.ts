import { useLayoutEffect, useRef } from "react";
import * as Y from "yjs";
import type { CanvasDocument } from "../document/canvasDocument";
import { applyShorthand } from "../document/shorthand";

interface Selection {
  start: Y.RelativePosition;
  end: Y.RelativePosition;
  direction: "forward" | "backward" | "none";
}

class TextareaBinding {
  private writing = false;
  private selection: Selection | null = null;
  private composition: {
    selection: Selection;
    start: number;
    suffix: number;
    value: string;
  } | null = null;
  private finishingComposition = false;
  private endAction: (() => void) | null = null;

  constructor(
    private document: CanvasDocument,
    private id: string,
    private text: Y.Text,
    private element: HTMLTextAreaElement
  ) {
    element.value = text.toString();
    document.doc.on("beforeTransaction", this.capture);
    text.observe(this.refresh);
    element.addEventListener("input", this.input);
    element.addEventListener("compositionstart", this.startComposition);
    element.addEventListener("compositionend", this.endComposition);
    element.addEventListener("keydown", this.keydown);
    element.addEventListener("blur", this.blur);
    element.ownerDocument.addEventListener("focusin", this.focusChanged);
  }

  private focused() {
    return this.element.ownerDocument.activeElement === this.element;
  }
  private readSelection(): Selection {
    const { selectionStart: start, selectionEnd: end, selectionDirection } = this.element;
    return {
      start: Y.createRelativePositionFromTypeIndex(this.text, start),
      end: Y.createRelativePositionFromTypeIndex(this.text, end, start === end ? 0 : -1),
      direction: selectionDirection,
    };
  }
  private resolve(position: Y.RelativePosition) {
    return Y.createAbsolutePositionFromRelativePosition(position, this.document.doc)?.index ?? 0;
  }
  private capture = () => {
    if (!this.writing && !this.composition)
      this.selection = this.focused() ? this.readSelection() : null;
  };
  private refresh = () => {
    if (this.writing || this.composition) return;
    this.element.value = this.text.toString();
    if (this.selection && this.focused())
      this.element.setSelectionRange(
        this.resolve(this.selection.start),
        this.resolve(this.selection.end),
        this.selection.direction
      );
    this.selection = null;
  };
  private input = (event: Event) => {
    if (this.composition) return;
    if (this.finishingComposition && (event as InputEvent).inputType?.includes("Composition")) {
      this.finishingComposition = false;
      this.refresh();
      return;
    }
    this.finishingComposition = false;
    this.endAction ??= this.document.actions.begin();
    this.writing = true;
    try {
      this.document.editText(this.id, this.element.value);
    } finally {
      this.writing = false;
    }
  };
  private keydown = (event: KeyboardEvent) => {
    if (this.finishKey(event)) return;
    if (event.isComposing || this.composition || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "y" || event.shiftKey) this.document.undo.redo();
    else this.document.undo.undo();
  };
  private finishKey(event: KeyboardEvent) {
    if (event.isComposing || this.composition) return false;
    if (event.key !== "Escape" && !((event.ctrlKey || event.metaKey) && event.key === "Enter"))
      return false;
    this.finish();
    this.element.blur();
    return true;
  }
  private startComposition = () => {
    this.endAction ??= this.document.actions.begin();
    this.composition = {
      selection: this.readSelection(),
      start: this.element.selectionStart,
      suffix: this.element.value.length - this.element.selectionEnd,
      value: this.element.value,
    };
  };
  private endComposition = () => {
    const composition = this.composition;
    if (!composition) return;
    this.composition = null;
    this.finishingComposition = true;
    const start = this.resolve(composition.selection.start);
    const end = Math.max(start, this.resolve(composition.selection.end));
    const value = this.element.value;
    const inserted = value.slice(composition.start, value.length - composition.suffix);
    if (value !== composition.value) {
      this.writing = true;
      try {
        const current = this.text.toString();
        // Preserve unchanged CRDT characters even when the browser composes over a whole field.
        this.document.editText(this.id, current.slice(0, start) + inserted + current.slice(end));
      } finally {
        this.writing = false;
      }
    }
    this.refresh();
    const caret = start + (value === composition.value ? 0 : inserted.length);
    this.element.setSelectionRange(caret, caret);
  };

  private finish = () => {
    if (!this.endAction) return;
    // Typed shorthand such as #tag or [] becomes fields once the edit is done.
    applyShorthand(this.document, this.id);
    this.endAction();
    this.endAction = null;
  };
  private outside(target: EventTarget | null) {
    return (
      target !== this.element && !(target instanceof Element && target.closest("[data-text-tools]"))
    );
  }
  private blur = (event: FocusEvent) => {
    if (this.outside(event.relatedTarget)) this.finish();
  };
  private focusChanged = (event: FocusEvent) => {
    if (this.outside(event.target)) this.finish();
  };

  destroy() {
    this.finish();
    this.document.doc.off("beforeTransaction", this.capture);
    this.text.unobserve(this.refresh);
    this.element.removeEventListener("input", this.input);
    this.element.removeEventListener("compositionstart", this.startComposition);
    this.element.removeEventListener("compositionend", this.endComposition);
    this.element.removeEventListener("keydown", this.keydown);
    this.element.removeEventListener("blur", this.blur);
    this.element.ownerDocument.removeEventListener("focusin", this.focusChanged);
  }
}

export function useCollaborativeText(document: CanvasDocument, id: string | null) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = id ? document.text(id) : null;
  useLayoutEffect(() => {
    if (!id || !text || !ref.current) return;
    const binding = new TextareaBinding(document, id, text, ref.current);
    return () => binding.destroy();
  }, [document, id, text]);
  return ref;
}
