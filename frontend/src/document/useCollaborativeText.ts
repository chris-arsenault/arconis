import { useLayoutEffect, useRef } from "react";
import * as Y from "yjs";
import type { CanvasDocument } from "./canvasDocument";
import { LOCAL } from "./types";

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
    this.writing = true;
    try {
      this.document.editText(this.id, this.element.value);
    } finally {
      this.writing = false;
    }
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.isComposing || this.composition || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "y" || event.shiftKey) this.document.undo.redo();
    else this.document.undo.undo();
  };
  private startComposition = () => {
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
        this.document.doc.transact(() => {
          this.text.delete(start, end - start);
          this.text.insert(start, inserted);
        }, LOCAL);
      } finally {
        this.writing = false;
      }
    }
    this.refresh();
    const caret = start + (value === composition.value ? 0 : inserted.length);
    this.element.setSelectionRange(caret, caret);
  };

  destroy() {
    this.document.doc.off("beforeTransaction", this.capture);
    this.text.unobserve(this.refresh);
    this.element.removeEventListener("input", this.input);
    this.element.removeEventListener("compositionstart", this.startComposition);
    this.element.removeEventListener("compositionend", this.endComposition);
    this.element.removeEventListener("keydown", this.keydown);
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
