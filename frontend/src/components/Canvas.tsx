import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import type { RoomSession } from "../collaboration/room";
import { EditorController } from "../editor/controller";
import type { PreviewBox } from "../editor/preview";
import { useCollaborativeText } from "../document/useCollaborativeText";
import { addBranch } from "../editor/topics";
import { bindPictureInput } from "../editor/pictureInput";
import { MarkdownTools } from "./MarkdownTools";
import { markdownKey } from "../text/sourceKeys";
import { fitText } from "../editor/textLayout";
import { positionTextEditor } from "../editor/textEditorPosition";

export function Canvas({
  session,
  onEditor,
}: Readonly<{
  session: RoomSession;
  onEditor: (editor: EditorController | null) => void;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = new EditorController(ref.current!, session.document);
    onEditor(editor);
    let lastCursor = 0;
    const updateCursor = (event: MouseEvent) => {
      if (performance.now() - lastCursor < 80) return;
      lastCursor = performance.now();
      session.provider.awareness.setLocalStateField("cursor", editor.worldPoint(event));
    };
    const element = ref.current!;
    element.addEventListener("mousemove", updateCursor);
    const leave = () => session.provider.awareness.setLocalStateField("cursor", null);
    element.addEventListener("mouseleave", leave);
    editor.onPreview = (boxes) => session.provider.awareness.setLocalStateField("preview", boxes);
    const unbindPictures = bindPictureInput(editor, session);
    return () => {
      unbindPictures();
      element.removeEventListener("mousemove", updateCursor);
      element.removeEventListener("mouseleave", leave);
      editor.destroy();
      onEditor(null);
    };
  }, [session, onEditor]);
  return (
    <div
      ref={ref}
      className="canvas-surface"
      data-testid="canvas"
      role="application"
      tabIndex={0}
      aria-label="Shared canvas"
    />
  );
}

export function InlineEditor({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useCollaborativeText(editor.document, editor.editId);
  const panel = useRef<HTMLDivElement>(null);
  const item = editor.editId ? editor.document.get(editor.editId) : null;
  const editingId = editor.editId;
  useLayoutEffect(() => {
    const item = editingId ? editor.document.get(editingId) : null;
    if (!item || !ref.current) return;
    positionTextEditor(editor, item.id, ref.current, panel.current);
  });
  useLayoutEffect(() => {
    if (!editingId) return;
    ref.current?.focus();
    if (editor.selectOnEdit) ref.current?.select();
  }, [editor, editingId, ref]);
  if (!item) return null;
  const close = () => {
    editor.closeEditor();
  };
  return (
    <>
      <textarea
        ref={ref}
        className="inline-editor"
        aria-label="Edit canvas text"
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest("[data-text-tools]")
          )
            return;
          close();
        }}
        onInput={() => void fitText(editor, item.id, true)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (markdownKey(event, editor.document, item.id)) {
            void fitText(editor, item.id, true);
            return;
          }
          if (event.nativeEvent.isComposing) return;
          if (
            event.key === "Escape" ||
            ((event.ctrlKey || event.metaKey) && event.key === "Enter")
          ) {
            close();
            return;
          }
          // The same keys as on the canvas, so a tree can be typed. Plain Enter stays a new line.
          const sibling = event.key === "Enter" && event.altKey;
          if (event.key !== "Tab" && !sibling) return;
          event.preventDefault();
          addBranch(editor, sibling);
        }}
      />
      <div ref={panel} className="inline-markdown-panel" data-text-tools="true">
        <MarkdownTools editor={editor} id={item.id} textarea={ref} expanded />
      </div>
    </>
  );
}

type Peer = Partial<{
  user: { name: string; color: string };
  cursor: { x: number; y: number };
  preview: PreviewBox[] | null;
}>;
export function Cursors({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  return (
    <div className="cursors" aria-hidden="true">
      {[...session.provider.awareness.getStates()]
        .filter(([id]) => id !== session.document.doc.clientID)
        .map(([id, state]) => (
          <Fragment key={id}>
            <PeerPreview peer={state as Peer} editor={editor} />
            <PeerCursor peer={state as Peer} editor={editor} />
          </Fragment>
        ))}
    </div>
  );
}
function PeerPreview({ peer, editor }: Readonly<{ peer: Peer; editor: EditorController }>) {
  return (peer.preview || []).map((box, index) => (
    <PreviewOutline key={index} box={box} color={peer.user?.color || "#7863d4"} editor={editor} />
  ));
}
function PreviewOutline({
  box,
  color,
  editor,
}: Readonly<{ box: PreviewBox; color: string; editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const { scale, translate } = editor.graph.view;
    Object.assign(ref.current.style, {
      left: `${(box.x + translate.x) * scale}px`,
      top: `${(box.y + translate.y) * scale}px`,
      width: `${box.width * scale}px`,
      height: `${box.height * scale}px`,
      borderColor: color,
    });
  });
  return <div ref={ref} className="peer-preview" data-testid="peer-preview" />;
}
function PeerCursor({ peer, editor }: Readonly<{ peer: Peer; editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && peer.cursor) {
      const view = editor.graph.view;
      ref.current.style.transform = `translate(${(peer.cursor.x + view.translate.x) * view.scale}px, ${(peer.cursor.y + view.translate.y) * view.scale}px)`;
      ref.current.style.color = peer.user?.color || "#7863d4";
    }
  });
  if (!peer.cursor) return null;
  return (
    <div ref={ref} className="peer-cursor">
      <svg width="18" height="22" viewBox="0 0 18 22">
        <path d="M1 1 L16 12 L8 13 L5 21 Z" fill="currentColor" stroke="white" />
      </svg>
      <span>{peer.user?.name || "Guest"}</span>
    </div>
  );
}
