import type { RoomSession } from "../collaboration/room";
import type { View } from "../document/types";
import type { EditorController } from "./controller";
import { flyToView } from "./views";

/**
 * What each participant shares beyond the document: their name, cursor, drag preview, where
 * they are looking, a fading laser, a line of cursor chat and a call to look at their view.
 * All of it rides on awareness and writes nothing to the document.
 */
export interface PeerState {
  user?: { name: string; color: string };
  cursor?: { x: number; y: number } | null;
  preview?: unknown;
  viewport?: { center: { x: number; y: number }; zoom: number };
  laser?: { x: number; y: number; at: number }[];
  chat?: string;
  spotlight?: { at: number };
}

/** How long a laser point stays visible, and how many a trail keeps. */
export const LASER_FADE_MS = 900;
const LASER_POINTS = 24;
/** How long a call to follow stays worth answering. */
export const SPOTLIGHT_WINDOW_MS = 30000;
/** How often a changing viewport is shared, in milliseconds. */
const VIEWPORT_INTERVAL_MS = 120;

export function peerStates(session: RoomSession): [number, PeerState][] {
  const own = session.document.doc.clientID;
  return [...session.provider.awareness.getStates()]
    .filter(([id]) => id !== own)
    .map(([id, state]) => [id, state as PeerState]);
}

/** Calls to follow that are fresh enough to show, newest first. */
export function freshSpotlights(peers: [number, PeerState][], now = Date.now()) {
  return peers
    .filter(([, state]) => state.spotlight && now - state.spotlight.at < SPOTLIGHT_WINDOW_MS)
    .sort(([, a], [, b]) => b.spotlight!.at - a.spotlight!.at);
}

/** Points of a laser trail still bright enough to draw. */
export function liveLaser(points: PeerState["laser"], now = Date.now()) {
  return (points ?? []).filter((point) => now - point.at < LASER_FADE_MS);
}

/** Adds a point to a trail, keeping it short and fresh. */
export function extendLaser(
  points: PeerState["laser"],
  point: { x: number; y: number },
  now = Date.now()
) {
  return [...liveLaser(points, now), { ...point, at: now }].slice(-LASER_POINTS);
}

function setField(session: RoomSession, field: keyof PeerState, value: unknown) {
  session.provider.awareness.setLocalStateField(field, value);
}

/** Asks everyone here to look at this view. */
export function callEveryone(session: RoomSession) {
  setField(session, "spotlight", { at: Date.now() });
}

export function sendChat(session: RoomSession, text: string) {
  setField(session, "chat", text || null);
}

export function sendLaser(session: RoomSession, points: PeerState["laser"] | null) {
  setField(session, "laser", points);
}

/** Flies to a peer's view without recording the flight as a jump of one's own. */
export function showPeerView(
  editor: EditorController,
  viewport: NonNullable<PeerState["viewport"]>
) {
  const view: View = { id: "", name: "", center: viewport.center, zoom: viewport.zoom };
  editor.history.travel(() => flyToView(editor.graph, editor.element, view, false));
}

/**
 * Shares this person's viewport as it changes, follows a peer's while asked, and stops following
 * as soon as this person moves the view or edits, as a reader looking up from a book.
 */
export function bindPresence(editor: EditorController, session: RoomSession) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let viewportTimer: ReturnType<typeof setTimeout> | null = null;
  const shareViewport = () => {
    viewportTimer = null;
    const { center, zoom } = editor.history.current();
    setField(session, "viewport", { center, zoom });
  };
  const unsubscribe = editor.subscribeView(() => {
    viewportTimer ??= setTimeout(shareViewport, VIEWPORT_INTERVAL_MS);
  });
  shareViewport();
  const follow = () => {
    const target = editor.ui.following;
    if (target === null) return;
    const state = session.provider.awareness.getStates().get(target) as PeerState | undefined;
    if (!state) {
      editor.ui.following = null;
      editor.emit();
      return;
    }
    if (state.viewport) showPeerView(editor, state.viewport);
  };
  session.provider.awareness.on("change", follow);
  const release = () => stopFollowing(editor);
  editor.element.addEventListener("pointerdown", release, options);
  editor.element.addEventListener("wheel", release, options);
  window.addEventListener(
    "keydown",
    (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) release();
    },
    options
  );
  return () => {
    abort.abort();
    unsubscribe();
    session.provider.awareness.off("change", follow);
    if (viewportTimer) clearTimeout(viewportTimer);
  };
}

/** Starts following a peer: their view becomes this view until this person moves. */
export function followPeer(editor: EditorController, session: RoomSession, clientId: number) {
  editor.ui.following = clientId;
  const state = session.provider.awareness.getStates().get(clientId) as PeerState | undefined;
  if (state?.viewport) showPeerView(editor, state.viewport);
  editor.emit();
}

/** A link that opens this room at an item: the page, the room's hash and the item's id after it. */
export function itemLink(base: string, roomHash: string, itemId: string) {
  return `${base}#${roomHash}&item=${encodeURIComponent(itemId)}`;
}

/** Stops following whoever this view followed. */
export function stopFollowing(editor: EditorController) {
  if (editor.ui.following === null) return;
  editor.ui.following = null;
  editor.emit();
}

export function openChat(editor: EditorController) {
  editor.ui.chat = true;
  editor.emit();
}

/** Closes the chat line and takes its words away from peers. */
export function closeChat(editor: EditorController, session: RoomSession) {
  sendChat(session, "");
  editor.ui.chat = false;
  editor.emit();
  editor.element.focus({ preventScroll: true });
}

/** Lets a call to follow pass, remembering it so it does not return. */
export function dismissSpotlight(editor: EditorController, at: number) {
  editor.ui.dismissedSpotlights.push(at);
  editor.emit();
}

/** The item a page's hash names, if any. */
export function itemInHash(hash: string) {
  const match = /[&?]item=([^&]+)/.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}
