import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { RoomSession } from "../collaboration/room";
import { EditorController } from "../editor/controller";
import type { PreviewBox } from "../editor/preview";
import { useCollaborativeText } from "./useCollaborativeText";
import { notifyPictures, setPictureSource } from "../editor/pictureSource";
import { addBranch, jumpTo } from "../editor/topics";
import { splitAtCaret } from "../editor/structureCommands";
import { bindPresence, itemInHash, peerStates, type PeerState } from "../editor/presence";
import { bindLaser } from "../editor/laserInput";
import { addTaskAfter, taskListOf } from "../editor/stencils";
import { labelHistory } from "../editor/history";
import { bindTouchInput } from "../editor/touchInput";
import { LaserTrail } from "./Presence";
import { bindPictureInput } from "../editor/pictureInput";
import { bindClipboardInput } from "../editor/clipboardInput";
import { SelectionToolbar } from "./SelectionToolbar";
import { markdownKey } from "../text/sourceKeys";
import { fitText } from "../editor/textLayout";
import { positionTextEditor } from "../editor/textEditorPosition";
import { editSource } from "../editor/commands";

/** How long a deep link waits for its item to arrive from peers before giving up. */
const DEEP_LINK_WAIT_MS = 30000;

/** Flies to the item a link names once it is in the document, selecting and ringing it. */
function openDeepLink(editor: EditorController, hash: string) {
  const id = itemInHash(hash);
  if (!id) return () => undefined;
  let done = false;
  const attempt = () => {
    if (done || !editor.document.get(id)) return;
    done = true;
    jumpTo(editor, id);
    editor.ui.pulse = id;
    editor.emit();
    stop();
  };
  const stop = () => {
    editor.document.doc.off("update", attempt);
    clearTimeout(timer);
  };
  const timer = setTimeout(stop, DEEP_LINK_WAIT_MS);
  editor.document.doc.on("update", attempt);
  attempt();
  return stop;
}

export function Canvas({
  session,
  onEditor,
}: Readonly<{
  session: RoomSession;
  onEditor: (editor: EditorController | null) => void;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPictureSource((hash, type, shared) => session.pictures.url(hash, type, shared));
    const stopPictures = session.pictures.subscribe(notifyPictures);
    const editor = new EditorController(ref.current!, session.document);
    editor.room = session;
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
    const unbindClipboard = bindClipboardInput(editor, session);
    const unbindPresence = bindPresence(editor, session);
    const unbindLaser = bindLaser(editor, session);
    const stopDeepLink = openDeepLink(editor, location.hash);
    const stopLabels = labelHistory(session.document);
    const touch = new AbortController();
    bindTouchInput(editor, session, touch.signal);
    return () => {
      touch.abort();
      stopLabels();
      stopPictures();
      setPictureSource(null);
      unbindPictures();
      unbindClipboard();
      unbindPresence();
      unbindLaser();
      stopDeepLink();
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
      data-help-id="canvas"
    />
  );
}

function finishesEditing(event: React.KeyboardEvent) {
  return event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter");
}

/**
 * The same keys as on the canvas, so a tree can be typed: Tab grows a branch, and Alt Enter adds
 * a sibling, splitting the text at the caret when the caret is in the middle. Plain Enter stays
 * a new line.
 */
function treeKey(
  editor: EditorController,
  id: string,
  event: React.KeyboardEvent<HTMLTextAreaElement>
) {
  const sibling = event.key === "Enter" && event.altKey;
  if (event.key !== "Tab" && !sibling) return;
  event.preventDefault();
  const item = editor.document.get(id);
  if (sibling && item && taskListOf(editor.document.list(), item)) {
    // In a task list, the next item is the next task.
    const next = addTaskAfter(editor.document, id);
    if (next) {
      editor.select(next);
      editor.edit(next, true);
    }
  } else if (sibling) splitAtCaret(editor, id, event.currentTarget);
  else addBranch(editor, false);
}

export function InlineEditor({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useCollaborativeText(editor.document, editor.editId);
  const item = editor.editId ? editor.document.get(editor.editId) : null;
  const editingId = editor.editId;
  useLayoutEffect(() => {
    const item = editingId ? editor.document.get(editingId) : null;
    if (!item || !ref.current) return;
    positionTextEditor(editor, item.id, ref.current);
  });
  useLayoutEffect(() => {
    if (!editingId) return;
    ref.current?.focus();
    if (editor.selectOnEdit) ref.current?.select();
  }, [editor, editingId, ref]);
  const close = () => {
    editor.closeEditor();
  };
  return (
    <>
      {item && (
        <textarea
          ref={ref}
          className="inline-editor"
          aria-label="Edit canvas text"
          data-hint-detail="Your typing shows live for everyone; Tab adds a branch and Escape finishes."
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Element &&
              event.relatedTarget.closest("[data-text-tools]")
            )
              return;
            close();
          }}
          onInput={() => void fitText(editor.document, item.id, true)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (
              markdownKey(event, (element, edit) =>
                editSource(editor.document, item.id, element, edit)
              )
            )
              return;
            if (event.nativeEvent.isComposing) return;
            if (finishesEditing(event)) close();
            else treeKey(editor, item.id, event);
          }}
        />
      )}
      <SelectionToolbar editor={editor} textarea={ref} />
    </>
  );
}

export function Cursors({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  useSyncExternalStore(session.subscribe, session.snapshot);
  return (
    <div className="cursors" aria-hidden="true">
      {peerStates(session).map(([id, state]) => (
        <Fragment key={id}>
          <PeerPreview peer={state} editor={editor} />
          <LaserTrail editor={editor} points={state.laser} color={state.user.color} />
          <PeerCursor peer={state} editor={editor} />
        </Fragment>
      ))}
    </div>
  );
}
function PeerPreview({ peer, editor }: Readonly<{ peer: PeerState; editor: EditorController }>) {
  return peer.preview.map((box, index) => (
    <PreviewOutline key={index} box={box} color={peer.user.color} editor={editor} />
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
function PeerCursor({ peer, editor }: Readonly<{ peer: PeerState; editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && peer.cursor) {
      const view = editor.graph.view;
      ref.current.style.transform = `translate(${(peer.cursor.x + view.translate.x) * view.scale}px, ${(peer.cursor.y + view.translate.y) * view.scale}px)`;
      ref.current.style.color = peer.user.color;
    }
  });
  if (!peer.cursor) return null;
  return (
    <div ref={ref} className="peer-cursor">
      <svg width="18" height="22" viewBox="0 0 18 22">
        <path d="M1 1 L16 12 L8 13 L5 21 Z" fill="currentColor" stroke="white" />
      </svg>
      <span>
        {peer.user.name}
        {peer.chat && (
          <span className="peer-chat" data-testid="peer-chat">
            {peer.chat}
          </span>
        )}
      </span>
    </div>
  );
}
